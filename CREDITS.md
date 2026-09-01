# 에셋 출처

실제로 게임에 들어간 것만 적는다. 원본 라이선스 전문은 `licenses/` 에 팩별로 있다.

**전량 CC0 1.0** — 표기 의무가 없다. 그래도 적어 둔다. 만든 사람이 있다.

| 쓰임 | 팩 | 만든 이 | 라이선스 |
|---|---|---|---|
| 유닛 26종 + 3성 진화 모델 6종 | Ultimate Monsters | [Quaternius](https://quaternius.com) | CC0 1.0 |
| 육각 타일 (풀·물), 나무·바위·수련 | [KayKit Medieval Hexagon Pack 1.0](https://kaylousberg.com) | Kay Lousberg | CC0 1.0 |
| UI 프레임·버튼·육각 칸·배너·금화·보석 | [UI Pack: Pixel Adventure 2.0](https://kenney.nl) | Kenney | CC0 1.0 |
| 자물쇠 · 시계 아이콘 | 이 저장소 (`tools/make-icons.mjs`) | — | CC0 1.0 |
| 시너지 아이콘 11종 | 이 저장소 (`tools/trait-icons.mjs`) | — | CC0 1.0 |

Kenney 는 표기가 의무는 아니지만 권장이라 명시했다.

자물쇠는 Kenney 팩에 없어서 같은 팔레트로 직접 찍었다. 다른 팩에서 아이콘 하나만
끌어오면 색조가 튄다. `tools/make-lock-icon.mjs` 가 도트맵에서 PNG 를 만든다.

## 아직 안 쓰는 것

`art-src/` 에 받아만 두고 게임에 안 들어간 팩이 있다 (`licenses/` 에는 전문이 있다):
Stylized Nature · Medieval Village MegaKit · Bestiary Dungeon Monsters (전부 Quaternius, CC0),
0x72 Dungeon Tileset II, 음악 루프 번들. 쓰게 되면 위 표로 옮긴다.

## 코드

Three.js (MIT), Vite · Vitest (MIT).
