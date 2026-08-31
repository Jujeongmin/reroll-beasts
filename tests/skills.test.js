import { describe, it, expect } from 'vitest'
import { buildBoard } from '../sim/hex.js'
import { createRng } from '../sim/rng.js'
import { castSkill } from '../sim/skills.js'
import combat from '../game/public/data/combat.json' with { type: 'json' }

const board = buildBoard(combat.board)

function mk(id, team, row, col, over = {}) {
  return {
    id,
    team,
    tile: board.indexOf(row, col),
    hp: 1000,
    maxHp: 1000,
    shield: 0,
    alive: true,
    mana: 100,
    stats: { atk: 100, def: 20, mr: 20, power: 100, range: 1, critChance: 0 },
    buffs: [],
    skill: { id: 'x', type: 'single', params: { dmgPct: 200, hits: 1 } },
    unitId: 'test_unit',
    ...over,
  }
}

function ctx(all) {
  const occupied = new Map(all.filter((u) => u.alive).map((u) => [u.tile, u.id]))
  return { board, all, occupied, rng: createRng(1), combatCfg: combat, tick: 0 }
}

describe('castSkill - single', () => {
  it('타겟 HP 를 깎는다', () => {
    const caster = mk(0, 'A', 3, 3)
    const foe = mk(1, 'B', 2, 3)
    caster.targetId = foe.id
    const before = foe.hp
    const events = castSkill(ctx([caster, foe]), caster)
    expect(foe.hp).toBeLessThan(before)
    expect(events[0].type).toBe('skill_single')
    expect(events[0].targetIds).toContain(1)
  })

  it('hits 3 은 hits 1 보다 정확히 3배 때린다', () => {
    const run = (hits) => {
      const caster = mk(0, 'A', 3, 3, { skill: { id: 's', type: 'single', params: { dmgPct: 100, hits } } })
      const foe = mk(1, 'B', 2, 3, { hp: 100000, maxHp: 100000 })
      caster.targetId = foe.id
      castSkill(ctx([caster, foe]), caster)
      return 100000 - foe.hp
    }
    expect(run(3)).toBe(run(1) * 3)
  })

  it('타겟이 없으면 빈 배열이다', () => {
    const caster = mk(0, 'A', 3, 3)
    caster.targetId = null
    expect(castSkill(ctx([caster]), caster)).toEqual([])
  })
})

describe('castSkill - aoe', () => {
  it('반경 안의 모든 적을 때린다', () => {
    const caster = mk(0, 'A', 3, 3, { skill: { id: 'blast', type: 'aoe', params: { radius: 1, dmgPct: 200 } } })
    const foe = mk(1, 'B', 2, 3)
    const nearFoe = board.neighbors[foe.tile].filter((t) => board.tiles[t].row <= 2)
    const foe2 = mk(2, 'B', board.tiles[nearFoe[0]].row, board.tiles[nearFoe[0]].col)
    caster.targetId = foe.id
    const events = castSkill(ctx([caster, foe, foe2]), caster)
    expect(events[0].type).toBe('skill_aoe')
    expect(events[0].targetIds).toEqual([1, 2])
    expect(foe.hp).toBeLessThan(1000)
    expect(foe2.hp).toBeLessThan(1000)
  })

  it('아군은 때리지 않는다', () => {
    const caster = mk(0, 'A', 3, 3, { skill: { id: 'blast', type: 'aoe', params: { radius: 3, dmgPct: 200 } } })
    const foe = mk(1, 'B', 2, 3)
    const mate = mk(2, 'A', 3, 4)
    caster.targetId = foe.id
    castSkill(ctx([caster, foe, mate]), caster)
    expect(mate.hp).toBe(1000)
  })

  it('광역 대상 목록은 id 오름차순이다 (배열 순서 아님)', () => {
    const caster = mk(0, 'A', 3, 3, { skill: { id: 'blast', type: 'aoe', params: { radius: 3, dmgPct: 200 } } })
    // 배열에는 큰 id 를 먼저 넣는다. 정렬이 없으면 이 순서가 그대로 나온다.
    const high = mk(7, 'B', 2, 3)
    const low = mk(2, 'B', 2, 4)
    caster.targetId = high.id
    const events = castSkill(ctx([caster, high, low]), caster)
    expect(events[0].targetIds).toEqual([2, 7])
  })
})

describe('castSkill - buff', () => {
  it('자신에게 버프를 붙인다', () => {
    const caster = mk(0, 'A', 3, 3, {
      skill: { id: 'brace', type: 'buff', params: { target: 'self', stat: 'def', amount: 40, durationTicks: 90 } },
    })
    const events = castSkill(ctx([caster]), caster)
    expect(caster.buffs).toHaveLength(1)
    expect(caster.buffs[0].stat).toBe('def')
    expect(caster.buffs[0].expiresAt).toBe(90)
    expect(events[0].type).toBe('skill_buff')
  })

  it('보호막 버프는 shield 를 올린다', () => {
    const caster = mk(0, 'A', 3, 3, {
      skill: { id: 'sh', type: 'buff', params: { target: 'self', stat: 'shield', amountPctMaxHp: 15, durationTicks: 120 } },
    })
    castSkill(ctx([caster]), caster)
    expect(caster.shield).toBe(150)
  })

  it('아군 전체 버프는 같은 팀에만 붙는다', () => {
    const caster = mk(0, 'A', 3, 3, {
      skill: { id: 'rally', type: 'buff', params: { target: 'allies', stat: 'atkPct', amount: 20, durationTicks: 150 } },
    })
    const mate = mk(1, 'A', 3, 4)
    const foe = mk(2, 'B', 2, 3)
    castSkill(ctx([caster, mate, foe]), caster)
    expect(mate.buffs).toHaveLength(1)
    expect(foe.buffs).toHaveLength(0)
  })

  it('아군 전체 버프 대상 목록은 id 오름차순이다 (배열 순서 아님)', () => {
    const caster = mk(6, 'A', 3, 3, {
      skill: { id: 'rally', type: 'buff', params: { target: 'allies', stat: 'atkPct', amount: 20, durationTicks: 150 } },
    })
    const mate = mk(1, 'A', 3, 4)
    const events = castSkill(ctx([caster, mate]), caster)
    expect(events[0].targetIds).toEqual([1, 6])
  })
})

describe('castSkill - summon', () => {
  it('onDeath 트리거는 즉시 소환하지 않는다', () => {
    const caster = mk(0, 'A', 3, 3, {
      skill: { id: 'split', type: 'summon', params: { unitId: 'slime', count: 2, hpPct: 40, trigger: 'onDeath' } },
    })
    const events = castSkill(ctx([caster]), caster)
    expect(events).toEqual([])
  })
})

describe('castSkill 결정론', () => {
  it('같은 입력이면 같은 이벤트를 낸다', () => {
    const build = () => {
      const caster = mk(0, 'A', 3, 3)
      const foe = mk(1, 'B', 2, 3)
      caster.targetId = foe.id
      return { caster, all: [caster, foe] }
    }
    const a = build()
    const b = build()
    expect(castSkill(ctx(a.all), a.caster)).toEqual(castSkill(ctx(b.all), b.caster))
  })
})
