import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { simulate } from '../sim/combat.js'

const data = await loadData()

function team(entries) {
  return entries.map(([unitId, star, tile]) => ({ unitId, star, tile }))
}

const weakSide = team([['medieval_warrior_1', 1, 0]])
const strongSide = team([['medieval_king_2', 3, 0], ['evil_wizard_3', 3, 1], ['fire_worm', 3, 2]])

describe('simulate', () => {
  it('결과 객체 형태를 지킨다', () => {
    const r = simulate({ boardA: weakSide, boardB: weakSide, seed: 1, data })
    expect(['A', 'B', 'draw']).toContain(r.winner)
    expect(Number.isInteger(r.ticks)).toBe(true)
    expect(Array.isArray(r.log)).toBe(true)
  })

  it('한쪽이 비면 다른 쪽이 즉시 이긴다', () => {
    expect(simulate({ boardA: weakSide, boardB: [], seed: 1, data }).winner).toBe('A')
    expect(simulate({ boardA: [], boardB: weakSide, seed: 1, data }).winner).toBe('B')
  })

  it('양쪽이 다 비면 무승부다', () => {
    expect(simulate({ boardA: [], boardB: [], seed: 1, data }).winner).toBe('draw')
  })

  it('압도적으로 강한 쪽이 이긴다', () => {
    const r = simulate({ boardA: weakSide, boardB: strongSide, seed: 7, data })
    expect(r.winner).toBe('B')
    expect(r.survivorsB).toBeGreaterThan(0)
    expect(r.survivorsA).toBe(0)
  })

  it('같은 시드와 같은 보드는 완전히 같은 로그를 낸다', () => {
    const a = simulate({ boardA: weakSide, boardB: strongSide, seed: 42, data })
    const b = simulate({ boardA: weakSide, boardB: strongSide, seed: 42, data })
    expect(a.log).toEqual(b.log)
    expect(a.ticks).toBe(b.ticks)
    expect(a.winner).toBe(b.winner)
  })

  it('보드 배열 순서를 바꿔도 같은 결과를 낸다', () => {
    const order1 = team([['huntress_1', 1, 5], ['hero_knight_1', 1, 0]])
    const order2 = team([['hero_knight_1', 1, 0], ['huntress_1', 1, 5]])
    const a = simulate({ boardA: order1, boardB: strongSide, seed: 3, data })
    const b = simulate({ boardA: order2, boardB: strongSide, seed: 3, data })
    expect(a.winner).toBe(b.winner)
    expect(a.ticks).toBe(b.ticks)
  })

  it('maxTicks 를 넘지 않는다', () => {
    const r = simulate({ boardA: strongSide, boardB: strongSide, seed: 9, data })
    expect(r.ticks).toBeLessThanOrEqual(data.combat.maxTicks)
  })

  it('로그가 spawn 으로 시작해 end 로 끝난다', () => {
    const r = simulate({ boardA: weakSide, boardB: strongSide, seed: 5, data })
    expect(r.log[0].type).toBe('spawn')
    expect(r.log[r.log.length - 1].type).toBe('end')
  })

  it('로그의 tick 이 단조 증가한다', () => {
    const r = simulate({ boardA: weakSide, boardB: strongSide, seed: 5, data })
    for (let i = 1; i < r.log.length; i++) {
      expect(r.log[i].tick).toBeGreaterThanOrEqual(r.log[i - 1].tick)
    }
  })

  it('시너지가 결과를 바꾼다 (왕국 2 활성 vs 미활성)', () => {
    const noSynergy = team([['medieval_warrior_1', 2, 0], ['rat', 2, 1]])
    const withSynergy = team([['medieval_warrior_1', 2, 0], ['hero_knight_1', 2, 1]])
    const foe = team([['martial_hero_1', 2, 0], ['huntress_1', 2, 1]])
    const a = simulate({ boardA: noSynergy, boardB: foe, seed: 11, data })
    const b = simulate({ boardA: withSynergy, boardB: foe, seed: 11, data })
    expect(a.log).not.toEqual(b.log)
  })

  it('3성이 1성보다 강하다', () => {
    const foe = team([['martial_hero_1', 2, 0], ['huntress_1', 2, 1], ['wizard_pack', 2, 2]])
    const one = simulate({ boardA: team([['hero_knight_2', 1, 0]]), boardB: foe, seed: 4, data })
    const three = simulate({ boardA: team([['hero_knight_2', 3, 0]]), boardB: foe, seed: 4, data })
    // 3성은 더 오래 버티고, 적을 더 많이 죽인다.
    expect(three.ticks).toBeGreaterThan(one.ticks)
    expect(three.survivorsB).toBeLessThan(one.survivorsB)
  })
})
