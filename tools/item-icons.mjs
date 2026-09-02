// 아이템 아이콘 12종 (16×16).
//
// 시너지 아이콘과 같은 이유로 직접 찍는다 — 외부 팩에서 끌어오면 색조가 튀고
// 출처 표기 의무가 붙는다. trait-icons.mjs 는 픽셀 문자열을 쓰지만 아이템은
// 도형이 단순해서(칼 · 방패 · 구슬 …) 원시 도형으로 그리는 편이 짧고 고치기 쉽다.
//
// 실행: node tools/item-icons.mjs
import { writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'game', 'public', 'assets', 'ui')
const S = 16
const OUTLINE = [0x2a, 0x20, 0x2c]

/** 16×16 캔버스 하나. 색은 [r,g,b] 배열이고 alpha 는 찍는 순간 255 가 된다. */
function canvas() {
  const buf = new Uint8Array(S * S * 4)
  const px = (x, y, c) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return
    const i = (y * S + x) * 4
    buf[i] = c[0]
    buf[i + 1] = c[1]
    buf[i + 2] = c[2]
    buf[i + 3] = 255
  }
  const rect = (x, y, w, h, c) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c)
  }
  const disc = (cx, cy, r, c) => {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r + 1) px(cx + x, cy + y, c)
      }
    }
  }
  /** 위가 뾰족한 삼각형. h 줄에 걸쳐 폭이 2씩 준다. */
  const tri = (cx, y0, h, c) => {
    for (let j = 0; j < h; j++) {
      const half = Math.floor((h - 1 - j) / 2)
      for (let i = -half; i <= half; i++) px(cx + i, y0 + h - 1 - j, c)
    }
  }
  /** 이미 찍힌 픽셀 둘레에 외곽선을 두른다. 마지막에 한 번 부른다. */
  const outline = () => {
    const solid = []
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) solid.push(buf[(y * S + x) * 4 + 3] > 0)
    }
    const at = (x, y) => x >= 0 && y >= 0 && x < S && y < S && solid[y * S + x]
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (at(x, y)) continue
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) px(x, y, OUTLINE)
      }
    }
  }
  return { buf, px, rect, disc, tri, outline }
}

