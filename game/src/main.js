// 부팅과 화면 전환. 규칙은 전부 sim/ 이 갖고 있고 여기는 배선만 한다.
//
// 흐름: 배치·상점 → 전투 리플레이 → 정산 → 다음 라운드 배치
//
// "상대가 어디서 오는가"는 전부 serverMatchmaker.js 가 안다. 홈에서 모드를
// 고르면 그 파일이 로비를 세우고, 여기는 받은 것을 화면에 잇는다.

import { loadData } from '@sim/data.js'
import { createRng } from '@sim/rng.js'
import { simulate } from '@sim/combat.js'
import { startRun, refreshShop, grantItem } from '@sim/roster.js'
import { roundIncome, addXp } from '@sim/economy.js'
import { roundAt, totalRounds, defeatDamage, grantIndices, itemSeed } from '@sim/rounds.js'
import { setupTutorial } from '@sim/tutorial.js'
import {
  resolveAvatar,
  avatarFile,
  avatarAnims,
  resolveBoard,
  boardColors,
} from '@sim/cosmetics.js'
import { createHome } from './home.js'
import { createStore } from './vxshop.js'
import { createCoach, isTutorialDone, markTutorialDone } from './tutorial.js'
import { createTutorialMatchmaker } from './tutorialMatchmaker.js'
import { createHeroView } from './heroView.js'
import { createAvatar } from './avatarView.js'
import { createJoystick } from './joystick.js'
import { createServerMatchmaker, connectServer, startQueue } from './serverMatchmaker.js'
import { createPrep } from './prep.js'
import { createBattle } from './battle.js'

const boot = document.getElementById('boot')

// ── 화면 맞추기 ───────────────────────────────────────────
//
// 기준 판은 세로 390. 가로는 실제 화면비를 따라가되 범위를 둔다 — 아주 길쭉한
// 화면에서 판이 띠처럼 늘어나면 판이 우표만 해지고, 정사각에 가까우면 상점 카드가
// 세로로 눌린다. 범위 밖에서는 위아래(또는 좌우)에 여백이 생긴다.
const DESIGN_H = 390
const DESIGN_W_MIN = 700
const DESIGN_W_MAX = 1040
function fitViewport() {
  const el = document.getElementById('viewport')
  if (!el) return
  const w = Math.round(
    Math.min(DESIGN_W_MAX, Math.max(DESIGN_W_MIN, (DESIGN_H * innerWidth) / innerHeight)),
  )
  const k = Math.min(innerWidth / w, innerHeight / DESIGN_H)
  el.style.width = `${w}px`
  el.style.height = `${DESIGN_H}px`
  el.style.transform = `translate(-50%, -50%) scale(${k})`
}
fitViewport()
addEventListener('resize', fitViewport)

