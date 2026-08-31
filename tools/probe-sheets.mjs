// 스프라이트시트 규격 실측.
//
//   node tools/probe-sheets.mjs [팩폴더]
//
// LuizMelo 팩은 가로 스트립이지만 프레임 폭이 팩마다 다르고 문서에도 없다.
// PNG 헤더(IHDR)에서 폭·높이만 읽고, 폭이 높이로 나누어떨어지는지 본다 —
// 떨어지면 정사각 프레임일 가능성이 높다. 확정은 눈으로 한다.
//
// 의존성 없이 PNG 헤더만 판다: 8바이트 시그니처 + IHDR 길이(4) + 'IHDR'(4)
// 다음에 폭(4) 높이(4)가 빅엔디언으로 온다.

import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, relative } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ART = join(HERE, '..', 'art-src')

export async function pngSize(path) {
  const buf = await readFile(path)
  if (buf.length < 24) throw new Error(`PNG 로 보기엔 너무 짧다: ${path}`)
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`PNG 시그니처가 아니다: ${path}`)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

async function walk(dir, out = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else if (e.name.toLowerCase().endsWith('.png')) out.push(p)
  }
  return out
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
  const only = process.argv[2]
  const packs = (await readdir(ART, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((n) => !only || n === only)
    .sort()

  for (const pack of packs) {
    const files = await walk(join(ART, pack))
    if (files.length === 0) continue
    console.log(`\n=== ${pack} ===`)
    for (const f of files.sort()) {
      const { width, height } = await pngSize(f)
      const rel = relative(join(ART, pack), f)
      // 폭 / 높이 가 정수면 정사각 프레임 가설이 선다
      const square = width % height === 0 ? `${width / height}프레임(정사각 가정)` : '—'
      console.log(`  ${rel.padEnd(46)} ${String(width).padStart(5)}x${String(height).padStart(4)}  ${square}`)
    }
  }
}
