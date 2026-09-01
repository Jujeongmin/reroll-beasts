# Reroll Beasts · 리롤 비스트

가로형 모바일 오토체스. 몬스터 26종, 육각 판 4×7, 23라운드.

```bash
npm install
npm run dev      # 개발 서버
npm run check    # 데이터 불변식 + 테스트
npm run art      # art-src/ 에서 에셋 반입 (원본 팩 필요)
npm run build    # dist/ 로 빌드
```

설계 문서는 `docs/superpowers/specs/`, 에셋 출처는 `CREDITS.md` (전량 CC0).

**핵심 경계**: `sim/combat.js` 가 전투 로그를 만들고 `game/src/battle.js` 는
그것을 재생만 한다. 이 분리 덕에 헤드리스 밸런스 시뮬과 서버 검증이
같은 코드로 가능하다.
