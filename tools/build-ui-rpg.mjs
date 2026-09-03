// 새 UI 팩에서 **홈이 실제로 쓰는 것만** 뽑는다.
//
// 팩을 통째로 game/public 으로 복사하지 않는 이유: 안 쓰는 파일이 배포에
// 쌓이면 나중에 어느 것이 살아 있는지 아무도 모른다. 쓰는 순간 여기에 줄을
// 추가한다 (87장 중 지금 쓰는 건 넷).
import { mkdir, copyFile, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'

const SRC = resolve(import.meta.dirname, '../art-src/kenney-ui-pack-rpg-expansion/PNG')
const BG_SRC = resolve(import.meta.dirname, '../art-src/home-bg')
const OUT = resolve(import.meta.dirname, '../game/public/assets/ui')
const BG_OUT = resolve(import.meta.dirname, '../game/public/assets/home')

const JOBS = [
  ['panel_brown.png', 'lobby_panel.png'],
  // 갈색 패널 위의 갈색 버튼은 글자가 안 읽힌다. 밝은 베이지를 써서 판과
  // 버튼을 명도로 가른다 — 색조만 다르면 작은 글씨에서 구분이 안 된다.
  ['buttonLong_beige.png', 'lobby_btn.png'],
  ['buttonLong_beige_pressed.png', 'lobby_btn_down.png'],
  // 전적 칸. 안으로 파인 판이라 "읽는 것"과 "누르는 것"이 눈에 갈린다.
  ['panelInset_brown.png', 'lobby_inset.png'],
]

async function copyAll(jobs, src, out) {
  await mkdir(out, { recursive: true })
  for (const [from, to] of jobs) {
    try {
      await mkdir(dirname(resolve(out, to)), { recursive: true })
      await copyFile(resolve(src, from), resolve(out, to))
    } catch {
      // 조용히 넘어가면 홈이 그림 없이 떠서 "CSS 가 틀렸나" 를 한참 뒤진다 —
      // 여기서 있는 이름을 보여 주고 멈춘다.
      const have = await readdir(src).catch(() => [])
      console.error(`없는 파일: ${from}\n있는 것: ${have.slice(0, 40).join(', ')}`)
      process.exit(1)
    }
    console.log(`${from} → ${to}`)
  }
}

await copyAll(JOBS, SRC, OUT)

// 홈 배경 한 장. 원본 PNG 는 1.6MB 인데 WebP 로 구우면 51KB 다 — 노을·안개가
// 그라디언트뿐이라 PNG 의 무손실 압축이 거의 안 먹는다. 화면에서 쓰는 폭은
// 최대 1040 이므로 1624 로 줄여도 2배 화면까지 충분하다.
await mkdir(BG_OUT, { recursive: true })
try {
  const { default: sharp } = await import('sharp')
  await sharp(resolve(BG_SRC, 'bg_scene.png'))
    .resize(1624, null, { withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(resolve(BG_OUT, 'bg_scene.webp'))
  console.log('bg_scene.png → bg_scene.webp')
} catch (err) {
  console.error(`홈 배경을 못 구웠다: ${err.message}`)
  process.exit(1)
}

// 아바타 모델은 tools/build-avatars.mjs 가 따로 굽는다 — 몬스터와 다른 팩이고
// 굽는 방식(meshopt)도 달라서 여기 섞으면 둘 다 읽기 어려워진다.
