# Requirements — Reroll Beasts

## Coding Patterns

- **바닐라 JS ES 모듈.** React·TypeScript 안 쓴다. JSX 없음.
- `sim/` 은 **순수 함수만.** DOM · fetch · `Math.random` · `Date.now` 금지.
  무작위는 `sim/rng.js` (시드 고정 mulberry32) 로만 들어간다.
- **모든 규칙 수치는 `game/public/data/*.json`.** 런타임에 `fetch` 로 읽는다.
  `import` 로 바꾸면 번들에 박혀 JSON 만 고쳐 배포하는 길이 막힌다.
- 스킬·시너지 **설명문을 따로 적지 않는다.** 파라미터에서 문장을 만든다
  (`game/src/unit-info.js`, `trait-info.js`). 두 곳을 두면 반드시 어긋난다.
- 주석은 **왜** 를 적는다. 무엇을 하는지는 코드가 말한다.

## Verification

- `npm run check` — `tools/validate.mjs` 데이터 불변식 17종 + vitest.
- 테스트는 **돌연변이로 검증한다**: 구현을 고의로 망가뜨려 빨간불이 나야 한다.
  통과만 하는 테스트는 아무것도 지키지 않는다.
- 밸런스를 만졌으면 `REGEN_GOLDEN=1` 로 골든 로그를 다시 만든다.
