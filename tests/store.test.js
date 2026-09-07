// 결제 지급 표. 훅 안에 규칙이 박히면 결제를 흉내 내야만 확인할 수 있어
// 여기서 못박는다.
import { describe, it, expect, beforeAll } from 'vitest'
import { loadData } from '../sim/data.js'
import { productOf, purchaseGrant, storeProducts, applyGrant } from '../sim/store.js'

let data
beforeAll(async () => {
  data = await loadData()
})

describe('purchaseGrant', () => {
  it('젬 상품은 개수만큼 곱한다', () => {
    const p = data.store.products.find((x) => x.gems)
    expect(purchaseGrant(p.id, 1, data).gems).toBe(p.gems)
    expect(purchaseGrant(p.id, 3, data).gems).toBe(p.gems * 3)
  })

  it('개수가 없거나 이상하면 하나로 친다 — 0 을 곱하면 결제하고 못 받는다', () => {
    const p = data.store.products.find((x) => x.gems)
    expect(purchaseGrant(p.id, undefined, data).gems).toBe(p.gems)
    expect(purchaseGrant(p.id, 0, data).gems).toBe(p.gems)
    expect(purchaseGrant(p.id, -5, data).gems).toBe(p.gems)
  })

  it('패스를 두 개 사도 프리미엄은 하나다', () => {
    const p = data.store.products.find((x) => x.premium)
    const g = purchaseGrant(p.id, 2, data)
    expect(g.premium).toBe(true)
    expect(g.gems).toBe(0)
  })

  it('모르는 상품은 아무것도 안 준다 — 던지면 훅이 죽어 다음 결제까지 막힌다', () => {
    const g = purchaseGrant('아직_없는_상품', 1, data)
    expect(g).toEqual({ gems: 0, premium: false, known: false })
  })
})

describe('상품 표', () => {
  it('id 가 겹치지 않는다 — 겹치면 어느 쪽을 줄지 정해지지 않는다', () => {
    const ids = data.store.products.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('모든 상품이 젬이든 프리미엄이든 하나는 준다', () => {
    for (const p of data.store.products) {
      expect(Boolean(p.gems) || Boolean(p.premium), p.id).toBe(true)
    }
  })

  it('많이 살수록 젬 단가가 싸진다 — 비싼 쪽이 손해면 큰 묶음을 살 이유가 없다', () => {
    const packs = storeProducts(data)
      .filter((p) => p.gems)
      .sort((a, b) => a.usd - b.usd)
    for (let i = 1; i < packs.length; i++) {
      expect(packs[i].gems / packs[i].usd).toBeGreaterThan(packs[i - 1].gems / packs[i - 1].usd)
    }
  })

  it('productOf 는 모르는 id 에 null 을 준다', () => {
    expect(productOf('없음', data)).toBe(null)
  })
})

describe('applyGrant — 결제를 프로필에 얹는다', () => {
  // 전에는 "프로필이 없으면 지급 안 함"이었다. 한 판도 안 하고 젬부터 산
  // 사람은 돈만 내고 아무것도 못 받았고, 결제 id 는 처리 기록에 남아 재시도도
  // 중복으로 걸렀다 — 다시 받을 길이 없었다는 뜻이다.
  it('프로필이 없어도 지급한다 — 계정이 그 자리에서 선다', () => {
    const next = applyGrant(null, { gems: 300, premium: false, known: true })
    expect(next.gems).toBe(300)
    expect(next.pass).toEqual({ xp: 0, level: 1, premium: false })
  })

  it('가진 젬에 더한다', () => {
    expect(applyGrant({ gems: 40 }, { gems: 300, premium: false, known: true }).gems).toBe(340)
  })

  it('프리미엄은 한 번 켜지면 안 꺼진다 — 젬 팩을 더 사도 유지된다', () => {
    const paid = applyGrant({ gems: 0, pass: { xp: 900, level: 10, premium: true } }, {
      gems: 300,
      premium: false,
      known: true,
    })
    expect(paid.pass).toEqual({ xp: 900, level: 10, premium: true })
  })

  it('전적·이름·보유는 그대로 남는다', () => {
    const next = applyGrant({ name: '홍길동', owned: ['a'], games: 3 }, {
      gems: 300,
      premium: false,
      known: true,
    })
    expect(next.name).toBe('홍길동')
    expect(next.owned).toEqual(['a'])
    expect(next.games).toBe(3)
  })

  it('모르는 상품이면 아무것도 안 바꾼다 — 표를 고친 뒤 손으로 채워 준다', () => {
    const before = { gems: 10 }
    expect(applyGrant(before, { gems: 0, premium: false, known: false })).toBe(null)
  })
})
