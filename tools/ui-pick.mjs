// 후보 타일 몇 장만 크게 붙여 본다. 격자에서 눈으로 센 인덱스는 자주 어긋난다.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'

const dir = process.argv[2]
const out = process.argv[3]
const idx = process.argv.slice(4).map(Number)
const SCALE = 8

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.png'))
  .sort()
const imgs = idx.map((i) => ({ i, p: PNG.sync.read(readFileSync(join(dir, files[i]))) }))
const cell = 16 * SCALE + 8
const sheet = new PNG({ width: imgs.length * cell, height: cell })
for (let y = 0; y < sheet.height; y++) {
  for (let x = 0; x < sheet.width; x++) {
    const i = (y * sheet.width + x) * 4
    const c = (((x >> 3) + (y >> 3)) & 1) === 0 ? 40 : 70
    sheet.data[i] = c
    sheet.data[i + 1] = c
    sheet.data[i + 2] = c + 14
    sheet.data[i + 3] = 255
  }
}
imgs.forEach(({ p }, n) => {
  const cx = n * cell + 4
  for (let y = 0; y < p.height * SCALE; y++) {
    for (let x = 0; x < p.width * SCALE; x++) {
      const si = (Math.floor(y / SCALE) * p.width + Math.floor(x / SCALE)) * 4
      const a = p.data[si + 3] / 255
      if (a === 0) continue
      const di = ((4 + y) * sheet.width + (cx + x)) * 4
      if (di + 3 >= sheet.data.length) continue
      for (let k = 0; k < 3; k++) {
        sheet.data[di + k] = Math.round(p.data[si + k] * a + sheet.data[di + k] * (1 - a))
      }
    }
  }
})
writeFileSync(out, PNG.sync.write(sheet))
console.log(imgs.map(({ i, p }) => `${i}=${files[i]} ${p.width}x${p.height}`).join('  '))
