// 티어 아이콘 5종 (16×16). 직접 찍는다.
//
// 지금까지는 CSS 마름모에 색만 달리 줬다. 색만으로 다섯 칸을 가르면 두 가지가
// 안 된다: 색을 못 가르는 사람에게는 다섯이 하나이고, 작은 자리(사다리 12px)
// 에서는 옆 칸과 구별이 안 된다. **모양을 다르게** 한다 — 방패에 그은 줄이
// 티어 수만큼 늘고, 최고 티어만 보석이다.
//
// 팔레트는 홈 배지에 쓰던 색 그대로다. 새 색을 들이면 같은 티어가 화면마다
// 다른 색으로 보인다.
//
// 실행: node tools/tier-icons.mjs
import { writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'game', 'public', 'assets', 'ui')

const SIZE = 16
// Kenney UI 팩의 외곽선 색. 다른 아이콘들과 같은 검정을 써야 한 벌로 보인다.
const LINE = [0x30, 0x25, 0x2f, 0xff]

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 0xff]

/** 티어별 두 색. 위가 밝은 면, 아래가 그늘이다. */
const TIERS = [
  { id: 'bronze', hi: '#d08a4e', lo: '#8a5527', bars: 1 },
  { id: 'silver', hi: '#dfe6ef', lo: '#9aa6b6', bars: 2 },
  { id: 'gold', hi: '#ffd977', lo: '#c99326', bars: 3 },
  { id: 'platinum', hi: '#a8f0e2', lo: '#3f9f8e', bars: 4 },
  // 최고 티어는 줄이 아니라 보석이다. 다섯 줄은 넷과 눈으로 안 갈린다 —
  // 세는 것이 아니라 알아보는 것이어야 한다.
  { id: 'diamond', hi: '#bfe2ff', lo: '#5a8fe0', gem: true },
]

// 방패. h 는 밝은 면, l 은 그늘, o 는 외곽선.
const SHIELD = [
  '................',
  '...oooooooooo...',
  '..ohhhhhhhhhho..',
  '..ohhhhhhhhhho..',
  '..ohhhhhhhhhho..',
  '..ohhhhhhhhhho..',
  '..ollllllllllo..',
  '..ollllllllllo..',
  '...ollllllllo...',
  '...ollllllllo...',
  '....ollllllo....',
  '.....ollllo.....',
  '......ollo......',
  '.......oo.......',
  '................',
  '................',
]

/** 줄을 그을 행. 개수마다 위아래로 고르게 벌린다. */
const BAR_ROWS = {
  1: [5],
  2: [4, 6],
  3: [3, 5, 7],
  4: [3, 4, 6, 7],
}

/** 보석. 방패 한가운데 마름모. */
const GEM = [
  [3, [7, 8]],
  [4, [6, 9]],
  [5, [5, 10]],
  [6, [6, 9]],
  [7, [7, 8]],
]

function icon(tier) {
  const png = new PNG({ width: SIZE, height: SIZE })
  const hi = hex(tier.hi)
  const lo = hex(tier.lo)
  const put = (x, y, c) => {
    const i = (y * SIZE + x) * 4
    png.data[i] = c[0]
    png.data[i + 1] = c[1]
    png.data[i + 2] = c[2]
    png.data[i + 3] = c[3]
  }

  for (let y = 0; y < SIZE; y++) {
    if (SHIELD[y].length !== SIZE) throw new Error(`방패 ${y}행 길이 ${SHIELD[y].length}`)
    for (let x = 0; x < SIZE; x++) {
      const ch = SHIELD[y][x]
      if (ch === '.') continue
      put(x, y, ch === 'o' ? LINE : ch === 'h' ? hi : lo)
    }
  }

  // 표식은 외곽선 색으로 판다. 티어 색 위에 어느 색을 얹어도 어떤 티어에서는
  // 안 보이는데, 외곽선 색은 다섯 색 전부에서 읽힌다.
  if (tier.gem) {
    for (const [y, xs] of GEM) {
      for (let x = xs[0]; x <= xs[1]; x++) put(x, y, LINE)
    }
  } else {
    const rows = BAR_ROWS[tier.bars]
    if (!rows) throw new Error(`줄 ${tier.bars} 개는 표에 없다`)
    for (const y of rows) {
      for (let x = 5; x <= 10; x++) put(x, y, LINE)
    }
  }
  return PNG.sync.write(png)
}

for (const tier of TIERS) {
  await writeFile(join(OUT, `tier_${tier.id}.png`), icon(tier))
}
console.log(TIERS.map((t) => `tier_${t.id}.png`).join(' · '))
