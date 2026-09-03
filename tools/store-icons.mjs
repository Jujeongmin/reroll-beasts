// VXShop 대시보드에 올릴 상품 이미지 (512×512, 1:1).
//
// 왜 직접 찍나: 대시보드 이미지는 결제창에 그대로 뜬다. 게임 안 젬과 다른
// 그림이 결제창에 뜨면 "무엇을 사는지"가 한 번 끊긴다. 여기서 쓰는 돌은
// 게임 아이콘과 **같은 gem-sprite** 다.
//
// 128 에 그리고 4배로 늘린다(최근접). 512 에 직접 찍으면 픽셀 결이 사라져
// 게임 UI(도트 액자)와 재질이 어긋난다.
//
// 실행: node tools/store-icons.mjs
import { writeFile, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { gemSprite, GEM_S } from './gem-sprite.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'game', 'public', 'assets', 'store')
const S = 128
const SCALE = 4

const BG_TOP = [0x2a, 0x1d, 0x3e]
const BG_BOT = [0x14, 0x0e, 0x20]
const FRAME = [0xc5, 0x87, 0x47]
const FRAME_HI = [0xf0, 0xc5, 0x6a]
const GOLD = [0xff, 0xd1, 0x66]
const GOLD_D = [0xc4, 0x8a, 0x2f]
const RIBBON = [0xb8, 0x3a, 0x3a]

function canvas() {
  const buf = new Uint8Array(S * S * 4)
  const px = (x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return
    const i = (y * S + x) * 4
    buf[i] = c[0]
    buf[i + 1] = c[1]
    buf[i + 2] = c[2]
    buf[i + 3] = a
  }
  const rect = (x, y, w, h, c) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c)
  }
  const tri = (cx, y0, h, c) => {
    for (let j = 0; j < h; j++) {
      const half = Math.floor((h - 1 - j) / 2)
      for (let i = -half; i <= half; i++) px(cx + i, y0 + h - 1 - j, c)
    }
  }
  return { buf, px, rect, tri }
}

/** 젬 스프라이트를 정수배로 얹는다. 소수배로 늘리면 결이 흔들린다. */
function blitGem(c, sprite, x0, y0, k) {
  for (let y = 0; y < GEM_S; y++) {
    for (let x = 0; x < GEM_S; x++) {
      const i = (y * GEM_S + x) * 4
      if (!sprite[i + 3]) continue
      const col = [sprite[i], sprite[i + 1], sprite[i + 2]]
      for (let j = 0; j < k; j++) for (let l = 0; l < k; l++) c.px(x0 + x * k + l, y0 + y * k + j, col)
    }
  }
}

/** 바탕 + 액자. 상품마다 같은 틀이라 결제창에서 한 줄로 읽힌다. */
function base(c) {
  for (let y = 0; y < S; y++) {
    const t = y / (S - 1)
    const col = [
      Math.round(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t),
      Math.round(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t),
      Math.round(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t),
    ]
    c.rect(0, y, S, 1, col)
  }
  // 액자 두 겹. 한 겹이면 512 로 늘렸을 때 실선처럼 얇다.
  c.rect(0, 0, S, 3, FRAME)
  c.rect(0, S - 3, S, 3, FRAME)
  c.rect(0, 0, 3, S, FRAME)
  c.rect(S - 3, 0, 3, S, FRAME)
  c.rect(3, 3, S - 6, 1, FRAME_HI)
  c.rect(3, 3, 1, S - 6, FRAME_HI)
}

const gem = gemSprite()

/** 젬 더미. 개수로 묶음 크기를 말한다 — 숫자를 안 읽어도 크기가 보인다. */
function pile(c, spots) {
  for (const [x, y, k] of spots) blitGem(c, gem, x, y, k)
}

const ICONS = {
  // 작은 묶음 — 큰 돌 하나. 가장 단순한 그림이 가장 싼 상품이다.
  store_gems_small: (c) => {
    pile(c, [[32, 30, 2]])
  },
  // 중간 묶음 — 셋.
  store_gems_medium: (c) => {
    pile(c, [
      [16, 20, 2],
      [50, 34, 2],
      [33, 62, 1],
    ])
  },
  // 큰 묶음 — 여섯 알 더미.
  store_gems_large: (c) => {
    pile(c, [
      [12, 18, 2],
      [46, 12, 2],
      [72, 30, 1],
      [22, 60, 1],
      [50, 58, 2],
      [12, 78, 1],
    ])
  },
  // 프리미엄 패스 — 금관 + 젬. 젬만 그리면 젬 묶음과 안 갈린다.
  store_pass_premium: (c) => {
    // 리본 받침. 패스는 "기간 상품"이라 묶음과 다른 결이어야 한다. 젬이 이
    // 띠를 밟고 서야 왕관·젬·띠가 한 덩이로 읽힌다 — 띄우면 셋이 따로 논다.
    c.rect(0, 96, S, S - 96, RIBBON)
    c.rect(0, 96, S, 2, [0xe0, 0x6a, 0x6a])
    // 왕관
    c.tri(40, 16, 26, GOLD)
    c.tri(64, 10, 32, GOLD)
    c.tri(88, 16, 26, GOLD)
    c.rect(30, 40, 68, 13, GOLD)
    c.rect(30, 49, 68, 4, GOLD_D)
    blitGem(c, gem, 32, 52, 2)
  },
}

for (const [id, draw] of Object.entries(ICONS)) {
  const c = canvas()
  base(c)
  draw(c)
  // 액자를 다시 덮는다 — 그림이 테두리를 넘으면 잘린 것처럼 보인다.
  base2(c)

  const big = new PNG({ width: S * SCALE, height: S * SCALE })
  for (let y = 0; y < S * SCALE; y++) {
    for (let x = 0; x < S * SCALE; x++) {
      const s = (Math.floor(y / SCALE) * S + Math.floor(x / SCALE)) * 4
      const d = (y * S * SCALE + x) * 4
      big.data[d] = c.buf[s]
      big.data[d + 1] = c.buf[s + 1]
      big.data[d + 2] = c.buf[s + 2]
      big.data[d + 3] = c.buf[s + 3]
    }
  }
  await writeFile(join(OUT, `${id}.png`), PNG.sync.write(big))
}

/** 액자만 다시 그린다. 그림이 테두리 위로 삐져나오는 것을 막는다. */
function base2(c) {
  c.rect(0, 0, S, 3, FRAME)
  c.rect(0, S - 3, S, 3, FRAME)
  c.rect(0, 0, 3, S, FRAME)
  c.rect(S - 3, 0, 3, S, FRAME)
}

console.log(`상품 이미지 ${Object.keys(ICONS).length} 장 (${S * SCALE}×${S * SCALE})`)
