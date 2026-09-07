# Structure — Reroll Beasts

## Build

`vite.config.js` — `root: 'game'`, `@sim` alias → 저장소 루트 `sim/`,
`outDir: '../dist'`. `vitest.config.js` 는 **따로 둔다** — vite 의 `root:'game'`
을 물려받으면 테스트를 하나도 못 찾고 조용히 통과한다.

## `sim/` — 순수 규칙 (브라우저·서버·테스트가 공유)

| 파일 | 책임 |
|---|---|
| `combat.js` | 전투 메인 루프. (보드A, 보드B, 시드) → 로그 |
| `hex.js` | 육각 격자. 인접·거리(BFS 홉) |
| `movement.js` | 빈 칸만 밟는 BFS 길찾기 |
| `targeting.js` `damage.js` `skills.js` `modifiers.js` `stats.js` `traits.js` | 전투 세부 |
| `items.js` | 아이템 지급·장착·전투 효과 |
| `pool.js` | 로비 공유 유닛 풀. 티어 확률 + 남은 매수 비례 |
| `roster.js` | 벤치·보드·합성·판매·상점 |
| `economy.js` `levels.js`* `rounds.js` `lobby.js` | 골드·레벨·라운드·로비 |
| `lobbyRound.js` | 실시간 로비 라운드 진행·탈락 순위. 시각을 인자로 받는다 |
| `rank.js` `profile.js` | 순위 → LP → 티어 · 전적 누적 |
| `cosmetics.js` `pass.js` `season.js` | 보유·해금 · 패스 경험치 · 시즌 구간 |
| `missions.js` | 일일 미션 추첨·진행·수령 판정 |
| `store.js` | 결제 productId → 계정에 들어갈 것 |
| `avatar.js` `name.js` | 홈 아바타 이동 · 닉네임 규칙 |
| `tutorial.js` | 튜토리얼 대본. 어느 단계인지는 상태에서 나온다 |
| `rng.js` `data.js` | 시드 난수 · JSON 로더 |

\* 레벨 수치는 `game/public/data/levels.json`, 계산은 `economy.js`.

## `game/` — Vite root

- `index.html` — 배치·전투가 **한 화면**이다. 무대를 갈아끼우지 않는다.
- `public/data/*.json` — 규칙 단일소스 (런타임 fetch)
- `public/assets/` — `tools/build-assets.mjs` 가 채우는 glTF·UI (커밋됨)
- `src/scene3d.js` `board3d.js` — 두 단계가 공유하는 3D 무대 · 타일 좌표
- `src/prep.js` — 배치·상점·로비 · `src/battle.js` — 로그 재생
  (`replay.js` 는 그 재생의 순수 부분: 로그 사건 → 유닛 상태)
- `src/home.js` `home-state.js` — 홈 화면 · 무엇을 그릴지 정하는 순수 계산
- `src/avatarView.js` `heroView.js` `joystick.js` — 홈 아바타·간판 캐릭터·조작
- `src/serverMatchmaker.js` — 상대가 어디서 오는지 아는 유일한 파일.
  `tutorialMatchmaker.js` 는 같은 모양으로 **서버 없이** 준다
- `src/tutorial.js` — 코치. 대본(`@sim/tutorial.js`)을 말풍선·불빛으로 옮긴다
- `src/vxshop.js` — 플랫폼 결제 껍데기. 결제창은 호스트가 연다
- `src/unit-info.js` `trait-info.js` — 수치에서 설명문 생성
- `src/thumbs.js` — 유닛 초상화를 모델에서 오프스크린 렌더

## `server/` — Verse8 게임서버 (`@agent8/gameserver-node`)

`src/server.ts` 하나다: 로비 입장 · 매칭 큐 · 정찰 · 라운드 마감 · 전적 ·
순위표 · 겉모습 · 결제 훅(`$onItemPurchased`). **판정은 전부 `sim/` 의 순수
함수를 불러서** 한다 — 서버 안에 규칙을 새로 쓰면 화면과 다른 셈이 된다.
데이터는 JSON 을 직접 import 한다(`loadData` 의 Node 분기는 번들에서 못 쓴다).

## `tools/` · `tests/` · `docs/`

`validate.mjs` 데이터 불변식, `build-assets.mjs` 에셋 반입,
`tests/` 는 `sim/` 과 1:1, 설계 문서는 `docs/superpowers/specs/`.
