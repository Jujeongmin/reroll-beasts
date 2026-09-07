// 유닛 풀. 로비 8인이 **한 벌의 카드 뭉치를 나눠 쓴다** — 남이 사간 유닛은
// 내 상점에도 안 뜬다. 이게 오토체스에서 "노선이 겹친다"가 의미를 갖는 이유다.
//
// 순수 함수다. Math.random 을 쓰지 않고 rng 를 받는다 —
// 서버가 같은 시드로 같은 상점을 재현할 수 있어야 한다.

import { unitById } from './units.js'

/** 성급 하나를 만드는 데 든 원본 카드 수. 팔면 이만큼 풀로 돌아간다. */
export function copiesForStar(star, shopCfg) {
  if (star === 1) return 1
  const n = shopCfg.starUpCopies[String(star)]
  if (!n) throw new Error(`성급 ${star} 의 필요 매수가 shop.json 에 없다`)
  return n
}

/** 유닛 id → 남은 매수. */
export function createPool(data) {
  const pool = new Map()
  for (const u of data.units.units) {
    const def = data.shop.pool[String(u.tier)]
    if (!def) throw new Error(`티어 ${u.tier} 의 풀 정의가 shop.json 에 없다`)
    pool.set(u.id, def.copiesPerUnit)
  }
  return pool
}

export function takeFromPool(pool, unitId, count) {
  const left = pool.get(unitId)
  if (left === undefined) throw new Error(`풀에 없는 유닛: ${unitId}`)
  if (left < count) return false
  pool.set(unitId, left - count)
  return true
}

export function returnToPool(pool, unitId, count) {
  const left = pool.get(unitId)
  if (left === undefined) throw new Error(`풀에 없는 유닛: ${unitId}`)
  pool.set(unitId, left + count)
}

/**
 * 상점 한 칸을 뽑는다.
 *
 * 티어를 확률표로 고르고, 그 티어 안에서는 **남은 매수에 비례**해 고른다.
 * 종당 균등이 아니라 매수 비례여야 "남들이 쓸어간 유닛은 덜 나온다"가 성립한다.
 *
 * 재고가 0인 티어는 확률표에서 **빼고 정규화**한다. 그냥 다시 굴리면
 * 재고가 마른 후반에 무한루프가 되고, 이웃 티어로 흘리면 확률표가 거짓말이 된다.
 */
export function rollSlot(pool, level, rng, data) {
  const odds = data.shop.tierOdds[String(level)]
  if (!odds) throw new Error(`레벨 ${level} 의 상점 확률표가 없다`)

  // 유닛 순회 순서는 units.json 의 배열 순서다 — 결정론의 근거다.
  const list = data.units.units
  const stockByTier = new Map()
  for (const u of list) {
    const n = pool.get(u.id) ?? 0
    if (n > 0) stockByTier.set(u.tier, (stockByTier.get(u.tier) ?? 0) + n)
  }

  let totalWeight = 0
  for (let t = 1; t <= odds.length; t++) {
    if (stockByTier.has(t)) totalWeight += odds[t - 1]
  }
  if (totalWeight === 0) return null

  let r = rng.int(totalWeight)
  let tier = -1
  for (let t = 1; t <= odds.length; t++) {
    if (!stockByTier.has(t)) continue
    r -= odds[t - 1]
    if (r < 0) {
      tier = t
      break
    }
  }
  if (tier < 0) return null

  let pick = rng.int(stockByTier.get(tier))
  for (const u of list) {
    if (u.tier !== tier) continue
    const n = pool.get(u.id) ?? 0
    if (n === 0) continue
    pick -= n
    if (pick < 0) {
      pool.set(u.id, n - 1)
      return u.id
    }
  }
  return null
}

/** 상점 한 판. 칸 수는 shop.json 이 정한다. */
export function rollShop(pool, level, rng, data) {
  const out = []
  for (let i = 0; i < data.shop.slots; i++) out.push(rollSlot(pool, level, rng, data))
  return out
}

/** 팔지 않고 상점을 새로 굴릴 때, 안 산 카드는 풀로 돌려준다. */
export function discardShop(pool, shop) {
  for (const id of shop) if (id) returnToPool(pool, id, 1)
}

export function unitCost(unitId, data) {
  const u = unitById(data.units, unitId)
  if (!u) throw new Error(`없는 유닛 id: ${unitId}`)
  return u.tier
}
