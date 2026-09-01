// 필요한 3D 모델만 게임이 읽는 자리로 옮긴다.
//
//   node tools/build-assets.mjs
//
// Quaternius 몬스터 glTF 는 지오메트리와 텍스처가 전부 임베드된 자체완결
// 파일이라 그대로 복사하면 된다 (.bin·.png 딸림 파일이 없다).
// KayKit 육각 타일은 .gltf + .bin + 공유 텍스처 셋이 한 벌이다.
//
// 팩 전체(380MB)를 public/ 에 넣지 않는다 — 거긴 빌드에 그대로 복사되는
// 곳이라 안 쓰는 모델까지 플레이어에게 배포된다.

import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises'
import { PNG } from 'pngjs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const ART = join(ROOT, 'art-src')
const OUT = join(ROOT, 'game', 'public', 'assets')

const KAYKIT = join(ART, 'kaykit-hexagon', 'KayKit_Medieval_Hexagon_Pack_1.0_FREE', 'Assets', 'gltf')
const VILLAGE = join(ART, 'q-medieval-village', 'Medieval Village MegaKit[Standard]', 'glTF')
const NATURE = join(ART, 'q-stylized-nature', 'glTF')

// 전장 바닥. 2×2 정사각이라 육각 간격(stepX)과 크기가 같아 격자로 깔린다.
const FLOOR = ['Floor_UnevenBrick']
// 바닥에 흩을 얼룩. 자갈은 판 위, 풀·꽃은 가장자리에 쓴다.
const SCATTER = {
  stone: ['Pebble_Round_1', 'Pebble_Round_3', 'Pebble_Square_2', 'Pebble_Square_5'],
  grass: ['Grass_Common_Short', 'Grass_Wispy_Short', 'Flower_3_Group', 'Clover_1', 'Mushroom_Common'],
}
const HEX_TILES = ['hex_grass', 'hex_water']

// 보드 둘레를 채울 장식. 물 위(수련·수초)와 바깥 실루엣(나무·바위)을 나눈다.
// 전부 hexagons_medieval.png 한 장을 공유하므로 텍스처가 늘지 않는다.
const DECOR = {
  water: ['waterlily_A', 'waterlily_B', 'waterplant_A', 'waterplant_B', 'waterplant_C'],
  land: ['tree_single_A', 'tree_single_B', 'trees_A_small', 'trees_B_small', 'rock_single_A', 'rock_single_C'],
}

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

// 텍스처 상한. 육각 한 칸이 화면에서 40px 남짓인데 원본은 2048² 다 —
// 바닥 타일 한 장에 7.8MB 를 플레이어에게 내려보낼 이유가 없다.
const MAX_TEX = 512

/**
 * PNG 를 2의 거듭제곱으로 줄인다. 박스 필터 — 축소에는 이걸로 충분하고
 * 의존성이 pngjs 하나로 끝난다.
 */
function downscale(buf, max) {
  const src = PNG.sync.read(buf)
  const factor = Math.max(1, Math.ceil(Math.max(src.width, src.height) / max))
  if (factor === 1) return null
  const w = Math.max(1, Math.floor(src.width / factor))
  const h = Math.max(1, Math.floor(src.height / factor))
  const out = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let dy = 0; dy < factor; dy++) {
        const sy = y * factor + dy
        if (sy >= src.height) break
        for (let dx = 0; dx < factor; dx++) {
          const sx = x * factor + dx
          if (sx >= src.width) break
          const i = (sy * src.width + sx) << 2
          r += src.data[i]
          g += src.data[i + 1]
          b += src.data[i + 2]
          a += src.data[i + 3]
          n++
        }
      }
      const o = (y * w + x) << 2
      out.data[o] = r / n
      out.data[o + 1] = g / n
      out.data[o + 2] = b / n
      out.data[o + 3] = a / n
    }
  }
  return PNG.sync.write(out)
}

