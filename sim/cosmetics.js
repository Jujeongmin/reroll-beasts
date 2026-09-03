// 코스메틱 보유·해금 규칙.
//
// **밸런스에 안 닿는 것만 다룬다.** 아바타는 판 위의 말이 아니고 싸우지도
// 않는다 — 무엇을 입든 이기고 지는 데는 아무 영향이 없다. 그게 이걸 팔아도
// 되는 유일한 이유다.
//
// 판정을 순수 함수로 두는 이유: 나중에 서버가 같은 함수로 "그 사람이 정말
// 그걸 갖고 있나"를 검산한다. 화면에서만 잠가 두면 잠금은 장식이다.

import { tierOf, TIERS } from './rank.js'

/**
 * 그 아바타를 지금 쓸 수 있나.
 *
 * @param {object} item     cosmetics.json 의 avatars 한 줄
 * @param {object} owned    { passLevel, lp } — 없으면 아무것도 안 가진 것으로 친다
 */
export function isUnlocked(item, owned = {}) {
  // 산 것이 제일 먼저다. 젬으로 미리 산 아바타는 아직 그 단계에 못 갔어도
  // 쓸 수 있어야 한다 — 그러라고 판 것이다.
  if (owned.avatars?.includes(item.id)) return true
  if (item.unlock === 'free') return true
  // 젬으로만 여는 것. 산 적이 없으면(위에서 안 걸렸으면) 잠긴 채다.
  if (item.unlock === 'gem') return false
  if (item.unlock === 'pass') return (owned.passLevel ?? 0) >= (item.passLevel ?? 0)
  if (item.unlock === 'rank') {
    const need = TIERS.findIndex((t) => t.id === item.tier)
    const have = TIERS.findIndex((t) => t.id === tierOf(owned.lp ?? 0).id)
    // 모르는 티어 이름이면 잠가 둔다 — 오타 하나로 전부 열리면 안 된다.
    return need >= 0 && have >= need
  }
  // 모르는 해금 방식도 잠가 둔다. 새 방식을 추가하다 만 상태가 "전부 공짜"로
  // 새는 것보다, 안 열리는 편이 눈에 띄고 고치기도 쉽다.
  return false
}

/** 왜 잠겼는지 한 줄. 화면이 그대로 쓴다. */
export function lockReason(item) {
  if (item.unlock === 'gem') return `${item.price ?? 0} 젬`
  if (item.unlock === 'pass') return `시즌 패스 ${item.passLevel ?? 0}단계`
  if (item.unlock === 'rank') {
    const t = TIERS.find((x) => x.id === item.tier)
    return t ? `${t.name} 달성` : '조건 미정'
  }
  return '잠김'
}

/**
 * 고른 것이 유효한지 확인해서 실제로 쓸 id 를 돌려준다.
 *
 * 잠긴 걸 고른 채로 남아 있을 수 있다 — 시즌이 끝나 패스 단계가 내려가거나,
 * 데이터에서 그 줄이 빠지거나. 그때 조용히 기본값으로 돌린다.
 */
export function resolveAvatar(picked, data, owned = {}) {
  const list = data.cosmetics.avatars
  const found = list.find((a) => a.id === picked)
  if (found && isUnlocked(found, owned)) return found.id
  return data.cosmetics.avatarDefault
}

/**
 * 화면에 뿌릴 목록. 잠금·사유·값을 한 줄에 담는다.
 *
 * 값과 살 수 있는지를 **같은 목록에** 넣는 이유: 고르는 곳과 사는 곳이 갈리면
 * "이걸 쓰고 싶다"와 "이걸 산다" 사이에 화면을 한 번 옮겨야 한다. 고르다가
 * 잠긴 것을 눌렀을 때 그 자리에서 살 수 있어야 한다.
 */
function choicesOf(list, data, owned) {
  return list.map((a) => {
    const unlocked = isUnlocked(a, owned)
    const price = priceOf(a, data)
    const buy = canBuyCosmetic(a, owned, data)
    return {
      id: a.id,
      name: a.name,
      file: a.file ?? null,
      colors: a.colors ?? null,
      unlocked,
      reason: unlocked ? null : lockReason(a),
      price,
      canBuy: buy.ok,
      // 값은 있는데 못 사는 경우(젬 부족)를 화면이 구분해야 한다 — 살 수
      // 없다고 값을 숨기면 얼마를 모아야 하는지 알 수 없다.
      why: buy.ok ? null : buy.why,
    }
  })
}

