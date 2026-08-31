import { describe, it, expect } from 'vitest'
import { physicalDamage, magicDamage, applyDamage } from '../sim/damage.js'

describe('physicalDamage', () => {
  it('방어력 0 이면 공격력 그대로다', () => {
    expect(physicalDamage(100, 0, 100)).toBe(100)
  })

  it('방어력이 defK 와 같으면 절반이다', () => {
    expect(physicalDamage(100, 100, 100)).toBe(50)
  })

  it('정수를 낸다', () => {
    expect(Number.isInteger(physicalDamage(77, 33, 100))).toBe(true)
  })

  it('최소 1 이다', () => {
    expect(physicalDamage(1, 100000, 100)).toBe(1)
  })
})

describe('magicDamage', () => {
  it('마법 저항이 defK 와 같으면 절반이다', () => {
    expect(magicDamage(200, 100, 100)).toBe(100)
  })

  it('최소 1 이다', () => {
    expect(magicDamage(1, 100000, 100)).toBe(1)
  })
})

describe('applyDamage', () => {
  it('HP 를 깎는다', () => {
    const v = { hp: 100, shield: 0, alive: true }
    expect(applyDamage(v, 30)).toEqual({ dealt: 30, toShield: 0, toHp: 30, died: false })
    expect(v.hp).toBe(70)
  })

  it('보호막을 먼저 깎는다', () => {
    const v = { hp: 100, shield: 50, alive: true }
    expect(applyDamage(v, 30)).toEqual({ dealt: 30, toShield: 30, toHp: 0, died: false })
    expect(v.shield).toBe(20)
    expect(v.hp).toBe(100)
  })

  it('보호막을 넘치면 나머지가 HP 로 간다', () => {
    const v = { hp: 100, shield: 20, alive: true }
    // 보호막과 HP 에 걸치는 경우 — 재생기가 둘을 나눠 복원할 수 있어야 한다.
    expect(applyDamage(v, 50)).toEqual({ dealt: 50, toShield: 20, toHp: 30, died: false })
    expect(v.shield).toBe(0)
    expect(v.hp).toBe(70)
  })

  it('HP 가 0 이하가 되면 사망 처리한다', () => {
    const v = { hp: 10, shield: 0, alive: true }
    expect(applyDamage(v, 30)).toEqual({ dealt: 10, toShield: 0, toHp: 10, died: true })
    expect(v.hp).toBe(0)
    expect(v.alive).toBe(false)
  })

  it('이미 죽은 대상에는 0 을 넣는다', () => {
    const v = { hp: 0, shield: 0, alive: false }
    expect(applyDamage(v, 30)).toEqual({ dealt: 0, toShield: 0, toHp: 0, died: false })
  })

  it('HP 는 음수가 되지 않는다', () => {
    const v = { hp: 5, shield: 0, alive: true }
    applyDamage(v, 999)
    expect(v.hp).toBe(0)
  })

  it('dealt 는 과잉 피해를 잘라낸 실제 흡수량이다', () => {
    const v = { hp: 50, shield: 0, alive: true }
    expect(applyDamage(v, 1000).dealt).toBe(50)
  })

  it('보호막이 막은 몫도 흡수량에 포함된다', () => {
    const v = { hp: 100, shield: 20, alive: true }
    expect(applyDamage(v, 50).dealt).toBe(50)
  })

  it('보호막과 HP 를 합쳐도 모자라면 그 합만 흡수한다', () => {
    const v = { hp: 30, shield: 20, alive: true }
    expect(applyDamage(v, 500)).toEqual({ dealt: 50, toShield: 20, toHp: 30, died: true })
  })
})
