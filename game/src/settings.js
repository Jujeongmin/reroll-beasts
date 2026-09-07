// 설정 창. **홈과 인게임이 같은 창을 연다.**
//
// 두 벌로 만들면 항목 하나 늘 때마다 두 군데를 고치고, 그러다 한쪽만 고친
// 상태가 남는다 — 인게임에서만 소리가 안 꺼지는 식의 어긋남이 그렇게 생긴다.
// 다른 점은 하나뿐이다: 인게임에서는 항복 줄이 보인다.
//
// 설정은 **기기에 저장한다.** 계정에 두면 값 하나 바꿀 때마다 서버 왕복이
// 필요하고, 볼륨·움직임은 기기마다 달라도 되는 값이다(폰에서는 소리를 끄고
// PC 에서는 켠다).

import { t, lang, setLang } from './i18n.js'

const MOTION_KEY = 'rr.motion'
const SFX_KEY = 'rr.sfx'
const BGM_KEY = 'rr.bgm'

/** 초기화가 지우는 기기 저장 전부. 한 곳에 모아 둔다 — 흩어 두면 하나가 남는다. */
export const LOCAL_KEYS = [
  'rr.avatar',
  'rr.board',
  'rr.boom',
  'rr.tutorial.done',
  'rr.name.ask',
  MOTION_KEY,
  SFX_KEY,
  BGM_KEY,
]

/**
 * 움직임을 줄일까.
 *
 * 저장된 값이 없으면 **기기 설정을 따른다** — `prefers-reduced-motion` 으로
 * 이미 답한 질문을 게임이 다시 묻지 않는다. 저장된 값이 있으면 그게 이긴다:
 * 이 게임에서만 다르게 하고 싶을 수 있다.
 */
export function reduceMotion() {
  try {
    const saved = localStorage.getItem(MOTION_KEY)
    if (saved === 'reduced') return true
    if (saved === 'full') return false
  } catch {
    // 저장소를 못 읽는 브라우저가 있다. 그때는 기기 설정만 본다.
  }
  return matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
   볼륨 0~100. 저장된 값이 없으면 효과음은 크게, 배경음은 작게 시작한다 —
   배경음이 처음부터 크면 대부분 그 자리에서 소리를 통째로 꺼 버린다.

   **소리를 내는 코드는 아직 없다**(다음 조각). 값을 지금부터 저장해 두는
   이유: 오디오가 붙는 날 설정 창을 다시 고치지 않아도 되고, 그때 이미 자기
   값을 가진 사람은 손대지 않아도 자기 소리로 시작한다.
*/
function volume(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw != null) {
      const n = Number(raw)
      if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)))
    }
  } catch {
    // 저장소를 못 읽는 브라우저가 있다. 기본값으로 간다.
  }
  return fallback
}

export const sfxVolume = () => volume(SFX_KEY, 80)
export const bgmVolume = () => volume(BGM_KEY, 45)

function setVolume(key, v) {
  try {
    localStorage.setItem(key, String(Math.max(0, Math.min(100, Math.round(v)))))
  } catch {
    // 못 적어도 이번 판에는 적용된다.
  }
}

function setReduceMotion(on) {
  try {
    localStorage.setItem(MOTION_KEY, on ? 'reduced' : 'full')
  } catch {
    // 못 적어도 이번 판에는 적용된다. 다음에 켜면 기기 설정으로 돌아간다.
  }
}

/**
 * @param {object} o
 * @param {() => string} o.account        지갑 주소. 문의할 때 서로 누군지 짚는 값이다
 * @param {() => Promise<any>} o.onSurrender  인게임에서 항복을 눌렀다
 * @param {() => Promise<any>} o.onReset      계정을 지운다
 */
