// 원본 시트를 게임이 읽는 자리로 옮기고, 발밑 정렬 데이터를 뽑는다.
//
//   node tools/build-assets.mjs
//
// 시트는 이미 가로 스트립이라 자르지 않는다 — PixiJS 가 프레임 사각형으로 바로 쓴다.
// 여기서 하는 일은 둘이다:
//
//   1. art-src/<pack>/<dir>/<file> → game/public/assets/units/<unit>/<anim>.png 복사
//   2. 불투명 픽셀의 경계상자를 재서 manifest.json 에 넣는다
//
// **왜 경계상자가 필요한가.** 프레임 캔버스 안에서 캐릭터가 차지하는 자리가
// 팩마다 다르다. hero_knight_1 은 180x180 캔버스에 작게 들어있고 slime 은
// 156x156 에 꽉 찬다. 캔버스 기준으로 타일에 얹으면 발이 뜨거나 묻힌다.
// 그래서 **불투명 영역의 아래변**을 땅으로 삼고 거기에 타일을 맞춘다.
//
// idleBox 와 fullBox 를 따로 낸다:
//   idleBox  대기 자세 기준. 이걸로 앵커를 잡는다 — 서 있는 자세가 기준이어야
//            공격 모션에서 팔을 뻗어도 발이 안 움직인다
//   fullBox  전 애니메이션 합집합. 스프라이트가 타일 밖으로 얼마나 삐져나오는지
//            알려준다 (겹침 판단·컬링용)

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { PNG } from 'pngjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const ART = join(ROOT, 'art-src')
const OUT = join(ROOT, 'game', 'public', 'assets', 'units')

// 알파가 이 값 이하면 없는 픽셀로 친다. 0 으로 두면 눈에 안 보이는
// 1~2 알파 찌꺼기까지 경계에 잡혀 상자가 캔버스만큼 커진다.
const ALPHA_FLOOR = 8

async function readPng(path) {
  return PNG.sync.read(await readFile(path))
}

/**
 * 시트 전체(모든 프레임)의 불투명 경계상자를 **프레임 좌표계**로 낸다.
 * 프레임을 하나씩 훑어 좌표를 프레임 내부로 접는다.
 */
function boxOfSheet(png, frameW, frameH) {
  const frames = png.width / frameW
  let minX = frameW
  let minY = frameH
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const alpha = png.data[(png.width * y + x) * 4 + 3]
      if (alpha <= ALPHA_FLOOR) continue
      const fx = x % frameW // 프레임 안쪽 x
      if (fx < minX) minX = fx
      if (fx > maxX) maxX = fx
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null // 전부 투명
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, frames }
}

function union(a, b) {
  if (!a) return b
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  }
}

export async function buildAssets({ quiet = false } = {}) {
  const map = JSON.parse(await readFile(join(HERE, 'sprite-map.json'), 'utf8'))
  const manifest = { units: {} }

  for (const [id, entry] of Object.entries(map.units)) {
    const destDir = join(OUT, id)
    await mkdir(destDir, { recursive: true })

    const anims = {}
    let idleBox = null
    let fullBox = null

    for (const [anim, file] of Object.entries(entry.anims)) {
      const src = join(ART, entry.pack, entry.dir, file)
      await copyFile(src, join(destDir, `${anim}.png`))

      const png = await readPng(src)
      const box = boxOfSheet(png, entry.frame.w, entry.frame.h)
      anims[anim] = { frames: png.width / entry.frame.w }
      if (anim === 'idle') idleBox = box
      fullBox = union(fullBox, box)
    }

    if (!idleBox) throw new Error(`${id}: idle 애니메이션의 경계상자를 못 냈다`)

    // 앵커 — 스프라이트를 타일에 얹을 때 이 지점이 타일 바닥 중앙에 온다.
    // 0~1 비율로 저장한다. 렌더러가 프레임 크기를 몰라도 되게.
    const anchor = {
      x: (idleBox.x + idleBox.w / 2) / entry.frame.w,
      y: (idleBox.y + idleBox.h) / entry.frame.h,
    }

    manifest.units[id] = {
      frame: entry.frame,
      anchor,
      idleBox,
      fullBox,
      anims,
    }
    if (!quiet) {
      const pct = ((idleBox.w * idleBox.h) / (entry.frame.w * entry.frame.h) * 100).toFixed(0)
      console.log(
        `  ${id.padEnd(22)} ${entry.frame.w}x${entry.frame.h}  ` +
          `본체 ${String(idleBox.w).padStart(3)}x${String(idleBox.h).padStart(3)} (${pct}%)  ` +
          `앵커 ${anchor.x.toFixed(3)}, ${anchor.y.toFixed(3)}  ` +
          `애니 ${Object.keys(anims).length}`,
      )
    }
  }

  await mkdir(OUT, { recursive: true })
  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
  console.log('유닛 에셋 배치 + 경계상자 측정')
  const manifest = await buildAssets()
  const n = Object.keys(manifest.units).length
  const anims = Object.values(manifest.units).reduce((a, u) => a + Object.keys(u.anims).length, 0)
  console.log(`\n완료 — 유닛 ${n}종 / 애니메이션 ${anims}개`)
  console.log(`매니페스트: game/public/assets/units/manifest.json`)
}
