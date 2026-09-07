// 상품 그림 반입. art-src 의 원본을 512×512 로 줄여 game/public/assets/store 로 옮긴다.
//
// **왜 도구로 두나**: 원본은 2MB 짜리 정사각 그림이고, 게임이 쓰는 것은 한 변
// 512 다. 손으로 줄이면 다음에 그림을 바꿀 때 크기·이름·품질이 매번 달라진다 —
// 표를 여기 적어 두면 원본만 갈아 끼우고 다시 돌리면 된다.
//
// 결제창에 그대로 뜨는 그림이라 **1:1 을 지킨다**. 비율이 다른 원본이 오면
// 가운데를 잘라 정사각으로 맞춘다(cover) — 여백을 채우면 그림에 없던 띠가
// 결제창에 생긴다.
//
// 실행: node tools/store-import.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'art-src')
const OUT = join(ROOT, 'game', 'public', 'assets', 'store')
// 512 PNG 는 **대시보드에 올릴 것**이다(결제창이 그대로 쓴다).
// 게임 안 상점은 한 줄에 30px 로 그리므로 같은 파일을 쓰면 그림 넉 장에
// 2MB 를 받는다 — 작은 webp 를 따로 굽고, store.json 은 그쪽을 가리킨다.
const SIZE = 512
const GAME_SIZE = 256

// 원본 이름 → 게임이 쓰는 이름. 오른쪽 이름은 store.json 의 icon 칸과 **글자
// 그대로** 같아야 한다 — 다르면 결제창에 그림이 안 뜬다.
const MAP = [
  ['gem300.png', 'store_gems_small.png'],
  ['gem1000.png', 'store_gems_medium.png'],
  ['gem2600.png', 'store_gems_large.png'],
  ['Premium pass.png', 'store_pass_premium.png'],
]

await mkdir(OUT, { recursive: true })

const seen = new Map()
for (const [from, to] of MAP) {
  const src = join(SRC, from)
  if (!existsSync(src)) {
    console.warn(`건너뜀: ${from} 이 art-src 에 없다`)
    continue
  }
  const raw = await readFile(src)
  // 같은 원본이 두 상품에 쓰이면 화면에서 두 묶음이 구분이 안 된다. 조용히
  // 넘기면 나중에 "왜 1,000 과 2,600 이 똑같지"를 그림에서부터 되짚어야 한다.
  const key = raw.length + ':' + raw.subarray(0, 64).toString('hex')
  if (seen.has(key)) console.warn(`주의: ${from} 이 ${seen.get(key)} 와 같은 그림이다`)
  else seen.set(key, from)

  const big = await sharp(raw)
    .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
    .png({ compressionLevel: 9 })
    .toBuffer()
  await writeFile(join(OUT, to), big)

  const small = await sharp(raw)
    .resize(GAME_SIZE, GAME_SIZE, { fit: 'cover', position: 'centre' })
    .webp({ quality: 82 })
    .toBuffer()
  const web = to.replace(/\.png$/, '.webp')
  await writeFile(join(OUT, web), small)

  console.log(
    `${from} → ${to} (${(big.length / 1024).toFixed(0)}KB, 대시보드) ` +
      `· ${web} (${(small.length / 1024).toFixed(0)}KB, 게임)`,
  )
}