try {
  const data = await loadData()

  // 런 하나의 모든 무작위성이 이 시드에서 나온다. 나중에 서버가 같은 시드로
  // 상점과 PvE 편성을 재현해 검산한다.
  const seed = Number(new URLSearchParams(location.search).get('seed') ?? 20260901)
  const rng = createRng(seed)

  const { state, pool } = startRun(data, rng)

  // 상대는 여기서만 나온다. 어느 모드로 갈지는 **홈이 정하고**, 이 변수는
  // 그 결과를 받는다. 서버가 안 붙으면 여기는 계속 null 이다 — 봇으로
  // 떨어지지 않는다. 봇과 붙으면서 사람과 붙는 줄 아는 것이 더 나쁘다.
  let mm = null
  const run = {
    state,
    pool,
    rng,
    seed,
    index: 1,
    round: roundAt(1, data.rounds).label,
    lastWon: null,
    // 메인화면에서 모드를 고른 뒤 enterGame 이 채운다. 그전까지 순위표는
    // 그릴 것이 없다 — prep 자체가 아직 안 열려 있다.
    lobby: [],
    opponentId: null,
  }

  // mm 이 늦게 정해지므로 호출 시점에 찾아 들어간다. 부팅 때 한 번
  // 꺼내 두면 메인화면에서 고른 모드가 반영되지 않는다.
  const roundSeed = (n) => mm.roundSeed(n)

  // 아이템 지급이 일어나는 라운드. 한 번만 센다.
  const itemRounds = grantIndices(data)

  /**
   * 그 라운드가 지급 라운드면 아이템 하나를 준다.
   *
   * **상점과 다른 RNG 스트림**을 쓴다. run.rng 에서 뽑으면 아이템을 뽑을
   * 때마다 상점 뽑기 순서가 밀려, 같은 시드로 저장한 결과가 전부 달라진다.
   */
  function grantIfDue(index) {
    if (!itemRounds.has(index)) return
    const id = grantItem(run.state, createRng(itemSeed(seed, index)), data)
    return id
  }

  /** 이번 라운드 대진을 짜고 화면이 읽는 자리에 적어 둔다. */
  function drawRound() {
    const { opponentId } = mm.round(run.index)
    run.opponentId = opponentId
  }

  // 마지막으로 서버에 알린 레벨. 레벨은 라운드에 한두 번 바뀌는데 판이
  // 바뀔 때마다 같이 보내면 서버가 룸 상태를 헛되이 쓰고 방송한다.
  let pushedLevel = 0

  /**
   * 배치가 바뀌었다고 서버에 알린다 — 남이 내 자리를 열어 두고 있으면
   * 방금 산 말이 그 화면에 바로 뜬다.
   *
   * mm 은 홈에서 모드를 고른 뒤에야 정해지므로 호출 시점에 읽는다. 배치가
   * 열리기 전에는 없으니 옵셔널 체이닝을 유지한다.
   */
  // 코치. 튜토리얼 중에만 있다. **prep 보다 먼저 선언한다** — createPrep 이
  // 생성 중에 refresh() 를 한 번 부르고, 그 refresh 가 아래 pushScout 를
  // 타므로 그때 이 변수가 이미 있어야 한다.
  let coach = null

  // 무대 위 아바타. 같은 이유로 prep 보다 먼저 선언한다 — prep 의 콜백이
  // 이 변수를 읽는다.
  let avatar = null

  /**
   * 고른 아바타. 지금은 이 기기에만 남는다 — 서버 프로필에 얹는 건 패스가
   * 붙는 조각에서 같이 한다(해금 여부를 서버가 쥐어야 잠금이 장식이 아니게
   * 된다). 못 읽어도 게임은 굴러가야 하므로 조용히 기본값으로 간다.
   */
  const AVATAR_KEY = 'rr.avatar'
  const BOARD_KEY = 'rr.board'
  function pickedAvatar() {
    return readKey(AVATAR_KEY)
  }
  function pickedBoard() {
    return readKey(BOARD_KEY)
  }
  function readKey(k) {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  }

  // 가상 조이스틱. 빈 땅을 짚으면 그 자리에 뜬다. 손가락으로 끌면 방향,
  // 톡 치면 그 지점으로 걸어간다.
  /** 지금 가진 것. 코스메틱 해금 판정이 이걸 본다. */
  function ownedNow() {
    return {
      lp: profileLp,
      passLevel: profilePassLevel,
      gems: profileGems,
      avatars: profileOwned,
    }
  }
  // 서버가 준 전적. 해금 판정에 쓴다 — 서버가 못 붙으면 비어 있어 잠긴 것은
  // 잠긴 채다. 반대로 두면 접속 실패가 곧 전체 해금이 된다.
  let profileLp = 0
  let profilePassLevel = 1
  let profileGems = 0
  let profileOwned = []

  /** 지금 내가 쓰는 무대. 못 가진 것을 골라 뒀으면 기본값으로 떨어진다. */
  function myBoardId() {
    return resolveBoard(pickedBoard(), data, ownedNow())
  }

  /** 서버가 준 전적을 화면과 해금 판정 양쪽에 흘린다. */
  function applyProfile(p) {
    profileLp = p?.lp ?? 0
    profilePassLevel = p?.pass?.level ?? 1
    profileGems = p?.gems ?? 0
    profileOwned = p?.owned ?? []
    home.setProfile(p)
    // 무대 스킨은 **전적이 온 뒤에** 다시 입힌다. 부팅 때는 아직 무엇을
    // 갖고 있는지 몰라 잠긴 무대가 기본으로 떨어진다 — 그 상태로 두면 산
    // 무대가 판을 한 번 들어갔다 나와야 보인다.
    prep.scene.setSkin(boardColors(myBoardId(), data))
  }

  // 무대 견본 캐시. id 하나에 그림 한 장.
  const boardShots = new Map()

  const stick = createJoystick({
    root: document.getElementById('viewport'),
    onMove: (dx, dy) => avatar?.setStick(dx, dy),
    onTap: (x, y) => avatar?.goTo(x, y),
  })

  // 남의 아바타. **지금 보고 있는 판 위에 서 있는 사람들**이다.
  //
  // 아바타의 존재 이유가 여기 있다: 내가 남의 판을 구경 가면 내 아바타가 그
  // 판에 나타나고, 그래서 그 사람은 "누가 내 판을 보고 있다"를 안다. 한 판에
  // 여럿이 몰릴 수 있으므로 좌석마다 하나씩 만들어 둔다(최대 7).
  const peers = new Map()

  /** 그 좌석의 아바타 뷰. 처음 보는 좌석이면 만든다. */
  function peerFor(seatId) {
    if (peers.has(seatId)) return peers.get(seatId)
    // 자리를 먼저 잡아 둔다 — 안 그러면 만드는 사이에 프레임이 또 들어와
    // 같은 좌석의 아바타를 여러 벌 만든다.
    peers.set(seatId, null)
    createAvatar({ scene: prep.scene, data })
      .then((a) => peers.set(seatId, a))
      .catch(() => peers.delete(seatId))
    return null
  }

  /**
   * 아바타 한 프레임. 움직였을 때만 서버로 보낸다 — 가만히 서 있는 사람의
   * 좌표를 초당 몇 번씩 보내면 그게 곧 대역 낭비다.
   */
  function tickAvatar(dt, peeked) {
    // 지금 화면에 떠 있는 판. 남의 판을 구경 중이면 그 좌석, 아니면 내 자리다.
    const here = peeked ?? mySeatId()

    if (avatar) {
      // 내 아바타는 **보고 있는 판 위에** 있다. 구경 갔으면 거기 서 있는 게
      // 맞다 — 그게 상대에게 "누가 왔다"로 보인다.
      avatar.setVisible(true)
      if (avatar.tick(dt)) mm?.pushAvatar?.(avatar.position, here)
    }

    // 이 판에 와 있는 남들. 온 사람만 그린다.
    const hereNow = new Set()
    for (const p of mm?.avatarsOn?.(here) ?? []) {
      hereNow.add(p.id)
      const v = peerFor(p.id)
      if (!v) continue
      v.setVisible(true)
      v.setTarget({ x: p.x, z: p.z })
      v.tick(dt)
    }
    // 떠난 사람은 감춘다. 지우지 않는 이유: 곧 돌아올 수 있고, 모델을 다시
    // 만드는 것보다 세워 둔 채 감추는 편이 싸다.
    for (const [id, v] of peers) if (v && !hereNow.has(id)) v.setVisible(false)
  }

  /** 내 좌석 번호. 로비가 아직 없으면 0(튜토리얼도 0번이다). */
  function mySeatId() {
    return run.lobby.find((s) => s.isPlayer)?.id ?? 0
  }

  function pushScout(entries) {
    // 판이 바뀌면 단계가 넘어갔는지 코치가 다시 본다. refresh() 가 판이
    // 바뀌는 모든 자리에서 불리므로 여기 하나면 빠뜨릴 곳이 없다.
    coach?.sync()
    mm?.pushBoardLive?.(entries)
    if (run.state.level === pushedLevel) return
    pushedLevel = run.state.level
    mm?.pushLevel?.(run.state.level)
  }

  // 무대는 **하나**다. 배치가 만들고 전투가 이어 쓴다 — 화면을 갈아끼우지 않으므로
  // 전투가 "다른 화면으로 넘어가는 일"이 아니라 "그 자리에서 시작되는 일"이 된다.
  const prep = await createPrep({
    data,
    run,
    onFight: startFight,
    onWatch: watchFight,
    onBoardChange: pushScout,
    // 빈 땅을 짚으면 아바타 차례다. 끌면 조이스틱, 톡 치면 그리로 걸어간다.
    // 말을 짚었으면 prep 이 먼저 드래그로 처리하므로 여기까지 안 온다.
    onGroundDown: (ev) => stick?.start(ev),
    onGroundMove: (ev) => stick?.move(ev),
    onGroundUp: (ev) => stick?.end(ev),
    onTickAvatar: (dt, peeked) => tickAvatar(dt, peeked),
    /**
     * 남의 판을 열었다/닫았다. 무대를 그 사람 것으로 갈아 끼운다 —
     * TFT 의 아레나 스킨과 같은 규칙이다: 무대는 **주인 것**이 보인다.
     * 그래야 남에게 보여 줄 수 있는 물건이 되고, 그게 이걸 파는 이유다.
     */
    onPeek: (seat) => {
      const id = seat ? (seat.skin ?? data.cosmetics.boardDefault) : myBoardId()
      prep.scene.setSkin(boardColors(id, data))
    },
    // battle 은 prep 다음에 만들어진다. 화살표 안에서 읽으므로 그때는 이미 있다.
    onPickUnit: (x, y) => battle?.unitAt(x, y) ?? null,
  })
  const battle = await createBattle({ data, scene: prep.scene })

  // 리소스를 전부 받고 나서 연다.
  const bootBar = boot.querySelector('.bar i')
  const bootPct = boot.querySelector('.pct')
  await prep.preload((t) => {
    const pct = Math.round(t * 100)
    if (bootBar) bootBar.style.width = `${pct}%`
    if (bootPct) bootPct.textContent = `${pct}%`
  })

  boot.remove()

  // ── 메인화면 ────────────────────────────────────────────
  //
  // 부팅이 끝나면 바로 게임이 아니라 여기가 뜬다. 모드를 고르는 곳이라
  // 없으면 매칭이란 개념 자체가 설 자리가 없다.
  //
  // 서버가 필수다. 못 붙으면 못 논다 — 봇과 붙으면서 사람과 붙는 줄 아는
  // 것보다 못 붙었다고 듣는 편이 낫다.
  let queue = null
  let server = null

  // 결제. 지급은 서버 훅이 하고 여기서는 결제창을 열고 결과만 받는다.
  const vxshop = createStore({
    onPurchased: async () => {
      // 서버 훅이 먼저 끝났다는 보장이 없다. 그래도 다시 읽는 편이 낫다 —
      // 안 읽으면 산 사람이 홈을 나갔다 와야 잔액이 는다.
      try {
        applyProfile(await server?.remoteFunction('getProfile', []))
      } catch {}
    },
  })

  const home = createHome({
    data,
    onPick: (mode) => (mode === 'tutorial' ? startTutorial() : startMatch(mode)),
    onCancelQueue: () => {
      queue?.cancel()
      queue = null
      home.setQueue(null)
    },
    onRetry: () => connect(),
    onPickedAvatar: () => resolveAvatar(pickedAvatar(), data, ownedNow()),
    onAvatarPortrait: (file) => prep.avatarPortrait(file),
    /**
     * 무대 견본. 진짜 판을 한 장 찍어 온다 — 색만 보여 주면 사는 사람이
     * 알고 싶은 "내 판이 어떻게 보이나"에 답이 안 된다.
     *
     * 한 번 찍은 것은 캐시한다. 목록을 열 때마다 다섯 장을 다시 그리면
     * 창이 열리는 순간 프레임이 끊긴다.
     */
    onBoardPortrait: async (id) => {
      if (boardShots.has(id)) return boardShots.get(id)
      const url = prep.scene.boardShot(boardColors(id, data), 200, 240)
      boardShots.set(id, url)
      return url
    },
    /**
     * 젬으로 아바타를 산다. 판정은 서버가 하고 여기서는 결과만 받는다 —
     * 여기서 잔액을 깎으면 서버가 거절해도 화면만 산 것처럼 남는다.
     */
    onStoreItems: () => vxshop.items(),
    /**
     * 결제창을 연다. 지급은 서버 훅($onItemPurchased)이 하므로 여기서는
     * 잔액을 건드리지 않는다 — 닫힘 신호를 받고 전적을 다시 읽는다.
     */
    onBuyPack: (productId) => vxshop.buy(productId),
    onBuyAvatar: async (id) => {
      if (!server) return { ok: false, why: '서버에 안 붙었다' }
      try {
        const res = await server.remoteFunction('buyAvatar', [id])
        if (res?.profile) applyProfile(res.profile)
        return res
      } catch {
        return { ok: false, why: '구매를 못 보냈다' }
      }
    },
    /**
     * 고른 아바타를 저장하고 **곧장 간판에 세운다.** 다음 판까지 기다리게
     * 하면 무엇을 골랐는지 확인할 방법이 없다.
     */
    onPickAvatar: (id) => {
      try {
        localStorage.setItem(AVATAR_KEY, id)
      } catch {
        // 못 적어도 이번 판에는 적용된다.
      }
      hero3d?.swap(avatarFile(id, data), avatarAnims(id, data)).catch(() => {})
    },
    onPickedBoard: () => resolveBoard(pickedBoard(), data, ownedNow()),
    /**
     * 무대를 골랐다. **곧장 판에 입힌다** — 다음 판까지 기다리게 하면 무엇을
     * 골랐는지 확인할 방법이 없다. 무대는 이미 서 있으므로 색만 갈아 끼운다.
     */
    onPickBoard: (id) => {
      try {
        localStorage.setItem(BOARD_KEY, id)
      } catch {
        // 못 적어도 이번 판에는 적용된다.
      }
      prep.scene.setSkin(boardColors(id, data))
      // 좌석에도 붙인다 — 남이 구경 왔을 때 보이는 값이다.
      mm?.pushSkin?.(id)
    },
    // 홈은 서버를 모른다. 순위표도 여기서 받아 넘긴다.
    onBoard: async () => {
      if (!server) return null
      try {
        return await server.remoteFunction('getLeaderboard', [10])
      } catch (err) {
        console.warn('순위표 실패:', err?.message)
        return null
      }
    },
  })
  home.show()
  // 간판은 **내가 착용한 아바타**다. 고른 것이 곧장 홈에 서야 고르는 의미가
  // 산다. 정지 초상을 먼저 걸고, 살아 있는 모델이 준비되면 그 뒤로 숨는다.
  const heroId = resolveAvatar(pickedAvatar(), data, ownedNow())
  const heroFile = avatarFile(heroId, data)
  prep.avatarPortrait(heroFile, 512).then(home.setHero).catch(() => {})

  // 실패하면 초상이 그대로 남는다 — 기기가 WebGL 컨텍스트를 더 못 줄 수도 있다.
  let hero3d = null
  createHeroView({
    scene: prep.scene,
    mount: document.getElementById('home-hero3d'),
    file: heroFile,
    anims: avatarAnims(heroId, data),
  })
    .then((v) => {
      hero3d = v
      home.setHeroLive()
      if (!document.getElementById('home').hidden) v.start()
    })
    .catch((err) => console.warn('간판 애니메이션 없이 간다:', err?.message))

  // 처음 온 사람도 **메인화면을 먼저 본다.** 부팅하자마자 게임 안으로 밀어
  // 넣으면 무슨 게임인지 보기도 전에 조작을 배우게 되고, 나가는 길도 모른다.
  // 대신 튜토리얼 버튼에 표를 달아 눈이 가게 한다.
  if (!isTutorialDone()) home.markTutorialNew()

  // ── 튜토리얼 ────────────────────────────────────────────
  //
  // 서버 없이 도는 **유일한** 경로다. 상대도 대본이 고정한다 — 무작위 봇을
  // 세우면 어떤 사람은 첫 전투에서 지고, 그러면 "이렇게 하면 이긴다"를
  // 가르칠 수가 없다.

  function startTutorial() {
    setupTutorial(run.state, data)
    coach = createCoach({
      run,
      onFight: () => prep.fight(),
      onSkip: () => endTutorial(),
    })
    enterGame(createTutorialMatchmaker({ data }))
    // 시간에 쫓기면 배우다 말고 전투에 끌려 들어간다.
    prep.pauseTimer(true)
    coach.show()
  }

  /** 튜토리얼을 닫고 홈으로 돌린다. 한 번 끝냈으면 다시 자동으로 안 뜬다. */
  function endTutorial() {
    markTutorialDone()
    coach?.hide()
    coach = null
    location.reload()
  }

  /** 서버에 붙고 전적을 받아 온다. 실패는 홈의 실패 상태로 끝난다. */
  async function connect() {
    home.setStatus('connecting')
    try {
      server = await connectServer()
    } catch (err) {
      console.warn('서버 접속 실패:', err?.message)
      home.setStatus('failed')
      return
    }
    home.setStatus('ready')
    // 전적은 홈에 머무는 동안 바뀌지 않는다 — 내 판이 끝나야 바뀌는데
    // 그때는 홈에 없다. 그래서 한 번만 받는다.
    try {
      const p = await server.remoteFunction("getProfile", [])
      applyProfile(p)
    } catch {
      home.setProfile(null)
    }
  }
  connect()

  /** 로비가 정해졌다. 판을 세우고 홈을 닫는다. */
  function enterGame(matchmaker) {
    mm = matchmaker
    run.lobby = mm.seats
    drawRound()
    home.hide()
    hero3d?.stop()
    document.getElementById('prep').hidden = false
    // 1라운드도 지급 라운드일 수 있다 — settle() 은 라운드 2부터 도니 여기서
    // 한 번은 짚어야 한다. 지금 일정은 1라운드가 아니라 no-op 이다.
    grantIfDue(run.index)
    // 내 무대를 좌석에 붙인다. 판에 들어올 때마다 보내는 이유: 좌석은 방마다
    // 새로 생기고 기본값으로 시작한다 — 안 보내면 남에게는 늘 기본 무대다.
    prep.scene.setSkin(boardColors(myBoardId(), data))
    mm?.pushSkin?.(myBoardId())
    prep.show()
    // 판이 선 뒤에 세운다 — 무대 범위(stageBounds)가 그때 정해진다.
    if (!avatar) {
      createAvatar({ scene: prep.scene, data, avatarId: pickedAvatar() })
        .then((a) => {
          avatar = a
          // 개발 중 확인용. 아바타는 화면에만 있어 콘솔에서 잡을 손잡이가 없다.
          if (import.meta.env.DEV && globalThis.__dev) globalThis.__dev.avatar = a
        })
        .catch((err) => console.warn('아바타 없이 간다:', err?.message))
    }
  }

  function startMatch(mode) {
    if (!server) return
    queue = startQueue({
      server,
      mode,
      data,
      onUpdate(r) {
        if (r.status === 'error') return
        home.setQueue({ mode, queued: r.queued, waitedMs: r.waitedMs ?? 0 })
      },
      async onMatched(roomId) {
        queue = null
        home.setQueue(null)
        try {
          enterGame(await createServerMatchmaker({ data, server, roomId }))
        } catch (err) {
          console.warn('방 입장 실패:', err?.message)
          home.setStatus('failed')
        }
      },
    })
    // 폴링 첫 응답이 오기 전에도 대기 중임이 보여야 한다.
    home.setQueue({ mode, queued: 1, waitedMs: 0 })
  }

  async function startFight(entries) {
    const info = roundAt(run.index, data.rounds)
    // 전투 시드를 라운드마다 다르게 준다. 같은 시드를 재사용하면
    // 치명타·타겟 순서가 매판 똑같아진다.
    const battleSeed = roundSeed(run.index)
    const enemy = mm.opponentBoard(run.index)
    // 최종 보드를 지금 올린다 — 서버가 같은 판으로 판정해야 결과가 일치한다.
    // 여기만 쓰로틀을 안 탄다(serverMatchmaker.pushBoard 참고).
    mm.pushBoard(entries)

    let result
    try {
      result = simulate({ boardA: entries, boardB: enemy, seed: battleSeed, data })
    } catch (err) {
      console.error(err)
      return
    }

    // 남의 대진도 지금 돌려 둔다 — 내 전투를 보는 중에 아무 사람이나 눌러
    // 그 판을 볼 수 있어야 하고, 그러려면 로그가 그때 이미 있어야 한다.
    // 체력 반영은 정산에서 한 번에 한다.
    run.otherFights = mm.otherFights(run.index)

    const onBack = () => settle(result, info)
    // 지금 무대에 올린 전투. 관전에서 돌아올 자리이자 정산의 근거다.
    run.fight = { result, onBack }
    run.watchId = 0

    // 전투 중에는 코치를 내린다 — 시킬 게 없는데 "싸우자" 가 계속 떠 있으면
    // 아직 안 누른 줄 안다. 결과가 나오면 finish() 가 다시 올린다.
    coach?.hide()
    prep.hide()
    await battle.load(result, { onBack })
  }

  /**
   * 그 사람의 이번 라운드 전투를 무대에 올린다.
   *
   * 어느 판을 보고 있든 **정산은 내 결과로** 한다 — 한 라운드의 전투들은
   * 이야기상 동시에 벌어지므로, 어느 쪽이 끝나든 라운드가 끝난 것이다.
   */
  function watchFight(seatId) {
    if (!run.fight) return
    const mine = seatId === 0 || seatId === run.opponentId
    const f = mine ? null : (run.otherFights ?? []).find((x) => x.a === seatId || x.b === seatId)
    if (!mine && !f) return
    run.watchId = seatId
    prep.refresh()
    // 한 라운드의 전투는 동시에 벌어진다 — 보던 시점 그대로 남의 판을 본다.
    // 0 부터 다시 틀면 내 판으로 돌아왔을 때 이미 본 전투를 또 보게 된다.
    battle.load(mine ? run.fight.result : f.result, {
      onBack: run.fight.onBack,
      atTick: battle.tick(),
    })
  }

  function settle(result, info) {
    const s = run.state
    const won = result.winner === 'A'

    // 연속 횟수는 승패 방향과 무관하게 센다 — 연승도 연패도 같은 표를 쓴다.
    s.streak = won === run.lastWon ? s.streak + 1 : 1
    run.lastWon = won

    if (!won) s.hp = Math.max(0, s.hp - defeatDamage(result.survivorsB, info.damage))
    run.lobby[0].hp = s.hp
    // 순위표가 내 연승도 같은 규칙으로 표시해야 한다.
    run.lobby[0].streak = s.streak
    run.lobby[0].lastWon = run.lastWon

    // 내가 이겼으면 상대도 잃는다. 순위표가 내 전투와 같은 규칙을 따라야 한다.
    const foe = mm.opponentSeat()
    if (won && foe) foe.hp = Math.max(0, foe.hp - defeatDamage(result.survivorsA, info.damage))
    // 전투를 시작할 때 이미 돌려 둔 결과를 여기서 반영한다
    mm.applyFights(run.otherFights ?? [], { stageDamage: info.damage })

    s.gold += roundIncome(
      { gold: s.gold, streak: s.streak, won, round: run.index },
      data.economy,
    ).total

    // 매 라운드 자동 XP. 구매와 같은 함수를 타야 레벨업 연쇄가 똑같이 돈다.
    const next = addXp(s.level, s.xp, data.levels.xpPerRound, data.levels)
    s.level = next.level
    s.xp = next.xp

    battle.hide()

    // 튜토리얼은 한 판이다. 전투를 본 것으로 배울 건 다 배웠다 — 그 뒤로
    // 계속 굴리면 상대가 허수아비 하나뿐인 게임이 이어진다.
    if (coach) {
      coach.finish(won)
      return
    }

    if (s.hp <= 0 || run.index >= totalRounds(data.rounds)) {
      alert(s.hp <= 0 ? `탈락 — 라운드 ${info.label}` : '런 완주')
      location.reload()
      return
    }

    run.index += 1
    run.round = roundAt(run.index, data.rounds).label
    mm.advance(run.index)
    drawRound()
    // 라운드가 넘어가면 상점은 공짜로 새로 깔린다
    refreshShop(s, run.pool, run.rng, data, { free: true })
    grantIfDue(run.index)
    prep.show()
  }
} catch (err) {
  // boot 는 부팅 성공 직후 지워진다. 여기서 무조건 건드리면 부팅 뒤에 난
  // 진짜 오류가 "textContent of null" 로 덮여 원인이 사라진다.
  if (boot.isConnected) boot.textContent = `시작할 수 없다: ${err.message}`
  throw err
}
