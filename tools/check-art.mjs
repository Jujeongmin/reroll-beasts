// 에셋 다운로드 진행 확인.
// art-src/ 에 어떤 팩이 들어왔고 뭐가 남았는지, 라이선스 원문이 보관됐는지 본다.
//
//   node tools/check-art.mjs
//
// 팩 zip 내부 구조는 팩마다 다르므로 파일명은 검사하지 않는다 —
// 폴더 존재와 PNG 개수만 본다. 실제 시트 구조는 받은 뒤에 눈으로 확인하고
// 그때 가공 도구를 짠다.

import { readdir, stat, access } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const ART = join(ROOT, 'art-src')
const LICENSES = join(ROOT, 'licenses')

// 폴더명 → 그 팩이 담고 있는 유닛 id. docs/에셋_다운로드.md 와 같은 표다.
export const PACKS = [
  ['medieval-warrior-pack', ['medieval_warrior_1']],
  ['medieval-warrior-pack-2', ['medieval_warrior_2']],
  ['medieval-warrior-pack-3', ['medieval_warrior_3']],
  ['hero-knight', ['hero_knight_1']],
  ['hero-knight-2', ['hero_knight_2']],
  ['martial-hero', ['martial_hero_1']],
  ['martial-hero-2', ['martial_hero_2']],
  ['martial-hero-3', ['martial_hero_3']],
  ['huntress', ['huntress_1']],
  ['huntress-2', ['huntress_2']],
  ['wizard-pack', ['wizard_pack']],
  ['evil-wizard', ['evil_wizard_1']],
  ['evil-wizard-2', ['evil_wizard_2']],
  ['evil-wizard-3', ['evil_wizard_3']],
  ['fantasy-warrior', ['fantasy_warrior']],
  ['medieval-king-pack', ['medieval_king_1']],
  ['medieval-king-pack-2', ['medieval_king_2']],
  ['monsters-creatures-fantasy', ['skeleton', 'goblin', 'mushroom', 'flying_eye']],
  ['monsters-creatures-fantasy-2', ['mimic', 'rat', 'slime', 'bat']],
  ['fire-worm', ['fire_worm']],
]

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// zip 을 어떻게 풀었든 찾도록 재귀로 센다.
async function countPngs(dir) {
  let n = 0
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) n += await countPngs(p)
    else if (e.name.toLowerCase().endsWith('.png')) n++
  }
  return n
}

export async function checkArt() {
  const rows = []
  for (const [folder, units] of PACKS) {
    const dir = join(ART, folder)
    const present = await exists(dir)
    rows.push({
      folder,
      units,
      present,
      pngs: present ? await countPngs(dir) : 0,
      license: await exists(join(LICENSES, `${folder}.txt`)),
    })
  }
  return rows
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
  const rows = await checkArt()
  const done = rows.filter((r) => r.present && r.pngs > 0)
  const missing = rows.filter((r) => !r.present || r.pngs === 0)
  const noLicense = rows.filter((r) => r.present && r.pngs > 0 && !r.license)

  const totalUnits = PACKS.reduce((a, [, u]) => a + u.length, 0)
  const haveUnits = done.reduce((a, r) => a + r.units.length, 0)

  console.log(`받은 팩  ${done.length}/${PACKS.length}   유닛 ${haveUnits}/${totalUnits}`)
  console.log('')

  if (done.length > 0) {
    console.log('받음:')
    for (const r of done) {
      const lic = r.license ? '' : '   ⚠ 라이선스 원문 없음'
      console.log(`  ${r.folder.padEnd(30)} PNG ${String(r.pngs).padStart(3)}${lic}`)
    }
    console.log('')
  }

  if (missing.length > 0) {
    console.log('남음:')
    for (const r of missing) {
      const why = r.present ? '(폴더는 있는데 PNG 가 없다)' : ''
      console.log(`  ${r.folder.padEnd(30)} https://luizmelo.itch.io/${r.folder} ${why}`)
    }
    console.log('')
  }

  if (noLicense.length > 0) {
    console.log(`라이선스 원문 누락 ${noLicense.length} 건 — licenses/<폴더명>.txt 로 저장할 것`)
    console.log('docs/에셋_다운로드.md 의 문구를 그대로 쓰면 된다.')
    console.log('')
  }

  if (missing.length === 0 && noLicense.length === 0) {
    console.log('전부 갖춰졌다. 다음은 시트 구조 확인 → 가공 도구 작성이다.')
  }
}
