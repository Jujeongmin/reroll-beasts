// 골드·레벨·판매가. 전부 데이터가 정하고 여기는 규칙만 쓴다.
// 순수 함수다 — 서버가 같은 코드로 클라이언트의 소비 내역을 검산한다.

import { unitById } from './data.js'
import { copiesForStar } from './pool.js'

/** 보유 골드 이자. 10당 1, 상한 있음. */
export function interest(gold, economy) {
  return Math.min(economy.interest.max, Math.floor(gold / economy.interest.per))
}

/** 연승·연패 보너스. 승패 방향은 무관하고 **연속 횟수**만 본다. */
export function streakBonus(streak, economy) {
  let best = 0
  for (const row of economy.streak) {
    if (streak >= row.atLeast) best = Math.max(best, row.gold)
  }
  return best
}

/** 라운드 정산. 항목을 쪼개 돌려주므로 화면이 "왜 이만큼인지" 그대로 보여준다. */
export function roundIncome({ gold, streak, won }, economy) {
  const parts = {
    base: economy.baseIncome,
    interest: interest(gold, economy),
    streak: streakBonus(streak, economy),
    win: won ? economy.winBonus : 0,
  }
  return { ...parts, total: parts.base + parts.interest + parts.streak + parts.win }
}

/**
 * 판매 환급.
 *
 * 1성은 산 값 전액, 2·3성은 배수에서 1을 뺀다 — 합성한 유닛을 되팔아
 * 원금을 온전히 회수하면 리롤에 위험이 없어진다.
 */
export function sellValue(unitId, star, data) {
  const u = unitById(data.units, unitId)
  if (!u) throw new Error(`없는 유닛 id: ${unitId}`)
  const { multiplier, penalty } = data.economy.sell
  const i = star - 1
  if (multiplier[i] === undefined) throw new Error(`성급 ${star} 의 환급 배수가 없다`)
  return u.tier * multiplier[i] - penalty[i]
}

/** 판매 시 풀로 돌려줄 카드 수. */
export function refundCopies(star, data) {
  return copiesForStar(star, data.shop)
}

/** 다음 레벨까지 필요한 XP. 최대 레벨이면 null. */
export function xpToNext(level, levels) {
  const n = levels.xpToNext[String(level)]
  return n === undefined ? null : n
}

export function maxLevel(levels) {
  return Math.max(...Object.keys(levels.xpToNext).map(Number)) + 1
}

/**
 * XP 를 더하고 레벨업을 연쇄 처리한다.
 * 최대 레벨에 닿으면 남는 XP 는 버린다 (더 살 이유가 없어야 한다).
 */
export function addXp(level, xp, amount, levels) {
  let lv = level
  let cur = xp + amount
  for (;;) {
    const need = xpToNext(lv, levels)
    if (need === null) return { level: lv, xp: 0 }
    if (cur < need) return { level: lv, xp: cur }
    cur -= need
    lv += 1
  }
}
