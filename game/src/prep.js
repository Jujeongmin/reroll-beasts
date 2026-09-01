// 배치 · 상점 화면.
//
// 규칙은 전부 sim/roster.js 가 갖고 있다. 여기는 **그 결과를 그리고 입력을 넘기는**
// 일만 한다 — 골드를 깎거나 인구를 세는 코드가 여기 생기면 서버 검산과 어긋난다.
//
// 배치는 오토체스·TFT 관례를 따른다:
//   상점 카드 누르기 = 구매 · 벤치↔보드 끌기 = 배치 · 상점 바로 끌기 = 판매

import { unitById } from '@sim/data.js'
import { activeTraits } from '@sim/traits.js'
import { buildBoard } from '@sim/hex.js'
import { roundAt, pveBoard } from '@sim/rounds.js'
import { createRng } from '@sim/rng.js'
import { sellValue } from '@sim/economy.js'
import {
  allUnits,
  boardCount,
  buy,
  buyXp,
  findUnit,
  moveTo,
  population,
  refreshShop,
  toggleShopLock,
  sell,
  toCombatEntries,
} from '@sim/roster.js'
import { unitInfo } from './unit-info.js'
import { traitDetail } from './trait-info.js'
import { standings } from '@sim/lobby.js'
import { createScene } from './scene3d.js'
import { createThumbnailer } from './thumbs.js'

const TIER_COLOR = ['var(--t1)', 'var(--t2)', 'var(--t3)', 'var(--t4)', 'var(--t5)']
const STAR = ['', '★', '★★', '★★★']
// 성급 색. scene3d 의 STAR_COLOR 와 같은 값이어야 배지와 패널이 안 어긋난다.
const STAR_COLOR = ['#d99154', '#e6edf5', '#ffd166']

