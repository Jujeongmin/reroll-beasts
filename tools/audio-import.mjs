// 소리 반입. art-src 의 팩에서 **쓰는 것만** 골라 game/public/assets/audio 로 옮긴다.
//
// 팩 전체를 복사하지 않는 이유는 UI 팩과 같다: 130개 중 쓰는 것은 열 개 남짓이고,
// 나머지는 저장소만 무겁게 한다. 여기 표가 "무엇을 어디에 쓰는가" 의 단일소스다.
//
// **ogg 그대로 둔다.** 이 저장소에는 변환기(ffmpeg)가 없고, 원본이 전부 ogg 다.
// 오래된 사파리는 ogg 를 못 읽는다 — 그 기기에서는 소리가 안 날 뿐 게임은 돈다
// (game/src/audio.js 가 재생 실패를 삼킨다).
//
// 실행: node tools/audio-import.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'art-src')
const OUT = join(ROOT, 'game', 'public', 'assets', 'audio')

// 원본 → 게임이 쓰는 이름. 오른쪽 이름은 game/src/audio.js 의 SFX 표와
// **글자 그대로** 같아야 한다.
const MAP = [
  // ── 조작음 (Kenney Interface Sounds, CC0) ──
  ['kenney_interface-sounds/Audio/click_001.ogg', 'ui_click.ogg'],
  ['kenney_interface-sounds/Audio/open_001.ogg', 'ui_open.ogg'],
  ['kenney_interface-sounds/Audio/confirmation_001.ogg', 'ui_buy.ogg'],
  ['kenney_interface-sounds/Audio/error_003.ogg', 'ui_error.ogg'],
  ['kenney_interface-sounds/Audio/drop_002.ogg', 'ui_drop.ogg'],
  ['kenney_interface-sounds/Audio/bong_001.ogg', 'merge.ogg'],
  // ── 전투음 (Kenney Impact Sounds, CC0) ──
  ['kenney_impact-sounds/Audio/impactPunch_medium_000.ogg', 'hit.ogg'],
  ['kenney_impact-sounds/Audio/impactSoft_heavy_000.ogg', 'death.ogg'],
  ['kenney_impact-sounds/Audio/impactMetal_light_000.ogg', 'boom.ogg'],
  // ── 짧은 곡 (Kenney Music Jingles, CC0) ──
  ['kenney_music-jingles/Audio/Steel jingles/jingles_STEEL00.ogg', 'win.ogg'],
  ['kenney_music-jingles/Audio/Steel jingles/jingles_STEEL08.ogg', 'lose.ogg'],
  // ── 배경음 (Abstraction Music Loop Bundle, CC0) ──
  // 두 개만 쓴다. 하나가 2MB 라 여러 개를 넣으면 첫 화면이 그만큼 늦어진다 —
  // 배경음은 필요할 때 받는다(audio.js 가 늦게 부른다).
  ['music-loop-bundle/Week 16 - Vacation Day CHILLOUT.ogg', 'bgm_home.ogg'],
  ['music-loop-bundle/Week 17 - Alley Cat DUMPSTER PARTY.ogg', 'bgm_battle.ogg'],
]

await mkdir(OUT, { recursive: true })

let total = 0
for (const [from, to] of MAP) {
  const src = join(SRC, from)
  if (!existsSync(src)) {
    console.warn(`건너뜀: ${from} 이 art-src 에 없다`)
    continue
  }
  const buf = await readFile(src)
  await writeFile(join(OUT, to), buf)
  total += buf.length
  console.log(`${to.padEnd(16)} ${(buf.length / 1024).toFixed(0)}KB`)
}
console.log(`합계 ${(total / 1024 / 1024).toFixed(1)}MB`)
