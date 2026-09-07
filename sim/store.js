// 결제 상품 → 계정에 들어갈 것.
//
// **결제창은 우리가 안 만든다.** VXShop(플랫폼)이 상품·가격·결제창을 쥐고,
// 다 끝나면 서버 훅으로 "누가 무엇을 몇 개 샀다"만 온다. 여기 있는 건 그
// productId 를 우리 재화로 옮기는 표 하나다.
//
// 순수 함수인 이유: 지급 규칙이 서버 훅 안에 박히면 테스트가 결제를 흉내
// 내야만 확인할 수 있다. 표는 표대로 검산하고, 훅은 이 표를 부르기만 한다.

/** 프로필에 남기는 최근 결제 id 개수. 재시도는 곧바로 오므로 이만큼이면 넉넉하다. */
const PAID_KEEP = 20

/** productId → 상품 줄. 모르는 id 면 null. */
export function productOf(id, data) {
  return data.store.products.find((p) => p.id === id) ?? null
}

/**
 * 이 결제로 무엇을 주나.
 *
 * 모르는 상품이면 아무것도 안 준다. 대시보드에만 있고 우리 표엔 없는 상품이
 * 언제든 생길 수 있는데(운영이 먼저 등록한다), 그때 던지면 훅 전체가 죽어서
 * **다음 결제까지 막힌다**. 0 을 주고 넘어가면 그 결제만 보류로 남는다.
 *
 * quantity 를 곱하는 것은 젬뿐이다 — 패스를 두 개 사도 프리미엄은 하나다.
 */
export function purchaseGrant(id, quantity, data) {
  const p = productOf(id, data)
  if (!p) return { gems: 0, premium: false, known: false }
  const n = Math.max(1, Math.floor(quantity ?? 1))
  return { gems: (p.gems ?? 0) * n, premium: !!p.premium, known: true }
}

/** 화면에 뿌릴 상품 목록. 값은 플랫폼이 쥐므로 여기 값은 참고용이다. */
export function storeProducts(data) {
  return data.store.products.map((p) => ({
    id: p.id,
    name: p.name,
    desc: p.desc ?? '',
    gems: p.gems ?? 0,
    premium: !!p.premium,
    bonus: p.bonus ?? null,
    // 그림 파일 이름은 표가 쥔다. id 로 조립하면 id 를 고치는 순간 조용히
    // 깨진 그림이 뜬다 — pass_premium_s1 의 그림이 store_pass_premium.png 다.
    icon: p.icon ?? null,
  }))
}

/**
 * 결제 하나를 프로필에 얹는다. 모르는 상품이면 null — 부르는 쪽이 "안 줬다"를
 * 기록으로 남긴다.
 *
 * **프로필이 없어도 준다.** 전에는 없으면 건너뛰었는데, 한 판도 안 하고 젬부터
 * 산 사람이 딱 그 경우다 — 돈은 받고 아무것도 안 줬고, 결제 id 는 이미 처리
 * 기록에 남아 재시도까지 중복으로 걸렀다. 계정은 여기서 서면 된다.
 *
 * 모르는 칸은 그대로 넘긴다 — 이름·보유·전적이 결제 한 번에 지워지면 안 된다.
 */
export function applyGrant(profile, grant, { purchaseId = null } = {}) {
  if (!grant?.known) return null
  const base = profile ?? {}
  const pass = base.pass ?? { xp: 0, level: 1, premium: false }
  return {
    ...base,
    gems: (base.gems ?? 0) + (grant.gems ?? 0),
    // 프리미엄은 한 번 켜지면 안 꺼진다. 젬 팩을 뒤에 사도 유지돼야 한다.
    pass: { ...pass, premium: !!grant.premium || !!pass.premium },
    // 준 결제의 id 를 **지급과 같은 쓰기에** 남긴다. 처리 기록(컬렉션)은
    // 다른 문서라, 지급이 끝나고 기록이 실패하면 재시도가 "처음 보는 결제" 로
    // 읽어 또 준다. 최근 것만 남긴다 — 계정 문서가 영수증 더미가 되면 안 된다.
    ...(purchaseId ? { paid: [String(purchaseId), ...(base.paid ?? [])].slice(0, PAID_KEEP) } : {}),
  }
}

/** 이미 준 결제인가. */
export function paidAlready(profile, purchaseId) {
  if (!purchaseId) return false
  return (profile?.paid ?? []).includes(String(purchaseId))
}
