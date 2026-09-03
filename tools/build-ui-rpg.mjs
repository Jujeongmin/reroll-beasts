// 새 UI 팩에서 **홈이 실제로 쓰는 것만** 뽑는다.
//
// 팩을 통째로 game/public 으로 복사하지 않는 이유: 안 쓰는 파일이 배포에
// 쌓이면 나중에 어느 것이 살아 있는지 아무도 모른다. 쓰는 순간 여기에 줄을
// 추가한다 (87장 중 지금 쓰는 건 넷).
import { mkdir, copyFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const SRC = resolve(import.meta.dirname, '../art-src/kenney-ui-pack-rpg-expansion/PNG')
const OUT = resolve(import.meta.dirname, '../game/public/assets/ui')

const JOBS = [
  ['panel_brown.png', 'lobby_panel.png'],
  ['buttonLong_brown.png', 'lobby_btn.png'],
  ['buttonLong_brown_pressed.png', 'lobby_btn_down.png'],
  // 전적 칸. 안으로 파인 판이라 "읽는 것"과 "누르는 것"이 눈에 갈린다.
  ['panelInset_brown.png', 'lobby_inset.png'],
]

await mkdir(OUT, { recursive: true })
for (const [from, to] of JOBS) {
  try {
    await copyFile(resolve(SRC, from), resolve(OUT, to))
  } catch {
    // 조용히 넘어가면 홈이 프레임 없이 떠서 "CSS 가 틀렸나" 를 한참 뒤진다 —
    // 여기서 있는 이름을 보여 주고 멈춘다.
    const have = await readdir(SRC).catch(() => [])
    console.error(`없는 파일: ${from}\n있는 것: ${have.slice(0, 40).join(', ')}`)
    process.exit(1)
  }
  console.log(`${from} → ${to}`)
}
