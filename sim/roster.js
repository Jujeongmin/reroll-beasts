// 런 상태: 골드·레벨·벤치·보드·상점. 그리고 그 위에서 도는 규칙.
//
// 순수하다 — DOM 도 fetch 도 Math.random 도 없다. 화면은 이 결과를 그리기만 하고,
// 서버는 같은 코드로 "이 사람이 정말 이걸 살 수 있었나"를 검산한다.
//
// 보드는 **로컬 타일 0..27 배열**이다. 전장 좌표로의 변환은 sim/combat.js 의
// toFieldTile 이 진영을 보고 한다. 여기서 전장 좌표를 쓰면 A/B 진영마다
// 다른 배열이 되어 스냅샷을 반대편에서 못 읽는다.

import { unitById } from './data.js'
import { createPool, rollShop, discardShop, returnToPool, unitCost } from './pool.js'
import { addXp, sellValue, refundCopies, xpToNext } from './economy.js'

const ok = { ok: true }
const fail = (reason) => ({ ok: false, reason })

export function tilesPerSide(data) {
  return data.combat.board.rows.reduce((a, n) => a + n, 0) / 2
}

export function createRun(data) {
  const { economy, levels, shop } = data
  return {
    gold: economy.startGold,
    hp: economy.startHp,
    level: levels.startLevel,
    xp: 0,
    streak: 0,
    bench: Array(economy.benchSlots).fill(null),
    board: Array(tilesPerSide(data)).fill(null),
    shop: Array(shop.slots).fill(null),
    nextUid: 1,
  }
}

export function boardCount(state) {
  return state.board.reduce((n, c) => n + (c ? 1 : 0), 0)
}

/** 배치 가능 인원 = 레벨. */
export function population(state) {
  return { used: boardCount(state), cap: state.level }
}

export function allUnits(state) {
  const out = []
  state.board.forEach((c, i) => c && out.push({ ...c, where: 'board', index: i }))
  state.bench.forEach((c, i) => c && out.push({ ...c, where: 'bench', index: i }))
  return out
}

export function findUnit(state, uid) {
  for (let i = 0; i < state.board.length; i++) {
    if (state.board[i]?.uid === uid) return { where: 'board', index: i, unit: state.board[i] }
  }
  for (let i = 0; i < state.bench.length; i++) {
    if (state.bench[i]?.uid === uid) return { where: 'bench', index: i, unit: state.bench[i] }
  }
  return null
}

function slotsOf(state, where) {
  return where === 'board' ? state.board : state.bench
}

function freeBenchSlot(state) {
  return state.bench.indexOf(null)
}

// ── 합성 ────────────────────────────────────────────────────

/**
 * 같은 유닛 · 같은 성급 3장을 한 단계 위로 합친다. 연쇄한다 (3장×3 = 3성).
 *
 * 합쳐진 유닛이 앉을 자리는 **셋 중 가장 앞선 자리**다: 보드가 벤치보다 앞서고,
 * 보드끼리는 타일 번호가, 벤치끼리는 칸 번호가 앞선 쪽. 이 순서를 고정해야
 * 같은 상태에서 항상 같은 배치가 나온다 — 스냅샷 재현의 전제다.
 */
// 합성 결과가 앉을 자리를 정하는 순서. 보드가 벤치보다 앞서고,
// 같은 곳끼리는 번호가 앞선 쪽. buy 의 만석 경로도 같은 순서를 써야
// 벤치가 찼는지 여부에 따라 배치가 달라지는 일이 없다.
function bySeatOrder(list) {
  return [...list].sort((a, b) =>
    a.where === b.where ? a.index - b.index : a.where === 'board' ? -1 : 1,
  )
}