/** 텍스처면 줄여서, 아니면 그대로 옮긴다. */
async function copyAsset(from, to) {
  if (!from.endsWith('.png')) return copyFile(from, to)
  const small = downscale(await readFile(from), MAX_TEX)
  if (!small) return copyFile(from, to)
  return writeFile(to, small)
}

export async function buildAssets({ quiet = false } = {}) {
  const map = JSON.parse(await readFile(join(HERE, 'model-map.json'), 'utf8'))
  const src = join(ART, map.pack, map.root)

  // ── 유닛 모델 ──────────────────────────────────────────
  const manifest = { units: {}, hex: {} }
  let copied = 0

  for (const [id, entry] of Object.entries(map.models)) {
    const dest = join(OUT, 'monsters')
    await mkdir(dest, { recursive: true })

    const files = [entry.file, ...(entry.evolved ? [entry.evolved] : [])]
    for (const f of files) {
      const from = join(src, entry.family, 'glTF', `${f}.gltf`)
      // 계열이 달라도 파일명이 같은 모델이 있다 (Big/Cactoro vs Blob/Cactoro).
      // 계열을 파일명에 넣어 충돌을 막는다.
      const to = join(dest, `${entry.family}_${f}.gltf`)
      await copyFile(from, to)
      copied++
    }

    manifest.units[id] = {
      base: `${entry.family}_${entry.file}.gltf`,
      evolved: entry.evolved ? `${entry.family}_${entry.evolved}.gltf` : null,
      anims: map.animsByFamily[entry.family],
    }
  }

  // ── 육각 타일 ──────────────────────────────────────────
  const hexDest = join(OUT, 'hex')
  await mkdir(hexDest, { recursive: true })
  for (const tile of HEX_TILES) {
    for (const ext of ['gltf', 'bin']) {
      const from = join(KAYKIT, 'tiles', 'base', `${tile}.${ext}`)
      if (await exists(from)) {
        await copyFile(from, join(hexDest, `${tile}.${ext}`))
        copied++
      }
    }
    manifest.hex[tile] = `${tile}.gltf`
  }
  // 타일들이 공유하는 텍스처
  const tex = join(KAYKIT, 'tiles', 'base', 'hexagons_medieval.png')
  if (await exists(tex)) {
    await copyFile(tex, join(hexDest, 'hexagons_medieval.png'))
    copied++
  }

  // ── 보드 장식 ──────────────────────────────────────────
  const decorDest = join(OUT, 'decor')
  await mkdir(decorDest, { recursive: true })
  manifest.decor = { water: [], land: [] }
  for (const [group, names] of Object.entries(DECOR)) {
    for (const name of names) {
      for (const ext of ['gltf', 'bin']) {
        const from = join(KAYKIT, 'decoration', 'nature', name + '.' + ext)
        if (await exists(from)) {
          await copyFile(from, join(decorDest, name + '.' + ext))
          copied++
        }
      }
      manifest.decor[group].push(name + '.gltf')
    }
  }
  {
    const from = join(KAYKIT, 'decoration', 'nature', 'hexagons_medieval.png')
    if (await exists(from)) {
      await copyFile(from, join(decorDest, 'hexagons_medieval.png'))
      copied++
    }
  }

  // ── 전장 바닥 · 흩뿌림 ─────────────────────────────────
  // glTF 는 .bin 과 텍스처 딸림 파일이 따로다. 참조된 것만 골라 옮긴다 —
  // 팩 전체를 복사하면 안 쓰는 수백 장이 플레이어에게 배포된다.
  async function copyGltfSet(srcDir, destDir, names) {
    await mkdir(destDir, { recursive: true })
    const out = []
    for (const name of names) {
      const gltfPath = join(srcDir, `${name}.gltf`)
      if (!(await exists(gltfPath))) {
        console.warn(`  건너뜀: ${name}.gltf 가 없다`)
        continue
      }
      const doc = JSON.parse(await readFile(gltfPath, 'utf8'))
      await copyFile(gltfPath, join(destDir, `${name}.gltf`))
      copied++
      const deps = [
        ...(doc.buffers ?? []).map((b) => b.uri),
        ...(doc.images ?? []).map((i) => i.uri),
      ].filter(Boolean)
      for (const uri of new Set(deps)) {
        const from = join(srcDir, decodeURIComponent(uri))
        if (await exists(from)) {
          await copyAsset(from, join(destDir, decodeURIComponent(uri)))
          copied++
        }
      }
      out.push(`${name}.gltf`)
    }
    return out
  }

  manifest.floor = await copyGltfSet(VILLAGE, join(OUT, 'floor'), FLOOR)
  manifest.scatter = {
    stone: await copyGltfSet(NATURE, join(OUT, 'scatter'), SCATTER.stone),
    grass: await copyGltfSet(NATURE, join(OUT, 'scatter'), SCATTER.grass),
  }

  // ── UI 타일 ────────────────────────────────────────────
  // 원본 파일명이 tile_00NN 뿐이라 ui-map.json 의 이름으로 바꿔 내보낸다.
  // 코드에서 숫자를 참조하면 나중에 어느 게 무슨 프레임인지 알 수 없다.
  const ui = JSON.parse(await readFile(join(HERE, 'ui-map.json'), 'utf8'))
  const uiSrc = join(ART, ui.pack, ui.root)
  const uiDest = join(OUT, 'ui')
  await mkdir(uiDest, { recursive: true })
  const tile = (n) => 'tile_' + String(n).padStart(4, '0') + '.png'
  for (const [name, index] of Object.entries(ui.tiles)) {
    await copyFile(join(uiSrc, tile(index)), join(uiDest, name + '.png'))
    copied++
  }
  // 작은 타일(16px)은 아이콘용이다 — 금화·보석. 큰 타일과 폴더가 다르다.
  const smallSrc = join(ART, ui.pack, ui.smallRoot)
  for (const [name, index] of Object.entries(ui.smallTiles)) {
    await copyFile(join(smallSrc, tile(index)), join(uiDest, name + '.png'))
    copied++
  }
  manifest.ui = {
    tiles: [...Object.keys(ui.tiles), ...Object.keys(ui.smallTiles)],
    slice: ui.slice,
  }

  // ── 이펙트 스프라이트 ──────────────────────────────────
  // 원본은 256px 무채색이다. 색은 코드가 입힌다 — 색깔별 파일을 따로 두면
  // 같은 그림이 여덟 벌 생기고, 티어색처럼 값이 바뀔 때마다 다시 뽑아야 한다.
  const FX = {
    ring: 'circle_04',
    ring_thick: 'circle_03',
    burst: 'scorch_02',
    glow: 'light_01',
    trail: 'trace_01',
    wisp: 'trace_02',
    spark: 'star_04',
    slash: 'slash_03',
  }
  const fxSrc = join(ART, 'kenney_particle-pack', 'PNG (Transparent)')
  const fxDest = join(OUT, 'fx')
  await mkdir(fxDest, { recursive: true })
  for (const [name, file] of Object.entries(FX)) {
    const small = downscale(await readFile(join(fxSrc, file + '.png')), 128)
    await writeFile(join(fxDest, name + '.png'), small ?? (await readFile(join(fxSrc, file + '.png'))))
    copied++
  }
  manifest.fx = Object.keys(FX)

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

  if (!quiet) {
    const evo = Object.values(manifest.units).filter((u) => u.evolved).length
    const decorCount = manifest.decor.water.length + manifest.decor.land.length
    console.log(`유닛 ${Object.keys(manifest.units).length}종 (진화 ${evo}) · 육각 타일 ${HEX_TILES.length}종`)
    const scatterCount = manifest.scatter.stone.length + manifest.scatter.grass.length
    console.log(`장식 ${decorCount}종 · UI 타일 ${manifest.ui.tiles.length}종`)
    console.log(`바닥 ${manifest.floor.length}종 · 흩뿌림 ${scatterCount}종`)
    console.log(`파일 ${copied}개 복사 → game/public/assets/`)
  }
  return manifest
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) await buildAssets()
