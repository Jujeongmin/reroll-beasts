import { describe, it, expect } from 'vitest'
import { loadData, unitById } from '../sim/data.js'
import { createRng } from '../sim/rng.js'
import {
  createPool,
  rollSlot,
  rollShop,
  discardShop,
  returnToPool,
  takeFromPool,
  copiesForStar,
  unitCost,
} from '../sim/pool.js'

const data = await loadData()
const tierOf = (id) => unitById(data.units, id).tier

/** 재고가 마르지 않는 풀. 확률표만 보고 싶을 때 쓴다. */
function bigPool(perUnit = 100000) {
  return new Map(data.units.units.map((u) => [u.id, perUnit]))
}

describe('풀 생성', () => {
  it('종당 매수가 shop.json 의 티어별 정의와 같다', () => {
    const pool = createPool(data)
    for (const u of data.units.units) {
      expect(pool.get(u.id)).toBe(data.shop.pool[String(u.tier)].copiesPerUnit)
    }
  })

  it('총 매수가 티어별 (종수 × 종당 매수) 합과 같다', () => {
    const pool = createPool(data)
    const total = [...pool.values()].reduce((a, b) => a + b, 0)
    const expected = Object.values(data.shop.pool).reduce(
      (a, d) => a + d.unitCount * d.copiesPerUnit,
      0,
    )
    expect(total).toBe(expected)
  })
})

describe('상점 뽑기', () => {
  it('뽑을 때마다 그 유닛의 재고가 정확히 1 줄어든다', () => {
    const pool = createPool(data)
    const rng = createRng(11)
    const before = new Map(pool)
    const id = rollSlot(pool, 5, rng, data)
    expect(id).toBeTruthy()
    expect(pool.get(id)).toBe(before.get(id) - 1)
    // 나머지는 그대로여야 한다
    for (const [k, v] of before) if (k !== id) expect(pool.get(k)).toBe(v)
  })

  it('확률이 0 인 티어는 절대 나오지 않는다', () => {
    // 레벨 3 은 T3~T5 가 0% 다. 한 번이라도 나오면 확률표를 안 보는 것이다.
    const pool = bigPool()
    const rng = createRng(3)
    for (let i = 0; i < 3000; i++) {
      const id = rollSlot(pool, 3, rng, data)
      expect(tierOf(id)).toBeLessThanOrEqual(2)
    }
  })

  it('티어 분포가 확률표를 따른다', () => {
    // 표를 무시하고 균등하게 뽑아도 위 테스트는 통과한다. 분포까지 봐야
    // "확률표를 읽기는 하는가"가 실제로 걸린다.
    const pool = bigPool()
    const rng = createRng(77)
    const N = 20000
    const count = new Map()
    for (let i = 0; i < N; i++) {
      const t = tierOf(rollSlot(pool, 7, rng, data))
      count.set(t, (count.get(t) ?? 0) + 1)
    }
    const odds = data.shop.tierOdds['7']
    for (let t = 1; t <= 5; t++) {
      const pct = ((count.get(t) ?? 0) / N) * 100
      expect(Math.abs(pct - odds[t - 1])).toBeLessThan(1.5)
    }
  })

  it('같은 티어 안에서는 남은 매수에 비례해 뽑는다', () => {
    // 한 종에만 재고를 몰아두면 그 종만 나와야 한다. 종당 균등이면 실패한다.
    const pool = new Map(data.units.units.map((u) => [u.id, 0]))
    const t1 = data.units.units.filter((u) => u.tier === 1)
    pool.set(t1[0].id, 500)
    pool.set(t1[1].id, 0)
    const rng = createRng(9)
    for (let i = 0; i < 200; i++) expect(rollSlot(pool, 3, rng, data)).toBe(t1[0].id)
  })

  it('재고가 마른 티어는 확률표에서 빠지고 나머지로 정규화된다', () => {
    // T1 재고를 0 으로 만들면 레벨 3 에서는 T2 만 남는다.
    // 이웃 티어로 흘리거나 null 을 뱉으면 상점이 빈칸투성이가 된다.
    const pool = bigPool()
    for (const u of data.units.units) if (u.tier === 1) pool.set(u.id, 0)
    const rng = createRng(4)
    for (let i = 0; i < 500; i++) {
      const id = rollSlot(pool, 3, rng, data)
      expect(id).not.toBeNull()
      expect(tierOf(id)).toBe(2)
    }
  })

  it('전 티어가 비면 null 을 준다', () => {
    const pool = new Map(data.units.units.map((u) => [u.id, 0]))
    expect(rollSlot(pool, 9, createRng(1), data)).toBeNull()
  })

  it('상점 칸 수가 shop.json 을 따른다', () => {
    const pool = createPool(data)
    expect(rollShop(pool, 5, createRng(2), data)).toHaveLength(data.shop.slots)
  })

  it('버린 상점은 팔린 카드를 뺀 나머지만 풀로 돌아온다', () => {
    const pool = createPool(data)
    const before = new Map(pool)
    const shop = rollShop(pool, 5, createRng(8), data)
    const sold = shop[0]
    shop[0] = null // 한 장은 샀다고 치자
    discardShop(pool, shop)

    // 산 유닛만 정확히 1 줄고, 나머지는 전부 원래대로여야 한다.
    // 같은 유닛이 상점에 두 번 떴을 수도 있으므로 개수로 센다.
    for (const [id, v] of before) {
      expect(pool.get(id)).toBe(id === sold ? v - 1 : v)
    }
  })
})

describe('매수 계산', () => {
  it('성급별 원본 카드 수가 shop.json 을 따른다', () => {
    expect(copiesForStar(1, data.shop)).toBe(1)
    expect(copiesForStar(2, data.shop)).toBe(data.shop.starUpCopies['2'])
    expect(copiesForStar(3, data.shop)).toBe(data.shop.starUpCopies['3'])
  })

  it('재고보다 많이 가져가려 하면 거절하고 아무것도 안 뺀다', () => {
    const pool = new Map([['cat', 2]])
    expect(takeFromPool(pool, 'cat', 3)).toBe(false)
    expect(pool.get('cat')).toBe(2)
    expect(takeFromPool(pool, 'cat', 2)).toBe(true)
    expect(pool.get('cat')).toBe(0)
    returnToPool(pool, 'cat', 2)
    expect(pool.get('cat')).toBe(2)
  })

  it('가격은 티어와 같다', () => {
    for (const u of data.units.units) expect(unitCost(u.id, data)).toBe(u.tier)
  })
})
