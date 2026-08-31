import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { activeTraits } from '../sim/traits.js'

const data = await loadData()

function u(unitId) {
  const found = data.units.units.find((x) => x.id === unitId)
  return { unitId: found.id, origin: found.origin, class: found.class }
}

describe('activeTraits', () => {
  it('빈 보드는 아무 시너지도 활성하지 않는다', () => {
    const m = activeTraits([], data.traits)
    for (const v of m.values()) expect(v.step).toBe(0)
  })

  it('거인 2명이면 거인 1단계가 활성된다', () => {
    const m = activeTraits([u('bunny'), u('frog')], data.traits)
    expect(m.get('giant').count).toBe(2)
    expect(m.get('giant').step).toBe(1)
  })

  it('거인 1명이면 활성되지 않는다', () => {
    const m = activeTraits([u('bunny')], data.traits)
    expect(m.get('giant').count).toBe(1)
    expect(m.get('giant').step).toBe(0)
    expect(m.get('giant').effect).toBeNull()
  })

  it('같은 유닛을 두 개 놓아도 1로 센다', () => {
    const m = activeTraits([u('bunny'), u('bunny')], data.traits)
    expect(m.get('giant').count).toBe(1)
  })

  it('단계 사이 값은 낮은 쪽 단계로 떨어진다 (거인 5명 → 2단계)', () => {
    const board = [
      u('bunny'), u('frog'), u('orc'),
      u('ninja'), u('yeti'),
    ]
    const m = activeTraits(board, data.traits)
    expect(m.get('giant').count).toBe(5)
    expect(m.get('giant').step).toBe(2)
  })

  it('한 유닛이 종족과 직업 시너지를 동시에 채운다', () => {
    const m = activeTraits([u('dino'), u('bunny')], data.traits)
    expect(m.get('giant').step).toBe(1)   // dino + bunny
    expect(m.get('tank').step).toBe(0)    // dino 뿐이라 미달
  })

  it('활성 단계의 effect 객체를 되돌린다', () => {
    const m = activeTraits([u('bunny'), u('frog')], data.traits)
    expect(m.get('giant').effect).toEqual(data.traits.origins.find((o) => o.id === 'giant').effects[0])
  })

  it('시너지 11종을 모두 담는다', () => {
    expect(activeTraits([], data.traits).size).toBe(11)
  })
})
