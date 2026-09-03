// 결제 상품 → 계정에 들어갈 것.
//
// **결제창은 우리가 안 만든다.** VXShop(플랫폼)이 상품·가격·결제창을 쥐고,
// 다 끝나면 서버 훅으로 "누가 무엇을 몇 개 샀다"만 온다. 여기 있는 건 그
// productId 를 우리 재화로 옮기는 표 하나다.
//
// 순수 함수인 이유: 지급 규칙이 서버 훅 안에 박히면 테스트가 결제를 흉내
// 내야만 확인할 수 있다. 표는 표대로 검산하고, 훅은 이 표를 부르기만 한다.

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
    usd: p.usd,
    bonus: p.bonus ?? null,
  }))
}
