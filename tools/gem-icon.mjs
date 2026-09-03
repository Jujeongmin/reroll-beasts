// 젬 아이콘 (32×32). 프리미엄 재화의 얼굴이다.
//
// Kenney 팩의 16px 젬을 안 쓰는 이유: 그건 코인과 같은 계열의 노란 보석이라
// 화면에서 골드와 안 갈린다. 이 게임의 재화는 둘(골드=판 안, 젬=판 밖)이고
// 둘을 색으로 못 가르면 매번 글자를 읽어야 한다. 그래서 밤하늘 보라로 찍고
// 크기도 키웠다 — 상점에서 24px 로 쓰는데 16px 원본을 늘리면 뭉갠다.
//
// 아이템 아이콘과 같은 방식(원시 도형 + 외곽선)이라 색조가 안 튄다.
//
// 실행: node tools/gem-icon.mjs
import { writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'game', 'public', 'assets', 'ui')
const S = 32
const OUTLINE = [0x2a, 0x20, 0x2c]

const DARK = [0x4c, 0x33, 0x94]
const MID = [0x7c, 0x5a, 0xd6]
const LIGHT = [0xa9, 0x8c, 0xf0]
const SPARK = [0xef, 0xe8, 0xff]

const buf = new Uint8Array(S * S * 4)
function px(x, y, c) {
  if (x < 0 || y < 0 || x >= S || y >= S) return
  const i = (y * S + x) * 4
  buf[i] = c[0]
  buf[i + 1] = c[1]
  buf[i + 2] = c[2]
  buf[i + 3] = 255
}
const row = (y, x0, x1, c) => {
  for (let x = x0; x <= x1; x++) px(x, y, c)
}

// 위는 깎은 면(크라운), 아래는 뾰족한 몸(파빌리온). 좌우 대칭이라 폭만 준다.
// [y, 왼쪽, 오른쪽]
const SHAPE = []
for (let i = 0; i < 8; i++) SHAPE.push([6 + i, 11 - i, 20 + i]) // 6..13 벌어진다
for (let i = 0; i < 12; i++) SHAPE.push([14 + i, 5 + i, 26 - i]) // 14..25 모인다

for (const [y, x0, x1] of SHAPE) {
  row(y, x0, x1, MID)
  // 왼쪽 면은 그늘, 오른쪽 위는 빛. 한 색으로 채우면 보석이 아니라 육각형이다.
  row(y, x0, x0 + Math.max(1, Math.round((x1 - x0) * 0.28)), DARK)
  if (y <= 13) row(y, x1 - Math.round((x1 - x0) * 0.3), x1, LIGHT)
}

// 테이블(윗면)과 몸을 가르는 띠. 이 선 하나로 "깎인 돌"이 된다.
row(13, 6, 25, LIGHT)
row(14, 6, 25, DARK)

// 반짝임. 두 점이면 유리처럼 읽히고, 많으면 지저분하다.
row(9, 17, 19, SPARK)
row(10, 18, 19, SPARK)
px(12, 18, SPARK)

// 이미 찍힌 픽셀 둘레에 외곽선. 배경이 밝든 어둡든 모양이 유지된다.
const solid = []
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) solid.push(buf[(y * S + x) * 4 + 3] > 0)
const at = (x, y) => x >= 0 && y >= 0 && x < S && y < S && solid[y * S + x]
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (at(x, y)) continue
    if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) px(x, y, OUTLINE)
  }
}

const png = new PNG({ width: S, height: S })
png.data = Buffer.from(buf)
await writeFile(join(OUT, 'gem.png'), PNG.sync.write(png))
console.log('젬 아이콘 1 장 (32×32)')
