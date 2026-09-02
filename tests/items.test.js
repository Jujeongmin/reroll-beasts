import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { applyItems, itemSpecials, mergeSpecials, itemById } from '../sim/items.js'
import { resolveStats, applyTraitEffects, traitSpecials } from '../sim/stats.js'
import { unitById } from '../sim/data.js'
import { simulate } from '../sim/combat.js'

const data = await loadData()

describe('items.json', () => {
  it('12종이 있고 id 가 유일하다', () => {
    const ids = data.items.items.map((i) => i.id)
    expect(ids).toHaveLength(12)
    expect(new Set(ids).size).toBe(12)
  })

  it('유닛당 칸 수가 3이다', () => {
    expect(data.items.slotsPerUnit).toBe(3)
  })

  it('지급 라운드가 7개다', () => {
    expect(data.items.grantRounds).toHaveLength(7)
  })

  it('모든 아이템에 한국어 이름과 효과가 있다', () => {
    for (const it of data.items.items) {
      expect(typeof it.name?.ko).toBe('string')
      expect(Object.keys(it.effect).length).toBeGreaterThan(0)
    }
  })
})

describe('applyItems', () => {
  const frog = unitById(data.units, 'frog')
  const base = resolveStats(frog, 1, data.combat)

  it('강철검이 공격력을 1.2 배로 올린다', () => {
    const out = applyItems(base, ['steel_sword'], data.items)
    expect(out.atk).toBe(Math.floor(base.atk * 1.2))
  })

  it('같은 아이템 2개는 퍼센트가 더해진다', () => {
    const out = applyItems(base, ['steel_sword', 'steel_sword'], data.items)
    expect(out.atk).toBe(Math.floor(base.atk * 1.4))
  })

  it('고정값은 그대로 더해진다', () => {
    const out = applyItems(base, ['oak_shield', 'giant_heart', 'sage_orb', 'holy_charm', 'mana_stone'], data.items)
    expect(out.def).toBe(base.def + 30)
    expect(out.hp).toBe(base.hp + 400)
    expect(out.power).toBe(base.power + 30)
    expect(out.mr).toBe(base.mr + 30)
    expect(out.manaStart).toBe(base.manaStart + 20)
  })

  it('공격속도가 공격 주기를 줄인다', () => {
    const out = applyItems(base, ['swift_gloves'], data.items)
    expect(out.attackInterval).toBe(Math.max(6, Math.floor(base.attackInterval / 1.25)))
  })

  it('치명타 확률은 100 분율로 들어온다', () => {
    const out = applyItems(base, ['executioner_seal'], data.items)
    expect(out.critChance).toBeCloseTo(base.critChance + 0.25, 6)
  })

  it('시너지 퍼센트와 아이템 퍼센트를 따로 곱한다', () => {
    const withTrait = applyTraitEffects(base, [{ atkPct: 20 }])
    const out = applyItems(withTrait, ['steel_sword'], data.items)
    // 1.2 × 1.2 = 1.44 다. 한 번에 더해 1.4 가 되면 안 된다.
    expect(out.atk).toBe(Math.floor(Math.floor(base.atk * 1.2) * 1.2))
  })

  it('원본 stats 를 건드리지 않는다', () => {
    const before = base.atk
    applyItems(base, ['steel_sword'], data.items)
    expect(base.atk).toBe(before)
  })

  it('없는 아이템 id 면 던진다', () => {
    expect(() => applyItems(base, ['nope'], data.items)).toThrow(/nope/)
  })
})

describe('itemSpecials', () => {
  it('관통 개수는 더하고 배수는 큰 값을 쓴다', () => {
    const s = itemSpecials(['piercing_arrowhead', 'piercing_arrowhead'], data.items)
    expect(s.pierceCount).toBe(2)
    expect(s.piercePct).toBe(40)
  })

  it('반사·흡혈은 더한다', () => {
    const s = itemSpecials(['thorn_armor', 'thorn_armor', 'vampiric_scythe'], data.items)
    expect(s.thornsPct).toBe(40)
    expect(s.lifestealPct).toBe(20)
  })

  it('오라는 값을 더하고 반경은 큰 값을 쓴다', () => {
    const s = itemSpecials(['victory_banner', 'victory_banner'], data.items)
    expect(s.auraAtkPct).toBe(20)
    expect(s.auraRadius).toBe(1)
  })

  it('아이템이 없으면 전부 0 이다', () => {
    const s = itemSpecials([], data.items)
    expect(Object.values(s).every((v) => v === 0)).toBe(true)
  })
})

