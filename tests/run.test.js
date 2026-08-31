import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { simulate } from '../sim/combat.js'
import { matchup, parseComp } from '../sim/run.mjs'

const data = await loadData()

describe('parseComp', () => {
  it('문자열을 보드 배열로 바꾼다', () => {
    expect(parseComp('hero_knight_1:2:0,huntress_1:1:5')).toEqual([
      { unitId: 'hero_knight_1', star: 2, tile: 0 },
      { unitId: 'huntress_1', star: 1, tile: 5 },
    ])
  })

  it('빈 문자열은 빈 배열이다', () => {
    expect(parseComp('')).toEqual([])
  })

  it('성급을 생략하면 1성이다', () => {
    expect(parseComp('rat::3')).toEqual([{ unitId: 'rat', star: 1, tile: 3 }])
  })

  it('성급이 숫자가 아니면 터진다', () => {
    expect(() => parseComp('rat:abc:3')).toThrow(/성급/)
  })

  it('타일이 없으면 터진다', () => {
    expect(() => parseComp('rat:1')).toThrow(/타일/)
  })

  it('유닛 id 가 비면 터진다', () => {
    expect(() => parseComp(':1:3')).toThrow(/유닛 id/)
  })

  it('성급 범위를 벗어나면 터진다', () => {
    expect(() => parseComp('rat:4:3')).toThrow(/성급/)
  })
})

describe('matchup', () => {
  const weak = parseComp('medieval_warrior_1:1:0')
  const strong = parseComp('medieval_king_2:3:0,evil_wizard_3:3:1,fire_worm:3:2')

  it('시행 횟수만큼 돌린다', () => {
    const r = matchup(weak, strong, 10, data)
    expect(r.winsA + r.winsB + r.draws).toBe(10)
  })

  it('압도적인 쪽 승률이 1 이다', () => {
    expect(matchup(weak, strong, 20, data).winRateA).toBe(0)
    expect(matchup(strong, weak, 20, data).winRateA).toBe(1)
  })

  it('평균 틱을 낸다', () => {
    expect(matchup(weak, strong, 5, data).avgTicks).toBeGreaterThan(0)
  })

  it('같은 시행 횟수면 결과가 재현된다', () => {
    expect(matchup(weak, strong, 15, data)).toEqual(matchup(weak, strong, 15, data))
  })

  it('시행마다 0..N-1 시드를 쓴다 (상수 시드면 평균 틱이 단일 판과 같아진다)', () => {
    const TRIALS = 20
    const perSeed = Array.from({ length: TRIALS }, (_, seed) =>
      simulate({ boardA: weak, boardB: strong, seed, data }).ticks,
    )
    const expected = Math.floor(perSeed.reduce((a, b) => a + b, 0) / TRIALS)

    // 전제 — 평균이 단일 판과 달라야 상수 시드 구현과 구분된다.
    // 이 단언이 깨지면 이 대진은 시드에 둔감한 것이므로 테스트가 무의미하다.
    expect(expected).not.toBe(perSeed[0])

    // avgTicks 가 0..19 시드 평균과 정확히 일치해야 시드 수열이 고정된 것이다.
    expect(matchup(weak, strong, TRIALS, data).avgTicks).toBe(expected)
  })
})
