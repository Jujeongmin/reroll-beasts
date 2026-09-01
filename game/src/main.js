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
import { createLobby, pairUp, opponentOf, resolveOthers, growBots } from '@sim/lobby.js'
import { createPrep } from './prep.js'
import { createBattle } from './battle.js'

const boot = document.getElementById('boot')

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

  /** 이번 라운드 대진을 짠다. PvE 라운드는 상대가 없다. */
  function drawRound() {
    const info = roundAt(run.index, data.rounds)
    if (info.isPve) {
      run.pairs = []
      run.opponentId = null
      return info
    }
    run.pairs = pairUp(run.lobby, createRng(roundSeed(run.index)))
    run.opponentId = opponentOf(run.pairs, 0)
    return info
  }
  drawRound()

  // 무대는 **하나**다. 배치가 만들고 전투가 이어 쓴다 — 화면을 갈아끼우지 않으므로
  // 전투가 "다른 화면으로 넘어가는 일"이 아니라 "그 자리에서 시작되는 일"이 된다.
  const prep = await createPrep({ data, run, onFight: startFight })
  const battle = await createBattle({ data, scene: prep.scene })

  boot.remove()
  document.getElementById('prep').hidden = false
  prep.show()

  async function startFight(entries) {
    const info = roundAt(run.index, data.rounds)
    // 전투 시드를 라운드마다 다르게 준다. 같은 시드를 재사용하면
    // 치명타·타겟 순서가 매판 똑같아진다.
    const battleSeed = roundSeed(run.index)
    // 짝이 있으면 그 사람 진형과 붙는다. PvE 라운드거나 홀수로 남으면 몬스터다.
    const foe = run.opponentId === null ? null : run.lobby[run.opponentId]
    const enemy = foe ? foe.board : pveBoard(info.stageIndex, createRng(battleSeed), data)

    let result
    try {
      result = simulate({ boardA: entries, boardB: enemy, seed: battleSeed, data })
    } catch (err) {
      console.error(err)
      return
    }

    prep.hide()
    await battle.load(result, { onBack: () => settle(result, info) })
  }

  function settle(result, info) {
    const s = run.state
    const won = result.winner === 'A'

    // 연속 횟수는 승패 방향과 무관하게 센다 — 연승도 연패도 같은 표를 쓴다.
    s.streak = won === run.lastWon ? s.streak + 1 : 1
    run.lastWon = won

    if (!won) s.hp = Math.max(0, s.hp - defeatDamage(result.survivorsB, info.damage))
    run.lobby[0].hp = s.hp

    // 내가 이겼으면 상대도 잃는다. 순위표가 내 전투와 같은 규칙을 따라야 한다.
    if (won && run.opponentId !== null) {
      const foe = run.lobby[run.opponentId]
      foe.hp = Math.max(0, foe.hp - defeatDamage(result.survivorsA, info.damage))
    }
    // 나머지 대진도 같은 simulate 로 돌린다
    resolveOthers(run.lobby, run.pairs ?? [], {
      seed: roundSeed(run.index),
      stageDamage: info.damage,
      data,
    })

    s.gold += roundIncome({ gold: s.gold, streak: s.streak, won }, data.economy).total

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
