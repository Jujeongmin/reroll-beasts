// 유닛팩 전수 조사. 폴더별로 프레임 크기와 프레임 수를 뽑는다.
//
//   node tools/survey-packs.mjs
//
// 프레임 폭은 **같은 높이를 가진 시트들 폭의 최대공약수**다.
// 정사각이 아닌 팩이 있어서(medieval-warrior-pack 184x137 등) 높이로 나누면 틀린다.
// 같은 폴더에 투사체(화살·창·화염구)가 섞여 있으면 높이가 달라 따로 묶인다.

import { readdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'
import { pngSize } from './probe-sheets.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ART = join(HERE, '..', 'art-src')

const SKIP = new Set(['dungeon-tileset-ii', 'kenney-ui-pixel-adventure', 'music-loop-bundle'])

const gcd = (a, b) => (b ? gcd(b, a % b) : a)

// GCD 가 실제 프레임 폭의 배수로 나오는 경우의 수기 교정.
// 그 폴더의 프레임 수들이 공약수를 공유하면 GCD 가 과대평가된다.
// 작가 페이지의 프레임 수와 대조해 확정한 값만 적는다.
//
//   medieval-king-pack-2  GCD 320 -> 실제 160
//     작가 페이지: Idle 8f · Run 8f · Attack 4f · Death 6f · Jump/Fall 2f
//     우리 파일 Idle 1280px -> 1280/160 = 8f 로 일치. 320 이면 4f 라 어긋난다.
//
// 대조해서 맞은 것들(교정 불필요):
//   medieval-warrior-pack 184x137 — 페이지 8개 항목 전부 일치
//   wizard-pack 231x190 — 7개 중 6개 일치. Idle 만 페이지가 4f 인데 우리 파일은 6f
//                          (팩이 갱신된 것으로 보인다)
const FRAME_WIDTH_OVERRIDE = {
  'medieval-king-pack-2::Medieval King Pack 2/Sprites': 160,
}

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) await walk(p, out)
    else if (e.name.toLowerCase().endsWith('.png')) out.push(p)
  }
  return out
}

export async function surveyPacks() {
  const packs = (await readdir(ART, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !SKIP.has(e.name))
    .map((e) => e.name)
    .sort()

  const result = []
  for (const pack of packs) {
    const files = (await walk(join(ART, pack))).sort()
    const byDir = new Map()
    for (const f of files) {
      const rel = relative(join(ART, pack), f).split(sep).join('/')
      const cut = rel.lastIndexOf('/')
      const dir = cut === -1 ? '.' : rel.slice(0, cut)
      const name = rel.slice(cut + 1)
      const { width, height } = await pngSize(f)
      if (!byDir.has(dir)) byDir.set(dir, [])
      byDir.get(dir).push({ name, width, height })
    }

    const groups = []
    for (const [dir, list] of byDir) {
      // 높이가 다르면 다른 것이다 (유닛 시트 vs 투사체 vs 프리뷰)
      for (const h of [...new Set(list.map((x) => x.height))]) {
        const sub = list.filter((x) => x.height === h)

        // 프레임 폭 결정. GCD 만 쓰면 **과대평가한다** — 그 폴더의 프레임 수들이
        // 공약수를 공유하면(예: 전부 짝수) GCD 가 실제 프레임 폭의 배수가 된다.
        // monsters-creatures-fantasy 에서 Goblin Idle 이 1프레임으로 나왔던 게 그 경우다
        // (실제 600x150 = 4프레임인데 GCD 가 600 을 뱉었다).
        //
        // 대부분의 팩은 정사각 프레임이다. 폭이 높이로 나누어떨어지면 그걸 쓴다.
        // 안 떨어지는 팩(medieval-warrior-pack 137, medieval-king-pack-2 111,
        // wizard-pack 190)만 GCD 로 추정하고, 종횡비가 2 를 넘으면 의심스럽다고 표시한다.
        const allDivisible = sub.every((x) => x.width % h === 0)
        const override = FRAME_WIDTH_OVERRIDE[`${pack}::${dir}`]
        const frameW = override ?? (allDivisible ? h : sub.map((x) => x.width).reduce(gcd))
        const suspect = !override && !allDivisible && frameW / h > 2

        groups.push({
          dir,
          frameW,
          frameH: h,
          square: allDivisible,
          suspect,
          files: sub.map((x) => ({ name: x.name, frames: x.width / frameW })),
        })
      }
    }
    result.push({ pack, groups })
  }
  return result
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
  for (const { pack, groups } of await surveyPacks()) {
    console.log(`\n### ${pack}`)
    for (const g of groups) {
      const how = g.square ? '정사각' : g.suspect ? 'GCD 추정 ⚠ 종횡비 이상' : 'GCD 추정'
      console.log(`  [${g.dir}]  프레임 ${g.frameW}x${g.frameH}  (${how})`)
      for (const f of g.files) {
        console.log(`      ${f.name.padEnd(36)} ${String(f.frames).padStart(3)}f`)
      }
    }
  }
}
