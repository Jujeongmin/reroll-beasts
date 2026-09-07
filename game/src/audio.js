// 소리. **한 곳에서만 소리를 낸다.**
//
// 화면마다 `new Audio()` 를 하면 볼륨 설정이 닿지 않는 소리가 하나씩 생기고,
// 그 하나가 "소리를 껐는데 아직 뭔가 난다" 로 돌아온다. 그래서 파일 이름을
// 아는 곳은 여기뿐이고, 바깥은 `sfx('hit')` 처럼 **무슨 일이 났는지만** 말한다.
//
// 세 가지가 이 파일의 전부다:
//   1. 첫 손짓 전에는 아무 소리도 못 낸다(브라우저 규칙) — 그때까지 미뤄 둔다
//   2. 같은 소리가 겹칠 수 있다 — 이름마다 몇 개를 돌려 쓴다
//   3. 볼륨은 설정에서 매번 새로 읽는다 — 슬라이더를 끄는 동안 바로 들린다
//
// 형식은 ogg 다. 사파리 구버전은 ogg 를 못 읽는데, 그 기기에서는 **소리만
// 안 나고 게임은 돈다** — 재생 실패를 전부 삼킨다. 소리 때문에 판이 멈추는
// 것이 소리가 없는 것보다 나쁘다.

import { sfxVolume, bgmVolume } from './settings.js'

const DIR = 'assets/audio/'

/**
 * 효과음 표. 값은 [파일, 이 소리의 기본 크기, 최소 간격ms].
 *
 * 기본 크기가 소리마다 다른 이유: 원본 팩이 서로 다른 음량으로 녹음돼 있어
 * 같은 값으로 틀면 타격음만 유독 크게 들린다. 여기 숫자는 귀로 맞춘 값이다.
 *
 * 최소 간격은 **겹쳐서 시끄러워지는 소리에만** 준다. 전투 한 판에 공격이
 * 수백 번 나는데 전부 틀면 소리가 뭉개져서 벽이 된다 — 그중 일부만 들려도
 * "치고받는 중"은 그대로 전해진다.
 */
const SFX = {
  click: ['ui_click.ogg', 0.8, 40],
  open: ['ui_open.ogg', 0.75, 0],
  buy: ['ui_buy.ogg', 0.7, 0],
  error: ['ui_error.ogg', 0.6, 120],
  drop: ['ui_drop.ogg', 0.6, 60],
  merge: ['merge.ogg', 0.9, 0],
  hit: ['hit.ogg', 0.35, 70],
  death: ['death.ogg', 0.5, 90],
  boom: ['boom.ogg', 0.85, 0],
  win: ['win.ogg', 0.9, 0],
  lose: ['lose.ogg', 0.8, 0],
}

/**
 * 배경음 표. 이름은 화면 이름이고, `mix` 는 그 화면에서의 몫이다.
 *
 * 몫이 필요한 이유: 배경음 슬라이더는 하나인데 두 화면이 원하는 크기가 다르다.
 * 홈은 들려야 하고, 판 안은 **거의 안 들리다시피** 깔려야 한다 — 판 안에서
 * 곡이 또렷하면 타격음과 승급음이 그 위에 묻힌다.
 *
 * 곡이 여럿이면 들어올 때마다 하나 뽑는다.
 */
const BGM = {
  home: { mix: 0.85, files: ['bgm_home.ogg'] },
  battle: { mix: 0.5, files: ['bgm_battle_a.ogg', 'bgm_battle_b.ogg', 'bgm_battle_c.ogg'] },
}

// 첫 손짓 전에는 브라우저가 재생을 막는다. 막힌 채로 계속 시도하면 콘솔이
// 경고로 가득 차므로, 손짓이 올 때까지 아예 안 튼다.
let unlocked = false
// 손짓을 기다리는 동안 걸어 둔 배경음. 홈이 뜨자마자 켜라고 하는데 그때는
// 아직 아무도 화면을 안 짚은 상태다 — 이름만 적어 두고 손짓이 오면 켠다.
let pending = null

