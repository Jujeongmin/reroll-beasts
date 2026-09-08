// 화면이 저절로 꺼지지 않게 붙잡는다.
//
// **손가락 기기가 문제다.** 배치 30초는 말을 고르느라 화면만 보고, 전투는
// 아예 만질 것이 없다. 그동안 화면 잠금 시간이 차면 판 한가운데서 화면이
// 꺼지고, 다시 켜는 사이에 라운드가 넘어간다.
//
// Screen Wake Lock 은 **탭이 숨으면 시스템이 알아서 놓는다.** 그러니 한 번
// 잡고 끝내면 알트탭 한 번에 영영 풀린다 — 돌아올 때마다 다시 잡아야 한다.
// 그래서 이 파일은 "잡아 두기"가 아니라 "계속 잡으려 하기"를 한다.

/** 지금 쥐고 있는 것. 없으면 null. */
let held = null
/** 이미 켰나. 두 번 켜도 리스너가 두 벌 붙지 않게. */
let on = false

/**
 * 붙잡기를 시도한다. 실패는 조용히 넘긴다.
 *
 * 실패하는 길이 여럿이고 전부 정상이다 — API 가 없는 브라우저(사파리 16.4
 * 아래, 일부 데스크톱), 탭이 안 보일 때, 사용자가 막아 둔 경우. 어느 쪽이든
 * 게임은 그대로 돌아야 한다. 화면이 꺼지는 것은 불편이지 고장이 아니다.
 */
async function grab() {
  if (held || document.hidden) return
  try {
    held = await navigator.wakeLock.request('screen')
    // 시스템이 놓으면(탭이 숨거나 배터리가 급할 때) 우리도 손을 턴다 —
    // 안 그러면 이미 없는 것을 쥔 줄 알고 다시 안 잡는다.
    held.addEventListener('release', () => {
      held = null
    })
  } catch {
    held = null
  }
}

/**
 * 화면 잠금 막기를 켠다. 한 번만 부르면 된다.
 *
 * 첫 손짓을 기다리는 이유: 브라우저에 따라 사용자가 한 번 만지기 전에는
 * 거절한다(소리를 푸는 규칙과 같은 결이다). 그 한 번을 놓쳐도 탭이 다시
 * 보일 때 또 시도하므로, 늦어도 곧 걸린다.
 */
export function keepAwake() {
  if (on) return
  if (!globalThis.navigator?.wakeLock) return
  on = true
  // 돌아올 때마다 다시 잡는다. 시스템이 숨은 탭의 것을 놓기 때문이다.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) grab()
  })
  addEventListener('pointerdown', grab, { once: true })
  addEventListener('keydown', grab, { once: true })
  // 이미 만진 뒤에 불렸을 수도 있다 — 한 번은 그냥 시도해 본다.
  grab()
}

/** 검사용. 지금 붙잡고 있나. */
export function awake() {
  return held !== null
}
