// model-map.json 을 실제 glTF 파일과 대조한다.
//
//   node tools/verify-model-map.mjs
//
// 손으로 쓴 표라 손으로 틀렸을 수 있고, 팩이 갱신되면 조용히 깨진다.
// 세 가지를 실측과 대조한다:
//   1. glTF 파일이 실제로 있는가 (기본형·진화형 둘 다)
//   2. 그 파일이 계열 매핑이 요구하는 애니 5종을 실제로 갖고 있는가
//   3. units.json 의 26종이 표에 빠짐없이 있고, 반대도 성립하는가

import { readFile, access } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const ART = join(ROOT, 'art-src')

const NEEDED = ['idle', 'run', 'attack', 'hit', 'death']

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

function gltfPath(map, family, file) {
  return join(ART, map.pack, map.root, family, 'glTF', `${file}.gltf`)
}

export async function verifyModelMap() {
  const map = JSON.parse(await readFile(join(HERE, 'model-map.json'), 'utf8'))
  const units = JSON.parse(await readFile(join(ROOT, 'game', 'public', 'data', 'units.json'), 'utf8'))
  const errors = []

  // units.json 과 표가 같은 집합인가 (units.json 은 model 필드로 가리킨다)
  const wanted = units.units.map((u) => u.model).sort()
  const have = Object.keys(map.models).sort()
  for (const m of wanted) if (!have.includes(m)) errors.push(`units.json 이 가리키는 model "${m}" 이 model-map 에 없다`)
  for (const m of have) if (!wanted.includes(m)) errors.push(`model-map 의 "${m}" 을 units.json 이 안 쓴다`)

  // units.json 의 evolved 플래그와 표의 evolved 항목이 일치하는가
  for (const u of units.units) {
    const e = map.models[u.model]
    if (!e) continue
    if (Boolean(u.evolved) !== Boolean(e.evolved)) {
      errors.push(`${u.id}: units.json evolved=${Boolean(u.evolved)} 인데 model-map evolved=${Boolean(e.evolved)}`)
    }
  }

  for (const [id, entry] of Object.entries(map.models)) {
    const wantAnims = map.animsByFamily[entry.family]
    if (!wantAnims) {
      errors.push(`${id}: 알 수 없는 계열 "${entry.family}"`)
      continue
    }

    for (const [label, file] of [['기본', entry.file], ...(entry.evolved ? [['진화', entry.evolved]] : [])]) {
      const path = gltfPath(map, entry.family, file)
      if (!(await exists(path))) {
        errors.push(`${id} ${label}: 파일 없음 — ${entry.family}/glTF/${file}.gltf`)
        continue
      }
      const gltf = JSON.parse(await readFile(path, 'utf8'))
      const names = new Set((gltf.animations ?? []).map((a) => a.name))
      for (const key of NEEDED) {
        const anim = wantAnims[key]
        if (!names.has(anim)) {
          errors.push(`${id} ${label}: "${anim}" 애니가 없다 (${key}). 보유: ${[...names].join(',') || '없음'}`)
        }
      }
    }
  }

  return errors
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
  const errors = await verifyModelMap()
  if (errors.length > 0) {
    console.error(`model-map 불일치 ${errors.length} 건:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  const map = JSON.parse(await readFile(join(HERE, 'model-map.json'), 'utf8'))
  const n = Object.keys(map.models).length
  const evo = Object.values(map.models).filter((m) => m.evolved).length
  console.log(`model-map 통과 — 유닛 ${n}종 / 진화 모델 ${evo}종 / 애니 ${NEEDED.length}종씩 확인`)
}
