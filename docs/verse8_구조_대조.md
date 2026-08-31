# Verse8 공식 규약 대조 (2026-08-31)

출처: `docs.verse8.io/ko/docs/...` + 설치된 SDK 패키지 + 참고 프로젝트(`nyangnyang-mercenaries`)의 실측 기록.
**추측한 것은 "미확인"으로 표시했다.**

---

## 1. 공식 규약 (확인됨)

### 1.1 프로젝트 형태

- **Vite 프로젝트가 전제**다. 공식 템플릿은 `Vite + React + TypeScript`.
  문서 원문: *"Agent8 is built on a Vite-based React TypeScript project, though custom implementations may be possible."*
- 기본 레이아웃은 저장소 루트에 `src/` · `public/` · `package.json` · `server.js`.
- 배포: `npx -y @agent8/deploy`

### 1.2 서버 코드 — 두 가지 형태

**(a) 루트 단일 파일 (참고 프로젝트가 쓰는 방식)**

```
server.js        ← 루트. class Server { } 를 담되 **export 하지 않는다**
```

- 메서드가 곧 원격 함수다
- **import 를 쓸 수 없다.** 참고 프로젝트 `server.js` = 1490줄 / import 0개로 실측 확인
- 루트에 `./server.js` 가 있으면 **이쪽이 우선**한다

**(b) 구조형 프로젝트**

```
server/
├─ src/server.ts      ← export class Server { }
├─ test/server.test.ts
├─ README.md
└─ package.json
```

- `npx -y @agent8/gameserver-node init` 로 생성
- 배포 시 플랫폼이 `server/dist/server.js` 로 자동 컴파일 — **빌드 단계가 있으므로 import 가 가능하다**
- 테스트: `npx -y @agent8/gameserver-node test` (루트에서 실행, `server/` 안이 아니다)
- `@Handler` 데코레이터로 핸들러를 별도 파일에 분리 가능

### 1.3 클라이언트 접속

- 공식 예제는 React 훅 `useGameServer()` 뿐
- **그러나 `GameServer` 클래스가 최상위 export 이고 React 를 안 쓴다.**
  참고 프로젝트가 vanilla 에서 직접 사용해 프로덕션 동작을 확인했다
- 호출: `server.remoteFunction("name", [args])`
- **레이트리밋 약 10회/초 — 유저당**

### 1.4 SDK 패키지

| 패키지 | 용도 | React |
|---|---|---|
| `@agent8/gameserver` | 게임서버 접속·원격함수 | peer dep 이나 `GameServer` 클래스는 불필요 |
| `@verse8/platform` | VXShop 결제 | optional peer dep. `/vanilla` 서브패스 제공, **API 동일** |
| `@verse8/ads` | 보상형 광고 | — |

> **함정:** `@verse8/react-client` 는 다른 물건이다. socket.io 로 `verse8-simple-game-backend-…` 에 붙는데
> 그 경로는 404 다. 문서가 가리키는 것은 `@agent8/gameserver` 이고 전송이 순수 WebSocket 이다.
> 참고 프로젝트가 여기서 한 번 헤맸다.

### 1.5 환경 파일 — 플랫폼이 관리한다

```
.env            VITE_AGENT8_ACCOUNT · VITE_AGENT8_VERSE
.agent8.lock    같은 값. 헤더에 "AI agents: never modify this file"
```

- 배포할 때마다 플랫폼이 새 값으로 **덮어쓴다**. 손으로 고쳐도 되돌아온다
- `verse` · `account` · `auth` 를 SDK 에 손으로 넘기지 않는다 — SDK 가 알아서 찾는다
  (`VITE_AGENT8_VERSE` / `?account=` / `?auth=`). 넘기면 오히려 어긋난다

### 1.6 서버 API (참고 프로젝트가 문서에서 확인한 것)

```
$global.getMyState() / updateMyState(state)
$global.getUserState(account) / updateUserState(account, state)
$global.addCollectionItem(name, item) / getCollectionItems(name, {orderBy, filters, limit})
$global.getCollectionItem(name, id)      없으면 {} 를 준다
$global.updateCollectionItem(name, item) item.__id 로 찾는다
$global.deleteCollectionItem(name, id) / countCollectionItems(name, options)
$sender.account                          요청자 식별
$onItemPurchased(data)                   결제 훅
```

컬렉션 아이템 식별자는 **`__id`**.

---

## 2. 우리 프로젝트 대조

### 2.1 현재 상태

```
reroll-royale/
├─ package.json          type:module, vitest만
├─ sim/                  전투 엔진 12개 모듈  ← 게임 본체
├─ tools/validate.mjs
├─ tests/ (+fixtures/)
├─ game/public/data/     units·traits·shop·combat.json
├─ docs/
├─ licenses/
└─ .github/workflows/
```

### 2.2 판정표

