// sprite-map.json 을 실제 파일과 대조한다.
//
//   node tools/verify-sprite-map.mjs
//
// 표를 손으로 썼으니 손으로 틀렸을 수 있다. 그리고 팩이 갱신되면 조용히 깨진다.
// 그래서 세 가지를 실측과 대조한다:
//   1. 파일이 실제로 있는가
//   2. 시트 높이가 frame.h 와 같은가
//   3. 시트 폭 / frame.w 가 적어둔 frames 와 같은가 (나누어떨어지는지 포함)
// 그리고 units.json 의 26종이 표에 빠짐없이 있는지 본다.

import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { pngSize } from './probe-sheets.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const ART = join(ROOT, 'art-src')

export async function verifySpriteMap() {
  const map = JSON.parse(await readFile(join(HERE, 'sprite-map.json'), 'utf8'))
  const unitsData = JSON.parse(await readFile(join(ROOT, 'game', 'public', 'data', 'units.json'), 'utf8'))
  const errors = []

  // units.json 과 표가 정확히 같은 집합인가
  const inData = unitsData.units.map((u) => u.id).sort()
  const inMap = Object.keys(map.units).sort()
  for (const id of inData) if (!inMap.includes(id)) errors.push(`units.json 의 ${id} 가 sprite-map 에 없다`)
  for (const id of inMap) if (!inData.includes(id)) errors.push(`sprite-map 의 ${id} 가 units.json 에 없다`)

  const groups = [
    ...Object.entries(map.units).map(([id, e]) => [id, e]),
    ...Object.entries(map.projectiles).filter(([k]) => k !== '_note'),
  ]

  for (const [id, entry] of groups) {
    for (const [anim, file] of Object.entries(entry.anims)) {
      const path = join(ART, entry.pack, entry.dir, file)
      let size
      try {
        size = await pngSize(path)
      } catch {
        errors.push(`${id}.${anim}: 파일 없음 — ${entry.pack}/${entry.dir}/${file}`)
        continue
      }
      if (size.height !== entry.frame.h) {
        errors.push(`${id}.${anim}: 높이 ${size.height} ≠ frame.h ${entry.frame.h}`)
        continue
      }
      if (size.width % entry.frame.w !== 0) {
        errors.push(`${id}.${anim}: 폭 ${size.width} 이 frame.w ${entry.frame.w} 로 안 나눠떨어진다`)
        continue
      }
      const actual = size.width / entry.frame.w
      const declared = entry.frames?.[anim]
      if (declared !== undefined && declared !== actual) {
        errors.push(`${id}.${anim}: 프레임 수 실제 ${actual} ≠ 표에 적힌 ${declared}`)
      }
    }
  }

  return errors
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
  const errors = await verifySpriteMap()
  if (errors.length > 0) {
    console.error(`sprite-map 불일치 ${errors.length} 건:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  const map = JSON.parse(await readFile(join(HERE, 'sprite-map.json'), 'utf8'))
  const units = Object.keys(map.units).length
  const anims = Object.values(map.units).reduce((a, e) => a + Object.keys(e.anims).length, 0)
  console.log(`sprite-map 통과 — 유닛 ${units}종 / 애니메이션 ${anims}개 / 투사체 ${Object.keys(map.projectiles).length - 1}종`)
}