export function resolveMerges(state, data) {
  const need = 3
  const maxStar = data.combat.starMultiplier.length
  let merged = 0

  for (;;) {
    const groups = new Map()
    for (const u of allUnits(state)) {
      if (u.star >= maxStar) continue
      const key = `${u.unitId}:${u.star}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(u)
    }

    let target = null
    for (const [, list] of groups) {
      if (list.length >= need) {
        target = bySeatOrder(list).slice(0, need)
        break
      }
    }
    if (!target) break

    const home = target[0]
    for (const u of target) slotsOf(state, u.where)[u.index] = null
    slotsOf(state, home.where)[home.index] = {
      uid: state.nextUid++,
      unitId: home.unitId,
      star: home.star + 1,
    }
    merged++
  }
  return merged
}

/** 이 유닛을 한 장 더 얻으면 곧바로 합성이 되는가. 벤치가 꽉 찼을 때의 예외 근거. */
function completesMerge(state, unitId) {
  const same = allUnits(state).filter((u) => u.unitId === unitId && u.star === 1)
  return same.length >= 2
}

// ── 상점 ────────────────────────────────────────────────────

export function refreshShop(state, pool, rng, data, { free = false } = {}) {
  if (!free) {
    const cost = data.shop.rerollCost
    if (state.gold < cost) return fail(`골드가 부족하다 (리롤 ${cost})`)
    state.gold -= cost
  }
  discardShop(pool, state.shop)
  state.shop = rollShop(pool, state.level, rng, data)
  return ok
}

export function buy(state, pool, slotIndex, data) {
  const unitId = state.shop[slotIndex]
  if (!unitId) return fail('빈 칸이다')

  const cost = unitCost(unitId, data)
  if (state.gold < cost) return fail(`골드가 부족하다 (${cost})`)

  // 벤치가 꽉 차도 **합성이 완성되는 경우엔** 살 수 있다.
  // 이게 없으면 벤치 9칸이 다 찼을 때 눈앞의 3성을 놓친다.
  const slot = freeBenchSlot(state)
  if (slot < 0 && !completesMerge(state, unitId)) return fail('벤치가 가득 찼다')

  state.gold -= cost
  state.shop[slotIndex] = null
  if (slot >= 0) {
    state.bench[slot] = { uid: state.nextUid++, unitId, star: 1 }
  } else {
    // 벤치 만석 + 합성 완성. 산 카드는 어차피 즉시 합쳐지므로 자리가 필요 없다.
    // 기존 두 장을 지우고 그 앞자리에 한 단계 위를 앉힌다.
    const same = bySeatOrder(allUnits(state).filter((u) => u.unitId === unitId && u.star === 1))
    const [home, other] = same
    slotsOf(state, other.where)[other.index] = null
    slotsOf(state, home.where)[home.index] = { uid: state.nextUid++, unitId, star: 2 }
  }
  resolveMerges(state, data)
  return ok
}

export function buyXp(state, data) {
  const { gold, xp } = data.shop.xpCost
  if (xpToNext(state.level, data.levels) === null) return fail('최대 레벨이다')
  if (state.gold < gold) return fail(`골드가 부족하다 (${gold})`)
  state.gold -= gold
  const next = addXp(state.level, state.xp, xp, data.levels)
  state.level = next.level
  state.xp = next.xp
  return ok
}

export function sell(state, pool, uid, data) {
  const found = findUnit(state, uid)
  if (!found) return fail('없는 유닛이다')
  const { unitId, star } = found.unit
  slotsOf(state, found.where)[found.index] = null
  state.gold += sellValue(unitId, star, data)
  returnToPool(pool, unitId, refundCopies(star, data))
  return ok
}

// ── 배치 ────────────────────────────────────────────────────

/**
 * 유닛을 옮긴다. 목적지가 차 있으면 **자리를 맞바꾼다** (오토체스 관례).
 * dest = { where: 'board'|'bench', index }
 */
export function moveTo(state, uid, dest, data) {
  const found = findUnit(state, uid)
  if (!found) return fail('없는 유닛이다')
  const slots = slotsOf(state, dest.where)
  if (dest.index < 0 || dest.index >= slots.length) return fail('없는 칸이다')
  if (found.where === dest.where && found.index === dest.index) return ok

  const occupant = slots[dest.index]
  // 벤치→보드로 사람이 늘어날 때만 인구를 본다. 보드 안에서의 이동이나
  // 자리 맞바꿈은 인원이 그대로이므로 막을 이유가 없다.
  const grows = dest.where === 'board' && found.where !== 'board' && !occupant
  if (grows && boardCount(state) >= state.level) {
    return fail(`배치 인원이 꽉 찼다 (레벨 ${state.level})`)
  }

  slotsOf(state, found.where)[found.index] = occupant ?? null
  slots[dest.index] = found.unit
  return ok
}

/** 전투에 넘길 형태. 보드에 놓인 유닛만 싸운다. */
export function toCombatEntries(state) {
  const out = []
  state.board.forEach((c, tile) => {
    if (c) out.push({ unitId: c.unitId, star: c.star, tile })
  })
  return out
}

/** 라운드 시작 시의 무료 상점. */
export function startRun(data, rng) {
  const state = createRun(data)
  const pool = createPool(data)
  refreshShop(state, pool, rng, data, { free: true })
  return { state, pool }
}

export { unitById }