/** 이름 → 돌려 쓸 오디오 몇 개. @type {Map<string, {pool: HTMLAudioElement[], i: number, last: number}>} */
const pools = new Map()

const POOL = 3

function poolFor(name) {
  let p = pools.get(name)
  if (p) return p
  const [file] = SFX[name]
  p = {
    pool: Array.from({ length: POOL }, () => {
      const a = new Audio(DIR + file)
      a.preload = 'auto'
      return a
    }),
    i: 0,
    last: 0,
  }
  pools.set(name, p)
  return p
}

/**
 * 효과음 한 번.
 *
 * 이름이 표에 없으면 조용히 넘긴다 — 오타 하나로 판이 멈추면 안 된다.
 * (표에 없는 이름을 쓰는 실수는 검사기가 잡는다.)
 *
 * @param {keyof SFX} name
 * @param {{gain?: number}} [o] gain 1 이 표의 기본 크기. 0.5 면 그 절반
 */
export function sfx(name, { gain = 1 } = {}) {
  if (!unlocked) return
  const row = SFX[name]
  if (!row) return
  const vol = sfxVolume() / 100
  if (vol <= 0) return

  const p = poolFor(name)
  const now = performance.now()
  // 너무 촘촘하면 건너뛴다. 겹쳐 틀어도 소리가 커지기만 하고 사건이 더 잘
  // 보이지는 않는다.
  if (row[2] && now - p.last < row[2]) return
  p.last = now

  const a = p.pool[p.i]
  p.i = (p.i + 1) % POOL
  a.volume = Math.max(0, Math.min(1, vol * row[1] * gain))
  try {
    a.currentTime = 0
    a.play()?.catch(() => {})
  } catch {
    // 이 기기가 ogg 를 못 읽거나 아직 안 받았다. 이번 소리만 없다.
  }
}

// ── 배경음 ────────────────────────────────────────────────
//
// 한 곡짜리 요소를 두 개 둔다: 지금 나는 것과 넘어가는 것. 한 개로 돌려
// 쓰면 곡을 바꿀 때 소리가 뚝 끊겨서, 전투로 들어가는 순간이 "장면이 바뀐다"
// 가 아니라 "뭔가 잘못됐다" 로 들린다.

/** @type {{name: string, el: HTMLAudioElement, mix: number} | null} */
let cur = null
let fading = null
// 전투가 도는 동안에는 곡을 **멈춰 둔다**(끄는 게 아니다). 자리를 기억해야
// 배치로 돌아왔을 때 곡이 이어지고, 매 라운드 도입부만 반복하지 않는다.
let held = false

const FADE_MS = 500
// 멈추고 살아나는 건 더 빨라야 한다 — 전투가 시작될 때 반 초를 끄는 데
// 쓰면 첫 타격음 위로 곡이 겹친다.
const HOLD_MS = 260

function fade(el, to, ms, done) {
  const from = el.volume
  const t0 = performance.now()
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms)
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k))
    if (k < 1) requestAnimationFrame(step)
    else done?.()
  }
  step()
}

/** 지금 곡이 향해야 할 크기. 설정 값에 그 곡의 몫을 곱한다. */
const target = () => Math.max(0, Math.min(1, (bgmVolume() / 100) * (cur?.mix ?? 1)))

function startBgm(name) {
  const row = BGM[name]
  if (!row) return
  // 여러 곡이면 **들어올 때마다 하나 뽑는다.** 판마다 같은 곡이면 세 판째에는
  // 배경음이 아니라 알람으로 들린다.
  const file = row.files[Math.floor(Math.random() * row.files.length)]
  const el = new Audio(DIR + file)
  el.loop = true
  el.preload = 'auto'
  el.volume = 0
  try {
    el.play()?.catch(() => {})
  } catch {
    return
  }
  cur = { name, el, mix: row.mix }
  // 멈춰 둔 채로 다음 곡이 걸리는 경우가 있다(전투 중에 판을 나간다).
  // 그때는 소리를 안 올린다 — 살아나는 건 bgmResume 이 한다.
  if (!held) fade(el, target(), FADE_MS)
}

