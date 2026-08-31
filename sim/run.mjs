// 헤드리스 밸런스 러너. 렌더 없이 조합끼리 붙여 승률을 낸다.
// 시드는 0..trials-1 을 순서대로 쓰므로 같은 시행 횟수면 결과가 재현된다.
//
// 사용:
//   node sim/run.mjs "hero_knight_1:2:0,huntress_1:1:5" "martial_hero_1:2:0" 200

import { pathToFileURL } from 'node:url'
import { loadData } from './data.js'
import { simulate } from './combat.js'

export function parseComp(text) {
  if (!text || text.trim() === '') return []
  return text.split(',').map((chunk) => {
    const [unitId, star, tile] = chunk.split(':')
    return {
      unitId: unitId.trim(),
      star: star ? Number(star) : 1,
      tile: Number(tile),
    }
  })
}

export function matchup(boardA, boardB, trials, data) {
  let winsA = 0
  let winsB = 0
  let draws = 0
  let totalTicks = 0

  for (let seed = 0; seed < trials; seed++) {
    const r = simulate({ boardA, boardB, seed, data })
    if (r.winner === 'A') winsA++
    else if (r.winner === 'B') winsB++
    else draws++
    totalTicks += r.ticks
  }

  return {
    winsA,
    winsB,
    draws,
    winRateA: winsA / trials,
    avgTicks: Math.floor(totalTicks / trials),
  }
}

// Windows 에서 import.meta.url 은 file:///C:/... (슬래시 3개)로 렌더된다.
// 문자열을 손으로 조립하면 슬래시 수가 어긋나 가드가 영영 거짓이 되고,
// CLI 가 아무것도 안 하면서 exit 0 으로 통과한 척한다. pathToFileURL 로 정규화한다.
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
  const [compA, compB, trialsArg] = process.argv.slice(2)
  if (!compA || !compB) {
    console.error('사용: node sim/run.mjs "<조합A>" "<조합B>" [시행횟수]')
    console.error('조합 형식: 유닛id:성급:타일 을 쉼표로 이음 (예: "hero_knight_1:2:0,rat:1:5")')
    process.exit(1)
  }

  const trials = Number(trialsArg ?? 200)
  const data = await loadData()
  const r = matchup(parseComp(compA), parseComp(compB), trials, data)

  console.log(`시행 ${trials} 회`)
  console.log(`A 승 ${r.winsA} · B 승 ${r.winsB} · 무 ${r.draws}`)
  console.log(`A 승률 ${(r.winRateA * 100).toFixed(1)}%`)
  console.log(`평균 ${r.avgTicks} 틱 (${(r.avgTicks / 30).toFixed(1)}초)`)
}
