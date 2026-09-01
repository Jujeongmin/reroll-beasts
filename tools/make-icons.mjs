// 직접 찍는 아이콘들 (16×16).
//
// Kenney UI 팩에 자물쇠가 없다. 상점 잠금은 이 게임에서 매 라운드 쓰는 버튼이라
// 글자만으로 두면 눈에 안 들어온다. 팩 팔레트를 그대로 써서 직접 찍는다 —
// 다른 팩에서 하나만 끌어오면 색조가 튄다.
//
// 실행: node tools/make-icons.mjs
import { writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'game', 'public', 'assets', 'ui')

// Kenney UI Pixel Adventure 의 색을 그대로 뽑아 쓴다.
const PALETTE = {
  '.': null,
  o: [0x30, 0x25, 0x2f, 0xff], // 외곽선
  s: [0xa8, 0xbc, 0xd4, 0xff], // 강철 (고리)
  b: [0xa9, 0x71, 0x2c, 0xff], // 몸통 그늘
  h: [0xe0, 0xa9, 0x4c, 0xff], // 몸통 밝은 면
  k: [0x4a, 0x34, 0x18, 0xff], // 열쇠구멍
}

const CLOSED = [
  '................',
  '......oooo......',
  '.....os..so.....',
  '....os....so....',
  '....os....so....',
  '....os....so....',
  '..oooooooooooo..',
  '..obbbbbbbbbbo..',
  '..obhhhhhhhhbo..',
  '..obhhhkkhhhbo..',
  '..obhhhkkhhhbo..',
  '..obhhhhkhhhbo..',
  '..obhhhhkhhhbo..',
  '..obbbbbbbbbbo..',
  '..oooooooooooo..',
  '................',
]

// 열린 자물쇠는 고리가 옆으로 젖혀진다. 같은 자리에 그리면 잠금과 구분이 안 된다.
const OPEN = [
  '................',
  '........oooo....',
  '.......os..so...',
  '......os....so..',
  '......os.....o..',
  '......os........',
  '..oooooooooooo..',
  '..obbbbbbbbbbo..',
  '..obhhhhhhhhbo..',
  '..obhhhkkhhhbo..',
  '..obhhhkkhhhbo..',
  '..obhhhhkhhhbo..',
  '..obhhhhkhhhbo..',
  '..obbbbbbbbbbo..',
  '..oooooooooooo..',
  '................',
]

function draw(rows) {
  const size = rows.length
  for (const [y, r] of rows.entries()) {
    if (r.length !== size) throw new Error(`${y}행 길이 ${r.length}, ${size} 이어야 한다`)
  }
  const png = new PNG({ width: size, height: size })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = PALETTE[rows[y][x]]
      if (c === undefined) throw new Error(`모르는 문자 ${rows[y][x]}`)
      const i = (y * size + x) * 4
      if (c === null) {
        png.data[i + 3] = 0
        continue
      }
      png.data[i] = c[0]
      png.data[i + 1] = c[1]
      png.data[i + 2] = c[2]
      png.data[i + 3] = c[3]
    }
  }
  return PNG.sync.write(png)
}

// 시계. 원은 도트로 그리면 어느 픽셀을 켤지 매번 틀리므로 계산으로 낸다.
function clock() {
  const size = 16
  const png = new PNG({ width: size, height: size })
  const cx = 7.5
  const cy = 7.5
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (Math.round(y) * size + Math.round(x)) * 4
    png.data[i] = c[0]
    png.data[i + 1] = c[1]
    png.data[i + 2] = c[2]
    png.data[i + 3] = c[3]
  }
  const face = [0xf0, 0xe4, 0xc6, 0xff]
  const rim = PALETTE.o
  const hand = [0x4a, 0x34, 0x18, 0xff]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d <= 5.4) put(x, y, face)
      else if (d <= 7.2) put(x, y, rim)
    }
  }
  // 바늘: 위로 4칸(시침), 오른쪽으로 3칸(분침). 10시 10분 같은 장식보다
  // 12시·3시가 작은 크기에서 훨씬 또렷하다.
  for (let k = 0; k <= 4; k++) put(cx - 0.5, cy - k, hand)
  for (let k = 0; k <= 3; k++) put(cx - 0.5 + k, cy, hand)
  return PNG.sync.write(png)
}

await writeFile(join(OUT, 'lock_closed.png'), draw(CLOSED))
await writeFile(join(OUT, 'lock_open.png'), draw(OPEN))
await writeFile(join(OUT, 'clock.png'), clock())
console.log('lock_closed.png · lock_open.png · clock.png')
