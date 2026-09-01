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
| `pool.js` | 로비 공유 유닛 풀. 티어 확률 + 남은 매수 비례 |
| `roster.js` | 벤치·보드·합성·판매·상점 |
| `economy.js` `levels.js`* `rounds.js` `lobby.js` | 골드·레벨·라운드·로비 |
| `rng.js` `data.js` | 시드 난수 · JSON 로더 |

\* 레벨 수치는 `game/public/data/levels.json`, 계산은 `economy.js`.

## `game/` — Vite root

- `index.html` — 배치·전투가 **한 화면**이다. 무대를 갈아끼우지 않는다.
- `public/data/*.json` — 규칙 단일소스 (런타임 fetch)
- `public/assets/` — `tools/build-assets.mjs` 가 채우는 glTF·UI (커밋됨)
- `src/scene3d.js` — 두 단계가 공유하는 3D 무대
- `src/prep.js` — 배치·상점·로비 · `src/battle.js` — 로그 재생
- `src/unit-info.js` `trait-info.js` — 수치에서 설명문 생성
- `src/thumbs.js` — 유닛 초상화를 모델에서 오프스크린 렌더

## `tools/` · `tests/` · `docs/`

`validate.mjs` 데이터 불변식, `build-assets.mjs` 에셋 반입,
`tests/` 는 `sim/` 과 1:1, 설계 문서는 `docs/superpowers/specs/`.
