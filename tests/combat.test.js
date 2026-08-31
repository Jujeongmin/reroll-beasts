import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadData } from '../sim/data.js'
import { simulate } from '../sim/combat.js'

const data = await loadData()

function team(entries) {
  return entries.map(([unitId, star, tile]) => ({ unitId, star, tile }))
}

const weakSide = team([['medieval_warrior_1', 1, 0]])
const strongSide = team([['medieval_king_2', 3, 0], ['evil_wizard_3', 3, 1], ['fire_worm', 3, 2]])

const HERE = dirname(fileURLToPath(import.meta.url))
const GOLDEN_PATH = join(HERE, 'fixtures', 'combat-golden.json')

// 골든 로그 시나리오. 이동·평타·스킬·치명타·사망을 전부 지나간다.
// 재생성: REGEN_GOLDEN=1 npx vitest run tests/combat.test.js
const GOLDEN_A = team([['bat', 2, 0], ['hero_knight_1', 2, 8]])
const GOLDEN_B = team([['rat', 2, 0], ['mushroom', 2, 8]])
const GOLDEN_SEED = 20260831

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

  it('보드 배열 순서를 바꿔도 로그가 완전히 같다', () => {
    const forward = team([['huntress_1', 1, 5], ['hero_knight_1', 1, 0], ['rat', 2, 12]])
    const reversed = [...forward].reverse()
    const a = simulate({ boardA: forward, boardB: GOLDEN_B, seed: 3, data })
    const b = simulate({ boardA: reversed, boardB: GOLDEN_B, seed: 3, data })
    expect(a.log).toEqual(b.log)
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

  it('다른 시드는 다른 로그를 낸다 (RNG 가 실제로 쓰인다)', () => {
    const a = simulate({ boardA: GOLDEN_A, boardB: GOLDEN_B, seed: 1, data })
    const b = simulate({ boardA: GOLDEN_A, boardB: GOLDEN_B, seed: 2, data })
    expect(a.log).not.toEqual(b.log)
  })

  it('maxTicks 에 도달하면 그 값으로 끝난다', () => {
    // 3성 수호자 거울전은 서로 못 죽여 제한 틱까지 간다.
    const wall = team([['hero_knight_1', 3, 0]])
    const r = simulate({ boardA: wall, boardB: wall, seed: 11, data })
    expect(r.ticks).toBe(data.combat.maxTicks)
    expect(r.winner).toBe('draw')
    expect(r.log[r.log.length - 1]).toEqual({ tick: data.combat.maxTicks, type: 'end', winner: 'draw' })
  })

  it('진영 범위를 벗어난 타일은 조용히 무시하지 않고 터진다', () => {
    expect(() => simulate({ boardA: team([['rat', 1, 22]]), boardB: weakSide, seed: 1, data })).toThrow(/범위/)
  })

  it('같은 진영에 타일이 겹치면 터진다', () => {
    const clash = team([['rat', 1, 0], ['bat', 1, 0]])
    expect(() => simulate({ boardA: clash, boardB: weakSide, seed: 1, data })).toThrow(/겹친/)
  })
})

describe('골든 로그', () => {
  it('고정 시나리오의 전투 로그가 바뀌지 않는다', () => {
    const result = simulate({ boardA: GOLDEN_A, boardB: GOLDEN_B, seed: GOLDEN_SEED, data })
    const actual = { winner: result.winner, ticks: result.ticks, log: result.log }

    if (process.env.REGEN_GOLDEN) {
      if (process.env.CI) throw new Error('CI 에서는 골든 로그를 재생성할 수 없다')
      writeFileSync(GOLDEN_PATH, JSON.stringify(actual, null, 2) + '\n')
    }

    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'))
    expect(actual).toEqual(golden)
  })
})