| 항목 | 공식 요구 | 우리 | 판정 |
|---|---|---|---|
| Vite 프로젝트 | 필수 | `vite.config.js` · `index.html` **전무** | **2-A 착수 전 필수** |
| `game/public/data/` | `<Vite root>/public` | ✓ 이미 그 자리 | **맞음** |
| 런타임 `fetch('/data/…')` | publicDir 은 가공 없이 복사 | ✓ `sim/data.js` 가 그 규약대로 | **맞음** |
| `server.js` 루트 | 서버 기능 쓸 때 필수 | 없음 | **4단계 전** |
| `.env` / `.agent8.lock` | 배포 시 자동 생성 | 없음 | 정상 (배포가 만든다) |
| React | 공식 템플릿 | 안 쓸 예정 | 검증된 우회 있음 |
| `sim/` 위치 | 규약 없음 | 루트 | **결정 필요 — 아래** |
| `tests/` · `tools/` · `docs/` | 규약 없음 | 루트 | 문제없음 (빌드 대상 아님) |

**좋은 소식:** 1단계에서 유일하게 Verse8 규약에 걸리는 부분이었던 `data/` 배치와
`fetch` 로 읽는 방식이 **이미 정확히 맞다.** 참고 프로젝트에서 역추론한 것이 우연히 맞은 게 아니라,
그게 Vite `publicDir` 기본 동작이고 Verse8 이 Vite 를 전제하기 때문이다.

---

## 3. 결정이 필요한 것 — `sim/` 의 위치

### 문제

참고 프로젝트의 `sim/` 은 **오프라인 밸런스 시뮬레이터**라 게임이 import 하지 않는다.
우리 `sim/` 은 **게임 엔진 본체**다. 네 곳에서 쓴다:

| 소비자 | 실행 환경 |
|---|---|
| 2-A 렌더러 (`game/src/`) | 브라우저 — Vite 가 번들 |
| 4단계 서버 검증 (`server.js`) | Node — 플랫폼 런타임 |
| 테스트 (`tests/`) | Node |
| 밸런스 러너 (`sim/run.mjs`) | Node |

Vite root 를 `game/` 으로 잡으면 `game/src/` 에서 `../../sim/` 을 import 하는 것이
root 밖 접근이 된다.

그리고 더 큰 제약: **루트 `server.js` 는 import 를 못 쓴다.**
서버가 스냅샷을 재실행하려면 `sim/` 전체가 필요한데 단일 파일에 담아야 한다.

### 권고

**`sim/` 을 루트에 그대로 둔다.** 클라이언트와 서버가 공유하는 모듈이므로 어느 한쪽 안에
넣으면 반대쪽이 어색해진다. Vite 설정으로 푼다:

```js
// vite.config.js
export default defineConfig({
  root: 'game',
  publicDir: 'public',
  resolve: { alias: { '@sim': resolve(__dirname, 'sim') } },
  server: { fs: { allow: ['..'] } },   // dev 전용. root 밖 모듈 서빙 허용
  build: { outDir: '../dist', emptyOutDir: true },
})
```

`fs.allow` 는 개발 서버 전용이고, 프로덕션 빌드는 모듈 그래프를 그대로 따라가므로 영향 없다.

**4단계 서버 검증은 구조형(`server/src/server.ts`)을 쓴다.** 컴파일 단계가 있어 import 가 되므로
`sim/` 을 그대로 가져다 쓸 수 있다. 루트 단일 파일 방식을 고르면 `sim/` 12개 모듈을
서버 파일에 인라인해야 하고, 그러면 클라와 서버의 전투 규칙이 갈라진다 — 스펙 §10 검증의 전제가 무너진다.

> 미확인: 구조형 컴파일이 `server/` 밖(`../sim/`) 의 import 를 따라가는지 문서에 없다.
> 4단계 착수 시 작은 실험으로 먼저 확인할 것. 안 되면 `sim/` 을 `server/src/` 아래로
> 심볼릭 링크하거나 빌드 단계에서 복사한다.

---

## 4. 2-A 착수 전 할 일

1. `vite.config.js` — 위 설정. `root: 'game'`, `@sim` alias, `outDir: '../dist'`
2. `game/index.html` — 진입점
3. `game/src/main.js` — 부트
4. `package.json` 에 `vite` · `pixi.js` 추가, `dev` · `build` · `preview` 스크립트
5. **`sim/` 은 건드리지 않는다** — 1단계 산출물이 그대로 엔진이 된다

## 5. 4단계(비동기 PvP) 전 확인할 것

- 구조형 서버가 `../sim/` import 를 따라가는지 (§3 미확인 항목)
- `$global` 상태 크기 제한 — 문서에 없다. 참고 프로젝트는 200KB 로 보수적으로 잡았다
- 동시 갱신 트랜잭션 보장 여부 — 문서에 없다
- 스케줄러/크론 부재 가정 — 일일 리셋은 lazy 처리
- remoteFunction 10회/초(유저당) 안에서 스냅샷 저장·조회가 들어가는지
