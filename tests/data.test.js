import { describe, it, expect } from 'vitest'
import { loadData, unitById } from '../sim/data.js'

const data = await loadData()

describe('loadData', () => {
  it('네 개의 데이터 파일을 모두 읽는다', () => {
    expect(data.combat).toBeTruthy()
    expect(data.units).toBeTruthy()
    expect(data.traits).toBeTruthy()
    expect(data.shop).toBeTruthy()
  })

  it('유닛이 26종이다', () => {
    expect(data.units.units).toHaveLength(26)
  })

  it('유닛 id 가 중복되지 않는다', () => {
    const ids = data.units.units.map((u) => u.id)
    expect(new Set(ids).size).toBe(26)
  })

  it('모든 유닛이 종족 1개와 직업 1개를 갖는다', () => {
    const origins = new Set(data.traits.origins.map((o) => o.id))
    const classes = new Set(data.traits.classes.map((c) => c.id))
    for (const u of data.units.units) {
      expect(origins.has(u.origin)).toBe(true)
      expect(classes.has(u.class)).toBe(true)
    }
  })

  it('모든 유닛 스킬이 4가지 타입 중 하나다', () => {
    const types = new Set(['single', 'aoe', 'buff', 'summon'])
    for (const u of data.units.units) {
      expect(types.has(u.skill.type)).toBe(true)
    }
  })

  it('시너지가 종족 5 + 직업 6 = 11종이다', () => {
    expect(data.traits.origins).toHaveLength(5)
    expect(data.traits.classes).toHaveLength(6)
  })
})

describe('unitById', () => {
  it('id 로 유닛을 찾는다', () => {
    expect(unitById(data.units, 'frog').tier).toBe(2)
  })

  it('없는 id 는 undefined 다', () => {
    expect(unitById(data.units, 'nope')).toBeUndefined()
  })
})
