// Kenney UI 팩 타일 전부를 격자로 붙여 한 장으로 만든다. 어느 게 동전·자물쇠인지
// 눈으로 골라야 하는데 파일명이 tile_00NN 뿐이라 이 방법밖에 없다.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'

const dir = process.argv[2]
const out = process.argv[3]
const COLS = 13
const SCALE = 4

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.png'))
  .sort()
const rows = Math.ceil(files.length / COLS)

let tw = 0
let th = 0
const imgs = files.map((f) => {
  const p = PNG.sync.read(readFileSync(join(dir, f)))
  tw = Math.max(tw, p.width)
  th = Math.max(th, p.height)
  return p
})

const cellW = tw * SCALE + 4
const cellH = th * SCALE + 4
const sheet = new PNG({ width: COLS * cellW, height: rows * cellH })
// 체크무늬 배경 — 투명 영역이 어디인지 보이게
for (let y = 0; y < sheet.height; y++) {
  for (let x = 0; x < sheet.width; x++) {
    const i = (y * sheet.width + x) * 4
    const c = (((x >> 3) + (y >> 3)) & 1) === 0 ? 60 : 84
    sheet.data[i] = c
    sheet.data[i + 1] = c
    sheet.data[i + 2] = c + 12
    sheet.data[i + 3] = 255
  }
}

imgs.forEach((p, n) => {
  const cx = (n % COLS) * cellW + 2
  const cy = Math.floor(n / COLS) * cellH + 2
  for (let y = 0; y < p.height * SCALE; y++) {
    for (let x = 0; x < p.width * SCALE; x++) {
      const si = (Math.floor(y / SCALE) * p.width + Math.floor(x / SCALE)) * 4
      const a = p.data[si + 3] / 255
      if (a === 0) continue
      const di = ((cy + y) * sheet.width + (cx + x)) * 4
      for (let k = 0; k < 3; k++) {
        sheet.data[di + k] = Math.round(p.data[si + k] * a + sheet.data[di + k] * (1 - a))
      }
    }
  }
})

writeFileSync(out, PNG.sync.write(sheet))
console.log(`${files.length}장 · ${COLS}열 · ${sheet.width}x${sheet.height}`)
console.log(files.map((f, i) => `${i}:${f.replace('.png', '').replace('tile_', '')}`).join(' '))