// 각 아이템의 그림. 색은 그 아이템이 무엇인지 한눈에 가르는 축이라
// 아이템마다 다르게 잡는다 (강철=은색, 마나=파랑, 흡혈=붉은색 …).
const ICONS = {
  // 강철검 — 세로 칼날 + 가로 코등이.
  steel_sword: (c) => {
    c.rect(7, 1, 2, 9, [0xd8, 0xdd, 0xe8])
    c.rect(7, 1, 1, 9, [0xf2, 0xf5, 0xfa])
    c.rect(4, 10, 8, 2, [0xc9, 0x8a, 0x3c])
    c.rect(7, 12, 2, 3, [0x7a, 0x4f, 0x2c])
  },
  // 쾌속 장갑 — 손등 + 속도선 두 줄.
  swift_gloves: (c) => {
    c.rect(6, 4, 7, 8, [0xc2, 0x6a, 0x4a])
    c.rect(6, 4, 7, 2, [0xe8, 0x8f, 0x6a])
    c.rect(4, 6, 2, 1, [0x9f, 0xe8, 0xff])
    c.rect(2, 9, 4, 1, [0x9f, 0xe8, 0xff])
  },
  // 처형자의 인장 — 원판 + 가운데 가로 절단선.
  executioner_seal: (c) => {
    c.disc(8, 8, 6, [0x8b, 0x2f, 0x3f])
    c.disc(8, 8, 4, [0xd9, 0x4f, 0x5c])
    c.rect(3, 7, 11, 2, [0xff, 0xe6, 0xa8])
  },
  // 관통 화살촉 — 위를 향한 삼각 + 자루.
  piercing_arrowhead: (c) => {
    c.tri(8, 1, 9, [0xb8, 0xc4, 0xd4])
    c.rect(7, 10, 2, 5, [0x7a, 0x4f, 0x2c])
  },
  // 참나무 방패 — 위가 네모, 아래가 뾰족한 방패꼴.
  oak_shield: (c) => {
    c.rect(3, 2, 10, 7, [0x8a, 0x5e, 0x3c])
    c.tri(8, 9, 5, [0x8a, 0x5e, 0x3c])
    c.rect(7, 3, 2, 8, [0xc9, 0xa0, 0x6a])
  },
  // 거인의 심장 — 두 덩이 + 아래 삼각.
  giant_heart: (c) => {
    c.disc(5, 6, 3, [0xd6, 0x3f, 0x55])
    c.disc(10, 6, 3, [0xd6, 0x3f, 0x55])
    c.rect(3, 6, 10, 3, [0xd6, 0x3f, 0x55])
    c.tri(8, 8, 6, [0xd6, 0x3f, 0x55])
    c.disc(5, 5, 1, [0xff, 0x8a, 0x9a])
  },
  // 가시 갑옷 — 몸통 + 위로 뻗은 가시 셋.
  thorn_armor: (c) => {
    c.rect(3, 6, 10, 8, [0x5f, 0x6b, 0x7e])
    c.rect(3, 6, 10, 2, [0x8d, 0x9a, 0xad])
    c.tri(4, 1, 5, [0xe2, 0xe8, 0xf2])
    c.tri(8, 0, 6, [0xe2, 0xe8, 0xf2])
    c.tri(12, 1, 5, [0xe2, 0xe8, 0xf2])
  },
  // 성수 부적 — 물방울 + 줄.
  holy_charm: (c) => {
    c.rect(7, 1, 2, 3, [0xc9, 0xa0, 0x6a])
    c.disc(8, 10, 4, [0x9f, 0xd8, 0xff])
    c.tri(8, 4, 6, [0x9f, 0xd8, 0xff])
    c.disc(7, 9, 1, [0xff, 0xff, 0xff])
  },
  // 현자의 보주 — 구슬 + 받침.
  sage_orb: (c) => {
    c.disc(8, 7, 5, [0x8b, 0x5f, 0xd6])
    c.disc(6, 5, 2, [0xd8, 0xbf, 0xff])
    c.rect(5, 12, 6, 2, [0xc9, 0xa0, 0x6a])
  },
  // 마나 원석 — 마름모.
  mana_stone: (c) => {
    c.tri(8, 1, 7, [0x4f, 0x9f, 0xe8])
    for (let j = 0; j < 7; j++) {
      const half = Math.floor((6 - j) / 2)
      for (let i = -half; i <= half; i++) c.px(8 + i, 8 + j, [0x4f, 0x9f, 0xe8])
    }
    c.rect(6, 6, 2, 2, [0xbf, 0xe4, 0xff])
  },
  // 흡혈의 낫 — 굽은 날 + 자루 + 핏방울.
  vampiric_scythe: (c) => {
    c.rect(9, 2, 2, 12, [0x7a, 0x4f, 0x2c])
    c.rect(3, 2, 7, 2, [0xc4, 0x3f, 0x4f])
    c.rect(2, 3, 2, 3, [0xc4, 0x3f, 0x4f])
    c.rect(3, 5, 2, 2, [0xe8, 0x6f, 0x7a])
    c.disc(4, 11, 2, [0xd6, 0x3f, 0x55])
  },
  // 승리의 깃발 — 장대 + 삼각 깃발.
  victory_banner: (c) => {
    c.rect(4, 1, 2, 14, [0x7a, 0x4f, 0x2c])
    c.rect(6, 2, 7, 6, [0xe8, 0xb3, 0x4f])
    c.rect(6, 2, 7, 2, [0xff, 0xdc, 0x8a])
    c.rect(11, 4, 2, 2, [0xc4, 0x8a, 0x2f])
  },
}

for (const [id, draw] of Object.entries(ICONS)) {
  const c = canvas()
  draw(c)
  c.outline()
  const png = new PNG({ width: S, height: S })
  png.data = Buffer.from(c.buf)
  await writeFile(join(OUT, `item_${id}.png`), PNG.sync.write(png))
}
console.log(`아이템 아이콘 ${Object.keys(ICONS).length} 장`)
