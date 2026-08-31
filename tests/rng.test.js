import { describe, it, expect } from 'vitest'
import { createRng } from '../sim/rng.js'

describe('createRng', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = createRng(12345)
    const b = createRng(12345)
    const seqA = Array.from({ length: 20 }, () => a.nextU32())
    const seqB = Array.from({ length: 20 }, () => b.nextU32())
    expect(seqA).toEqual(seqB)
  })

  it('다른 시드는 다른 수열을 낸다', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.nextU32()).not.toBe(b.nextU32())
  })

  it('nextU32 는 부호 없는 32비트 정수다', () => {
    const r = createRng(7)
    for (let i = 0; i < 200; i++) {
      const v = r.nextU32()
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(2 ** 32)
    }
  })

  it('int(n) 은 0 이상 n 미만이다', () => {
    const r = createRng(99)
    for (let i = 0; i < 500; i++) {
      const v = r.int(6)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(6)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('int(0) 은 0 을 낸다', () => {
    expect(createRng(3).int(0)).toBe(0)
  })

  it('pick 은 배열 원소를 낸다', () => {
    const r = createRng(42)
    const arr = ['a', 'b', 'c']
    for (let i = 0; i < 50; i++) expect(arr).toContain(r.pick(arr))
  })

  it('state() 로 재개하면 원본 수열이 이어진다', () => {
    const original = createRng(555)
    original.nextU32()
    original.nextU32()
    const saved = original.state()
    const expectedNext = original.nextU32()   // 원본이 이어서 낸 값
    const resumed = createRng(saved)
    expect(resumed.nextU32()).toBe(expectedNext)
  })
})
