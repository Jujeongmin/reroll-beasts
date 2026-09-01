import { describe, it, expect } from 'vitest'
import { loadData, unitById } from '../sim/data.js'
import {
  interest,
  streakBonus,
  roundIncome,
  sellValue,
  refundCopies,
  xpToNext,
  maxLevel,
  addXp,
} from '../sim/economy.js'

const data = await loadData()
const eco = data.economy
const levels = data.levels

describe('이자', () => {
  it('보유 골드 10당 1 이다', () => {
    expect(interest(0, eco)).toBe(0)
    expect(interest(9, eco)).toBe(0)
    expect(interest(10, eco)).toBe(1)
    expect(interest(29, eco)).toBe(2)
  })

  it('상한을 넘지 않는다', () => {
    expect(interest(50, eco)).toBe(eco.interest.max)
    expect(interest(999, eco)).toBe(eco.interest.max)
  })
})

describe('연승·연패 보너스', () => {
  it('경계값에서 바로 올라간다', () => {
    // atLeast 를 > 로 잘못 쓰면 여기서 한 칸씩 밀린다
    expect(streakBonus(1, eco)).toBe(0)
    expect(streakBonus(2, eco)).toBe(1)
    expect(streakBonus(3, eco)).toBe(2)
    expect(streakBonus(4, eco)).toBe(3)
    expect(streakBonus(5, eco)).toBe(4)
  })

  it('표의 마지막 구간을 넘어도 상한에서 멈춘다', () => {
    expect(streakBonus(12, eco)).toBe(4)
  })
})

describe('라운드 정산', () => {
  it('항목별 값과 합계가 맞는다', () => {
    const r = roundIncome({ gold: 32, streak: 3, won: true }, eco)
    expect(r).toEqual({ base: 5, interest: 3, streak: 2, win: 1, total: 11 })
  })

  it('패배하면 승리 보너스가 빠진다 — 연패 보너스는 남는다', () => {
    const r = roundIncome({ gold: 0, streak: 4, won: false }, eco)
    expect(r.win).toBe(0)
    expect(r.streak).toBe(3)
    expect(r.total).toBe(r.base + r.interest + r.streak)
  })

  it('스펙의 라운드 최대 수입 15 를 넘지 않는다', () => {
    const r = roundIncome({ gold: 999, streak: 99, won: true }, eco)
    expect(r.total).toBe(15)
  })
})

describe('판매 환급', () => {
  it('1성은 산 값 전액이다', () => {
    for (const u of data.units.units) expect(sellValue(u.id, 1, data)).toBe(u.tier)
  })

  it('2·3성은 배수에서 1 을 뺀다 — 되팔아 원금을 온전히 회수하면 안 된다', () => {
    const u = data.units.units.find((x) => x.tier === 3)
    expect(sellValue(u.id, 2, data)).toBe(u.tier * 3 - 1)
    expect(sellValue(u.id, 3, data)).toBe(u.tier * 9 - 1)
    // 3장 사는 값(=tier*3)보다 되파는 값이 적어야 한다
    expect(sellValue(u.id, 2, data)).toBeLessThan(u.tier * 3)
  })

  it('환급 카드 수가 합성에 든 원본 매수와 같다', () => {
    expect(refundCopies(1, data)).toBe(1)
    expect(refundCopies(2, data)).toBe(data.shop.starUpCopies['2'])
    expect(refundCopies(3, data)).toBe(data.shop.starUpCopies['3'])
  })

  it('없는 유닛이면 던진다', () => {
    expect(() => sellValue('없는유닛', 1, data)).toThrow()
  })
})

describe('레벨 · XP', () => {
  it('시작 레벨과 최대 레벨이 스펙과 같다', () => {
    expect(levels.startLevel).toBe(3)
    expect(maxLevel(levels)).toBe(9)
    expect(xpToNext(9, levels)).toBeNull()
  })

  it('필요 XP 를 딱 채우면 레벨이 오른다', () => {
    const need = xpToNext(3, levels)
    expect(addXp(3, 0, need - 1, levels)).toEqual({ level: 3, xp: need - 1 })
    expect(addXp(3, 0, need, levels)).toEqual({ level: 4, xp: 0 })
  })

  it('한 번에 여러 레벨을 연쇄로 올린다', () => {
    // 3→4 가 2, 4→5 가 6. 8 을 한 번에 넣으면 5레벨이어야 한다.
    expect(addXp(3, 0, 8, levels)).toEqual({ level: 5, xp: 0 })
    expect(addXp(3, 0, 9, levels)).toEqual({ level: 5, xp: 1 })
  })

  it('최대 레벨에서는 남는 XP 를 버린다', () => {
    expect(addXp(9, 0, 100, levels)).toEqual({ level: 9, xp: 0 })
  })

  it('9레벨까지 필요한 총 XP 가 스펙의 114 다', () => {
    const total = Object.values(levels.xpToNext).reduce((a, b) => a + b, 0)
    expect(total).toBe(114)
  })
})

describe('유닛 데이터 연결', () => {
  it('판매가가 units.json 의 티어를 실제로 읽는다', () => {
    const t1 = data.units.units.find((u) => u.tier === 1)
    const t5 = data.units.units.find((u) => u.tier === 5)
    expect(sellValue(t1.id, 1, data)).not.toBe(sellValue(t5.id, 1, data))
    expect(unitById(data.units, t5.id).tier).toBe(5)
  })
})
