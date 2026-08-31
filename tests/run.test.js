import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
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
})
