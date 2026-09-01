// 부팅과 화면 전환. 규칙은 전부 sim/ 이 갖고 있고 여기는 배선만 한다.
//
// 흐름: 배치·상점 → 전투 리플레이 → 정산 → 다음 라운드 배치
//
// PvP 상대는 아직 없다. §10 의 비동기 스냅샷이 붙기 전까지는 전 라운드가
// PvE 편성으로 돈다 — "상대 보드가 어디서 오는가"만 나중에 갈아끼우면 된다.

import { loadData } from '@sim/data.js'
import { createRng } from '@sim/rng.js'
import { simulate } from '@sim/combat.js'
import { startRun, refreshShop } from '@sim/roster.js'
import { roundIncome, addXp } from '@sim/economy.js'
import { roundAt, totalRounds, pveBoard, defeatDamage } from '@sim/rounds.js'
import {
  createLobby,
  pairUp,
  opponentOf,
  simulateOthers,
  applyOthers,
  growBots,
} from '@sim/lobby.js'
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
  const run = {
    state,
    pool,
    rng,
    seed,
    index: 1,
    round: roundAt(1, data.rounds).label,
    lastWon: null,
    // 나 + 봇 7. §10 의 비동기 스냅샷이 붙으면 여기만 실제 사람 판으로 바꾼다.
    lobby: createLobby(data, rng),
    opponentId: null,
  }

  /** 라운드 시드. 대진·편성·전투가 전부 여기서 갈라져 나온다. */
  const roundSeed = (n) => (seed + n * 7919) >>> 0

  /**
   * 이번 라운드 대진.
   *
   * 전 라운드가 PvP 다. 살아 있는 사람이 홀수라 내 짝이 비면 **유령**을 세운다 —
   * 다른 사람의 진형을 그대로 복사해 붙는 것이다 (TFT 의 유령 라운드와 같다).
   * 중립 몹을 세우면 "지금 사람과 붙는 건가"가 매 라운드 흐려진다.
   */
  function drawRound() {
    const info = roundAt(run.index, data.rounds)
    run.pairs = pairUp(run.lobby, createRng(roundSeed(run.index)))
    run.opponentId = opponentOf(run.pairs, 0)
    run.ghostId = null
    if (run.opponentId === null) {
      const others = run.lobby.filter((p) => !p.isPlayer && p.hp > 0 && p.board.length > 0)
      if (others.length > 0) {
        run.ghostId = others[createRng(roundSeed(run.index) ^ 0x5f3a).int(others.length)].id
      }
    }
    return info
  }
  drawRound()

  // 무대는 **하나**다. 배치가 만들고 전투가 이어 쓴다 — 화면을 갈아끼우지 않으므로
  // 전투가 "다른 화면으로 넘어가는 일"이 아니라 "그 자리에서 시작되는 일"이 된다.
  const prep = await createPrep({
    data,
    run,
    onFight: startFight,
    opponentBoard: () => opponentBoard(roundSeed(run.index)),
    onWatch: watchFight,
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
  document.getElementById('prep').hidden = false
  prep.show()

  async function startFight(entries) {
    const info = roundAt(run.index, data.rounds)
    // 전투 시드를 라운드마다 다르게 준다. 같은 시드를 재사용하면
    // 치명타·타겟 순서가 매판 똑같아진다.
    const battleSeed = roundSeed(run.index)
    // 짝이 있으면 그 사람, 없으면 유령(남의 진형 복사). 둘 다 없을 때만 몹이다 —
    // 마지막 한 명이 남는 경우뿐이라 실제로는 거의 오지 않는다.
    const enemy = opponentBoard(battleSeed)

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
    run.otherFights = simulateOthers(run.lobby, run.pairs ?? [], {
      seed: roundSeed(run.index),
      data,
    })

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
    battle.load(mine ? run.fight.result : f.result, { onBack: run.fight.onBack })
  }

  /** 이번 라운드에 내가 붙는 진형. 화면 미리보기와 실제 전투가 같은 값을 써야 한다. */
  function opponentBoard(battleSeed) {
    const id = run.opponentId ?? run.ghostId
    if (id !== null && id !== undefined) return run.lobby[id].board
    const info = roundAt(run.index, data.rounds)
    return pveBoard(info.stageIndex, createRng(battleSeed), data)
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
    if (won && run.opponentId !== null) {
      const foe = run.lobby[run.opponentId]
      foe.hp = Math.max(0, foe.hp - defeatDamage(result.survivorsA, info.damage))
    }
    // 전투를 시작할 때 이미 돌려 둔 결과를 여기서 반영한다
    applyOthers(run.lobby, run.otherFights ?? [], {
      stageDamage: info.damage,
      data,
    })

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
    growBots(run.lobby, run.index, createRng(roundSeed(run.index) ^ 0x9e37), data)
    drawRound()
    // 라운드가 넘어가면 상점은 공짜로 새로 깔린다
    refreshShop(s, run.pool, run.rng, data, { free: true })
    prep.show()
  }
} catch (err) {
  // boot 는 부팅 성공 직후 지워진다. 여기서 무조건 건드리면 부팅 뒤에 난
  // 진짜 오류가 "textContent of null" 로 덮여 원인이 사라진다.
  if (boot.isConnected) boot.textContent = `시작할 수 없다: ${err.message}`
  throw err
}
