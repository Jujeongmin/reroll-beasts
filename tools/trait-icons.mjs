// 시너지 아이콘 11종 (16×16).
//
// 시너지는 카드에도 좌측 칩에도 나오는데, 지금까지는 이름 첫 글자를 육각형에
// 넣어 쓰고 있었다. "거"와 "전"은 글자로만 보면 구분이 안 되고, 카드에서는
// 글자 두 줄이 초상화를 덮는다. 팩에 직업 아이콘이 없으니 팔레트를 그대로
// 써서 직접 찍는다 — 다른 팩에서 끌어오면 색조가 튄다.
//
// 실행: node tools/trait-icons.mjs
import { writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'game', 'public', 'assets', 'ui')

// o = 외곽선. l/d 는 아이콘마다 색이 다르므로 그릴 때 넘긴다 (밝은 면 / 그늘).
// h 는 보조색 (손잡이 · 자루 · 대).
const OUTLINE = [0x2a, 0x20, 0x2c, 0xff]

const ICONS = {
  // ── 계통 ──────────────────────────────────────────────
  // 거인 — 주먹. 큰 몸을 16px 에 넣으면 실루엣이 뭉개진다.
  giant: {
    l: [0xd8, 0xa2, 0x74],
    d: [0xa8, 0x74, 0x4c],
    h: [0x8a, 0x5e, 0x3c],
    rows: [
      '................',
      '...oooooooo.....',
      '..ollllllldo....',
      '..ollllllldo....',
      '.oolllllllldo...',
      '.olllllllllddo..',
      '.olllllllllddo..',
      '.olllllllllddo..',
      '.olllllllllddo..',
      '..olllllllldo...',
      '..oohhhhhhoo....',
      '...ohhhhhho.....',
      '...oooooooo.....',
      '................',
      '................',
      '................',
    ],
  },
  // 슬라임 — 방울.
  slime: {
    l: [0x7f, 0xe0, 0xa6],
    d: [0x3f, 0xa8, 0x76],
    h: [0x3f, 0xa8, 0x76],
    rows: [
      '................',
      '................',
      '.......oo.......',
      '......ollo......',
      '.....ollllo.....',
      '....ollllllo....',
      '...olldllllddo..',
      '..ollllllllddo..',
      '..ollllllllddo..',
      '.olllllllllddo..',
      '.ollllllllllddo.',
      '.ollllllllllddo.',
      '..oooooooooooo..',
      '................',
      '................',
      '................',
    ],
  },
  // 날개 — 깃.
  wing: {
    l: [0xe6, 0xed, 0xf5],
    d: [0xa8, 0xb4, 0xc4],
    h: [0xa8, 0xb4, 0xc4],
    rows: [
      '................',
      '....ooo.........',
      '...ollo.........',
      '...olllooo......',
      '...ollllllo.....',
      '...olllllllooo..',
      '...olllllllllllo',
      '...oldldldldldo.',
      '...ollllllllllo.',
      '....ollllllllo..',
      '.....ollllllo...',
      '......ollllo....',
      '.......ollo.....',
      '........oo......',
      '................',
      '................',
    ],
  },
  // 버섯 — 갓 + 대.
  mushroom: {
    l: [0xe8, 0x6a, 0x5c],
    d: [0xb3, 0x40, 0x2f],
    h: [0xf0, 0xe4, 0xc6],
    rows: [
      '................',
      '.....oooooo.....',
      '...oollllllooo..',
      '..olllldlllldo..',
      '..oldllllllddo..',
      '..ollllllllddo..',
      '..oooooooooooo..',
      '.....ohhhho.....',
      '.....ohhhho.....',
      '.....ohhhho.....',
      '.....ohhhho.....',
      '....ohhhhhho....',
      '....oooooooo....',
      '................',
      '................',
      '................',
    ],
  },
  // 망자 — 해골.
  undead: {
    l: [0xe8, 0xdc, 0xc0],
    d: [0xb0, 0xa2, 0x88],
    h: [0xb0, 0xa2, 0x88],
    rows: [
      '................',
      '....oooooooo....',
      '...ollllllllo...',
      '..ollllllllllo..',
      '..olooollooolo..',
      '..olooollooolo..',
      '..ollllllllllo..',
      '..olllloollllo..',
      '..ollllllllllo..',
      '...olllllllllo..',
      '...ollllllllo...',
      '...ololololoo...',
      '...oooooooooo...',
      '................',
      '................',
      '................',
    ],
  },

  // ── 직업 ──────────────────────────────────────────────
  // 탱커 — 방패.
  tank: {
    l: [0xa8, 0xbc, 0xd4],
    d: [0x6b, 0x82, 0x9e],
    h: [0x6b, 0x82, 0x9e],
    rows: [
      '................',
      '..oooooooooooo..',
      '..ollllllddddo..',
      '..ollllllddddo..',
      '..ollllllddddo..',
      '..ollllllddddo..',
      '..ollllllddddo..',
      '...olllllddddo..',
      '...ollllldddo...',
      '....olllddddo...',
      '....ollldddo....',
      '.....olldddo....',
      '.....oldddo.....',
      '......oddo......',
      '.......oo.......',
      '................',
    ],
  },
  // 전사 — 세운 검.
  fighter: {
    l: [0xd8, 0xe4, 0xf0],
    d: [0x94, 0xa6, 0xba],
    h: [0xa9, 0x71, 0x2c],
    rows: [
      '.......oo.......',
      '......olldo.....',
      '......olldo.....',
      '......olldo.....',
      '......olldo.....',
      '......olldo.....',
      '......olldo.....',
      '......olldo.....',
      '...ooooooooo....',
      '...ohhhhhhho....',
      '...ooooooooo....',
      '......ohho......',
      '......ohho......',
      '.....oohhoo.....',
      '.....oooooo.....',
      '................',
    ],
  },
  // 사수 — 화살.
  shooter: {
    l: [0xf0, 0xc9, 0x7a],
    d: [0xc0, 0x93, 0x45],
    h: [0x8f, 0xd8, 0xff],
    rows: [
      '................',
      '.......oo.......',
      '......ollo......',
      '.....ollllo.....',
      '....ollllllo....',
      '...ollllllllo...',
      '..oooolllloooo..',
      '......ollo......',
      '......ollo......',
      '......ollo......',
      '......ollo......',
      '.....ohhhho.....',
      '....ohhoohho....',
      '.....oooooo.....',
      '................',
      '................',
    ],
  },
  // 마법사 — 고깔모자.
  mage: {
    l: [0xb0, 0x8f, 0xe8],
    d: [0x76, 0x58, 0xb0],
    h: [0x76, 0x58, 0xb0],
    rows: [
      '................',
      '................',
      '.......oo.......',
      '......olldo.....',
      '......olldo.....',
      '.....ollldo.....',
      '.....ollldo.....',
      '....ollllddo....',
      '....ollllddo....',
      '...ollllldddo...',
      '...ollllldddo...',
      '..oooooooooooo..',
      '..olllllllddddo.',
      '..oooooooooooo..',
      '................',
      '................',
    ],
  },
  // 암살자 — 비스듬한 단검. 세운 검(전사)과 각도로 갈린다.
  assassin: {
    l: [0xd8, 0xe4, 0xf0],
    d: [0x94, 0xa6, 0xba],
    h: [0xa9, 0x71, 0x2c],
    rows: [
      '..............o.',
      '.............olo',
      '............olo.',
      '...........olo..',
      '..........olo...',
      '.........olo....',
      '........olo.....',
      '..o....olo......',
      '.ohoo.olo.......',
      '..ohhoolo.......',
      '...ohhho........',
      '....ohho........',
      '.....oho........',
      '......oo........',
      '................',
      '................',
    ],
  },
  // 부활 — 빛무리. 십자나 하트는 회복(즉시 치유)으로 읽힌다.
  revive: {
    l: [0xff, 0xe9, 0xa8],
    d: [0xe0, 0xa9, 0x4c],
    h: [0xe0, 0xa9, 0x4c],
    rows: [
      '................',
      '.......oo.......',
      '.......ll.......',
      '......ollo......',
      '.....ollllo.....',
      '..ooollllllooo..',
      'ooollllllllllooo',
      'ooollllllllllooo',
      '..ooollllllooo..',
      '.....ollllo.....',
      '......ollo......',
      '.......ll.......',
      '.......oo.......',
      '................',
      '................',
      '................',
    ],
  },
}

function draw({ rows, l, d, h }) {
  const size = rows.length
  for (const [y, r] of rows.entries()) {
    if (r.length !== size) throw new Error(`${y}행 길이 ${r.length}, ${size} 이어야 한다`)
  }
  const map = { '.': null, o: OUTLINE, l: [...l, 0xff], d: [...d, 0xff], h: [...h, 0xff] }
  const png = new PNG({ width: size, height: size })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ch = rows[y][x]
      if (!(ch in map)) throw new Error(`모르는 문자 ${ch} (${x},${y})`)
      const c = map[ch]
      const i = (y * size + x) * 4
      if (c === null) {
        png.data[i + 3] = 0
        continue
      }
      png.data[i] = c[0]
      png.data[i + 1] = c[1]
      png.data[i + 2] = c[2]
      png.data[i + 3] = 0xff
    }
  }
  return PNG.sync.write(png)
}

for (const [id, spec] of Object.entries(ICONS)) {
  await writeFile(join(OUT, `trait_${id}.png`), draw(spec))
}
console.log(`시너지 아이콘 ${Object.keys(ICONS).length}종`)
