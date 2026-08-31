import { describe, it, expect } from 'vitest'
import { buildBoard } from '../sim/hex.js'
import { createRng } from '../sim/rng.js'
import { castSkill } from '../sim/skills.js'
import { effectiveStat, damageTakenMultiplier } from '../sim/modifiers.js'
import { loadData } from '../sim/data.js'
import combat from '../game/public/data/combat.json' with { type: 'json' }

const board = buildBoard(combat.board)
const data = await loadData()

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
  return { board, all, occupied, rng: createRng(1), combatCfg: combat, tick: 0, effectiveStat, damageTakenMultiplier }
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

  it('흡혈은 과잉 피해가 아니라 실제 흡수량 기준이다', () => {
    const caster = mk(0, 'A', 3, 3, {
      hp: 100,
      maxHp: 10000,
      skill: { id: 'drain', type: 'single', params: { dmgPct: 100, hits: 1, lifestealPct: 50 } },
    })
    caster.stats.power = 100000
    const foe = mk(1, 'B', 2, 3, { hp: 40, maxHp: 40 })
    caster.targetId = foe.id
    castSkill(ctx([caster, foe]), caster)
    // 적 HP 40 만 흡수됐으므로 회복은 20 이다. 요청량 기준이면 수만이 회복된다.
    expect(caster.hp).toBe(120)
  })

  it('스킬 피해도 damageTakenPct 를 받는다', () => {
    const run = (buffs) => {
      const caster = mk(0, 'A', 3, 3, { skill: { id: 's', type: 'single', params: { dmgPct: 100, hits: 1 } } })
      const foe = mk(1, 'B', 2, 3, { hp: 100000, maxHp: 100000, buffs })
      caster.targetId = foe.id
      castSkill(ctx([caster, foe]), caster)
      return 100000 - foe.hp
    }
    const plain = run([])
    const guarded = run([{ stat: 'damageTakenPct', amount: -50, expiresAt: 999 }])
    expect(guarded).toBeLessThan(plain)
  })

  it('스킬 피해는 대상의 mr 버프를 반영한다', () => {
    const run = (buffs) => {
      const caster = mk(0, 'A', 3, 3, { skill: { id: 's', type: 'single', params: { dmgPct: 100, hits: 1 } } })
      const foe = mk(1, 'B', 2, 3, { hp: 100000, maxHp: 100000, buffs })
      caster.targetId = foe.id
      castSkill(ctx([caster, foe]), caster)
      return 100000 - foe.hp
    }
    // mr 이 오르면 마법 피해가 줄어야 한다. 원시 stats.mr 을 읽으면 버프가 무시돼 같아진다.
    expect(run([{ stat: 'mr', amount: 200, expiresAt: 999 }])).toBeLessThan(run([]))
  })

  it('defIgnorePct 는 대상의 마법 저항을 실제로 깎는다', () => {
    const run = (params) => {
      const caster = mk(0, 'A', 3, 3, { skill: { id: 's', type: 'single', params } })
      const foe = mk(1, 'B', 2, 3, { hp: 100000, maxHp: 100000 })
      caster.targetId = foe.id
      castSkill(ctx([caster, foe]), caster)
      return 100000 - foe.hp
    }
    const plain = run({ dmgPct: 100, hits: 1 })
    const ignoring = run({ dmgPct: 100, hits: 1, defIgnorePct: 30 })
    expect(plain).toBeGreaterThan(0)
    expect(ignoring).toBeGreaterThan(plain)
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

  it('광역 피해도 대상의 mr 버프와 damageTakenPct 를 반영한다', () => {
    const run = (buffs) => {
      const caster = mk(0, 'A', 3, 3, { skill: { id: 'blast', type: 'aoe', params: { radius: 0, dmgPct: 200 } } })
      const foe = mk(1, 'B', 2, 3, { hp: 100000, maxHp: 100000, buffs })
      caster.targetId = foe.id
      castSkill(ctx([caster, foe]), caster)
      return 100000 - foe.hp
    }
    const plain = run([])
    expect(plain).toBeGreaterThan(0)
    expect(run([{ stat: 'mr', amount: 200, expiresAt: 999 }])).toBeLessThan(plain)
    expect(run([{ stat: 'damageTakenPct', amount: -50, expiresAt: 999 }])).toBeLessThan(plain)
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

  it('shieldAndDef 는 보호막과 방어력을 둘 다 준다', () => {
    const caster = mk(0, 'A', 3, 3, {
      skill: {
        id: 'bulwark', type: 'buff',
        params: { target: 'self', stat: 'shieldAndDef', amountPctMaxHp: 12, amount: 50, durationTicks: 240 },
      },
    })
    castSkill(ctx([caster]), caster)
    expect(caster.shield).toBe(120)
    expect(effectiveStat(caster, 'def')).toBe(caster.stats.def + 50)
  })

  it('mk2_bulwark 은 여전히 shieldAndDef 를 쓴다 (데이터 이름이 바뀌면 위 테스트가 헛돈다)', () => {
    const king = data.units.units.find((u) => u.id === 'medieval_king_2')
    expect(king.skill.params.stat).toBe('shieldAndDef')
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

describe('castSkill ctx 검증', () => {
  it('ctx 에 수정자 함수가 없으면 조용히 넘어가지 않고 터진다', () => {
    const caster = mk(0, 'A', 3, 3)
    const foe = mk(1, 'B', 2, 3)
    caster.targetId = foe.id
    const bare = { board, all: [caster, foe], occupied: new Map(), rng: createRng(1), combatCfg: combat, tick: 0 }
    expect(() => castSkill(bare, caster)).toThrow(/effectiveStat/)
  })
})
