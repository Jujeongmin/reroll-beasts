import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'

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
