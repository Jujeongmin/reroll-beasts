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
  resolveBoom,
  boomFx,
} from '@sim/cosmetics.js'
import { createHome } from './home.js'
import { createStore } from './vxshop.js'
import {
  createCoach,
  isTutorialDone,
  markTutorialDone,
  askNameLater,
  takeNameAsk,
} from './tutorial.js'
import { createTutorialMatchmaker } from './tutorialMatchmaker.js'
import { createHeroView } from './heroView.js'
import { createAvatar } from './avatarView.js'
import { createJoystick } from './joystick.js'
import { createSettings, reduceMotion } from './settings.js'
import { applyStatic, t } from './i18n.js'
import { initAudio, sfx, bgm, bgmHold, bgmRelease, refreshVolumes } from './audio.js'
import { createServerMatchmaker, connectServer, startQueue } from './serverMatchmaker.js'
import { createPrep } from './prep.js'
import { createBattle } from './battle.js'
import { createResult } from './result.js'

const boot = document.getElementById('boot')
// 소리는 첫 손짓을 기다린다 — 브라우저가 그 전에는 재생을 막는다. 여기서
// 귀만 열어 두고, 무엇을 틀지는 화면들이 정한다.
initAudio()
// 눌리는 것에는 소리가 난다. **한 곳에서 잡는다** — 버튼마다 손으로 붙이면
// 버튼이 늘 때마다 하나씩 조용한 버튼이 생긴다.
addEventListener(
  'pointerdown',
  (ev) => {
    const b = ev.target.closest?.('button')
    // 꺼진 버튼은 아무 일도 안 하므로 소리도 안 난다 — 소리가 나면 눌린 줄 안다.
    if (b && !b.disabled) sfx('click')
  },
  true,
)
// 정적 문구를 지금 언어로 채운다. 화면을 세우기 전에 해야 첫 프레임부터 맞는
// 언어가 뜬다 — HTML 에 적힌 한국어는 표가 없을 때의 보루다.
applyStatic()

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
    // 어느 모드로 들어왔나. 결과판이 "점수가 움직였나"를 이 값으로 말한다 —
    // LP 는 랭크 판에서만 움직인다.
    mode: null,
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
    const { opponentId, iAmA } = mm.round(run.index)
    run.opponentId = opponentId
    // 이번 판에서 내가 A 진영인가. 서버와 같은 순서로 돌리기 위한 값이다.
    run.iAmA = iAmA !== false
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
  const BOOM_KEY = 'rr.boom'
  // 서버 프로필에 남아 있는 겉모습. **이쪽이 먼저다** — 기기 저장소는 서버를
  // 못 붙었을 때의 폴백이다. 반대로 두면 다른 기기에서 고른 것이 이 기기의
  // 오래된 값에 덮인다.
  let profileLook = null

  function pickedAvatar() {
    return profileLook?.avatar ?? readKey(AVATAR_KEY)
  }
  function pickedBoard() {
    return profileLook?.board ?? readKey(BOARD_KEY)
  }
  function pickedBoom() {
    return profileLook?.boom ?? readKey(BOOM_KEY)
  }

  /** 고른 것을 양쪽에 남긴다. 서버는 계정에, 저장소는 이 기기에. */
  function saveLook(key, id) {
    try {
      localStorage.setItem(key, id)
    } catch {
      // 못 적어도 이번 판에는 적용된다.
    }
    profileLook = { ...(profileLook ?? {}), [key.split('.')[1]]: id }
    mm?.pushLook?.(myBoardId(), pickedAvatar(), myBoomId())
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
      // 프리미엄 전용 보상은 단계만으로 안 열린다. 이 값이 빠지면 산 사람
      // 화면에서도 잠긴 채로 보인다 — 서버는 열어 주는데 화면만 잠긴다.
      premium: profilePremium,
      gems: profileGems,
      avatars: profileOwned,
    }
  }
  // 서버가 준 전적. 해금 판정에 쓴다 — 서버가 못 붙으면 비어 있어 잠긴 것은
  // 잠긴 채다. 반대로 두면 접속 실패가 곧 전체 해금이 된다.
  let profileLp = 0
  // 랭크 판수. 배치(첫 5판)·준배치(다음 10판)를 가른다. lp 와 같이 판 전 값이다.
  let profileRankedGames = 0
  let profilePassLevel = 1
  let profilePremium = false
  let profileGems = 0
  let profileOwned = []

  /** 지금 내가 쓰는 무대. 못 가진 것을 골라 뒀으면 기본값으로 떨어진다. */
  function myBoardId() {
    return resolveBoard(pickedBoard(), data, ownedNow())
  }

  /** 지금 내가 쓰는 승리 이펙트. */
  function myBoomId() {
    return resolveBoom(pickedBoom(), data, ownedNow())
  }

  // 전투 무대에 서는 상대 아바타. 내 아바타(avatar)의 짝이다 — 전투가
  // 끝나면 둘이 마주 보고 이긴 쪽이 한 방 날린다.
  let foe = null
  let foeId = null
  // 지금 마주 서 있는 상대 좌석. 대결 중에 그 사람이 내 판을 구경하고 있으면
  // 정찰 아바타로도 한 번 더 그려져 셋이 된다 — 대결 아바타가 그 사람이다.
  let duelWith = null

  /**
   * 맞은 자리 위에 피해 숫자를 한 번 띄운다.
   *
   * 좌석 체력을 애니메이션으로 깎지 않는 이유: 값이 두 군데(실제 체력과
   * 깎이는 중인 표시)가 되고, 어긋나면 화면이 조용히 거짓말한다. 이건 한 번
   * 뜨고 사라지므로 어긋날 상태가 안 남는다 — 값도 정산이 쓰는 그 숫자다.
   */
  function floatDamage(spot, amount) {
    if (!amount) return
    const V = prep.scene.THREE.Vector3
    const at = prep.scene.toScreen(new V(spot.x, prep.scene.topY + 1.1, spot.z))
    const el = document.createElement('div')
    el.className = 'dmgfx'
    el.textContent = `-${amount}`
    el.style.left = `${at.x}px`
    el.style.top = `${at.y}px`
    document.getElementById('viewport').appendChild(el)
    // 애니메이션이 끝나면 스스로 치운다. 남겨 두면 판마다 하나씩 쌓인다.
    setTimeout(() => el.remove(), 1200)
  }

  /** 전투 무대의 두 자리. 판 뒤쪽(내 쪽)과 앞쪽(상대 쪽) 가운데다. */
  function duelSpots() {
    const b = prep.scene.stageBounds()
    const cx = (b.minX + b.maxX) / 2
    const d = b.maxZ - b.minZ
    const near = { x: cx, z: b.maxZ - d * 0.1 }
    const far = { x: cx, z: b.minZ + d * 0.1 }
    // 내가 B 진영이면 카메라가 반대편에 앉는다(setSideFlip) — 그때는 -z 가
    // 화면 아래다. 내 아바타는 언제나 **화면 아래**에 서야 한다.
    const flipped = run.fight ? run.fight.iAmA === false : run.iAmA === false
    return flipped ? { mine: far, theirs: near } : { mine: near, theirs: far }
  }

  /**
   * 전투가 시작될 때 두 아바타를 마주 세운다.
   *
   * 배치 중에는 아바타가 판 위를 걸어 다니지만, 전투 중에는 **자리에 선다** —
   * 싸우는 말 사이를 돌아다니면 누가 싸우는지 흐려지고, 끝에 한 방 날릴
   * 자리도 매번 달라진다.
   */
  async function setDuel(theirAvatarId) {
    const spot = duelSpots()
    duelWith = run.opponentId
    // 마주 본다. 내 쪽은 위(-z), 상대는 아래(+z)를 향한다.
    avatar?.warpTo(spot.mine, Math.PI)
    avatar?.setVisible(true)
    if (foe && foeId !== theirAvatarId) {
      foe.dispose()
      foe = null
    }
    foeId = theirAvatarId
    if (!foe) {
      foe = await createAvatar({
        scene: prep.scene,
        data,
        avatarId: theirAvatarId,
        at: spot.theirs,
        facing: 0,
      }).catch(() => null)
    }
    foe?.warpTo(spot.theirs, 0)
    foe?.setVisible(true)
  }

  /** 전투가 끝나고 배치로 돌아간다. 상대 아바타는 치운다. */
  function clearDuel() {
    foe?.setVisible(false)
    duelWith = null
  }

  /**
   * 마무리 한 방. 이긴 아바타가 진 아바타에게 던지고, 맞은 자리에서
   * 승리 이펙트가 터진다.
   *
   * 순서가 중요하다 — 던지는 게 먼저 보이고 그다음에 터져야 '누가 이겨서
   * 저게 떨어졌다'로 읽힌다. 반대면 이펙트가 먼저 터지고 뒤늦게 뭔가 날아온다.
   */
  function duelStrike(iWon, fx) {
    const spot = duelSpots()
    const from = iWon ? spot.mine : spot.theirs
    const to = iWon ? spot.theirs : spot.mine
    const win = iWon ? avatar : foe
    const lose = iWon ? foe : avatar
    const y = prep.scene.topY + 0.55
    const V = prep.scene.THREE.Vector3
    win?.act('cheer')
    const flight = prep.scene.flyFx(
      fx.spark ?? 'spark',
      new V(from.x, y, from.z),
      new V(to.x, y, to.z),
      { color: new prep.scene.THREE.Color(fx.color ?? '#ffd166').getHex(), size: 1.4, life: 0.5 },
    )
    // 맞는 순간에 맞춘다. 먼저 터지면 던진 것과 터진 것이 따로 논다.
    setTimeout(() => lose?.act('poke'), flight * 1000)
    return flight * 1000
  }

  /**
   * 전투가 끝났다. **이긴 쪽 이펙트를 진 쪽 판에** 떨어뜨린다.
   *
   * 진영('A'/'B')이 아니라 **누가 이겼나**로 판단한다. 내가 B 진영일 수
   * 있어서다(서버는 좌석 번호가 낮은 쪽을 A 로 놓는다) — 'A = 나' 로 두면
   * 내가 진 판에서 내 이펙트가 터진다.
   *
   * @param {string} winner  'A' | 'B' | 'draw'
   * @param {object} o
   * @param {boolean} o.iAmA   이 전투에서 내가 A 진영인가
   * @param {string} o.myBoom  내 이펙트 id
   * @param {string} o.foeBoom 상대 이펙트 id
   */
  function playWinFx(winner, { iAmA = true, myBoom, foeBoom, damage = 0 }) {
    // 무승부면 아무것도 안 터진다 — 이긴 사람이 없다.
    if (winner !== 'A' && winner !== 'B') return
    const iWon = winner === (iAmA ? 'A' : 'B')
    const fx = boomFx((iWon ? myBoom : foeBoom) ?? data.cosmetics.boomDefault, data)
    // 아바타가 먼저 던지고, 맞은 뒤에 판이 터진다.
    const hitMs = duelStrike(iWon, fx)
    // **맞은 아바타 자리**에서 터진다. 판 한복판이면 누가 맞았는지가 아니라
    // 판이 반짝한 것으로 보인다.
    const spot = duelSpots()
    const at = iWon ? spot.theirs : spot.mine
    setTimeout(() => {
      prep.scene.playBoom(fx, { at })
      // 이겼으면 크게, 졌으면 작게. 같은 크기로 나면 진 판에서도 축포처럼
      // 들린다.
      sfx('boom', { gain: iWon ? 1 : 0.6 })
      floatDamage(at, damage)
    }, hitMs)
  }

  /** 서버가 준 전적을 화면과 해금 판정 양쪽에 흘린다. */
  function applyProfile(p) {
    profileLp = p?.lp ?? 0
    profileRankedGames = p?.rankedGames ?? 0
    profilePassLevel = p?.pass?.level ?? 1
    profilePremium = !!p?.pass?.premium
    profileGems = p?.gems ?? 0
    profileOwned = p?.owned ?? []
    profileLook = p?.look ?? null
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
    // 짚은 자리에 표시를 남긴다. 없으면 "눌러도 반응이 없다"로 읽힌다 —
    // 아바타는 반 박자 뒤에 움직이고, 화면 구석에 서 있으면 그마저 안 보인다.
    onTap: (x, y) => {
      const at = avatar?.goTo(x, y)
      if (at) prep.scene.markMove(at.x, at.z, { ripple: !reduceMotion() })
    },
  })

  // 남의 아바타. **지금 보고 있는 판 위에 서 있는 사람들**이다.
  //
  // 아바타의 존재 이유가 여기 있다: 내가 남의 판을 구경 가면 내 아바타가 그
  // 판에 나타나고, 그래서 그 사람은 "누가 내 판을 보고 있다"를 안다. 한 판에
  // 여럿이 몰릴 수 있으므로 좌석마다 하나씩 만들어 둔다(최대 7).
  const peers = new Map()
  // 그 좌석을 무슨 아바타로 만들었는지. 바뀌면 다시 만든다 — 안 그러면
  // 남이 아바타를 바꿔도 내 화면에는 처음 본 모습이 남는다.
  const peerLook = new Map()

  /**
   * 그 좌석의 아바타 뷰. 처음 보는 좌석이면 만든다.
   *
   * **그 사람이 고른 아바타**로 만든다. 기본 캐릭터로 세우면 아바타를 산
   * 값이 화면에 안 남는다 — 남에게 보이는 것이 이 물건의 전부다.
   */
  function peerFor(seatId) {
    const seat = run.lobby.find((s) => s.id === seatId)
    const want = seat?.avatar ?? null
    if (peers.has(seatId) && peerLook.get(seatId) === want) return peers.get(seatId)
    if (peers.has(seatId)) {
      peers.get(seatId)?.dispose()
      peers.delete(seatId)
    }
    // 자리를 먼저 잡아 둔다 — 안 그러면 만드는 사이에 프레임이 또 들어와
    // 같은 좌석의 아바타를 여러 벌 만든다.
    peers.set(seatId, null)
    peerLook.set(seatId, want)
    createAvatar({ scene: prep.scene, data, avatarId: want })
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
      // 목적지 표시는 아바타가 쥔 목적지를 그대로 따른다. 도착하면 사라지고,
      // 조이스틱을 잡아 목적지를 버려도 같이 꺼진다 — 안 가는 곳을 가리키는
      // 표시가 남으면 그게 거짓말이다.
      const goal = avatar.goal
      prep.scene.setGoal(goal ? goal.x : null, goal?.z)
    }

    // 이 판에 와 있는 남들. 온 사람만 그린다.
    const hereNow = new Set()
    for (const p of mm?.avatarsOn?.(here) ?? []) {
      // 나는 안 그린다(내 방송이 되돌아와도). 대결 상대도 안 그린다 — 그 사람은
      // 이미 대결 자리에 서 있다. 둘 다 안 걸러 셋이 서 있던 적이 있다.
      if (p.id === mySeatId() || (duelWith !== null && p.id === duelWith)) continue
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
  const bootWalker = boot.querySelector('#boot-walker')
  await prep.preload((done) => {
    // done 은 0~1. 전에 t 라고 불렀는데 i18n 의 t 와 겹쳐 이름을 바꾸다 이 줄을
    // 놓쳤고, 로딩 화면에 NaN% 가 떴다 — 함수에 100 을 곱한 값이다.
    const pct = Math.round(done * 100)
    if (bootBar) bootBar.style.width = `${pct}%`
    if (bootPct) bootPct.textContent = `${pct}%`
    // 말이 채워진 끝을 밟고 간다. 진행도와 따로 걸으면 걷는 시늉만 하는
    // 장식이 되고, 그러면 얼마나 남았는지를 두 번 봐야 한다.
    if (bootWalker) bootWalker.style.left = `${pct}%`
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

  /**
   * 설정 창. **홈과 인게임이 이 한 벌을 같이 쓴다.**
   *
   * 항복은 서버가 판정한다 — 화면만 닫으면 그 방은 내가 살아 있는 줄 알고
   * 계속 돌고, 남은 사람들이 유령과 대진을 잡는다.
   */
  /**
   * 결과판. 판이 끝나면 뜬다.
   *
   * 나가면 화면을 다시 띄운다 — 남은 판 상태를 손으로 되돌리는 것보다
   * 확실하다(튜토리얼을 끝냈을 때, 항복했을 때 쓰는 방식과 같다).
   */
  // 이름을 resultView 로 둔다. settle(result, info) 의 매개변수가 전투 결과라
  // 여기서 result 라고 부르면 그 안에서 이 창을 못 본다 — 판이 끝나는 그
  // 순간에만 터지는 종류의 어긋남이다.
  const resultView = createResult({
    data,
    thumbFor: (id, star) => prep.thumbFor(id, star),
    onClose: () => location.reload(),
    // 광고를 끝까지 봤다. 지급은 서버가 판정한다 — 등수·판·하루 상한을 서버가
    // 알고, 클라는 지면 id 와 SDK 가 준 requestId 만 보낸다.
    onAd: async (placementId, requestId) => {
      try {
        const res = await server?.remoteFunction('claimAdReward', [placementId, requestId])
        if (res?.profile) applyProfile(res.profile)
        return res
      } catch (err) {
        console.warn('광고 보상 실패:', err?.message)
        return { ok: false, why: 'failed' }
      }
    },
  })

  const settings = createSettings({
    account: () => server?.account ?? '',
    onSurrender: async () => {
      try {
        await server?.remoteFunction('surrender', [])
      } catch (err) {
        console.warn('항복 실패:', err?.message)
      }
      // 결과 화면을 거치지 않는다 — 내가 끝낸 판이라 "졌습니다"를 다시 보여 줄
      // 이유가 없다. 화면을 다시 띄우는 편이 남은 상태를 손으로 되돌리는 것보다
      // 확실하다(튜토리얼을 끝냈을 때 쓰는 방식과 같다).
      location.reload()
    },
    onVolume: () => refreshVolumes(),
    // 언어가 갈렸다. 창 안만 그리면 뒤에 깔린 홈과 판이 옛 언어로 남는다.
    onLang: () => {
      applyStatic()
      home.redraw?.()
      prep?.refresh?.()
    },
    onReset: async () => {
      try {
        await server?.remoteFunction('resetAccount', [])
      } catch (err) {
        // 서버를 못 붙어도 기기 저장은 이미 지웠다. 그 사실을 남긴다.
        console.warn('계정 초기화 실패:', err?.message)
      }
    },
  })
  document.getElementById('btn-ingame-settings').addEventListener('click', () => {
    sfx('open')
    settings.open({ inGame: true })
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
    onSettings: () => {
      sfx('open')
      settings.open({ inGame: false })
    },
    /** 미션 수령. 판정은 서버가 하고, 돌아온 프로필을 그대로 흘린다 —
     *  젬·패스 단계가 같이 바뀐다. */
    onClaimMission: async (index) => {
      try {
        const res = await server?.remoteFunction('claimMission', [index])
        if (res?.profile) applyProfile(res.profile)
        return res
      } catch (err) {
        // 서버가 그 함수를 아직 모를 수 있다(배포가 화면보다 늦는 경우).
        // 던지면 버튼이 눌린 채로 굳는다 — 실패로 돌려 다시 누르게 둔다.
        console.warn('미션 수령 실패:', err?.message)
        return { ok: false, why: 'now_locked' }
      }
    },
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
    /**
     * 이름을 정한다. 검산은 서버가 한다 — 여기서 통과시킨 것도 서버가 막을
     * 수 있고, 그때는 서버 말이 맞다.
     */
    onSetName: async (name) => {
      if (!server) return { ok: false, why: 'offline' }
      try {
        const res = await server.remoteFunction('setName', [name])
        if (res?.profile) applyProfile(res.profile)
        return res
      } catch {
        return { ok: false, why: 'send_failed' }
      }
    },
    onStoreItems: () => vxshop.items(),
    /**
     * 결제창을 연다. 지급은 서버 훅($onItemPurchased)이 하므로 여기서는
     * 잔액을 건드리지 않는다 — 닫힘 신호를 받고 전적을 다시 읽는다.
     */
    onBuyPack: (productId) => vxshop.buy(productId),
    onBuyAvatar: async (id) => {
      if (!server) return { ok: false, why: 'offline' }
      try {
        const res = await server.remoteFunction('buyAvatar', [id])
        if (res?.profile) applyProfile(res.profile)
        return res
      } catch {
        return { ok: false, why: 'send_failed' }
      }
    },
    /**
     * 고른 아바타를 저장하고 **곧장 간판에 세운다.** 다음 판까지 기다리게
     * 하면 무엇을 골랐는지 확인할 방법이 없다.
     */
    onPickAvatar: (id) => {
      saveLook(AVATAR_KEY, id)
      hero3d?.swap(avatarFile(id, data), avatarAnims(id, data)).catch(() => {})
      // 판 안이면 좌석에도 붙인다 — 구경 온 사람 화면의 내 모습이 바뀐다.
      mm?.pushLook?.(myBoardId(), id, myBoomId())
      // 내 무대 위 아바타도 갈아 끼운다. 다음 판까지 기다리면 방금 고른 것이
      // 어떻게 생겼는지 확인할 방법이 없다.
      if (avatar) {
        avatar.dispose()
        avatar = null
        createAvatar({ scene: prep.scene, data, avatarId: id })
          .then((a) => (avatar = a))
          .catch(() => {})
      }
    },
    onPickedBoard: () => resolveBoard(pickedBoard(), data, ownedNow()),
    onPickedBoom: () => myBoomId(),
    /**
     * 승리 이펙트를 골랐다. 고른 자리에서 **한 번 터뜨려 보여 준다** —
     * 이건 이겨야 보이는 물건이라 안 틀어 주면 다음 승리까지 무엇을 샀는지
     * 알 수 없다.
     */
    onPickBoom: (id) => {
      saveLook(BOOM_KEY, id)
      prep.scene.playBoom(boomFx(id, data), { enemyHalf: true })
    },
    /**
     * 무대를 골랐다. **곧장 판에 입힌다** — 다음 판까지 기다리게 하면 무엇을
     * 골랐는지 확인할 방법이 없다. 무대는 이미 서 있으므로 색만 갈아 끼운다.
     */
    onPickBoard: (id) => {
      saveLook(BOARD_KEY, id)
      prep.scene.setSkin(boardColors(id, data))
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
  bgm('home')
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
      data,
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
    // 홈에 나가 서버에 붙으면 이름을 묻는다. 여기서 못 묻는 이유: 이름은
    // 서버가 저장하는데 튜토리얼은 서버 없이 돈다.
    askNameLater()
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
    // 미션 추첨이 계정을 쓴다. 붙은 뒤에야 알 수 있는 값이다.
    home.setAccount(server.account)
    // 전적은 홈에 머무는 동안 바뀌지 않는다 — 내 판이 끝나야 바뀌는데
    // 그때는 홈에 없다. 그래서 한 번만 받는다.
    try {
      const p = await server.remoteFunction("getProfile", [])
      applyProfile(p)
      // 튜토리얼을 막 끝냈고 아직 이름이 없으면 지금 묻는다. **여기가 자연스러운
      // 자리다** — 방금 한 판을 끝냈고, 다음은 남과 붙는 판이라 남의 화면에 뜰
      // 이름이 처음으로 필요해진다. 이미 이름이 있으면 안 묻는다.
      if (takeNameAsk() && !p?.name) {
        home.openName({ why: t('name.askAfterTutorial') })
      }
    } catch {
      home.setProfile(null)
    }
  }
  connect()

  /** 로비가 정해졌다. 판을 세우고 홈을 닫는다. */
  function enterGame(matchmaker, mode = null) {
    mm = matchmaker
    run.mode = mode
    run.lobby = mm.seats
    drawRound()
    home.hide()
    bgm('battle')
    hero3d?.stop()
    document.getElementById('prep').hidden = false
    // 1라운드도 지급 라운드일 수 있다 — settle() 은 라운드 2부터 도니 여기서
    // 한 번은 짚어야 한다. 지금 일정은 1라운드가 아니라 no-op 이다.
    grantIfDue(run.index)
    // 내 무대를 좌석에 붙인다. 판에 들어올 때마다 보내는 이유: 좌석은 방마다
    // 새로 생기고 기본값으로 시작한다 — 안 보내면 남에게는 늘 기본 무대다.
    prep.scene.setSkin(boardColors(myBoardId(), data))
    mm?.pushLook?.(myBoardId(), pickedAvatar(), myBoomId())
    prep.show()
    // 판이 선 뒤에 세운다 — 무대 범위(stageBounds)가 그때 정해진다.
    if (!avatar) {
      createAvatar({ scene: prep.scene, data, avatarId: pickedAvatar(), mine: true })
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
          enterGame(
            await createServerMatchmaker({
              data,
              server,
              roomId,
              // 등수는 내 체력이 0 이 되는 순간이 아니라 서버가 박는 순간에
              // 온다. 결과판이 이미 떠 있으면 그 자리에서 다시 그린다.
              onSeats: (seats) => resultView.seatsChanged(seats),
            }),
            mode,
          )
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
    // 판 밖에서 불리면 할 일이 없다. 매치메이커가 상대·시드·판정을 다 쥐고
    // 있어서, 없으면 여기서 멈추는 것이 맞다 — 계속 가면 mm.roundSeed 에서
    // null 을 읽고 화면이 통째로 죽는다.
    if (!mm) {
      console.warn('판 밖에서 전투를 시작하려 했다 — 무시한다')
      return
    }
    const info = roundAt(run.index, data.rounds)
    // 전투 시드를 라운드마다 다르게 준다. 같은 시드를 재사용하면
    // 치명타·타겟 순서가 매판 똑같아진다.
    const battleSeed = roundSeed(run.index)
    const enemy = mm.opponentBoard(run.index)
    // 최종 보드를 지금 올린다 — 서버가 같은 판으로 판정해야 결과가 일치한다.
    // 여기만 쓰로틀을 안 탄다(serverMatchmaker.pushBoard 참고).
    mm.pushBoard(entries)

    // **서버와 같은 진영 순서로 돌린다.** 좌석 번호가 낮은 쪽이 A 다. 내가
    // 늘 A 라고 두면 같은 시드로도 다른 전투가 나온다 — 전투가 A/B 대칭이
    // 아니기 때문이다(같은 판끼리 붙이면 늘 B 가 이긴다). 그러면 화면이 낸
    // 승패·피해가 서버 판정과 어긋나고, 다음 방송이 올 때 체력이 튄다.
    const iAmA = run.iAmA !== false
    let result
    try {
      result = simulate({
        boardA: iAmA ? entries : enemy,
        boardB: iAmA ? enemy : entries,
        seed: battleSeed,
        data,
      })
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
    // iAmA 를 같이 들고 있어야 정산과 연출이 "어느 쪽이 나인가"를 안다.
    run.fight = { result, onBack, iAmA }
    // 내가 B 면 무대를 반대편에서 본다. 로그의 자리는 진영이 정하는데, 판의
    // 벌집은 180° 회전에 딱 맞아떨어지지 않아 로그를 뒤집을 수 없다 — 카메라를
    // 옮겨 앉는 것이 유일하게 정확한 방법이다.
    prep.scene.setSideFlip(!iAmA)
    // 내 판을 보고 있다는 표시. **0 이 아니라 내 좌석 번호다** — 매치 방에서
    // 내 자리는 계정 순서로 정해지고 0 이 아닐 수 있다.
    run.watchId = mySeatId()

    // 전투 중에는 코치를 내린다 — 시킬 게 없는데 "싸우자" 가 계속 떠 있으면
    // 아직 안 누른 줄 안다. 결과가 나오면 finish() 가 다시 올린다.
    coach?.hide()
    prep.hide()
    // 전투 소리가 서는 자리를 비운다. 판 안 곡은 낮게 깔리지만, 그 위로
    // 타격·죽음·폭발이 겹치면 무슨 소리가 났는지가 뭉갠다. 끄지 않고 멈추므로
    // 배치로 돌아오면 곡이 이어진다(매 라운드 도입부만 듣게 되지 않는다).
    bgmHold()
    // 두 아바타를 마주 세운다 — 끝에 한 방 주고받을 자리다.
    setDuel(run.lobby.find((x) => x.id === run.opponentId)?.avatar)
    await battle.load(result, {
      onBack,
      // 전투 중에도 아바타는 숨을 쉬어야 한다 — 배치 루프가 멈춰 있어서
      // 여기서 믹서를 돌리지 않으면 둘 다 굳은 채로 서 있다.
      onFrame: (dt) => {
        avatar?.tick(dt)
        foe?.tick(dt)
      },
      // 상대 이펙트는 그 좌석에 붙어 온다 — 내가 지면 그 사람 것이 내 판에
      // 떨어져야 한다.
      onEnd: (winner) =>
        playWinFx(winner, {
          iAmA,
          myBoom: myBoomId(),
          foeBoom: run.lobby.find((x) => x.id === run.opponentId)?.boom,
          // 진 쪽이 받을 피해. 정산이 쓰는 그 값이다 — 화면에 다른 숫자가
          // 뜨면 체력이 왜 그만큼 줄었는지 안 맞는다.
          damage: defeatDamage(
            winner === 'A' ? result.survivorsA : result.survivorsB,
            info.damage,
          ),
        }),
    })
  }

  /**
   * 그 사람의 이번 라운드 전투를 무대에 올린다.
   *
   * 어느 판을 보고 있든 **정산은 내 결과로** 한다 — 한 라운드의 전투들은
   * 이야기상 동시에 벌어지므로, 어느 쪽이 끝나든 라운드가 끝난 것이다.
   */
  function watchFight(seatId) {
    if (!run.fight) return
    const mine = seatId === mySeatId() || seatId === run.opponentId
    const f = mine ? null : (run.otherFights ?? []).find((x) => x.a === seatId || x.b === seatId)
    if (!mine && !f) return
    run.watchId = seatId
    // 무대를 어느 쪽에서 볼지 다시 정한다. 남의 판은 A(=좌석 번호가 낮은 쪽)를
    // 아래에 두고 보고, 내 판으로 돌아오면 내 진영에 맞춰 앉는다.
    prep.scene.setSideFlip(mine ? run.fight.iAmA === false : false)
    prep.refresh()
    // 한 라운드의 전투는 동시에 벌어진다 — 보던 시점 그대로 남의 판을 본다.
    // 0 부터 다시 틀면 내 판으로 돌아왔을 때 이미 본 전투를 또 보게 된다.
    const boomOfSeat = (id) =>
      id === mySeatId() ? myBoomId() : run.lobby.find((x) => x.id === id)?.boom
    const avatarOfSeat = (id) => run.lobby.find((x) => x.id === id)?.avatar
    // 남의 전투를 보면 그 판의 두 사람이 선다. 내 전투면 내 아바타 그대로다.
    setDuel(mine ? avatarOfSeat(run.opponentId) : avatarOfSeat(f.b))
    battle.load(mine ? run.fight.result : f.result, {
      onBack: run.fight.onBack,
      // 전투 중에도 아바타는 숨을 쉬어야 한다 — 배치 루프가 멈춰 있어서
      // 여기서 믹서를 돌리지 않으면 둘 다 굳은 채로 서 있다.
      onFrame: (dt) => {
        avatar?.tick(dt)
        foe?.tick(dt)
      },
      atTick: battle.tick(),
      // 남의 전투를 보는 중이면 그 판의 두 사람 이펙트를 쓴다.
      onEnd: (winner) => {
        const r = mine ? run.fight.result : f.result
        // 남의 판을 볼 때는 A 자리(f.a)를 "나"로 놓고 그린다 — 화면 아래에
        // 선 사람이 이겼는지가 이 연출이 말하는 전부다.
        playWinFx(winner, {
          iAmA: mine ? run.fight.iAmA !== false : true,
          myBoom: mine ? myBoomId() : boomOfSeat(f.a),
          foeBoom: mine ? boomOfSeat(run.opponentId) : boomOfSeat(f.b),
          damage: defeatDamage(
            winner === 'A' ? r.survivorsA : r.survivorsB,
            roundAt(run.index, data.rounds).damage,
          ),
        })
      },
    })
  }

  function settle(result, info) {
    clearDuel()
    // 무대를 원래 자리로 돌린다 — 배치 화면은 언제나 내 판이 아래다.
    prep.scene.setSideFlip(false)
    const s = run.state
    // **내가 A 라는 보장이 없다.** 서버가 좌석 번호가 낮은 쪽을 A 로 놓으므로,
    // 이겼는지도 생존자가 누구 것인지도 진영을 보고 읽어야 한다.
    const iAmA = run.fight ? run.fight.iAmA !== false : true
    const won = result.winner === (iAmA ? 'A' : 'B')
    const mySurvivors = iAmA ? result.survivorsA : result.survivorsB
    const foeSurvivors = iAmA ? result.survivorsB : result.survivorsA

    // 연속 횟수는 승패 방향과 무관하게 센다 — 연승도 연패도 같은 표를 쓴다.
    s.streak = won === run.lastWon ? s.streak + 1 : 1
    run.lastWon = won

    if (!won) s.hp = Math.max(0, s.hp - defeatDamage(foeSurvivors, info.damage))
    // **0번 좌석이 아니라 내 좌석이다.** 매치 방에서 내 자리는 계정 순서로
    // 정해지므로 0 이 아닐 수 있다 — 0 에 적으면 남의 체력·연승을 내 것으로
    // 덮어써서, 순위표가 엉뚱한 사람을 죽인다.
    const me = run.lobby.find((x) => x.isPlayer)
    if (me) {
      me.hp = s.hp
      // 순위표가 내 연승도 같은 규칙으로 표시해야 한다.
      me.streak = s.streak
      me.lastWon = run.lastWon
    }

    // 내가 이겼으면 상대도 잃는다. 순위표가 내 전투와 같은 규칙을 따라야 한다.
    const foe = mm.opponentSeat()
    if (won && foe) foe.hp = Math.max(0, foe.hp - defeatDamage(mySurvivors, info.damage))
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
      sfx(won ? 'win' : 'lose')
      coach.finish(won)
      return
    }

    // 내 판이 끝났다. 두 갈래로 온다: 내가 죽었거나(탈락), 23라운드를 다
    // 채웠거나. 어느 쪽이든 내 등수와 LP 는 이 순간 확정돼 있다 — 서버가
    // 죽는 자리에서 박는다. 남은 사람이 끝나기를 기다리게 하지 않는다.
    //
    // 등수가 박혔는지도 같이 본다. 마지막 한 명으로 남으면 내 체력은 멀쩡하고
    // 라운드도 안 찼는데 판은 끝난 것이다 — 서버가 그때 1위를 박는다.
    // 체력만 보면 그 사람은 23라운드까지 혼자 판을 굴린다.
    const mine = run.lobby.find((x) => x.isPlayer)
    if (s.hp <= 0 || mine?.rank || run.index >= totalRounds(data.rounds)) {
      // 곡은 멈춘 채로 둔다. 결과판이 뜨는 자리에 판 음악이 다시 깔리면
      // 판이 아직 안 끝난 것처럼 들린다.
      resultView.open({
        seats: run.lobby,
        mySeatId: mySeatId(),
        // LP 는 랭크 판에서만 움직인다. 일반 판에 0 을 적으면 움직였는데
        // 0 인 것처럼 읽힌다 — 아예 안 적는다.
        ranked: run.mode === 'ranked',
        won: mine?.rank === 1,
        // 판에 들어가기 전 LP. 서버는 이미 더했지만 화면이 든 값은 아직
        // 전이라, 여기가 "어디에서 어디로" 의 출발점이다.
        lp: profileLp,
        rankedGames: profileRankedGames,
      })
      return
    }

    // 전투가 끝났다. 멈춰 둔 곡을 되살린다 — 판이 끝났거나(위 두 갈래)
    // 튜토리얼이 끝난 경우에는 여기까지 안 온다. 그때는 홈으로 가거나 화면을
    // 다시 띄우므로 되살릴 곡이 없다.
    bgmRelease()

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
  if (boot.isConnected) boot.textContent = t('boot.failed', { why: err.message })
  throw err
}
