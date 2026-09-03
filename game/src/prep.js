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
  resolveMerges,
  toggleShopLock,
  sell,
  toCombatEntries,
  equipItem,
} from '@sim/roster.js'
import { itemById } from '@sim/items.js'
import { unitInfo, itemEffectText } from './unit-info.js'
import { traitDetail } from './trait-info.js'
import { standings } from '@sim/lobby.js'
import { createScene } from './scene3d.js'
import { createThumbnailer } from './thumbs.js'

const TIER_COLOR = ['var(--t1)', 'var(--t2)', 'var(--t3)', 'var(--t4)', 'var(--t5)']
const STAR = ['', '★', '★★', '★★★']
// 성급 색. scene3d 의 STAR_COLOR 와 같은 값이어야 배지와 패널이 안 어긋난다.
const STAR_COLOR = ['#d99154', '#e6edf5', '#ffd166']

export async function createPrep({
  data,
  run,
  onFight,
  onWatch,
  onPickUnit,
  onBoardChange,
  onGroundTap,
  onTickAvatar,
}) {
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
    benchSlots: data.economy.benchSlots,
    // 정보 줄 높이(32) + 여유. 이만큼 아래를 비워야 대기석이 그 밑에 안 깔린다.
    bottomInset: 42,
    // 상단 띠(28) + 여유. 이만큼 위를 비워야 상대 대기석이 띠 뒤로 안 들어간다.
    topInset: 40,
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

  /**
   * 홈에 걸 큰 초상. 상점 카드용 128px 을 늘려 쓰면 뭉개진다.
   *
   * 찍고 나서 렌더러를 바로 버린다 — 홈에 한 장 걸자고 WebGL 컨텍스트를
   * 계속 물고 있을 이유가 없다. 어떤 기기는 컨텍스트 수 자체가 빠듯하다.
   */
  async function heroPortrait(unitId, star = 3, size = 512) {
    const gltf = await scene.protoFor(unitId, star)
    // 홈 배경 조명에 맞춘 역광 프리셋. 카드 조명으로 찍으면 밤 그림 위에
    // 낮 그림이 얹힌다.
    const big = createThumbnailer({ size, lighting: 'lobby' })
    const url = big.shoot(gltf, `${unitId}:${star}:${size}`)
    big.dispose()
    return url
  }

  // ── 판 · 벤치 위의 3D 모델 ──────────────────────────────
  //
  // 벤치도 같은 UnitView 를 쓴다. 아이콘 줄로 두면 3D 말과 2D 칸이 따로 놀아
  // "들고 있는 말을 판에 올린다"는 느낌이 안 산다.
  const BENCH_UNIT_SCALE = 0.72

  const views = new Map() // uid → UnitView

  // 개발용 손잡이. 브라우저 콘솔에서 판 상태를 들여다보려면 이게 필요하다.
  // 프로덕션 번들에는 들어가지 않는다.
  if (import.meta.env.DEV) globalThis.__dev = { run, scene, views, el, data, refresh: () => refresh(), thumbFor: (id, star) => thumbFor(id, star), fight: () => { running = false; onFight(toCombatEntries(run.state)) } }
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
    // 정찰 중에는 내 말을 세우지 않는다. 세우면 남의 판 위에 내 판이 겹친다 —
    // refresh() 는 상점을 굴릴 때마다 불리므로 실제로 겹쳤다.
    if (peekSeat) return
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

      // 배지를 만들 이유는 둘이다 — 2성 이상이거나, 아이템을 꼈거나.
      // 1성이라도 아이템을 끼면 그게 보여야 한다. 별은 그래도 안 그린다.
      const worn = w.items ?? []
      const needBadge = w.star > 1 || worn.length > 0
      if (needBadge && !v.badge) {
        v.badge = scene.makeBadge({
          team: 'A',
          star: w.star,
          withHp: false,
          items: worn,
          showStars: w.star > 1,
        })
        v.badge.sprite.position.y = v.height + scene.spacing.stepX * 0.16
        v.root.add(v.badge.sprite)
      } else if (!needBadge && v.badge) {
        // 마지막 아이템을 판 유닛에서 빼면(= 유닛을 판) 배지도 사라진다.
        v.root.remove(v.badge.sprite)
        v.badge = null
      } else if (v.badge) {
        v.badge.setItems(worn)
      }
    }
  }

  // ── 로비 · 남의 판 보기 ─────────────────────────────────
  //
  // 목록을 누르면 그 사람 보드를 무대에 띄운다. 내 말은 잠깐 치우고
  // 그 사람 말을 세운 뒤, 닫으면 원래대로 돌린다.
  let peekViews = []
  let peekId = null
  // 보고 있는 사람의 자리 정보. 시너지·유닛 목록이 전부 여기서 나온다.
  let peekSeat = null
  let peekToken = 0

  async function closePeek() {
    peekToken++
    for (const v of peekViews) v.dispose()
    peekViews = []
    peekId = null
    peekSeat = null
    renderLobby()
    renderTraits()
    syncUnits()
  }

  async function openPeek(seat) {
    if (seat.isPlayer) return closePeek()
    const token = ++peekToken
    for (const v of peekViews) v.dispose()
    peekViews = []
    clearUnits()
    peekId = seat.id
    peekSeat = seat

    // 누구 판인지는 우측 순위표에서 그 줄이 밝아지는 걸로 말한다 — 판 한가운데에
    // 띠를 띄우면 정작 봐야 할 말들을 그 띠가 가린다 (실제로 뒷줄이 가려졌다).
    renderLobby()
    // 시너지도 그 사람 것으로 바꾼다. 남의 판을 보는데 내 시너지가 떠 있으면
    // 그 판이 왜 센지를 못 읽는다.
    renderTraits()

    // 남의 진형을 **내 자리에** 세운다. 정찰은 "저 사람 판이 어떻게 생겼나"를
    // 보는 일이라, 건너편에 뒤집어 세우면 내가 보던 방향과 달라 비교가 안 된다.
    // 화면 위쪽 띠가 누구 판인지 계속 말해 주므로 헷갈릴 일도 없다.
    for (const e of seat.board) {
      const v = await scene.makeUnit(e.unitId, e.star, 'A')
      if (token !== peekToken) {
        v.dispose()
        return
      }
      const field = localToField[e.tile]
      const t = field === undefined ? null : scene.board.tiles[field]
      if (!t) continue
      v.root.position.set(t.x, scene.topY, t.z)
      v.root.rotation.y = 0
      const worn = e.items ?? []
      if (e.star > 1 || worn.length > 0) {
        v.badge = scene.makeBadge({
          team: 'A',
          star: e.star,
          withHp: false,
          items: worn,
          showStars: e.star > 1,
        })
        v.badge.sprite.position.y = v.height + scene.spacing.stepX * 0.16
        v.root.add(v.badge.sprite)
      }
      v.play(v.anims.idle)
      scene.scene.add(v.root)
      peekViews.push(v)
    }
  }

  // 체력 색. 연속으로 섞으면 60% 와 55% 가 구별이 안 된다 — 세 단계로 끊는다.
  // 초록(여유) · 노랑(주의) · 빨강(위험) 은 오토체스가 공유하는 관례다.
  const HP_OK = '#5fd68a'
  const HP_MID = '#ffd166'
  const HP_LOW = '#e2513a'
  function hpColor(ratio) {
    if (ratio > 0.6) return HP_OK
    if (ratio > 0.3) return HP_MID
    return HP_LOW
  }

  function renderLobby() {
    if (!run.lobby) return
    // 체력 내림차순. standings 가 그 순서로 준다.
    const ranked = standings(run.lobby)
    const maxHp = Math.max(1, data.economy.startHp)
    el.lobby.replaceChildren(
      ...ranked.map((seat) => {
        const d = document.createElement('div')
        d.className =
          'seat' +
          (seat.isPlayer ? ' me' : '') +
          (seat.hp <= 0 ? ' out' : '') +
          (seat.id === run.opponentId ? ' foe' : '') +
          // 3연승부터 강조한다. 2연승은 아직 흐름이 아니다.
          (seat.lastWon === true && (seat.streak ?? 0) >= 3 ? ' hot' : '') +
          (seat.id === peekId || (!running && seat.id === run.watchId) ? ' open' : '')
        // 체력이 시작값을 넘는 경우는 없지만, 넘어도 고리가 두 바퀴 돌지 않게 묶는다.
        const ratio = Math.max(0, Math.min(1, seat.hp / maxHp))
        d.style.setProperty('--hp', String(ratio))
        d.style.setProperty('--hc', hpColor(ratio))
        d.innerHTML =
          `<span class="n">${seat.name}</span>` +
          `<span class="h">${seat.hp}</span>` +
          `<span class="av"><b>${seat.name.slice(0, 1)}</b></span>`
        const run3 = seat.lastWon === true && (seat.streak ?? 0) >= 3
        d.title =
          `${seat.name} · 체력 ${seat.hp}` +
          (run3 ? ` · ${seat.streak}연승 중` : '') +
          (seat.hp <= 0 ? ' (탈락)' : '')
        d.addEventListener('click', () => {
          // 전투 중에는 그 사람 전투를 관전한다. 배치 중에는 진형을 들여다본다.
          if (!running) return onWatch?.(seat.id)
          return seat.id === peekId ? closePeek() : openPeek(seat)
        })
        return d
      }),
    )
  }

  // 상대는 **전투 중에만** 보인다.
  //
  // 배치 중에 건너편에 상대 진형을 세워 봤는데, 그걸 보고 내 배치를 맞추게
  // 되어 "서로 모르는 채 동시에 짠다"는 이 장르의 전제가 무너졌다.
  // 전투가 시작되면 battle 이 로그의 spawn 으로 양쪽을 다 세운다.

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

    // 상점은 전투 중에도 열려 있다 — 싸우는 동안 굴리는 게 이 장르의 리듬이다.
    el.buyxp.disabled = !need || s.gold < data.shop.xpCost.gold
    el.reroll.disabled = s.gold < data.shop.rerollCost
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
        // 숫자를 따로 감싼다 — 자릿수가 달라도(0% vs 75%) 폭이 같아야 다섯 칸이 줄을 선다.
        d.innerHTML = `<i></i><b>${pct}%</b>`
        d.style.setProperty('--oc', TIER_COLOR[i])
        if (pct === 0) d.classList.add('zero')
        d.title = `${i + 1}티어 ${pct}%`
        return d
      }),
    )
  }

  /** 시너지 아이콘 경로. tools/trait-icons.mjs 가 id 별로 찍어 둔다. */
  const traitIcon = (id) => `url('/assets/ui/trait_${id}.png')`

  function traitLabel(id) {
    const t = [...data.traits.origins, ...data.traits.classes].find((x) => x.id === id)
    return t ? t.name.ko : id
  }

  /**
   * 지금 화면에 서 있는 판의 유닛들.
   *
   * 남의 판을 보는 중이면 **그 사람 것**이다. 시너지와 유닛 목록이 화면에
   * 서 있는 말과 어긋나면, 정찰이 아니라 거짓말이 된다.
   */
  function shownBoard() {
    if (peekSeat) return peekSeat.board
    // 남의 전투를 관전하는 중이면 그 사람 시너지를 띄운다. 화면에서 싸우는
    // 말들과 좌측 시너지가 다른 사람 것이면 그건 거짓말이다.
    if (!running && run.watchId) {
      const seat = run.lobby?.find((x) => x.id === run.watchId)
      if (seat) return seat.board
    }
    return run.state.board.filter(Boolean)
  }

  function renderTraits() {
    // 보드에 놓인 유닛만 시너지를 낸다 — 벤치는 세지 않는다
    const onBoard = shownBoard()
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
        d.style.setProperty('--ic', traitIcon(id))
        d.innerHTML =
          '<span class="pip"></span>' +
          `<span class="n">${label}</span>` +
          `<span class="c">${v.count}${next ? `/${next}` : ''}</span>`
        return d
      }),
    )
  }

  /**
   * 이 카드를 사면 무슨 일이 생기는가.
   *
   * 세 장이 모이면 한 단계 위로 합쳐지고, 그게 또 세 장이면 한 번 더 오른다
   * (sim/roster.js 의 resolveMerges 와 같은 규칙 — 여기서는 **재기만** 한다).
   * 카드에 이걸 안 적으면 "이미 두 장 있는 말"과 처음 보는 말이 똑같이 생겼다.
   */
  function buyPreview(unitId) {
    const owned = allUnits(run.state).filter((u) => u.unitId === unitId)
    const at = (star) => owned.filter((u) => u.star === star).length
    const maxStar = data.combat.starMultiplier.length
    const before = [at(1), at(2), at(3)]
    const after = [before[0] + 1, before[1], before[2]]
    for (let i = 0; i + 1 < maxStar; i++) {
      while (after[i] >= 3) {
        after[i] -= 3
        after[i + 1] += 1
      }
    }
    // 오르는 별 중 **가장 높은 것**을 보여 준다. 2성을 거쳐 3성이 되면
    // 3성이라고 적어야 한다 — 2성이라고 적으면 거짓말이 된다.
    let up = 0
    for (let star = maxStar; star >= 2; star--) {
      if (after[star - 1] > before[star - 1]) {
        up = star
        break
      }
    }
    return { count: owned.length, up }
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
        const pv = buyPreview(unitId)
        if (pv.up > 0) d.classList.add('up')
        d.style.setProperty('--sc', STAR_COLOR[pv.up - 1] ?? STAR_COLOR[0])
        // 티어색을 변수로 넘긴다 — 테두리·이름띠·후광이 한 값을 같이 쓴다
        d.style.setProperty('--tc', tierBar(u.tier))
        d.innerHTML =
          `<span class="art"><img alt="${u.name.ko}" /></span>` +
          (pv.up > 0
            ? `<span class="own up">${STAR[pv.up]}</span>`
            : pv.count > 0
              ? `<span class="own">×${pv.count}</span>`
              : '') +
          '<span class="tr">' +
          `<i style="--ic:${traitIcon(u.origin)}">${traitLabel(u.origin)}</i>` +
          `<i style="--ic:${traitIcon(u.class)}">${traitLabel(u.class)}</i></span>` +
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

  /** 내 말 정보 패널. 사거리를 판에 그리고 판매가를 적는다. */
  function showInfo(cell) {
    return showUnitCard(cell.unitId, cell.star, { cell })
  }

  /**
   * 유닛 카드.
   *
   * cell 이 있으면 **내 말**이다 — 사거리를 판에 그리고 판매가를 적는다.
   * 없으면 전투 중에 집은 말이다 (상대 말일 수도 있다). 그때 판매가를 적으면
   * 팔 수 있는 것처럼 읽히고, 사거리는 그릴 칸이 없다.
   *
   * items 는 cell 에서 오거나(내 로스터), 전투 중이면 battle 이 spawn 로그에서
   * 건네준다(cell 이 없으므로 옵션으로 따로 받는다). 둘 다 unitInfo 에 넘겨
   * 스탯 표에 반영한다 — 안 넘기면 아이템 낀 유닛의 체력·공격력이 실제 전투
   * 수치보다 낮게 뜬다(카드 옆 아이템 아이콘과 앞뒤가 안 맞는다).
   */
  /**
   * 선반 아이템 카드. 말 카드와 **같은 패널**을 쓴다 — 판 위의 것을 탭하면
   * 늘 같은 자리에 설명이 뜬다는 약속이 하나로 유지된다.
   *
   * 효과 문구는 itemEffectText 가 items.json 에서 만든다. 여기서 12줄을
   * 따로 적으면 수치를 고칠 때마다 두 군데를 고쳐야 하고, 한쪽만 고친 날
   * 화면이 거짓말을 한다.
   */
  function showItemCard(itemId) {
    const it = itemById(data.items, itemId)
    if (!it) return
    infoUid = null
    el.info.innerHTML =
      '<div class="hd">' +
      `<img class="itemart" src="/assets/ui/item_${itemId}.png" alt="" />` +
      `<div class="t"><div class="nm">${it.name.ko}</div>` +
      '<div class="sub">아이템</div></div>' +
      '</div>' +
      `<div class="items"><span><em>${itemEffectText(it)}</em></span></div>` +
      '<div class="sell">말 위로 끌면 장착 · 유닛당 ' +
      `${data.items.slotsPerUnit}칸</div>`
    el.info.hidden = false
    // 사거리 표시는 말의 것이다. 아이템 카드를 열 때 지우지 않으면 방금 본
    // 말의 사거리가 판에 그대로 남아 아이템이 그린 것처럼 읽힌다.
    scene.setRange(null)
  }

  async function showUnitCard(unitId, star, { cell = null, team = 'A', items = null } = {}) {
    const worn = items ?? cell?.items ?? []
    const i = unitInfo(unitId, star, data, worn)
    infoUid = cell ? cell.uid : null
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
      (worn.length > 0
        ? '<div class="items">' +
          worn
            .map((id) => {
              const it = itemById(data.items, id)
              // 스펙 §8: 아이콘 · 이름 · 효과를 한 줄로. 이름만 있으면 스탯
              // 표(위 grid)를 보고서야 뭐가 바뀌었는지 역산해야 한다.
              return (
                `<span><img src="/assets/ui/item_${id}.png" alt="" />` +
                `<b>${it.name.ko}</b><em>${itemEffectText(it)}</em></span>`
              )
            })
            .join('') +
          '</div>'
        : '') +
      (cell
        ? `<div class="sell">판매 <b>+${sellValue(unitId, star, data)}골드</b> · 상점 바로 끌기</div>`
        : `<div class="sell">${team === 'A' ? '내' : '상대'} 진영 · 전투 중</div>`)
    el.info.hidden = false
    scene.setRange(cell ? rangeTiles(cell.uid, i.stats.range) : null)
    const url = await thumbFor(unitId, star)
    const img = el.info.querySelector('img')
    if (img) img.src = url
  }

  // ── 시너지 상세 ─────────────────────────────────────────
  function ownedUnitIds() {
    // 남의 판을 보는 중이면 그 사람이 가진 것으로 회색 처리를 가른다.
    if (peekSeat) return new Set(peekSeat.board.map((c) => c.unitId))
    return new Set(allUnits(run.state).map((u) => u.unitId))
  }

  async function showTraitInfo(id, count) {
    const d = traitDetail(id, count, data, ownedUnitIds())
    el.traitInfo.style.setProperty('--ic', traitIcon(id))
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
            `<figure class="${mm.owned ? '' : 'no'}" data-unit="${mm.id}"` +
            ` data-name="${mm.name}" data-tier="${mm.tier}"` +
            ` style="--tc:${tierBar(mm.tier)}">` +
            `<img alt="${mm.name}" /><figcaption>${mm.tier}</figcaption></figure>`,
        )
        .join('') +
      '</div>' +
      '<div class="pick"></div>'
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
  function hideTraitInfo() {
    clearTimeout(traitHideTimer)
    el.traitInfo.hidden = true
  }

  el.traitInfo.addEventListener('pointerenter', keepTraitInfo)
  el.traitInfo.addEventListener('pointerleave', (ev) => {
    scheduleHideTraitInfo(ev)
    pickName(null)
  })
  // 짚은 유닛의 이름·티어를 패널 아래 한 줄에 적는다. 칸마다 이름을 붙이면
  // 여섯 칸이 두 배로 커지고, 별도 팝업을 띄우면 패널 위에 패널이 겹친다.
  function pickName(fig) {
    const line = el.traitInfo.querySelector('.pick')
    if (!line) return
    if (!fig) {
      line.textContent = ''
      line.style.removeProperty('--tc')
      return
    }
    line.style.setProperty('--tc', fig.style.getPropertyValue('--tc'))
    line.innerHTML = `<span class="t">${fig.dataset.tier}</span>${fig.dataset.name}`
  }
  el.traitInfo.addEventListener('pointerover', (ev) => {
    const fig = ev.target.closest('[data-unit]')
    if (fig) pickName(fig)
  })
  // 유닛 하나하나에 리스너를 달지 않는다 — 패널은 매번 새로 그려진다.

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
    // 가진(아직 안 낀) 아이템은 이제 DOM 줄이 아니라 대기석 옆 3D 선반이다.
    scene.setItemShelf(run.state.items)
    syncUnits()
    // 구매·이동·판매·합성·장착이 전부 여기로 모인다 — 판이 바뀌는 지점마다
    // 따로 부르면 언젠가 한 곳을 빠뜨린다.
    //
    // 전투 중에는 안 보낸다. 그때 서버가 쥔 보드는 이 판의 판정 근거라,
    // 싸우는 동안 산 말로 덮으면 화면과 판정이 갈린다.
    if (running) onBoardChange?.(toCombatEntries(run.state))
  }

  // ── 상점 조작 ───────────────────────────────────────────
  /**
   * 전투 중에는 **대기석 안에서만** 합쳐진다.
   *
   * 판 위의 말이 싸우는 도중에 승급하면, 이미 돌고 있는 리플레이의 능력치와
   * 화면의 말이 어긋난다. 판을 낀 합성은 전투가 끝난 뒤 show() 에서 정산한다.
   */
  const mergeScope = () => (running ? null : 'bench')

  el.shop.addEventListener('click', (ev) => {
    const card = ev.target.closest('[data-shop]')
    if (!card) return
    const r = buy(run.state, run.pool, Number(card.dataset.shop), data, {
      mergeOnly: mergeScope(),
    })
    if (!r.ok) hint(r.reason)
    refresh()
  })

  el.lock.addEventListener('click', () => {
    toggleShopLock(run.state)
    renderHud()
  })

  // ── 단축키 ──────────────────────────────────────────────
  //
  // 오토체스 관례를 따른다 (W 배치 · E 판매 · D 리롤 · F 경험치).
  // 손이 상점 버튼과 판 사이를 오가지 않아도 되는 게 이 장르의 조작 속도다.

  /** 가리키는 말을 판 ↔ 대기석으로 옮긴다. */
  function toggleSpot() {
    const found = unitAtPointer(ptr.x, ptr.y)
    if (!found) return hint('가리키는 말이 없다')
    const at = findUnit(run.state, found.uid)
    if (!at) return
    if (at.where === 'board') {
      const slot = run.state.bench.findIndex((c) => !c)
      if (slot < 0) return hint('대기석이 가득 찼다')
      const r = moveTo(run.state, found.uid, { where: 'bench', index: slot }, data)
      if (!r.ok) return hint(r.reason)
    } else {
      const slot = firstFreeBoardSlot()
      if (slot < 0) return hint(`배치 인원이 꽉 찼다 (레벨 ${run.state.level})`)
      const r = moveTo(run.state, found.uid, { where: 'board', index: slot }, data)
      if (!r.ok) return hint(r.reason)
    }
    refresh()
  }

  /** 지금 이 말을 만질 수 있는가. 전투 중에는 판 위의 말이 잠긴다. */
  function canTouch(uid) {
    if (running) return true
    const at = findUnit(run.state, uid)
    return at ? at.where !== 'board' : false
  }

  /** 가리키는 말을 판다. */
  function sellPointed() {
    const found = unitAtPointer(ptr.x, ptr.y)
    if (!found) return hint('가리키는 말이 없다')
    if (!canTouch(found.uid)) return hint('싸우는 중인 말은 못 판다')
    const value = sellValue(found.unit.unitId, found.unit.star, data)
    const r = sell(run.state, run.pool, found.uid, data)
    hint(r.ok ? `판매 +${value}골드` : r.reason)
    refresh()
  }

  /** 남의 판 순회. dir 1 = 다음 사람, -1 = 이전 사람. */
  function peekStep(dir) {
    if (!run.lobby) return
    const others = standings(run.lobby).filter((seat) => !seat.isPlayer)
    if (others.length === 0) return
    // **지금 보고 있는 사람에서 이어 간다.** 마우스로 고른 것도 보고 있는 것이다 —
    // peekId(배치) 든 run.watchId(전투 관전) 든 하나만 보면 둘이 따로 놀아,
    // 마우스로 고른 뒤 Q 를 누르면 두 사람이 동시에 선택된 것처럼 보였다.
    const nowId = running ? peekId : (run.watchId ?? null)
    const cur = others.findIndex((seat) => seat.id === nowId)
    // 아무도 안 보고 있으면 방향에 따라 양 끝에서 시작한다.
    const from = cur >= 0 ? cur : dir > 0 ? -1 : 0
    const next = others[(from + dir + others.length) % others.length]
    if (running) openPeek(next)
    else onWatch?.(next.id)
  }

  const KEYS = {
    KeyW: toggleSpot,
    KeyE: sellPointed,
    KeyD: doReroll,
    KeyF: doBuyXp,
    KeyQ: () => peekStep(1),
    Digit1: () => peekStep(1),
    KeyR: () => peekStep(-1),
    Digit3: () => peekStep(-1),
    Space: closePeek,
    Digit2: closePeek,
    Escape: closePeek,
  }
  addEventListener('keydown', (ev) => {
    // 키를 누른 채로 두면 repeat 가 초당 수십 번 들어온다 — 리롤이 골드를 쓸어간다.
    if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return
    const act = KEYS[ev.code]
    if (!act) return
    // Space 는 기본이 스크롤이다.
    ev.preventDefault()
    // 남의 판을 보는 중에는 내 말을 못 만진다 — 화면에 없는 말이다.
    if (peekId !== null && (ev.code === 'KeyW' || ev.code === 'KeyE')) return
    // W 는 판으로 옮기는 키다 — 전투 중에는 막는다.
    // E(판매)는 대기석 말이면 통한다 (sellPointed 가 다시 확인한다).
    if (!running && ev.code === 'KeyW') return
    act()
  })

  function doReroll() {
    const r = refreshShop(run.state, run.pool, run.rng, data)
    if (!r.ok) hint(r.reason)
    refresh()
  }
  function doBuyXp() {
    const r = buyXp(run.state, data)
    if (!r.ok) hint(r.reason)
    refresh()
  }
  el.reroll.addEventListener('click', doReroll)
  el.buyxp.addEventListener('click', doBuyXp)


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
  /** 내 판에서 비어 있는 첫 자리. 인원이 꽉 찼으면 -1. */
  function firstFreeBoardSlot() {
    if (boardCount(run.state) >= run.state.level) return -1
    return run.state.board.findIndex((c) => !c)
  }

  /**
   * 대기석 맨 왼쪽부터 판의 빈 자리에 올린다.
   *
   * 말은 샀는데 판에 안 올린 채 시간이 다 가면, 예전에는 라운드가 5초씩
   * 무한히 미뤄졌다 — 화면상 아무 일도 안 일어나서 멈춘 것처럼 보인다.
   * 대신 갖고 있는 말로 알아서 채우고 시작한다.
   */
  function autoPlaceFromBench() {
    let placed = 0
    for (const cell of run.state.bench) {
      if (!cell) continue
      const slot = firstFreeBoardSlot()
      if (slot < 0) break
      if (moveTo(run.state, cell.uid, { where: 'board', index: slot }, data).ok) placed++
    }
    return placed
  }

  // 튜토리얼은 시간에 쫓기면 안 된다. 코치가 시키는 걸 하는 동안 라운드가
  // 저절로 시작되면 배우다 말고 전투에 끌려 들어간다.
  let timerPaused = false

  function tickTimer(dt) {
    if (!running || timerPaused) return
    timeLeft = Math.max(0, timeLeft - dt)
    // 막대는 매 프레임 다시 그린다. 초가 바뀔 때만 그리면 1초씩 툭툭 끊긴다.
    paintTimer()
    if (timeLeft === 0) {
      // 판이 **비었을 때만**이 아니라 자리가 남을 때마다 채운다. 넷을 놓을 수
      // 있는데 둘만 놓고 시간이 가면 그냥 손해다 — 대기석 왼쪽부터 올린다.
      if (autoPlaceFromBench() > 0) {
        hint('대기석에서 자동 배치')
        refresh()
      }
      // 판이 그래도 비었으면(살아 있는 말이 하나도 없으면) 시작할 수 없다.
      if (boardCount(run.state) > 0) {
        running = false
        onFight(toCombatEntries(run.state))
      } else {
        timeLeft = 5
      }
    }
  }

  // 벤치 칸을 밝히는 색. 판의 청록 테두리와 같은 계열이라 목표가 어디인지
  // 통일된다. 되돌릴 때는 널빤지 원래 색으로 — 상수로 되돌리면 상대 대기석처럼
  // 눌러 둔 칸이 갑자기 밝아진다.
  const BENCH_HOT = 0x4de8d8

  let drag = null
  let hotTile = -1
  let hotSlot = null
  // 단축키는 "마우스가 가리키는 말"에 걸린다. 키를 누른 순간의 좌표를
  // 알 방법이 없으므로 움직일 때마다 적어 둔다.
  const ptr = { x: -1, y: -1 }

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
      hotSlot.userData.tint?.(null)
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
      hotSlot?.userData.tint?.(BENCH_HOT)
    } else if (target.where === 'sell') {
      el.shopbar.classList.add('selling')
      el.ghost.classList.add('sell')
    }
  }

  /**
   * 아이템을 끌 때의 표시. 놓을 곳은 **유닛**이지 빈 칸이 아니다.
   * 칸이 찬 유닛은 빨갛게 — 놓아도 아무 일이 없다는 걸 놓기 전에 알려야 한다.
   */
  function highlightUnit(found) {
    clearHighlight()
    if (!found) return
    const full = (found.unit.items ?? []).length >= data.items.slotsPerUnit
    const at = findUnit(run.state, found.uid)
    if (!at) return
    if (at.where === 'board') {
      const ring = scene.ringNodes[localToField[at.index]]
      if (ring) ring.material = full ? scene.ringStyles.sell : scene.ringStyles.hot
      hotTile = at.index
    } else {
      hotSlot = scene.benchPads[at.index] ?? null
      hotSlot?.userData.tint?.(full ? 0xe8654f : BENCH_HOT)
    }
  }

  /**
   * 화면 좌표가 가리키는 선반 아이템. 없으면 null.
   *
   * 유닛보다 **먼저** 짚는다 — 선반이 대기석 옆에 붙어 있어 카메라 각도에
   * 따라 둘이 화면에서 겹칠 수 있는데, 그때 앞에 있는 아이템이 집혀야
   * "말을 옮기려 했는데 아이템이 딸려 왔다" 같은 오조작이 안 생긴다.
   */
  function itemAtPointer(x, y) {
    if (document.elementFromPoint(x, y) !== scene.renderer.domElement) return null
    const hit = scene.pickObjects(scene.itemSlots, x, y)
    if (!hit || hit.userData.itemId == null) return null
    return { id: hit.userData.itemId, invIndex: hit.userData.invIndex }
  }

  el.root.addEventListener('pointerdown', (ev) => {
    if (
      ev.target.closest('#shopbar') ||
      ev.target.closest('#top') ||
      ev.target.closest('#info')
    ) {
      return
    }
    // 선반 아이템을 짚었으면 그 드래그를 시작하고 끝낸다 — 유닛 판정으로
    // 흘려보내지 않는다.
    const item = itemAtPointer(ev.clientX, ev.clientY)
    if (item) {
      // 유닛을 끄는 중에 다른 손가락이 선반을 짚으면 drag 를 덮어써 진행
      // 중이던 유닛 드래그가 고아가 되고, 다음 pointerup 에서 엉뚱하게
      // 장착이 일어난다. 이미 뭔가 끄는 중이면 새 드래그를 시작하지 않는다.
      if (drag) return
      ev.preventDefault()
      drag = { item, x0: ev.clientX, y0: ev.clientY, moved: false }
      el.ghostImg.src = `/assets/ui/item_${item.id}.png`
      el.ghost.style.display = 'block'
      el.ghost.style.left = `${ev.clientX}px`
      el.ghost.style.top = `${ev.clientY}px`
      el.root.setPointerCapture(ev.pointerId)
      return
    }
    // 전투 중에는 판 위의 말이 로그에서 나온다 — 로스터에는 없으므로 따로 집는다.
    // 양쪽 진영 다 열린다: 상대가 뭘 세웠는지 보는 게 다음 라운드 준비다.
    if (!running) {
      const shown = onPickUnit?.(ev.clientX, ev.clientY)
      if (shown) {
        // 여기서 끝낸다. 아래로 흘려보내면 로스터에 없는 말이라 found 가 null 이
        // 되고, 그 줄의 hideInfo() 가 방금 연 패널을 도로 닫는다.
        showUnitCard(shown.unitId, shown.star, { team: shown.team, items: shown.items ?? [] })
        return
      }
    }
    const found = unitAtPointer(ev.clientX, ev.clientY)
    if (!found) {
      hideInfo()
      // 빈 땅을 짚었다 = 말을 집으려던 게 아니다. 아바타 목적지로 넘긴다 —
      // 손가락 하나뿐인 화면에서 "말 옮기기"와 "걸어가기"를 가르는 유일한
      // 단서가 무엇을 짚었느냐다.
      onGroundTap?.(ev.clientX, ev.clientY)
      return
    }
    // 전투 중에도 대기석 말은 집을 수 있다 (팔거나 자리를 옮긴다).
    // 판 위의 말은 잠근다 — 옮기면 리플레이와 어긋난다.
    if (!canTouch(found.uid)) return
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
    // 끌고 있지 않아도 좌표는 계속 적어 둔다 — 단축키가 이걸 쓴다.
    ptr.x = ev.clientX
    ptr.y = ev.clientY
    if (!drag) return
    if (!drag.moved && (Math.abs(ev.clientX - drag.x0) > TAP_SLOP || Math.abs(ev.clientY - drag.y0) > TAP_SLOP)) {
      drag.moved = true
      // 사거리 표시와 드롭 목표 표시가 같은 테두리를 쓴다. 둘을 겹치면
      // 어느 칸에 놓이는지가 안 읽힌다.
      hideInfo()
    }
    el.ghost.style.left = `${ev.clientX}px`
    el.ghost.style.top = `${ev.clientY}px`
    if (drag.item) highlightUnit(unitAtPointer(ev.clientX, ev.clientY))
    else highlight(dropTargetAt(ev.clientX, ev.clientY))
  })

  function endDrag(ev) {
    if (!drag) return

    // 아이템 드래그. 놓을 곳은 유닛이다.
    if (drag.item) {
      const held = drag
      drag = null
      el.ghost.style.display = 'none'
      clearHighlight()
      // 끌면 장착, 탭하면 정보. 말과 같은 규칙이다 — 판 위의 것은 전부
      // 같은 손짓으로 들여다볼 수 있어야 한다.
      if (!held.moved) return showItemCard(held.item.id)
      const found = unitAtPointer(ev.clientX, ev.clientY)
      if (!found) return
      // moveTo 와 같은 잠금이다 — 전투 중엔 판 위 말이 리플레이 스냅샷과
      // 묶여 있다. 벤치는 리플레이와 무관하니 그대로 둔다.
      if (!canTouch(found.uid)) return hint('싸우는 중인 말에는 못 낀다')
      const r = equipItem(run.state, found.uid, held.item.invIndex, data)
      if (!r.ok) hint(r.reason)
      else hint(`${itemById(data.items, held.item.id).name.ko} 장착`)
      refresh()
      return
    }

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
    if (!running && target.where === 'board') return hint('전투 중에는 판을 못 바꾼다')
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
      // 아바타는 배치 중에만 걷는다. 전투 중에는 리플레이가 무대를 쥐고 있어
      // 그 위를 돌아다니면 누가 싸우는 말인지 흐려진다.
      onTickAvatar?.(dt)
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
    syncToken++
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
    const jobs = [
      ...ids.flatMap((id) => [() => thumbFor(id, 1), () => thumbFor(id, 3)]),
      () => scene.preloadItemIcons(data.items.items.map((i) => i.id)),
      // 전투 이펙트도 부팅에서 받는다 — 첫 타격 프레임에 디코드가 걸리면
      // 하필 화면이 가장 바쁠 때 끊긴다.
      () => scene.preloadFx(),
    ]
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
    heroPortrait,
    /**
     * 배치 시간을 세운다. 튜토리얼이 쓴다 — 멈춰 두면 타이머 숫자가 그대로
     * 남아 "시간이 안 간다"가 화면에 보인다.
     */
    pauseTimer(on) {
      timerPaused = on
      el.timer.textContent = on ? '∞' : String(Math.ceil(timeLeft))
    },
    /** 지금 판으로 전투를 시작한다. 튜토리얼의 "싸우자" 버튼이 부른다. */
    fight() {
      if (boardCount(run.state) === 0) return false
      running = false
      onFight(toCombatEntries(run.state))
      return true
    },
    /** 배치 단계로 돌아온다. 화면 전환이 아니라 같은 무대의 상태 전환이다. */
    show() {
      running = true
      boardFrozen = false
      // 전투 중에는 판을 낀 합성을 미뤄 뒀다. 여기서 제한 없이 한 번 돌린다.
      if (resolveMerges(run.state, data) > 0) hint('합성 완료')
      resetTimer()
      last = performance.now()
      scene.resize()
      refresh()
      // 라운드가 넘어가면 상대도 바뀐다
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
