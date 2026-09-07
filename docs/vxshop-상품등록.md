# VXShop 대시보드 상품 등록

Verse8 대시보드에 아래 4개를 등록한다. **productId 는 글자 그대로** 맞춰야 한다 —
다르면 결제는 되고 지급은 안 된다(서버가 모르는 상품으로 보고 보류한다).

지급 규칙의 단일소스는 `game/public/data/store.json` 이고, 서버 훅
`$onItemPurchased` 가 그 표를 읽는다. 값(가격)은 **대시보드가 쥔다** — 아래
금액은 등록할 때 넣을 값이고, 화면에는 플랫폼이 준 값이 뜬다.

## 상품

| productId | 이름 | 설명 | 금액(USD) | 지급 | 이미지 |
|---|---|---|---|---|---|
| `gems_small` | 젬 300 | 아바타 하나 값이 넉넉하다 | 0.99 | 젬 300 | `store_gems_small.png` |
| `gems_medium` | 젬 1,000 | 10% 더 준다 | 2.99 | 젬 1,000 | `store_gems_medium.png` |
| `gems_large` | 젬 2,600 | 23% 더 준다 | 6.99 | 젬 2,600 | `store_gems_large.png` |
| `pass_premium_s1` | 시즌 1 프리미엄 패스 | 잠긴 16칸이 전부 열린다. 끝까지 올리면 젬 500 | 4.99 | 패스 프리미엄 해금 (1인 1회) | `store_pass_premium.png` |

이미지는 `game/public/assets/store/` 에 있다. **512×512, 1:1**, 게임 안 젬과 같은
돌로 찍었다 — 결제창에 다른 그림이 뜨면 "무엇을 사는지"가 한 번 끊긴다.
다시 뽑으려면 `node tools/store-icons.mjs` (또는 `npm run art`).

### 구매 제한

- 젬 팩 3종: 제한 없음(반복 구매)
- `pass_premium_s1`: **1인 1회** (`maxPurchasePerUser: 1`). 두 번 사도 프리미엄은
  하나뿐이라, 제한을 안 걸면 값만 받고 줄 것이 없다

## 값 설계 근거

젬 단가는 묶음이 클수록 싸다 — 비싼 쪽이 손해면 큰 묶음을 살 이유가 없다
(`tests/store.test.js` 가 이 순서를 지킨다).

| 묶음 | $1 당 젬 |
|---|---|
| 300 / $0.99 | 303 |
| 1,000 / $2.99 | 334 |
| 2,600 / $6.99 | 372 |

아바타 값은 40 + 10 × 패스단계 = **70 ~ 260 젬**. 트랙 25칸 중 젬 칸은 12개,
무료 칸은 9개다. 한 시즌 무료로 끝까지 올리면 젬 60, 프리미엄이면 젬 500 에
잠긴 물건 칸까지 열린다. 이 수는 손으로 적은 것이 아니라 `sim/pass.js` 의
`gemsBetween(1, 25, premium, data)` 가 주는 값이다 — 표를 고치면 여기도
같이 고쳐야 한다(전에는 960·1,000 으로 적혀 있었고 둘 다 아무도 받을 수 없는
수였다).

젬만 놓고 보면 $4.99 패스(500)는 $2.99 팩(1,000)보다 적다. 패스가 파는 것은
젬이 아니라 **잠긴 칸의 물건**(아바타·무대·이펙트)과 "플레이해서 얻는다"는
경험이다. 상품 설명도 그렇게 적는다.

## 배선 요약

```
[클라] 젬 상점 → VXShop.buyItem(productId)
        → 호스트가 결제창을 연다 (우리 코드 아님)
[서버] $onItemPurchased({ account, purchaseId, productId, quantity })
        → sim/store.js purchaseGrant() 로 지급액 계산
        → profile.gems / profile.pass.premium 갱신
        → purchases 컬렉션에 purchaseId 기록 (중복 지급 방지)
[클라] onClose(purchased) → getProfile() 다시 읽어 잔액 갱신
```

**중복 방지**가 이 배선의 핵심이다. 재시도·중복 전송은 어느 결제 시스템에나
있고, 없으면 한 번 결제로 젬이 두 배 들어간다. `purchases` 컬렉션에
`purchaseId` 가 이미 있으면 조용히 돌아간다.

전적이 없는 사람(한 판도 안 한 사람)이 결제하면 지급할 자리가 없다. 그 결제는
`applied: false` 로 기록만 남는다 — 나중에 손으로 채워 줄 수 있어야 한다.

## 로컬에서 안 열리는 이유

`buyItem` 은 `window.parent` 로 메시지를 던진다. iframe 밖(로컬 dev)에서는 열
대상이 없어서 상점이 "결제는 Verse8 에서 실행할 때만 열린다"고 적는다.
정상이다 — 배포된 verse 안에서만 확인할 수 있다.
