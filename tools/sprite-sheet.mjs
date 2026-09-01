// 큰 스프라이트를 줄여 한 장으로 붙인다. 이펙트 파티클처럼 원본이 256px 인
// 묶음을 눈으로 고를 때 쓴다 (ui-sheet 는 32px 타일을 키우는 쪽이라 반대다).
//
// 실행: node tools/sprite-sheet.mjs <폴더> <출력.png> [칸크기=72] [열=10]
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'

const dir = process.argv[2]
const out = process.argv[3]
const CELL = Number(process.argv[4] ?? 72)
const COLS = Number(process.argv[5] ?? 10)

const files = readdirSync(dir)
  .filter((f) => f.toLowerCase().endsWith('.png'))
  .sort()
const rows = Math.ceil(files.length / COLS)
const sheet = new PNG({ width: COLS * CELL, height: rows * CELL })

// 체크무늬 배경 — 이펙트는 대부분 흰색이라 흰 바탕에서는 안 보인다.
for (let y = 0; y < sheet.height; y++) {
  for (let x = 0; x < sheet.width; x++) {
    const i = (y * sheet.width + x) * 4
    const c = (((x >> 3) + (y >> 3)) & 1) === 0 ? 26 : 44
    sheet.data[i] = c
    sheet.data[i + 1] = c
    sheet.data[i + 2] = c + 10
    sheet.data[i + 3] = 255
  }
}

files.forEach((f, n) => {
  const p = PNG.sync.read(readFileSync(join(dir, f)))
  const cx = (n % COLS) * CELL
  const cy = Math.floor(n / COLS) * CELL
  // 최근접 축소. 미리보기용이라 품질보다 속도다.
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const sx = Math.min(p.width - 1, Math.floor((x * p.width) / CELL))
      const sy = Math.min(p.height - 1, Math.floor((y * p.height) / CELL))
      const si = (sy * p.width + sx) * 4
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
console.log(files.map((f, i) => `${i}:${f.replace('.png', '')}`).join(' '))
