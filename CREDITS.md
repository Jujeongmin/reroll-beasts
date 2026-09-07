# 에셋 출처

실제로 게임에 들어간 것만 적는다. 원본 라이선스 전문은 `licenses/` 에 팩별로 있다.

**전량 CC0 1.0** — 표기 의무가 없다. 그래도 적어 둔다. 만든 사람이 있다.

| 쓰임 | 팩 | 만든 이 | 라이선스 |
|---|---|---|---|
| 유닛 26종 + 3성 진화 모델 6종 | Ultimate Monsters | [Quaternius](https://quaternius.com) | CC0 1.0 |
| 육각 타일 (풀·물), 나무·바위·수련 | [KayKit Medieval Hexagon Pack 1.0](https://kaylousberg.com) | Kay Lousberg | CC0 1.0 |
| UI 프레임·버튼·육각 칸·배너·금화·보석 | [UI Pack: Pixel Adventure 2.0](https://kenney.nl) | Kenney | CC0 1.0 |
| 로비 패널·버튼 | [UI Pack: RPG Expansion](https://kenney.nl/assets/ui-pack-rpg-expansion) | Kenney | CC0 1.0 |
| 아바타 캐릭터 8종 | [Ultimate Animated Character Pack](https://quaternius.com/packs/ultimatedanimatedcharacter.html) | Quaternius | CC0 1.0 |
| 아바타 몬스터 10종 | [Cute Animated Monsters](https://quaternius.com/packs/cutemonsters.html) | Quaternius | CC0 1.0 |
| 홈 배경 그림 1장 | AI 생성 (프로젝트 소유자 제공) | — | 저장소 소유 |
| 전투 이펙트 (고리·폭발·잔상·불꽃) | [Particle Pack](https://kenney.nl/assets/particle-pack) | Kenney | CC0 1.0 |
| 자물쇠 · 시계 아이콘 | 이 저장소 (`tools/make-icons.mjs`) | — | CC0 1.0 |
| 시너지 아이콘 11종 | 이 저장소 (`tools/trait-icons.mjs`) | — | CC0 1.0 |
| 조작음 (누르기·열기·거절·놓기) | [Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| 전투음 (타격·죽음·폭발) · 구매·승급 종소리 | [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 1.0 |
| 판 끝 승패 곡 | [Music Jingles](https://kenney.nl/assets/music-jingles) | Kenney | CC0 1.0 |
| 배경음 4곡 (홈 1 · 판 안 3) | [Music Loop Bundle](https://abstractionmusic.com) | Abstraction · Tallbeard Studios | CC0 1.0 |

Kenney 는 표기가 의무는 아니지만 권장이라 명시했다.

자물쇠는 Kenney 팩에 없어서 같은 팔레트로 직접 찍었다. 다른 팩에서 아이콘 하나만
끌어오면 색조가 튄다. `tools/make-lock-icon.mjs` 가 도트맵에서 PNG 를 만든다.

## 아직 안 쓰는 것

`art-src/` 에 받아만 두고 게임에 안 들어간 팩이 있다 (`licenses/` 에는 전문이 있다):
Stylized Nature · Medieval Village MegaKit · Bestiary Dungeon Monsters (전부 Quaternius, CC0),
0x72 Dungeon Tileset II. 쓰게 되면 위 표로 옮긴다.

소리는 팩에서 열다섯 개만 골라 넣었다 — 어느 파일이 무엇으로 들어갔는지는
`tools/audio-import.mjs` 의 표가 단일소스다.

Abstraction·Tallbeard 는 라이선스상 허용은 하되 NFT · AI/기계학습 · 원본 재판매
용도는 권하지 않는다고 밝혔다. 이 게임은 셋 다 아니다.

## 코드

Three.js (MIT), Vite · Vitest (MIT).