export async function createPrep({ data, run, onFight }) {
  const el = {
    root: document.getElementById('prep'),
    stage: document.getElementById('stage'),
    traits: document.getElementById('traits'),
    pop: document.getElementById('pop'),
    hint: document.getElementById('hint'),
    info: document.getElementById('info'),
    traitInfo: document.getElementById('traitinfo'),
    timer: document.getElementById('timer'),
    odds: document.getElementById('odds'),
    lock: document.getElementById('lock'),
    lobby: document.getElementById('lobby'),
    peek: document.getElementById('peek'),
    shop: document.getElementById('shop'),
    roundtag: document.getElementById('roundtag'),
    track: document.getElementById('track'),
    hp: document.getElementById('hp'),
    gold: document.getElementById('goldval'),
    lvl: document.getElementById('lvl'),
    xpFill: document.querySelector('#xpbar i'),
    xpText: document.getElementById('xptext'),
    buyxp: document.getElementById('buyxp'),
    reroll: document.getElementById('reroll'),
    fight: document.getElementById('fight'),
    shopbar: document.getElementById('shopbar'),
    ghost: document.getElementById('ghost'),
    ghostImg: document.querySelector('#ghost img'),
  }

  // 판 전체를 그리고 상대 절반은 어둡게 눌러 둔다 (TFT 와 같은 구성).
  // 내 칸에는 청록 테두리가 켜져 어디가 내 자리인지 색으로 읽힌다.
  const scene = await createScene({
    mount: el.stage,
    boardCfg: data.combat.board,
    pitchDeg: 46,
    phase: 'prep',
    benchSlots: data.economy.benchSlots,
    scaleOf: (id) => data.combat.classScale[unitById(data.units, id)?.class] ?? 1,
  })
  const thumbs = createThumbnailer()

  // 내 진영의 로컬 타일 i → 전장 타일 index. sim 의 배치 순서와 같아야 한다.
  const allyRows = data.combat.board.allyRows
  const localToField = []
  for (const row of allyRows) {
    for (let col = 0; col < data.combat.board.rows[row]; col++) {
      localToField.push(scene.board.tiles.findIndex((t) => t.row === row && t.col === col))
    }
  }
  const fieldToLocal = new Map(localToField.map((f, i) => [f, i]))

  // 상대 진영의 로컬 좌표 → 전장 타일. 두 진영은 180도 회전 대응이므로
  // 행을 뒤집고 열도 뒤집는다 — sim/combat.js 의 toFieldTile 과 같은 규칙이다.
  const enemyLocalToField = []
  for (const row of [...data.combat.board.enemyRows].reverse()) {
    const width = data.combat.board.rows[row]
    for (let i = 0; i < width; i++) {
      enemyLocalToField.push(scene.board.tiles.findIndex((t) => t.row === row && t.col === width - 1 - i))
    }
  }

  // 헥스 거리는 인접 홉 수다 — 시야 좌표의 유클리드 거리로는 못 잰다.
  // 전투가 쓰는 것과 **같은 표**를 써야 화면의 사거리와 실제 사거리가 같다.
  const simBoard = buildBoard(data.combat.board)
  const tileXZ = (local) => scene.board.tiles[localToField[local]]

  // ── 초상화 ──────────────────────────────────────────────
  const thumbCache = new Map()
  async function thumbFor(unitId, star) {
    const key = `${unitId}:${star >= 3 ? 3 : 1}`
    if (!thumbCache.has(key)) {
      const gltf = await scene.protoFor(unitId, star)
      thumbCache.set(key, thumbs.shoot(gltf, key))
    }
    return thumbCache.get(key)
  }

  // ── 판 · 벤치 위의 3D 모델 ──────────────────────────────
  //
  // 벤치도 같은 UnitView 를 쓴다. 아이콘 줄로 두면 3D 말과 2D 칸이 따로 놀아
  // "들고 있는 말을 판에 올린다"는 느낌이 안 산다.
  const BENCH_UNIT_SCALE = 0.72

  const views = new Map() // uid → UnitView
  let syncToken = 0

  // 전투 중에는 판을 얼린다. 전투는 **전투 시작 시점의 판**으로 이미 계산된
  // 로그다 — 도중에 판 위 말이 바뀌면 화면이 그 로그와 어긋난다.
  // 산 말은 벤치로만 들어오고, 합성 결과는 전투가 끝난 뒤에 판에 나타난다.
  let boardFrozen = false

  /** uid → 지금 있어야 할 자리. 판이면 로컬 타일, 벤치면 칸 번호. */
  function wantedSpots() {
    const want = new Map()
    // 판이 얼어 있으면 판 위 말은 전투가 세운다. 여기서 또 세우면 겹친다.
    if (!boardFrozen) {
      run.state.board.forEach((c, i) => c && want.set(c.uid, { ...c, where: 'board', index: i }))
    }
    run.state.bench.forEach((c, i) => c && want.set(c.uid, { ...c, where: 'bench', index: i }))
    return want
  }

  function spotOf(w) {
    if (w.where === 'board') {
      const t = tileXZ(w.index)
      return { x: t.x, y: scene.topY, z: t.z }
    }
    return scene.benchSpot(w.index)
  }

  async function syncUnits() {
    const token = ++syncToken
    const want = wantedSpots()

    for (const [uid, v] of views) {
      const w = want.get(uid)
      // 성급이 바뀌면 3성 진화 모델로 갈아끼워야 하므로 다시 만든다
      if (!w || w.star !== v.star) {
        v.dispose()
        views.delete(uid)
      }
    }

    for (const [uid, w] of want) {
      if (!views.has(uid)) {
        const v = await scene.makeUnit(w.unitId, w.star, 'A')
        // 비동기로 만드는 사이에 판이 또 바뀌었으면 이 결과는 버린다
        const still = wantedSpots().get(uid)
        if (token !== syncToken || !still) {
          v.dispose()
          continue
        }
        // 성급 별을 머리 위에 띄운다. 1성은 기본이라 표시하지 않는다 —
        // 아홉 마리 전부에 별이 뜨면 정작 2·3성이 안 보인다.
        if (w.star > 1) {
          v.badge = scene.makeBadge({ team: 'A', star: w.star, withHp: false })
          v.badge.sprite.position.y = v.height + scene.spacing.stepX * 0.16
          v.root.add(v.badge.sprite)
        }
        scene.scene.add(v.root)
        v.play(v.anims.idle)
        views.set(uid, v)
      }
      const v = views.get(uid)
      const spot = spotOf(w)
      if (!spot) continue
      v.root.position.set(spot.x, spot.y, spot.z)
      // 대기석 말은 조금 작게. 판 위와 같은 크기면 칸보다 넓어 서로 겹치고,
      // 판에 올린 말과 대기 중인 말이 구분되지 않는다.
      v.root.scale.setScalar(w.where === 'bench' ? BENCH_UNIT_SCALE : 1)
      // 준비 단계에는 전부 상대편(화면 위쪽)을 본다
      v.root.rotation.y = 0
    }
  }

  // ── 로비 · 남의 판 보기 ─────────────────────────────────
  //
  // 목록을 누르면 그 사람 보드를 무대에 띄운다. 내 말은 잠깐 치우고
  // 그 사람 말을 세운 뒤, 닫으면 원래대로 돌린다.
  let peekViews = []
  let peekId = null
  let peekToken = 0

  async function closePeek() {
    peekToken++
    for (const v of peekViews) v.dispose()
    peekViews = []
    peekId = null
    el.peek.hidden = true
    renderLobby()
    syncUnits()
  }

  async function openPeek(seat) {
    if (seat.isPlayer) return closePeek()
    const token = ++peekToken
    for (const v of peekViews) v.dispose()
    peekViews = []
    clearUnits()
    peekId = seat.id

    el.peek.innerHTML =
      `<span>${seat.name} 의 진형 · ♥ ${seat.hp}</span><button type="button">닫기</button>`
    el.peek.hidden = false
    el.peek.querySelector('button').addEventListener('click', closePeek)
    renderLobby()

    // 남의 진형은 **상대 진영 쪽**에 세운다. 내 자리에 세우면 내 보드로 착각한다.
    for (const e of seat.board) {
      const v = await scene.makeUnit(e.unitId, e.star, 'B')
      if (token !== peekToken) {
        v.dispose()
        return
      }
      const field = enemyLocalToField[e.tile]
      const t = field === undefined ? null : scene.board.tiles[field]
      if (!t) continue
      v.root.position.set(t.x, scene.topY, t.z)
      v.play(v.anims.idle)
      scene.scene.add(v.root)
      peekViews.push(v)
    }
  }

  function renderLobby() {
    if (!run.lobby) return
    const ranked = standings(run.lobby)
    el.lobby.replaceChildren(
      ...ranked.map((seat, i) => {
        const d = document.createElement('div')
        d.className =
          'seat' +
          (seat.isPlayer ? ' me' : '') +
          (seat.hp <= 0 ? ' out' : '') +
          (seat.id === run.opponentId ? ' foe' : '') +
          (seat.id === peekId ? ' open' : '')
        d.innerHTML =
          `<span class="rk">${i + 1}</span><span class="n">${seat.name}</span>` +
          `<span class="h">${seat.hp}</span>` +
          `<span class="av">${seat.name.slice(0, 1)}</span>`
        d.addEventListener('click', () => (seat.id === peekId ? closePeek() : openPeek(seat)))
        return d
      }),
    )
  }

  // ── 상대 대기석 ─────────────────────────────────────────
  //
  // 이번 라운드에 붙을 상대를 건너편 대기석에 세워 둔다. 무대가 대칭이 되고,
  // "누구랑 붙는지"가 배치 중에 보인다.
  //
  // 편성은 main.js 의 전투 시드와 **같은 식**으로 뽑는다. 다른 식으로 뽑으면
  // 여기 서 있던 유닛과 실제로 나오는 유닛이 달라진다.
  const enemyViews = []
  let enemyToken = 0

  async function syncEnemyBench() {
    const token = ++enemyToken
    for (const v of enemyViews) v.dispose()
    enemyViews.length = 0

    const info = roundAt(run.index, data.rounds)
    const battleSeed = (run.seed + run.index * 7919) >>> 0
    const roster = pveBoard(info.stageIndex, createRng(battleSeed), data)

    for (let i = 0; i < roster.length; i++) {
      const spot = scene.benchSpot(i, 'enemy')
      if (!spot) break
      const v = await scene.makeUnit(roster[i].unitId, roster[i].star, 'B')
      if (token !== enemyToken) {
        v.dispose()
        return
      }
      v.root.position.set(spot.x, spot.y, spot.z)
      v.root.scale.setScalar(BENCH_UNIT_SCALE)
      v.play(v.anims.idle)
      scene.scene.add(v.root)
      enemyViews.push(v)
    }
  }

  // ── 그리기 ──────────────────────────────────────────────
  function tierBar(tier) {
    return TIER_COLOR[tier - 1] ?? TIER_COLOR[0]
  }

  // 스테이지 트랙. TFT 상단의 라운드 점열과 같은 역할이다 —
  // "이번 스테이지 어디쯤이고 다음이 PvE 인가"를 한눈에 준다.
  function renderTrack() {
    const info = roundAt(run.index, data.rounds)
    const stage = data.rounds.stages[info.stageIndex]
    el.track.replaceChildren(
      ...Array.from({ length: stage.rounds }, (_, i) => {
        const n = i + 1
        const dot = document.createElement('i')
        if (stage.pveRounds.includes(n)) dot.classList.add('pve')
        if (n < info.roundInStage) dot.classList.add('done')
        if (n === info.roundInStage) dot.classList.add('now')
        return dot
      }),
    )
  }

  function renderHud() {
    const s = run.state

    el.roundtag.textContent = run.round
    renderTrack()

    el.hp.textContent = String(s.hp)

    const p = population(s)
    el.pop.textContent = `${p.used}/${p.cap}`
    el.pop.classList.toggle('full', p.used >= p.cap)

    const need = data.levels.xpToNext[String(s.level)]
    el.lvl.textContent = String(s.level)
    el.xpFill.style.width = need ? `${Math.min(100, (s.xp / need) * 100)}%` : '100%'
    el.xpText.textContent = need ? `${s.xp}/${need}` : 'MAX'

    renderOdds(s.level)
    el.gold.textContent = String(s.gold)

    el.buyxp.disabled = !need || s.gold < data.shop.xpCost.gold || !running
    el.reroll.disabled = s.gold < data.shop.rerollCost || !running
    el.lock.disabled = !running
    el.lock.classList.toggle('on', s.shopLocked)
    el.lock.querySelector('.cost').textContent = s.shopLocked ? '켬' : '−'
    // 전투 중에는 또 시작할 수 없다. 상점은 열려 있으므로 이 버튼만 잠근다.
    el.fight.disabled = p.used === 0 || !running
  }

  // 지금 레벨에서 무엇이 나오는지. 이게 없으면 "레벨업 vs 리롤" 판단을 못 한다.
  function renderOdds(level) {
    const odds = data.shop.tierOdds[String(level)] ?? []
    el.odds.replaceChildren(
      ...odds.map((pct, i) => {
        const d = document.createElement('span')
        d.textContent = String(pct)
        d.style.setProperty('--oc', TIER_COLOR[i])
        if (pct === 0) d.classList.add('zero')
        d.title = `T${i + 1} ${pct}%`
        return d
      }),
    )
  }

  function traitLabel(id) {
    const t = [...data.traits.origins, ...data.traits.classes].find((x) => x.id === id)
    return t ? t.name.ko : id
  }

  function renderTraits() {
    // 보드에 놓인 유닛만 시너지를 낸다 — 벤치는 세지 않는다
    const onBoard = run.state.board
      .filter(Boolean)
      .map((c) => {
        const u = unitById(data.units, c.unitId)
        return { unitId: u.id, origin: u.origin, class: u.class }
      })
    const active = activeTraits(onBoard, data.traits)

    const rows = [...active.entries()]
      .filter(([, v]) => v.count > 0)
      // 활성 단계가 높은 순 → 같은 단계면 보유 수 많은 순
      .sort((a, b) => b[1].step - a[1].step || b[1].count - a[1].count)

    el.traits.replaceChildren(
      ...rows.map(([id, v]) => {
        const def = [...data.traits.origins, ...data.traits.classes].find((x) => x.id === id)
        const next = def.steps.find((n) => n > v.count)
        const d = document.createElement('div')
        // 활성 단계를 클래스로 실어 등급색(동·은·금)을 CSS 가 정하게 한다
        d.className = `trait ${v.step > 0 ? `on s${v.step}` : 'off'}`
        d.addEventListener('pointerenter', () => showTraitInfo(id, v.count))
        d.addEventListener('pointerleave', hideTraitInfo)
        // 터치에는 hover 가 없다. 눌러도 열리게 한다.
        d.addEventListener('click', () => showTraitInfo(id, v.count))
        const label = traitLabel(id)
        d.innerHTML =
          `<span class="pip">${label.slice(0, 1)}</span>` +
          `<span class="n">${label}</span>` +
          `<span class="c">${v.count}${next ? `/${next}` : ''}</span>`
        return d
      }),
    )
  }

  function renderShop() {
    el.shop.replaceChildren(
      ...run.state.shop.map((unitId, i) => {
        const d = document.createElement('div')
        d.className = 'card'
        d.dataset.shop = String(i)
        if (!unitId) {
          d.classList.add('empty')
          return d
        }
        const u = unitById(data.units, unitId)
        if (run.state.gold < u.tier) d.classList.add('poor')
        // 티어색을 변수로 넘긴다 — 테두리·이름띠·후광이 한 값을 같이 쓴다
        d.style.setProperty('--tc', tierBar(u.tier))
        d.innerHTML =
          `<span class="art"><img alt="${u.name.ko}" /></span>` +
          `<span class="pr">${u.tier}</span>` +
          `<span class="tr">${traitLabel(u.origin)} · ${traitLabel(u.class)}</span>` +
          `<span class="nm">${u.name.ko}</span>`
        thumbFor(unitId, 1).then((url) => {
          const img = d.querySelector('img')
          if (img) img.src = url
        })
        return d
      }),
    )
  }

  // ── 유닛 정보 ───────────────────────────────────────────
  //
  // 끌면 배치, 탭하면 정보. 같은 포인터를 나눠 쓰므로 **움직인 거리**로 가른다.
  const TAP_SLOP = 6
  let infoUid = null

  function hideInfo() {
    el.info.hidden = true
    infoUid = null
    scene.setRange(null)
  }

  /** 그 유닛이 닿는 칸들. 판 위에 있을 때만 의미가 있다. */
  function rangeTiles(uid, range) {
    const at = findUnit(run.state, uid)
    if (!at || at.where !== 'board') return null
    const from = localToField[at.index]
    const out = new Set()
    for (let t = 0; t < simBoard.tileCount; t++) {
      const d = simBoard.dist[from][t]
      // 자기 칸은 뺀다 — "닿는 범위" 를 보여주는 것이지 서 있는 자리가 아니다
      if (d > 0 && d <= range) out.add(t)
    }
    return out
  }

  async function showInfo(cell) {
    const i = unitInfo(cell.unitId, cell.star, data)
    infoUid = cell.uid
    el.info.style.setProperty('--tc', tierBar(i.unit.tier))
    el.info.style.setProperty('--sc', STAR_COLOR[cell.star - 1] ?? STAR_COLOR[0])
    el.info.innerHTML =
      '<div class="hd">' +
      '<img alt="" />' +
      `<div class="t"><div class="nm">${i.unit.name.ko}</div>` +
      `<div class="sub">${traitLabel(i.unit.origin)} · ${traitLabel(i.unit.class)}</div></div>` +
      `<div class="st">${STAR[cell.star]}</div>` +
      '</div>' +
      '<div class="grid">' +
      `<span>체력<b>${i.stats.hp}</b></span>` +
      `<span>공격력<b>${i.stats.atk}</b></span>` +
      `<span>방어력<b>${i.stats.def}</b></span>` +
      `<span>마법저항<b>${i.stats.mr}</b></span>` +
      `<span>주문력<b>${i.stats.power}</b></span>` +
      `<span>사거리<b>${i.stats.range}</b></span>` +
      `<span>공속<b>${i.attacksPerSec}/s</b></span>` +
      `<span>치명<b>${Math.round(i.stats.critChance * 100)}%</b></span>` +
      '</div>' +
      `<div class="sk"><em>스킬</em> ${i.skill}</div>` +
      `<div class="sell">판매 <b>+${sellValue(cell.unitId, cell.star, data)}골드</b> · 상점 바로 끌기</div>`
    el.info.hidden = false
    scene.setRange(rangeTiles(cell.uid, i.stats.range))
    const url = await thumbFor(cell.unitId, cell.star)
    const img = el.info.querySelector('img')
    if (img) img.src = url
  }

  // ── 시너지 상세 ─────────────────────────────────────────
  function ownedUnitIds() {
    return new Set(allUnits(run.state).map((u) => u.unitId))
  }

  async function showTraitInfo(id, count) {
    const d = traitDetail(id, count, data, ownedUnitIds())
    el.traitInfo.innerHTML =
      `<div class="hd"><span>${d.name}</span><span class="c">${d.count}</span></div>` +
      '<div class="steps">' +
      d.steps
        .map((st) => `<div class="step ${st.active ? 'on' : ''}"><b>${st.need}</b><span>${st.text}</span></div>`)
        .join('') +
      '</div>' +
      '<div class="mem">' +
      d.members
        .map(
          (mm) =>
            `<figure class="${mm.owned ? '' : 'no'}" data-unit="${mm.id}">` +
            `<img alt="${mm.name}" /><figcaption>${mm.name}</figcaption></figure>`,
        )
        .join('') +
      '</div>'
    el.traitInfo.hidden = false

    // 초상화는 비동기로 채운다. 먼저 뜨고 나중에 그림이 붙는 편이
    // 다 모일 때까지 빈 화면으로 기다리는 것보다 낫다.
    for (const fig of el.traitInfo.querySelectorAll('[data-unit]')) {
      thumbFor(fig.dataset.unit, 1).then((url) => {
        const img = fig.querySelector('img')
        if (img) img.src = url
      })
    }
  }

  function hideTraitInfo() {
    el.traitInfo.hidden = true
  }

  let hintTimer = 0
  function hint(text) {
    el.hint.textContent = text
    el.hint.classList.add('show')
    clearTimeout(hintTimer)
    hintTimer = setTimeout(() => el.hint.classList.remove('show'), 1400)
  }

  function refresh() {
    hideTraitInfo()
    renderLobby()
    // 팔리거나 합쳐져 사라진 유닛의 정보가 남아 있으면 거짓말이 된다
    if (infoUid !== null) {
      const still = findUnit(run.state, infoUid)
      if (!still) hideInfo()
      // 자리가 바뀌었으면 사거리도 따라가야 한다
      else scene.setRange(rangeTiles(infoUid, unitInfo(still.unit.unitId, still.unit.star, data).stats.range))
    }
    renderHud()
    renderTraits()
    renderShop()
    syncUnits()
  }

  // ── 상점 조작 ───────────────────────────────────────────
  el.shop.addEventListener('click', (ev) => {
    const card = ev.target.closest('[data-shop]')
    if (!card) return
    const r = buy(run.state, run.pool, Number(card.dataset.shop), data)
    if (!r.ok) hint(r.reason)
    refresh()
  })

  el.lock.addEventListener('click', () => {
    toggleShopLock(run.state)
    renderHud()
  })

  el.reroll.addEventListener('click', () => {
    const r = refreshShop(run.state, run.pool, run.rng, data)
    if (!r.ok) hint(r.reason)
    refresh()
  })

  el.buyxp.addEventListener('click', () => {
    const r = buyXp(run.state, data)
    if (!r.ok) hint(r.reason)
    refresh()
  })

  el.fight.addEventListener('click', () => onFight(toCombatEntries(run.state)))

  // ── 드래그 배치 ─────────────────────────────────────────
  //
  // 벤치는 DOM, 보드는 3D 라 한쪽 방식만으로는 오갈 수 없다.
  // 포인터 좌표를 기준으로 매번 "지금 무엇 위인가"를 다시 판정한다.
  // 배치 단계에서만 판을 만질 수 있다. 전투 중에 말을 옮기면 화면이 재생 중인
  // 로그와 어긋나 "보이는 것이 곧 판정"이라는 전제가 깨진다.
  let running = true

  // ── 배치 시간 ───────────────────────────────────────────
  //
  // 0 이 되면 스스로 전투가 시작된다. 시간 제한이 없으면 한 판이 늘어져
  // "8~12분에 끝난다"는 설계가 무너진다.
  let timeLeft = 0
  function resetTimer() {
    const r = data.rounds
    timeLeft = run.index === 1 ? (r.firstRoundSeconds ?? r.prepSeconds) : r.prepSeconds
  }
  function tickTimer(dt) {
    if (!running) return
    const was = Math.ceil(timeLeft)
    timeLeft = Math.max(0, timeLeft - dt)
    const now = Math.ceil(timeLeft)
    if (now !== was) {
      el.timer.textContent = String(now)
      el.timer.classList.toggle('warn', now <= 5)
    }
    if (timeLeft === 0) {
      // 배치가 비었으면 시작할 수 없다 — 무한 루프가 된다. 그 판은 그대로 둔다.
      if (boardCount(run.state) > 0) {
        running = false
        onFight(toCombatEntries(run.state))
      } else {
        timeLeft = 5
      }
    }
  }

  // 벤치 칸 색. 판의 청록 테두리와 같은 계열로 밝혀 목표가 어디인지 통일한다.
  const BENCH_IDLE = 0x8a6238
  const BENCH_HOT = 0x4de8d8

  let drag = null
  let hotTile = -1
  let hotSlot = null

  /**
   * 그 자리에 서 있는 유닛. 없으면 null.
   *
   * **모델을 먼저 쏜다.** 칸 평면만 재면 말의 몸통을 눌러도 그 뒤 칸이 잡혀
   * 발밑을 정확히 겨눠야만 집히는, 손이 아픈 조작이 된다.
   */
  function unitAtPointer(x, y) {
    if (document.elementFromPoint(x, y) === scene.renderer.domElement) {
      const roots = [...views.values()].map((v) => v.root)
      let hit = scene.pickObjects(roots, x, y)
      while (hit) {
        for (const [uid, v] of views) {
          if (v.root === hit) {
            const at = findUnit(run.state, uid)
            return at ? { uid, unit: at.unit } : null
          }
        }
        hit = hit.parent
      }
    }
    const spot = spotAt(x, y)
    if (!spot) return null
    const c = spot.where === 'bench' ? run.state.bench[spot.index] : run.state.board[spot.index]
    return c ? { uid: c.uid, unit: c } : null
  }

  /**
   * 화면 좌표 → 판/벤치 자리. 벤치도 3D 라 둘 다 레이캐스트로 잡는다.
   * 상대 진영 칸은 로컬 번호가 없으므로 자연히 걸러진다.
   */
  function spotAt(x, y) {
    if (document.elementFromPoint(x, y) !== scene.renderer.domElement) return null
    const hit = scene.pickAt(x, y)
    if (!hit) return null
    if (hit.where === 'bench') return hit
    const local = fieldToLocal.get(hit.index)
    return local === undefined ? null : { where: 'board', index: local }
  }

  /** 지금 포인터가 가리키는 놓을 자리. 없으면 null. */
  function dropTargetAt(x, y) {
    if (document.elementFromPoint(x, y)?.closest('#shopbar')) return { where: 'sell' }
    return spotAt(x, y)
  }

  function clearHighlight() {
    if (hotTile >= 0) {
      const ring = scene.ringNodes[localToField[hotTile]]
      if (ring) ring.material = scene.ringStyles.idle
      hotTile = -1
    }
    if (hotSlot) {
      hotSlot.material.color.setHex(BENCH_IDLE)
      hotSlot = null
    }
    el.shopbar.classList.remove('selling')
    el.ghost.classList.remove('sell')
  }

  function highlight(target) {
    clearHighlight()
    if (!target) return
    if (target.where === 'board') {
      const ring = scene.ringNodes[localToField[target.index]]
      // 테두리만 밝힌다. 타일 색을 바꾸면 머티리얼이 공유라 56칸이 같이 변한다.
      if (ring) ring.material = scene.ringStyles.hot
      hotTile = target.index
    } else if (target.where === 'bench') {
      hotSlot = scene.benchPads[target.index] ?? null
      hotSlot?.material.color.setHex(BENCH_HOT)
    } else if (target.where === 'sell') {
      el.shopbar.classList.add('selling')
      el.ghost.classList.add('sell')
    }
  }

  el.root.addEventListener('pointerdown', (ev) => {
    if (!running) return
    if (ev.target.closest('#shopbar') || ev.target.closest('#top') || ev.target.closest('#info')) {
      return
    }
    const found = unitAtPointer(ev.clientX, ev.clientY)
    if (!found) {
      hideInfo()
      return
    }
    ev.preventDefault()
    drag = { uid: found.uid, unit: found.unit, x0: ev.clientX, y0: ev.clientY, moved: false }
    thumbFor(found.unit.unitId, found.unit.star).then((url) => {
      if (drag) el.ghostImg.src = url
    })
    el.ghost.style.display = 'block'
    el.ghost.style.left = `${ev.clientX}px`
    el.ghost.style.top = `${ev.clientY}px`
    el.root.setPointerCapture(ev.pointerId)
  })

  el.root.addEventListener('pointermove', (ev) => {
    if (!drag) return
    if (!drag.moved && (Math.abs(ev.clientX - drag.x0) > TAP_SLOP || Math.abs(ev.clientY - drag.y0) > TAP_SLOP)) {
      drag.moved = true
      // 사거리 표시와 드롭 목표 표시가 같은 테두리를 쓴다. 둘을 겹치면
      // 어느 칸에 놓이는지가 안 읽힌다.
      hideInfo()
    }
    el.ghost.style.left = `${ev.clientX}px`
    el.ghost.style.top = `${ev.clientY}px`
    highlight(dropTargetAt(ev.clientX, ev.clientY))
  })

  function endDrag(ev) {
    if (!drag) return
    const target = dropTargetAt(ev.clientX, ev.clientY)
    const held = drag
    drag = null
    el.ghost.style.display = 'none'
    clearHighlight()

    // 거의 안 움직였으면 옮기려던 게 아니라 들여다보려던 것이다
    if (!held.moved) {
      showInfo(held.unit)
      return
    }
    if (!target) return
    if (target.where === 'sell') {
      const value = sellValue(held.unit.unitId, held.unit.star, data)
      const r = sell(run.state, run.pool, held.uid, data)
      if (r.ok) hint(`판매 +${value}골드`)
      else hint(r.reason)
    } else {
      const r = moveTo(run.state, held.uid, target, data)
      if (!r.ok) hint(r.reason)
    }
    refresh()
  }
  el.root.addEventListener('pointerup', endDrag)
  el.root.addEventListener('pointercancel', () => {
    drag = null
    el.ghost.style.display = 'none'
    clearHighlight()
  })

  // ── 루프 ────────────────────────────────────────────────
  let last = performance.now()
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (running) {
      tickTimer(dt)
      for (const v of views.values()) v.mixer.update(dt)
      for (const v of enemyViews) v.mixer.update(dt)
      scene.render()
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  refresh()

  /** 무대에서 배치용 말을 전부 치운다. 전투는 자기 말을 새로 세운다. */
  function clearUnits() {
    for (const v of views.values()) v.dispose()
    views.clear()
    for (const v of enemyViews) v.dispose()
    enemyViews.length = 0
    syncToken++
    enemyToken++
  }

  return {
    refresh,
    scene,
    clearUnits,
    /** 배치 단계로 돌아온다. 화면 전환이 아니라 같은 무대의 상태 전환이다. */
    show() {
      running = true
      boardFrozen = false
      resetTimer()
      el.timer.textContent = String(Math.ceil(timeLeft))
      el.timer.classList.remove('warn')
      last = performance.now()
      scene.resize()
      refresh()
      // 라운드가 넘어가면 상대도 바뀐다
      syncEnemyBench()
    },
    /**
     * 전투에 판을 넘긴다. 루프는 battle 이 돌린다.
     * **상점은 그대로 열어 둔다** — TFT 처럼 싸우는 동안에도 굴려야 한다.
     */
    hide() {
      running = false
      boardFrozen = true
      el.timer.textContent = '—'
      el.timer.classList.remove('warn')
      if (peekId !== null) closePeek()
      hideInfo()
      clearHighlight()
      clearUnits()
      // 벤치 말은 계속 보여야 한다. 산 말이 어디로 갔는지 안 보이면
      // 전투 중 구매가 허공에 돈을 버리는 것처럼 느껴진다.
      syncUnits()
      renderHud()
      renderShop()
    },
    /** 판 위 유닛 수. 화면 밖에서도 인구를 물어볼 일이 있다. */
    boardCount: () => boardCount(run.state),
    allUnits: () => allUnits(run.state),
  }
}
