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
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const ART = join(ROOT, 'art-src')
const OUT = join(ROOT, 'game', 'public', 'assets')

const KAYKIT = join(ART, 'kaykit-hexagon', 'KayKit_Medieval_Hexagon_Pack_1.0_FREE', 'Assets', 'gltf')
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

  // ── UI 타일 ────────────────────────────────────────────
  // 원본 파일명이 tile_00NN 뿐이라 ui-map.json 의 이름으로 바꿔 내보낸다.
  // 코드에서 숫자를 참조하면 나중에 어느 게 무슨 프레임인지 알 수 없다.
  const ui = JSON.parse(await readFile(join(HERE, 'ui-map.json'), 'utf8'))
  const uiSrc = join(ART, ui.pack, ui.root)
  const uiDest = join(OUT, 'ui')
  await mkdir(uiDest, { recursive: true })
  for (const [name, index] of Object.entries(ui.tiles)) {
    const from = join(uiSrc, 'tile_' + String(index).padStart(4, '0') + '.png')
    await copyFile(from, join(uiDest, name + '.png'))
    copied++
  }
  manifest.ui = { tiles: Object.keys(ui.tiles), slice: ui.slice }

  await writeFile(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

  if (!quiet) {
    const evo = Object.values(manifest.units).filter((u) => u.evolved).length
    const decorCount = manifest.decor.water.length + manifest.decor.land.length
    console.log(`유닛 ${Object.keys(manifest.units).length}종 (진화 ${evo}) · 육각 타일 ${HEX_TILES.length}종`)
    console.log(`장식 ${decorCount}종 · UI 타일 ${manifest.ui.tiles.length}종`)
    console.log(`파일 ${copied}개 복사 → game/public/assets/`)
  }
  return manifest
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) await buildAssets()