export function avatarChoices(data, owned = {}) {
  return choicesOf(data.cosmetics.avatars, data, owned)
}

/** 무대 스킨. 아바타와 같은 해금 규칙을 탄다 — 규칙이 하나여야 한다. */
export function boardChoices(data, owned = {}) {
  return choicesOf(data.cosmetics.boards, data, owned)
}

/** id → 그 보드의 줄. 없으면 기본값. */
function boardOf(id, data) {
  const list = data.cosmetics.boards
  return list.find((b) => b.id === id) ?? list.find((b) => b.id === data.cosmetics.boardDefault)
}

/** 고른 보드가 유효한지 확인해서 실제로 쓸 id 를 돌려준다. */
export function resolveBoard(picked, data, owned = {}) {
  const found = data.cosmetics.boards.find((b) => b.id === picked)
  if (found && isUnlocked(found, owned)) return found.id
  return data.cosmetics.boardDefault
}

/** 무대에 입힐 색. 무대는 이 값만 알면 된다 — 코스메틱 규칙을 몰라도 된다. */
export function boardColors(id, data) {
  return boardOf(id, data)?.colors ?? {}
}

/** 아바타·보드를 통틀어 id 하나 찾기. 서버가 구매를 검산할 때 쓴다. */
export function cosmeticById(id, data) {
  return (
    data.cosmetics.avatars.find((a) => a.id === id) ??
    data.cosmetics.boards.find((b) => b.id === id) ??
    null
  )
}

/**
 * 젬 값. 안 파는 물건이면 null.
 *
 * **파는 것은 처음부터 팔려고 만든 것뿐이다**(unlock: 'gem'). 패스·랭크 보상을
 * 팔면 그 트랙을 도는 이유가 사라진다 — 랭크 아바타는 "이 사람은 플래티넘까지
 * 갔다"를 뜻해야 하고, 패스 보상은 시즌을 끝까지 도는 값이어야 한다. 돈으로
 * 같은 것을 얻을 수 있으면 둘 다 장식이 된다.
 */
export function priceOf(item, data) {
  const shop = data.cosmetics.shop
  if (!shop || !item || item.unlock !== shop.sellUnlock) return null
  return item.price ?? null
}

/** 예전 이름들. 아바타뿐 아니라 보드도 같은 규칙을 타므로 이름을 옮겼다. */
export const avatarPrice = priceOf

/**
 * 살 수 있나. 못 사면 왜인지 같이 준다.
 *
 * **서버가 이 함수로 검산한다.** 화면에서만 막으면 잠금은 장식이고, 조작된
 * 요청 하나로 젬 없이 아바타가 열린다.
 */
export function canBuyCosmetic(item, owned = {}, data) {
  if (!item) return { ok: false, why: '없는 물건' }
  const price = priceOf(item, data)
  if (price == null) return { ok: false, why: '파는 물건이 아니다' }
  if (owned.avatars?.includes(item.id)) return { ok: false, why: '이미 갖고 있다' }
  // 단계로 이미 열린 것을 다시 팔면 젬만 사라진다.
  if (isUnlocked(item, owned)) return { ok: false, why: '이미 열렸다' }
  if ((owned.gems ?? 0) < price) return { ok: false, why: '젬이 모자라다' }
  return { ok: true, price }
}

/** id → 그 아바타의 줄. 없으면 기본값의 줄. */
function avatarOf(id, data) {
  const list = data.cosmetics.avatars
  return list.find((a) => a.id === id) ?? list.find((a) => a.id === data.cosmetics.avatarDefault)
}

/** id → 파일. 없으면 기본값의 파일. */
export function avatarFile(id, data) {
  return avatarOf(id, data)?.file
}

/**
 * 그 아바타의 애니메이션 이름표.
 *
 * **팩마다 다르다** — 캐릭터 팩은 환호가 Victory 인데 큐트 팩은 Dance 고,
 * 피격은 RecieveHit 와 HitRecieve 로 철자까지 뒤집혀 있다. 전역 하나로 두면
 * 팩을 섞는 순간 한쪽이 안 움직인다. 아바타 줄이 자기 팩을 가리키고, 그
 * 팩이 이름표를 갖는다 — 새 팩이 와도 JSON 만 는다.
 */
export function avatarAnims(id, data) {
  const a = avatarOf(id, data)
  return data.cosmetics.packs[a?.pack]?.anims ?? {}
}

export const canBuyAvatar = canBuyCosmetic
