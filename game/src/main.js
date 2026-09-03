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
import { createHome } from './home.js'
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
  function pushScout(entries) {
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
  // 없으면 매칭이란 개념 자체가 설 자리가 없다. 무대(3D)는 이미 그려져
  // 있으므로 그 위에 겹친다 — 배경 그림을 따로 만들면 로딩만 는다.
  //
  // 서버가 필수다. 못 붙으면 못 논다 — 봇과 붙으면서 사람과 붙는 줄 아는
  // 것보다 못 붙었다고 듣는 편이 낫다.
  let queue = null
  let server = null

  const home = createHome({
    data,
    onPick: (mode) => startMatch(mode),
    onCancelQueue: () => {
      queue?.cancel()
      queue = null
      home.setQueue(null)
    },
    onRetry: () => connect(),
  })
  home.show()

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
      home.setProfile(await server.remoteFunction('getProfile', []))
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
    document.getElementById('prep').hidden = false
    // 1라운드도 지급 라운드일 수 있다 — settle() 은 라운드 2부터 도니 여기서
    // 한 번은 짚어야 한다. 지금 일정은 1라운드가 아니라 no-op 이다.
    grantIfDue(run.index)
    prep.show()
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
