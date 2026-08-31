import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { validate } from '../tools/validate.mjs'

const data = await loadData()

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

describe('validate', () => {
  it('현재 데이터는 모든 불변식을 통과한다', () => {
    expect(validate(data)).toEqual([])
  })

  it('티어 확률 합이 100 이 아니면 잡아낸다', () => {
    const bad = clone(data)
    bad.shop.tierOdds['5'] = [45, 33, 20, 3, 0]
    expect(validate(bad).some((m) => m.includes('확률 합'))).toBe(true)
  })

  it('없는 종족을 참조하면 잡아낸다', () => {
    const bad = clone(data)
    bad.units.units[0].origin = 'nonexistent'
    expect(validate(bad).some((m) => m.includes('종족'))).toBe(true)
  })

  it('시너지 보유 유닛 수가 최대 활성 단계보다 적으면 잡아낸다', () => {
    const bad = clone(data)
    const ranger = bad.traits.classes.find((c) => c.id === 'ranger')
    ranger.steps = [2, 3, 9]
    ranger.effects.push({ scope: 'trait' })
    expect(validate(bad).some((m) => m.includes('활성 단계'))).toBe(true)
  })

  it('시너지에 T1 진입점이 없으면 잡아낸다', () => {
    const bad = clone(data)
    for (const u of bad.units.units) if (u.class === 'ranger') u.tier = 2
    expect(validate(bad).some((m) => m.includes('T1 진입점'))).toBe(true)
  })

  it('티어별 종수와 pool 정의가 어긋나면 잡아낸다', () => {
    const bad = clone(data)
    bad.shop.pool['1'].unitCount = 9
    expect(validate(bad).some((m) => m.includes('티어별 종수'))).toBe(true)
  })

  it('T5 3성이 봉쇄되지 않으면 잡아낸다', () => {
    const bad = clone(data)
    bad.shop.pool['5'].copiesPerUnit = 12
    expect(validate(bad).some((m) => m.includes('T5 3성'))).toBe(true)
  })

  it('없는 직업 계수를 참조하면 잡아낸다', () => {
    const bad = clone(data)
    delete bad.combat.classModifier.ranger
    expect(validate(bad).some((m) => m.includes('직업 계수'))).toBe(true)
  })

  it('steps 와 effects 길이가 다르면 잡아낸다', () => {
    const bad = clone(data)
    bad.traits.origins[0].steps = [2, 4]
    expect(validate(bad).some((m) => m.includes('effects 길이'))).toBe(true)
  })
})