export function createSettings({ account, onSurrender, onReset, onLang }) {
  const el = {
    root: document.getElementById('settings'),
    body: document.getElementById('settings-body'),
    close: document.getElementById('settings-close'),
  }

  let inGame = false
  // 확인 중인 위험한 행동. 'surrender' | 'reset' | null — 한 번에 하나만
  // 열어 둔다. 둘 다 열려 있으면 어느 것을 누르는지 헷갈린다.
  let asking = null

  const closeSheet = () => {
    el.root.classList.add('closing')
    setTimeout(() => {
      el.root.hidden = true
      el.root.classList.remove('closing')
    }, 200)
  }

  el.close.addEventListener('click', closeSheet)
  el.root.addEventListener('click', (ev) => {
    // 바깥을 짚으면 닫는다. 안쪽 클릭은 그대로 둔다.
    if (ev.target === el.root) closeSheet()
  })

  /**
   * 한 줄. 이름 왼쪽, 손잡이 오른쪽.
   *
   * 설명은 **위험한 줄에만** 붙인다. 모든 줄에 한 마디씩 달면 여섯 줄짜리
   * 창이 글로 꽉 차서, 정작 손잡이가 어디 있는지 눈이 한 번 더 찾아야 한다.
   */
  const row = (name, control, note = '') =>
    `<div class="row"><div class="t"><b>${name}</b>${note ? `<span>${note}</span>` : ''}</div>` +
    `<div class="c">${control}</div></div>`

  /** 볼륨 손잡이. 값이 숫자로도 보여야 "지금 얼마"인지 눈이 안 헤맨다. */
  const slider = (act, v) =>
    `<input class="vol" type="range" min="0" max="100" step="5" value="${v}" data-act="${act}" />` +
    `<span class="num">${v}</span>`

  function draw() {
    const motion = reduceMotion()
    const tail = String(account?.() ?? '').slice(-4)
    const cancel = `<button class="ghost" data-act="cancel" type="button">${t('settings.cancel')}</button>`
    el.body.innerHTML =
      row(t('settings.sfx'), slider('sfx', sfxVolume())) +
      row(t('settings.bgm'), slider('bgm', bgmVolume())) +
      // 둘 중 하나를 고르는 손잡이. 토글(켜고 끄기)과 모양이 달라야 무엇을
      // 하는 손잡이인지 안 헷갈린다.
      row(
        t('settings.language'),
        `<button class="seg${lang() === 'ko' ? ' on' : ''}" data-act="lang-ko" type="button">한국어</button>` +
          `<button class="seg${lang() === 'en' ? ' on' : ''}" data-act="lang-en" type="button">English</button>`,
      ) +
      row(
        t('settings.motion'),
        `<button class="tg${motion ? ' on' : ''}" data-act="motion" type="button">` +
          `<i></i></button>`,
      ) +
      (tail ? row(t('settings.account'), `<span class="mono">…${tail}</span>`) : '') +
      (inGame
        ? row(
            t('settings.surrender'),
            asking === 'surrender'
              ? `<button class="danger go" data-act="surrender-yes" type="button">${t('settings.surrenderGo')}</button>` +
                cancel
              : `<button class="danger" data-act="surrender" type="button">${t('settings.surrender')}</button>`,
            // 되돌릴 수 없는 것에만 설명을 남긴다. 무엇이 일어나는지 모른 채
            // 누르면 사과할 자리가 없다.
            asking === 'surrender' ? t('settings.surrenderWarn') : '',
          )
        : '') +
      row(
        t('settings.reset'),
        asking === 'reset'
          ? `<button class="danger go" data-act="reset-yes" type="button">${t('settings.resetGo')}</button>` + cancel
          : `<button class="danger" data-act="reset" type="button">${t('settings.reset')}</button>`,
        asking === 'reset' ? t('settings.resetWarn') : '',
      ) +
      `<div class="ver">${t('settings.credits')}</div>`
  }

  el.body.addEventListener('input', (ev) => {
    const s = ev.target.closest('input.vol')
    if (!s) return
    const v = Number(s.value)
    setVolume(s.dataset.act === 'sfx' ? SFX_KEY : BGM_KEY, v)
    // 숫자만 고친다. draw() 를 다시 부르면 끌던 손잡이가 새로 그려져 손에서
    // 놓친다.
    const num = s.parentElement.querySelector('.num')
    if (num) num.textContent = String(v)
  })

  el.body.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act]')
    if (!btn) return
    const act = btn.dataset.act

    if (act === 'lang-ko' || act === 'lang-en') {
      setLang(act === 'lang-ko' ? 'ko' : 'en')
      // 창 안만 다시 그리면 뒤에 깔린 홈이 옛 언어로 남는다 — 바깥도 같이
      // 그리라고 알린다.
      onLang?.()
      draw()
      return
    }
    if (act === 'motion') {
      setReduceMotion(!reduceMotion())
      draw()
      return
    }
    // 위험한 것은 한 번 더 묻는다. 되돌릴 수 없는 일에 손이 미끄러지면
    // 사과할 자리가 없다.
    if (act === 'surrender' || act === 'reset') {
      asking = act
      draw()
      return
    }
    if (act === 'cancel') {
      asking = null
      draw()
      return
    }
    if (act === 'surrender-yes') {
      btn.disabled = true
      await onSurrender?.()
      return
    }
    if (act === 'reset-yes') {
      btn.disabled = true
      for (const k of LOCAL_KEYS) {
        try {
          localStorage.removeItem(k)
        } catch {
          // 하나를 못 지워도 나머지는 지운다.
        }
      }
      await onReset?.()
      // 남은 화면 상태를 손으로 되돌리는 것보다 다시 띄우는 편이 확실하다 —
      // 튜토리얼을 끝냈을 때 이미 쓰는 방식이다.
      location.reload()
    }
  })

  return {
    /** @param {object} o @param {boolean} o.inGame 판 안에서 열었나 */
    open({ inGame: g = false } = {}) {
      inGame = g
      asking = null
      el.root.classList.remove('closing')
      el.root.hidden = false
      draw()
    },
    close: closeSheet,
  }
}
