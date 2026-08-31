import { describe, it, expect } from 'vitest'
import { loadData, unitById } from '../sim/data.js'
import { resolveStats, applyTraitEffects } from '../sim/stats.js'

const data = await loadData()
const knight = unitById(data.units, 'hero_knight_1')   // T2 guardian
const wizard = unitById(data.units, 'evil_wizard_3')   // T5 mage

describe('resolveStats', () => {
  it('티어 기본 × 직업 계수로 스탯을 낸다', () => {
    const s = resolveStats(knight, 1, data.combat)
    // T2 hp 650 × guardian 1.35 = 877.5 → floor 877
    expect(s.hp).toBe(877)
    // T2 atk 50 × guardian 0.75 = 37.5 → floor 37
    expect(s.atk).toBe(37)
  })

  it('사거리는 직업이 정한다', () => {
    expect(resolveStats(knight, 1, data.combat).range).toBe(1)
    expect(resolveStats(wizard, 1, data.combat).range).toBe(3)
  })

  it('시작 마나는 티어가 정한다', () => {
    expect(resolveStats(knight, 1, data.combat).manaStart).toBe(25)
    expect(resolveStats(wizard, 1, data.combat).manaStart).toBe(10)
  })

  it('성급이 hp·atk 를 배율로 올린다', () => {
    const one = resolveStats(knight, 1, data.combat)
    const two = resolveStats(knight, 2, data.combat)
    const three = resolveStats(knight, 3, data.combat)
    expect(two.hp).toBe(Math.floor(877 * 1.8))
    expect(three.hp).toBe(Math.floor(877 * 3.24))
    expect(two.atk).toBeGreaterThan(one.atk)
    expect(three.atk).toBeGreaterThan(two.atk)
  })

  it('성급이 power 도 배율로 올린다', () => {
    const one = resolveStats(wizard, 1, data.combat)
    const two = resolveStats(wizard, 2, data.combat)
    const three = resolveStats(wizard, 3, data.combat)
    const [, m2, m3] = data.combat.starMultiplier
    expect(two.power).toBe(Math.floor(one.power * m2))
    expect(three.power).toBe(Math.floor(one.power * m3))
  })

  it('성급은 사거리와 공격 간격을 바꾸지 않는다', () => {
    const one = resolveStats(knight, 1, data.combat)
    const three = resolveStats(knight, 3, data.combat)
    expect(three.range).toBe(one.range)
    expect(three.attackInterval).toBe(one.attackInterval)
  })

  it('성급은 def·mr 을 바꾸지 않는다 (배율 대상은 hp·atk·power 뿐)', () => {
    const one = resolveStats(knight, 1, data.combat)
    const three = resolveStats(knight, 3, data.combat)
    expect(three.def).toBe(one.def)
    expect(three.mr).toBe(one.mr)
  })

  it('성급 스탯은 1성 표시값의 정확한 배수다 (내림을 두 번 하는 이유)', () => {
    const one = resolveStats(knight, 1, data.combat)
    const two = resolveStats(knight, 2, data.combat)
    const three = resolveStats(knight, 3, data.combat)
    const [, m2, m3] = data.combat.starMultiplier
    expect(two.hp).toBe(Math.floor(one.hp * m2))
    expect(three.hp).toBe(Math.floor(one.hp * m3))
    expect(two.atk).toBe(Math.floor(one.atk * m2))
    expect(three.atk).toBe(Math.floor(one.atk * m3))
  })

  it('모든 스탯이 정수다 (critChance 제외)', () => {
    const s = resolveStats(wizard, 2, data.combat)
    for (const key of ['hp', 'atk', 'def', 'mr', 'power', 'attackInterval', 'range', 'manaStart']) {
      expect(Number.isInteger(s[key])).toBe(true)
    }
  })

  it('공격 간격은 최소 6틱이다', () => {
    const s = resolveStats(wizard, 3, data.combat)
    expect(s.attackInterval).toBeGreaterThanOrEqual(6)
  })
})

describe('applyTraitEffects', () => {
  const base = { hp: 1000, atk: 100, def: 20, mr: 20, power: 50, attackInterval: 50, range: 1, critChance: 0.05, manaStart: 20 }

  it('평탄 가산을 더한다', () => {
    const out = applyTraitEffects(base, [{ def: 25, hp: 250 }])
    expect(out.def).toBe(45)
    expect(out.hp).toBe(1250)
  })

  it('퍼센트 가산을 곱한다', () => {
    const out = applyTraitEffects(base, [{ atkPct: 20 }])
    expect(out.atk).toBe(120)
  })

  it('공속 퍼센트는 공격 간격을 줄인다', () => {
    const out = applyTraitEffects(base, [{ attackSpeedPct: 20 }])
    expect(out.attackInterval).toBe(Math.floor(50 / 1.2))
  })

  it('여러 효과를 누적한다', () => {
    const out = applyTraitEffects(base, [{ def: 25 }, { def: 50, hp: 500 }])
    expect(out.def).toBe(95)
    expect(out.hp).toBe(1500)
  })

  it('사거리 가산을 더한다', () => {
    expect(applyTraitEffects(base, [{ range: 2 }]).range).toBe(3)
  })

  it('치명타 확률은 퍼센트포인트로 더한다', () => {
    expect(applyTraitEffects(base, [{ critChancePct: 20 }]).critChance).toBeCloseTo(0.25, 5)
  })

  it('빈 효과 목록은 원본과 같은 값을 낸다', () => {
    expect(applyTraitEffects(base, [])).toEqual(base)
  })

  it('원본을 변형하지 않는다', () => {
    applyTraitEffects(base, [{ def: 25 }])
    expect(base.def).toBe(20)
  })
})