describe('mergeSpecials', () => {
  it('시너지 묶음의 키를 하나도 잃지 않는다', () => {
    const t = traitSpecials([{ leapToBackline: true, dodgePct: 15 }])
    const merged = mergeSpecials(t, itemSpecials(['thorn_armor'], data.items))
    expect(merged.leapToBackline).toBe(true)
    expect(merged.dodgePct).toBe(15)
    expect(merged.thornsPct).toBe(20)
  })

  it('시너지 관통과 아이템 관통이 더해진다', () => {
    const t = traitSpecials([{ pierceCount: 1, piercePct: 50 }])
    const merged = mergeSpecials(t, itemSpecials(['piercing_arrowhead'], data.items))
    expect(merged.pierceCount).toBe(2)
    expect(merged.piercePct).toBe(50)
  })
})

describe('전투 — 아이템 배선', () => {
  const spawnOf = (log, id) => log.find((e) => e.type === 'spawn' && e.casterId === id)

  it('거인의 심장이 최대 체력을 올린다', () => {
    const plain = simulate({
      boardA: [{ unitId: 'frog', star: 1, tile: 0 }],
      boardB: [{ unitId: 'frog', star: 1, tile: 0 }],
      seed: 1,
      data,
    })
    const armed = simulate({
      boardA: [{ unitId: 'frog', star: 1, tile: 0, items: ['giant_heart'] }],
      boardB: [{ unitId: 'frog', star: 1, tile: 0 }],
      seed: 1,
      data,
    })
    const a0 = armed.log.find((e) => e.type === 'spawn' && e.team === 'A')
    const p0 = plain.log.find((e) => e.type === 'spawn' && e.team === 'A')
    expect(a0.maxHp).toBe(p0.maxHp + 400)
  })

  it('마나 원석이 시작 마나를 올린다', () => {
    const armed = simulate({
      boardA: [{ unitId: 'frog', star: 1, tile: 0, items: ['mana_stone'] }],
      boardB: [{ unitId: 'frog', star: 1, tile: 0 }],
      seed: 1,
      data,
    })
    const a0 = armed.log.find((e) => e.type === 'spawn' && e.team === 'A')
    const b0 = armed.log.find((e) => e.type === 'spawn' && e.team === 'B')
    expect(a0.mana).toBe(b0.mana + 20)
  })

  it('items 를 안 주면 지금과 같은 로그가 나온다', () => {
    const boardA = [{ unitId: 'frog', star: 1, tile: 0 }]
    const boardB = [{ unitId: 'orc', star: 1, tile: 0 }]
    const a = simulate({ boardA, boardB, seed: 7, data })
    const b = simulate({
      boardA: boardA.map((e) => ({ ...e, items: [] })),
      boardB: boardB.map((e) => ({ ...e, items: [] })),
      seed: 7,
      data,
    })
    expect(b.log).toEqual(a.log)
  })

  it('관통 화살촉이 뒤에 선 적도 때린다', () => {
    // 원거리 유닛 하나 대 앞뒤로 선 둘. 관통이 없으면 앞의 하나만 맞는다.
    const boardB = [
      { unitId: 'frog', star: 1, tile: 0 },
      { unitId: 'frog', star: 1, tile: 1 },
    ]
    const armed = simulate({
      boardA: [{ unitId: 'wizard', star: 1, tile: 0, items: ['piercing_arrowhead'] }],
      boardB,
      seed: 3,
      data,
    })
    const victims = new Set(
      armed.log.filter((e) => e.type === 'attack').flatMap((e) => e.targetIds),
    )
    expect(victims.size).toBeGreaterThan(1)
  })

  it('없는 아이템 id 를 들고 오면 던진다', () => {
    expect(() =>
      simulate({
        boardA: [{ unitId: 'frog', star: 1, tile: 0, items: ['nope'] }],
        boardB: [{ unitId: 'frog', star: 1, tile: 0 }],
        seed: 1,
        data,
      }),
    ).toThrow(/nope/)
  })

  it('칸 수를 넘겨 들고 오면 던진다', () => {
    expect(() =>
      simulate({
        boardA: [
          {
            unitId: 'frog',
            star: 1,
            tile: 0,
            items: ['steel_sword', 'steel_sword', 'steel_sword', 'steel_sword'],
          },
        ],
        boardB: [{ unitId: 'frog', star: 1, tile: 0 }],
        seed: 1,
        data,
      }),
    ).toThrow(/칸/)
  })
})
