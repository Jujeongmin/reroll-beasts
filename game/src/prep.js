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
import { sellValue, streakBonus } from '@sim/economy.js'
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
    timebar: document.getElementById('timebar'),
    timeFill: document.querySelector('#timebar i'),
    odds: document.getElementById('odds'),
    lock: document.getElementById('lock'),
    lobby: document.getElementById('lobby'),
    peek: document.getElementById('peek'),
    shop: document.getElementById('shop'),
    roundtag: document.getElementById('roundtag'),
    track: document.getElementById('track'),
    gold: document.getElementById('goldval'),
    lvl: document.getElementById('lvl'),
    xpFill: document.querySelector('#xpbar i'),
    xpText: document.getElementById('xptext'),
    buyxp: document.getElementById('buyxp'),
    reroll: document.getElementById('reroll'),
    streak: document.getElementById('streak'),
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
    // 정보 줄 높이(36) + 여유. 이만큼 아래를 비워야 대기석이 그 밑에 안 깔린다.
    bottomInset: 46,
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

  // 개발용 손잡이. 브라우저 콘솔에서 판 상태를 들여다보려면 이게 필요하다.
  // 프로덕션 번들에는 들어가지 않는다.
  if (import.meta.env.DEV) globalThis.__dev = { run, scene, views, el, data, refresh: () => refresh() }
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
        const pve = stage.pveRounds.includes(n)
        if (pve) dot.classList.add('pve')
        if (n < info.roundInStage) dot.classList.add('done')
        if (n === info.roundInStage) dot.classList.add('now')
        // 모양만으로는 마름모가 뭔지 알 수 없다.
        dot.title = `${info.stageIndex + 1}-${n} · ${pve ? '몬스터' : '대결'}`
        return dot
      }),
    )
  }

  function renderHud() {
    const s = run.state

    el.roundtag.textContent = run.round
    renderTrack()


    const p = population(s)
    el.pop.textContent = `${p.used}/${p.cap}`
    el.pop.classList.toggle('full', p.used >= p.cap)

    const need = data.levels.xpToNext[String(s.level)]
    el.lvl.textContent = String(s.level)
    el.xpFill.style.width = need ? `${Math.min(100, (s.xp / need) * 100)}%` : '100%'
    el.xpText.textContent = need ? `${s.xp}/${need}` : 'MAX'

    renderOdds(s.level)
    el.gold.textContent = String(s.gold)

    renderStreak()

    el.buyxp.disabled = !need || s.gold < data.shop.xpCost.gold || !running
    el.reroll.disabled = s.gold < data.shop.rerollCost || !running
    el.lock.disabled = !running
    el.lock.classList.toggle('on', s.shopLocked)
    // 글자는 뺐다 — 자물쇠 모양과 버튼 색이 이미 상태를 말한다.
    // 다만 눈으로만 알 수 있으면 안 되므로 이름표는 남긴다.
    el.lock.title = s.shopLocked ? '상점 잠금 켜짐 — 다음 라운드에도 유지' : '상점 잠금 꺼짐'
    el.lock.setAttribute('aria-pressed', String(s.shopLocked))
  }

  // 연승·연패. 다음 라운드 수입이 이걸로 갈리는데 화면에 없었다.
  function renderStreak() {
    const s = run.state
    const n = s.streak ?? 0
    const bonus = streakBonus(n, data.economy)
    el.streak.className = n < 2 ? 'none' : run.lastWon ? 'win' : 'lose'
    if (n < 2) {
      // 자리는 min-width 로 남긴다 — 연승이 붙는 순간 골드가 옆으로 밀리면
      // 눈이 매번 골드를 다시 찾아야 한다.
      el.streak.innerHTML = ''
      return
    }
    el.streak.innerHTML =
      `<b>${n}</b><span>${run.lastWon ? '연승' : '연패'}</span>` +
      (bonus > 0 ? `<span class="bn">+${bonus}</span>` : '')
  }

  // 지금 레벨에서 무엇이 나오는지. 이게 없으면 "레벨업 vs 리롤" 판단을 못 한다.
  function renderOdds(level) {
    const odds = data.shop.tierOdds[String(level)] ?? []
    el.odds.replaceChildren(
      ...odds.map((pct, i) => {
        const d = document.createElement('span')
        // 색 점 + 숫자. 색칠된 네모에 숫자를 넣으면 다섯 개가 알록달록한 블록
        // 줄이 되어 상점 카드보다 확률표가 눈에 먼저 든다 — 참고용 숫자인데.
        // 점은 색만 나르고 숫자는 배경 없이 읽힌다.
        d.innerHTML = `<i></i>${pct}%`
        d.style.setProperty('--oc', TIER_COLOR[i])
        if (pct === 0) d.classList.add('zero')
        d.title = `${i + 1}티어 ${pct}%`
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
        d.addEventListener('pointerenter', () => {
          keepTraitInfo()
          showTraitInfo(id, v.count)
        })
        // 바로 닫으면 패널로 마우스를 옮기는 도중에 사라진다.
        d.addEventListener('pointerleave', scheduleHideTraitInfo)
        // 터치에는 hover 가 없다. 눌러도 열리게 한다.
        d.addEventListener('click', () => {
          keepTraitInfo()
          showTraitInfo(id, v.count)
        })
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
          `<span class="tr"><i>${traitLabel(u.origin)}</i><i>${traitLabel(u.class)}</i></span>` +
          `<span class="nm"><b>${u.name.ko}</b><span class="pr">${u.tier}</span></span>`
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
  // 시너지 패널에서 연 미리보기인지. 내 말 정보와 닫는 조건이 다르다.
  let infoPreview = false

  function hideInfo() {
    el.info.hidden = true
    infoUid = null
    infoPreview = false
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

  function showInfo(cell) {
    return renderUnitInfo(cell.unitId, cell.star, cell)
  }

  /**
   * 유닛 정보 패널.
   *
   * cell 이 있으면 **내 말** 이다 — 사거리를 판에 그리고 판매가를 적는다.
   * cell 이 없으면 **미리보기** 다 (시너지 패널에서 아직 없는 말을 짚은 경우).
   * 그때 판매가·사거리를 그대로 보여 주면 있지도 않은 말이 판 위에 있는 것처럼
   * 읽힌다.
   */
  async function renderUnitInfo(unitId, star, cell = null) {
    const i = unitInfo(unitId, star, data)
    infoUid = cell ? cell.uid : null
    infoPreview = !cell
    el.info.style.setProperty('--tc', tierBar(i.unit.tier))
    el.info.style.setProperty('--sc', STAR_COLOR[star - 1] ?? STAR_COLOR[0])
    el.info.innerHTML =
      '<div class="hd">' +
      '<img alt="" />' +
      `<div class="t"><div class="nm">${i.unit.name.ko}</div>` +
      `<div class="sub">${traitLabel(i.unit.origin)} · ${traitLabel(i.unit.class)}</div></div>` +
      `<div class="st">${STAR[star]}</div>` +
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
      (cell
        ? `<div class="sell">판매 <b>+${sellValue(unitId, star, data)}골드</b> · 상점 바로 끌기</div>`
        : `<div class="sell">상점 확률 <b>${i.unit.tier}티어</b> · 아직 보유하지 않음</div>`)
    el.info.hidden = false
    scene.setRange(cell ? rangeTiles(cell.uid, i.stats.range) : null)
    const url = await thumbFor(unitId, star)
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

  /**
   * 칩 → 패널로 마우스가 건너갈 수 있어야 한다. 패널 안 유닛을 짚어야 하니까.
   * 칩에서 나가는 순간 닫으면 그 이동이 불가능하므로 짧은 유예를 두고,
   * 패널에 들어오면 취소한다.
   */
  let traitHideTimer = 0
  function keepTraitInfo() {
    clearTimeout(traitHideTimer)
  }
  function scheduleHideTraitInfo() {
    clearTimeout(traitHideTimer)
    traitHideTimer = setTimeout(hideTraitInfo, 180)
  }
  // 미리보기는 **패널을 벗어날 때만** 닫는다. 유닛에서 유닛으로 옮길 때마다
  // 닫으면 옮기는 사이에 깜빡여서 읽을 수가 없다.
  function hideTraitInfo() {
    clearTimeout(traitHideTimer)
    el.traitInfo.hidden = true
    // 미리보기는 이 패널에 딸린 것이다. 같이 닫는다.
    if (infoPreview) hideInfo()
  }

  el.traitInfo.addEventListener('pointerenter', keepTraitInfo)
  el.traitInfo.addEventListener('pointerleave', scheduleHideTraitInfo)
  // 유닛 하나하나에 리스너를 달지 않는다 — 패널은 매번 새로 그려진다.
  el.traitInfo.addEventListener('pointerover', (ev) => {
    const fig = ev.target.closest('[data-unit]')
    if (fig) renderUnitInfo(fig.dataset.unit, 1)
  })
  // 터치: hover 가 없으니 눌러서 연다
  el.traitInfo.addEventListener('click', (ev) => {
    const fig = ev.target.closest('[data-unit]')
    if (fig) renderUnitInfo(fig.dataset.unit, 1)
  })

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
  // 게이지를 채우려면 "얼마 중 얼마"인지 알아야 한다. 남은 시간만으로는 못 그린다.
  let timeTotal = 1
  function resetTimer() {
    const r = data.rounds
    timeLeft = run.index === 1 ? (r.firstRoundSeconds ?? r.prepSeconds) : r.prepSeconds
    timeTotal = Math.max(1, timeLeft)
    paintTimer()
  }
  // 여유 → 촉박. 두 색을 섞어 시간이 줄수록 붉어진다. 마지막 5초에만 빨개지면
  // 그 전까지는 막대 길이만 봐야 하는데, 길이는 눈이 대충 읽는다.
  const TIME_OK = [0xe8, 0xb3, 0x4f]
  const TIME_LOW = [0xe2, 0x4a, 0x33]
  function paintTimer() {
    const left = Math.ceil(timeLeft)
    el.timer.textContent = String(left)
    const warn = left <= 5
    el.timer.classList.toggle('warn', warn)
    el.timebar.classList.toggle('warn', warn)
    const k = timeTotal > 0 ? Math.max(0, Math.min(1, timeLeft / timeTotal)) : 0
    // 남은 만큼 칠한다. 오른쪽에 붙어 있으므로 빈 칸이 좌 → 우로 밀고 들어온다.
    el.timeFill.style.width = `${k * 100}%`
    const mix = (a, b) => Math.round(b + (a - b) * k)
    const c = TIME_OK.map((v, i) => mix(v, TIME_LOW[i]))
    el.timeFill.style.background = `rgb(${c[0]} ${c[1]} ${c[2]})`
  }
  function tickTimer(dt) {
    if (!running) return
    timeLeft = Math.max(0, timeLeft - dt)
    // 막대는 매 프레임 다시 그린다. 초가 바뀔 때만 그리면 1초씩 툭툭 끊긴다.
    paintTimer()
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

  /**
   * 쓸 모델과 초상화를 **미리 전부** 만든다.
   *
   * 게으르게 받으면 상점을 굴릴 때마다 카드가 빈 칸으로 떴다가 채워지고,
   * 처음 보는 말은 판에 한 박자 늦게 나타난다. 부팅에서 한 번에 치른다.
   */
  async function preload(onProgress) {
    const ids = data.units.units.map((u) => u.id)
    // 1성(기본)과 3성(진화) 모델이 다르다. 2성은 1성과 같은 모델을 쓴다.
    const jobs = ids.flatMap((id) => [
      () => thumbFor(id, 1),
      () => thumbFor(id, 3),
    ])
    let done = 0
    for (const job of jobs) {
      await job()
      onProgress?.(++done / jobs.length)
    }
  }

  return {
    refresh,
    preload,
    scene,
    clearUnits,
    /** 배치 단계로 돌아온다. 화면 전환이 아니라 같은 무대의 상태 전환이다. */
    show() {
      running = true
      boardFrozen = false
      resetTimer()
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
      // 전투 중에는 배치 시간이 흐르지 않는다. 막대도 같이 비운다 —
      // 게이지가 멈춘 채 차 있으면 아직 시간이 남은 것처럼 읽힌다.
      el.timer.textContent = '—'
      el.timer.classList.remove('warn')
      el.timebar.classList.remove('warn')
      el.timeFill.style.width = '0%'
      el.timeFill.style.background = ''
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