/**
 * 배경음을 이 곡으로 바꾼다. 같은 곡이면 아무것도 안 한다 — 홈으로 돌아올
 * 때마다 처음부터 다시 틀면 곡이 영영 도입부만 반복한다.
 *
 * @param {keyof BGM | null} name null 이면 끈다
 */
export function bgm(name) {
  if (!unlocked) {
    pending = name
    return
  }
  if (cur?.name === name) return

  const old = cur
  cur = null
  if (old) {
    // 넘어가는 중에 또 바뀔 수 있다. 앞엣것은 그 자리에서 끊는다 — 셋이
    // 겹쳐 나는 것보다 하나가 조금 거칠게 끊기는 편이 낫다.
    fading?.pause()
    fading = old.el
    fade(old.el, 0, FADE_MS, () => {
      old.el.pause()
      if (fading === old.el) fading = null
    })
  }
  if (name) startBgm(name)
}

/**
 * 곡을 잠깐 멈춘다. 전투가 도는 동안 쓴다.
 *
 * 끄지 않고 멈추는 이유: 전투는 한 판에 여러 번 돌고, 그때마다 곡을 다시
 * 틀면 도입부만 계속 듣게 된다. 자리를 그대로 두고 소리만 내린다.
 */
export function bgmHold() {
  held = true
  if (!cur) return
  const el = cur.el
  fade(el, 0, HOLD_MS, () => {
    // 멈추는 사이에 곡이 갈렸으면 남의 것을 세우지 않는다.
    if (held && cur?.el === el) el.pause()
  })
}

/** 멈춰 둔 곡을 되살린다. 배치로 돌아올 때 쓴다. */
export function bgmRelease() {
  held = false
  if (!cur) return
  try {
    cur.el.play()?.catch(() => {})
  } catch {
    return
  }
  fade(cur.el, target(), FADE_MS)
}

/** 설정에서 볼륨을 움직였다. 지금 나는 곡에 바로 먹인다. */
export function refreshVolumes() {
  // 멈춰 둔 곡은 0 이어야 한다 — 여기서 올리면 전투 중에 슬라이더를 만진
  // 순간 곡이 되살아난다.
  if (cur && !held) cur.el.volume = target()
}


/**
 * 첫 손짓을 기다린다. 부팅 때 한 번 부른다.
 *
 * `pointerdown` 과 `keydown` 둘 다 본다 — 키보드만 쓰는 사람에게도 소리가
 * 나야 한다.
 */
export function initAudio() {
  if (unlocked) return
  const go = () => {
    if (unlocked) return
    unlocked = true
    removeEventListener('pointerdown', go)
    removeEventListener('keydown', go)
    if (pending) {
      const name = pending
      pending = null
      bgm(name)
    }
  }
  addEventListener('pointerdown', go)
  addEventListener('keydown', go)
}

// ── 검사기가 읽는 것 ─────────────────────────────────────
//
// 표를 밖으로 내보내는 이유: 검사기가 소스를 정규식으로 뜯으면, 표 모양을
// 조금만 바꿔도 조용히 빈 표를 들고 통과한다. 불러가면 그런 여지가 없다.

/** 화면이 부르는 이름이 표에 다 있는지 볼 때 쓴다. */
export const SFX_NAMES = Object.keys(SFX)
export const BGM_NAMES = Object.keys(BGM)
/** 표가 가리키는 파일이 실제로 있는지 볼 때 쓴다. */
export const AUDIO_FILES = [
  ...Object.values(SFX).map((r) => r[0]),
  ...Object.values(BGM).flatMap((r) => r.files),
]

/**
 * 지금 무슨 곡이 얼마 크기로 나고 있나. 브라우저에서 눈으로 못 보는 것을
 * 확인하려고 둔다 — 소리는 화면에 안 나와서, 이게 없으면 "볼륨이 진짜
 * 먹었나"를 귀 말고는 확인할 길이 없다.
 */
export const bgmState = () =>
  cur
    ? {
        name: cur.name,
        file: cur.el.src.split('/').pop(),
        volume: Math.round(cur.el.volume * 100) / 100,
        held,
        paused: cur.el.paused,
      }
    : { name: null, held }
