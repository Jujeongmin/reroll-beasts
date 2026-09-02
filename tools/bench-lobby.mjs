// 8인 로비 전투 비용 측정. 렌더 없이 sim/ 만 돌린다.
//
//   node bench-lobby.mjs [반복수]
//
// 재는 것:
//   1. simulate 한 판 — 라운드별(=보드가 커질수록) 소요 시간과 틱 수
//   2. simulateOthers 한 라운드 — 남의 대진 전부 (8인이면 3~4판)
//   3. 런 한 판 전체(23라운드) 누적
//
// 프레임 예산은 16.7ms 다. 한 라운드 정산이 그걸 넘으면 그만큼 화면이 멈춘다.

import { loadData } from '../sim/data.js'
import { createRng } from '../sim/rng.js'
import { simulate } from '../sim/combat.js'
import {
  createLobby,
  pairUp,
  simulateOthers,
  applyOthers,
  growBots,
} from '../sim/lobby.js'
import { roundAt, totalRounds } from '../sim/rounds.js'

const REPS = Number(process.argv[2] ?? 5)
const data = await loadData()
const TOTAL = totalRounds(data.rounds)

const ms = (t) => `${t.toFixed(2)}ms`
const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]
}

/** 한 런을 끝까지 돌리며 라운드마다 시간을 잰다. */
function runOnce(seed) {
  const roundSeed = (n) => (seed + n * 7919) >>> 0
  const seats = createLobby(data, createRng(seed))
  const perRound = []

  for (let n = 1; n <= TOTAL; n++) {
    const info = roundAt(n, data.rounds)
    const pairs = pairUp(seats, createRng(roundSeed(n)))

    // 내 전투 한 판 (플레이어가 낀 대진)
    const mine = pairs.find((p) => p.includes(0))
    let mineMs = 0
    let mineTicks = 0
    if (mine) {
      const [a, b] = mine
      const t0 = performance.now()
      const r = simulate({
        boardA: seats[a].board,
        boardB: seats[b].board,
        seed: roundSeed(n),
        data,
      })
      mineMs = performance.now() - t0
      mineTicks = r.ticks
    }

    // 남의 대진 전부 — main.js 가 내 전투를 시작할 때 같이 돌리는 그 덩어리
    const t1 = performance.now()
    const others = simulateOthers(seats, pairs, { seed: roundSeed(n), data })
    const othersMs = performance.now() - t1

    applyOthers(seats, others, { stageDamage: info.damage })
    growBots(seats, n, createRng(roundSeed(n) ^ 0x9e37), data)

    const units = seats.reduce((a, s) => a + s.board.length, 0)
    perRound.push({
      n,
      label: info.label,
      mineMs,
      mineTicks,
      othersMs,
      fights: others.length,
      logLen: others.reduce((a, f) => a + f.result.log.length, 0),
      units,
      alive: seats.filter((s) => s.hp > 0).length,
    })
  }
  return perRound
}

console.log(`8인 로비 · ${TOTAL}라운드 · ${REPS}회 반복\n`)

const runs = []
for (let i = 0; i < REPS; i++) runs.push(runOnce(20260901 + i * 7919))

// ── 라운드별 평균 ────────────────────────────────────────
console.log('라운드  내전투    남의대진(판수)  합계     유닛  로그줄')
for (let i = 0; i < TOTAL; i++) {
  const rows = runs.map((r) => r[i])
  const mine = rows.reduce((a, r) => a + r.mineMs, 0) / rows.length
  const others = rows.reduce((a, r) => a + r.othersMs, 0) / rows.length
  const fights = rows.reduce((a, r) => a + r.fights, 0) / rows.length
  const units = rows.reduce((a, r) => a + r.units, 0) / rows.length
  const log = rows.reduce((a, r) => a + r.logLen, 0) / rows.length
  const total = mine + others
  const flag = total > 16.7 ? '  ← 프레임 예산 초과' : ''
  console.log(
    `${rows[0].label.padEnd(6)} ${ms(mine).padStart(8)} ${ms(others).padStart(9)} (${fights.toFixed(1)})` +
      ` ${ms(total).padStart(9)} ${units.toFixed(0).padStart(5)} ${Math.round(log).toString().padStart(7)}${flag}`,
  )
}

// ── 전체 요약 ────────────────────────────────────────────
const allTotals = runs.flatMap((r) => r.map((x) => x.mineMs + x.othersMs))
const runTotals = runs.map((r) => r.reduce((a, x) => a + x.mineMs + x.othersMs, 0))
console.log('\n── 라운드 정산 한 번 (내 전투 + 남의 대진) ──')
console.log(`  중앙값 ${ms(pct(allTotals, 0.5))}`)
console.log(`  p95    ${ms(pct(allTotals, 0.95))}`)
console.log(`  최대   ${ms(Math.max(...allTotals))}`)
console.log(`  16.7ms 초과 라운드: ${allTotals.filter((t) => t > 16.7).length} / ${allTotals.length}`)
console.log(`\n런 한 판 총 계산: ${ms(runTotals.reduce((a, b) => a + b, 0) / runTotals.length)}`)

// ── 최악 조건 단판 ───────────────────────────────────────
// 후반 편성으로 양쪽을 꽉 채운 대진. 8인 PvP 의 상한이다.
const last = data.lobby.growth.at(-1)
const big = []
for (let i = 0; i < last.units; i++) {
  big.push({ unitId: data.units.units.filter((u) => u.tier <= last.maxTier)[i % 10].id, star: last.star, tile: i })
}
const solo = []
for (let i = 0; i < 20; i++) {
  const t0 = performance.now()
  const r = simulate({ boardA: big, boardB: big.map((e) => ({ ...e })), seed: 1000 + i, data })
  solo.push({ ms: performance.now() - t0, ticks: r.ticks, log: r.log.length })
}
console.log('\n── 후반 만석 단판 (양쪽 ' + last.units + '기, ' + last.star + '성) ──')
console.log(`  중앙값 ${ms(pct(solo.map((s) => s.ms), 0.5))} · 최대 ${ms(Math.max(...solo.map((s) => s.ms)))}`)
console.log(`  틱 중앙값 ${pct(solo.map((s) => s.ticks), 0.5)} · 로그 줄 중앙값 ${pct(solo.map((s) => s.log), 0.5)}`)
