// 결제 지급 표. 훅 안에 규칙이 박히면 결제를 흉내 내야만 확인할 수 있어
// 여기서 못박는다.
import { describe, it, expect, beforeAll } from 'vitest'
import { loadData } from '../sim/data.js'
import { productOf, purchaseGrant, storeProducts, applyGrant, paidAlready, gemBonus } from '../sim/store.js'

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

  it('값은 데이터에 없다 — 대시보드가 VX 로 쥔다. 여기 적으면 결제창과 다른 수가 화면에 뜬다', () => {
    for (const p of storeProducts(data)) {
      expect(p.usd, p.id).toBeUndefined()
      expect(p.price, p.id).toBeUndefined()
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

describe('같은 결제를 두 번 지급하지 않는다', () => {
  // 지급(프로필 쓰기)과 처리 기록(컬렉션 쓰기)은 서로 다른 문서다. 지급이
  // 끝나고 기록이 실패하면, 재시도가 "처음 보는 결제" 로 읽어 또 준다.
  // 그래서 **지급과 같은 쓰기에** 결제 id 를 남긴다.
  it('지급하면 결제 id 가 프로필에 남는다', () => {
    const next = applyGrant(null, { gems: 300, premium: false, known: true }, { purchaseId: 'p1' })
    expect(paidAlready(next, 'p1')).toBe(true)
  })

  it('이미 준 결제는 다시 안 준다', () => {
    const one = applyGrant(null, { gems: 300, premium: false, known: true }, { purchaseId: 'p1' })
    expect(paidAlready(one, 'p2')).toBe(false)
    expect(paidAlready(null, 'p1')).toBe(false)
  })

  it('기록은 최근 것만 남긴다 — 계정 문서가 영수증 더미가 되면 안 된다', () => {
    let p = null
    for (let i = 0; i < 30; i++) {
      p = applyGrant(p, { gems: 1, premium: false, known: true }, { purchaseId: `p${i}` })
    }
    expect(p.paid.length).toBeLessThanOrEqual(20)
    expect(paidAlready(p, 'p29')).toBe(true)
    expect(paidAlready(p, 'p0')).toBe(false)
  })
})

describe('묶음 보너스', () => {
  it('값에서 센다 — 표에 적어 두면 대시보드에서 값을 바꾼 날 거짓말이 된다', () => {
    // 대시보드에 실제로 등록한 값. 젬/VX 가 300/100 = 3.0 이 기준선이다.
    const b = gemBonus([
      { id: 'small', gems: 300, price: 100 },
      { id: 'medium', gems: 1000, price: 300 },
      { id: 'large', gems: 2600, price: 700 },
    ])
    // 기준선 자신은 배지가 없다 — "+0%" 는 적을 이유가 없다.
    expect(b.small).toBeUndefined()
    expect(b.medium).toBe(11)
    expect(b.large).toBe(24)
  })

  it('값을 못 받았거나 젬을 안 주는 상품은 세지 않는다 — 없는 수를 지어내지 않는다', () => {
    const b = gemBonus([
      { id: 'small', gems: 300, price: 100 },
      { id: 'medium', gems: 1000, price: 0 },
      { id: 'pass', gems: 0, price: 500 },
    ])
    expect(b.medium).toBeUndefined()
    expect(b.pass).toBeUndefined()
  })

  it('견줄 것이 하나뿐이면 아무것도 안 센다', () => {
    expect(gemBonus([{ id: 'small', gems: 300, price: 100 }])).toEqual({})
    expect(gemBonus([])).toEqual({})
    expect(gemBonus(null)).toEqual({})
  })

  it('상품 표는 보너스를 들고 있지 않다 — 값과 어긋날 자리를 아예 없앤다', () => {
    for (const p of storeProducts(data)) {
      expect(p).not.toHaveProperty('bonus')
    }
  })
})
