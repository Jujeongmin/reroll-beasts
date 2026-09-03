// VXShop(플랫폼 결제) 얇은 껍데기.
//
// **결제창을 우리가 만들지 않는다.** buyItem 은 부모 창(Verse8 호스트)에
// 메시지를 던지고, 호스트가 결제 대화상자를 연다. 우리는 닫힌 뒤에 "샀다"는
// 신호만 받아 서버가 이미 처리한 전적을 다시 읽는다 — 지급은 서버 훅
// ($onItemPurchased)이 하고, 클라는 결과를 확인만 한다.
//
// 껍데기를 두는 이유: 홈이 SDK 를 직접 알면 홈을 확인할 때마다 플랫폼이
// 필요해진다. 로컬(iframe 밖)에서는 상품이 안 오는데, 그때도 홈은 떠야 한다.

let api = null
let ready = false

/**
 * SDK 를 늦게 싣는다. 모듈 최상단에서 import 하면 상점을 안 여는 사람도
 * 부팅에서 그 값을 치른다.
 *
 * verseId·account 는 **넘기지 않는다** — SDK 가 쿼리스트링과 env 에서 찾는다.
 * 손으로 넘기면 플랫폼이 준 값과 어긋난다.
 */
async function load() {
  if (api) return api
  try {
    const mod = await import('@verse8/platform/vanilla')
    api = mod.VXShop
    api.init()
    ready = true
  } catch {
    // 로컬 실행이거나 플랫폼 밖이다. 상점만 못 열 뿐 게임은 돈다.
    api = null
  }
  return api
}

export function createStore({ onPurchased }) {
  let unsub = null

  return {
    /** 상품 목록을 받아 온다. 못 받으면 null — 화면이 그 사실을 적는다. */
    async items() {
      // 결제창은 **부모 창**이 연다(buyItem 이 window.parent 로 메시지를 던진다).
      // iframe 밖이면 열 대상이 없다 — 목록을 받아 와도 누르면 아무 일이 없다.
      if (window.parent === window) return null
      const shop = await load()
      if (!shop) return null
      try {
        await shop.refresh()
      } catch {
        return null
      }
      // 빈 목록과 못 받은 것은 다르다. verseId·account 를 못 찾으면 SDK 는
      // 던지지 않고 상태에 오류를 적는다 — 그걸 안 보면 "상품 0개"로 읽힌다.
      if (shop.getState().error) return null
      return shop.getItems()
    },
    /**
     * 결제창을 연다. 값·영수증은 플랫폼이 쥔다.
     *
     * 닫힘을 기다리지 않고 곧장 돌아간다 — 결제는 몇 초에서 몇 분까지
     * 걸리는데 그동안 화면을 붙잡아 두면 취소도 못 한다.
     */
    async buy(productId) {
      const shop = await load()
      if (!shop) return false
      // 콜백을 매번 새로 걸면 한 번 산 것에 여러 번 반응한다.
      unsub?.()
      unsub = shop.onClose((p) => {
        if (p?.purchased) onPurchased?.(p.productId)
      })
      shop.buyItem(productId)
      return true
    },
    get ready() {
      return ready
    },
    dispose() {
      unsub?.()
      unsub = null
    },
  }
}
