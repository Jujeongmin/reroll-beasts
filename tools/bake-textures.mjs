// 텍스처를 WebP 로 굽는다. build-assets 와 **다른 프로세스**로 돈다 —
// sharp 와 @gltf-transform/functions 를 한 모듈 그래프에 두면 gltf-transform 이
// 끌고 오는 중첩 sharp(0.35.x) 네이티브가 먼저 로드되며 Node 24 에서 터진다.
// 두 단계는 서로 아는 게 없으므로 갈라 두는 편이 맞기도 하다.
//
//   node tools/bake-textures.mjs

import { readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'game', 'public', 'assets')

/**
 * 텍스처를 WebP 로 굽고 .gltf 가 가리키는 파일명을 같이 고친다.
 *
 * 이 팩들의 PNG 는 512×512 인데도 장당 300KB 다 — 노이즈가 많은 법선·거칠기
 * 맵이라 PNG 의 무손실 압축이 거의 안 먹는다. WebP 는 같은 그림을 10분의 1로
 * 줄인다 (실측: floor 2191KB → 247KB).
 *
 * **ui 는 건드리지 않는다.** 16px 픽셀아트라 WebP 로 바꾸면 오히려 커진다
 * (11KB → 16KB). monsters 는 이미 .glb 안에 텍스처가 들어가 있다.
 */
const WEBP_DIRS = ['floor', 'scatter', 'landmark', 'decor', 'hex', 'terrain', 'fx']

export async function bakeTextures(quiet) {
  let saved = 0
  for (const dir of WEBP_DIRS) {
    const here = join(OUT, dir)
    let names
    try {
      names = await readdir(here)
    } catch {
      continue
    }

    const renamed = new Map()
    for (const name of names.filter((n) => n.endsWith('.png'))) {
      const from = join(here, name)
      const png = await readFile(from)
      const webp = await sharp(png).webp({ quality: 88, effort: 6 }).toBuffer()
      // 커지면 그대로 둔다. 픽셀아트가 섞여 들어와도 손해를 안 본다.
      if (webp.length >= png.length) continue
      await writeFile(join(here, name.replace(/.png$/, '.webp')), webp)
      await rm(from)
      renamed.set(name, name.replace(/.png$/, '.webp'))
      saved += png.length - webp.length
    }

    // .gltf 안의 uri 를 새 파일명으로. 안 고치면 모델이 텍스처를 못 찾아
    // 흰 덩어리로 뜬다 — 콘솔에도 404 하나만 남아 원인이 안 읽힌다.
    if (renamed.size === 0) continue
    for (const name of names.filter((n) => n.endsWith('.gltf'))) {
      const at = join(here, name)
      const doc = JSON.parse(await readFile(at, 'utf8'))
      let touched = false
      for (const img of doc.images ?? []) {
        const next = renamed.get(img.uri)
        if (!next) continue
        img.uri = next
        img.mimeType = 'image/webp'
        touched = true
      }
      if (touched) await writeFile(at, JSON.stringify(doc))
    }
  }
  if (!quiet) console.log(`텍스처 WebP 변환 — ${Math.round(saved / 1024)}KB 절감`)
}


const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) await bakeTextures(false)
