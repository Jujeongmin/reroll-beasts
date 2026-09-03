// 새 UI 팩에서 **홈이 실제로 쓰는 것만** 뽑는다.
//
// 팩을 통째로 game/public 으로 복사하지 않는 이유: 안 쓰는 파일이 배포에
// 쌓이면 나중에 어느 것이 살아 있는지 아무도 모른다. 쓰는 순간 여기에 줄을
// 추가한다 (87장 중 지금 쓰는 건 넷).
import { mkdir, copyFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const SRC = resolve(import.meta.dirname, '../art-src/kenney-ui-pack-rpg-expansion/PNG')
const BG_SRC = resolve(import.meta.dirname, '../art-src/kenney-background-elements/PNG')
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

// 홈 배경 조각. 평면 컬러 그림이라 그대로 쓰면 밤 하늘과 안 맞는다 —
// CSS 에서 실루엣으로 눌러 능선 위 스카이라인으로 쓴다. 달만 그대로.
const BG_JOBS = [
  ['castle_grey.png', 'bg_castle.png'],
  ['tower_grey.png', 'bg_tower.png'],
  ['tree22.png', 'bg_tree_tall.png'],
  ['tree05.png', 'bg_tree.png'],
  ['moon_full.png', 'bg_moon.png'],
  ['cloud3.png', 'bg_cloud.png'],
]

async function copyAll(jobs, src, out) {
  await mkdir(out, { recursive: true })
  for (const [from, to] of jobs) {
    try {
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
await copyAll(BG_JOBS, BG_SRC, BG_OUT)
