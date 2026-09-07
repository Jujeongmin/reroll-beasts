// 설정 창. **홈과 인게임이 같은 창을 연다.**
//
// 두 벌로 만들면 항목 하나 늘 때마다 두 군데를 고치고, 그러다 한쪽만 고친
// 상태가 남는다 — 인게임에서만 소리가 안 꺼지는 식의 어긋남이 그렇게 생긴다.
// 다른 점은 하나뿐이다: 인게임에서는 항복 줄이 보인다.
//
// 설정은 **기기에 저장한다.** 계정에 두면 값 하나 바꿀 때마다 서버 왕복이
// 필요하고, 볼륨·움직임은 기기마다 달라도 되는 값이다(폰에서는 소리를 끄고
// PC 에서는 켠다).

const MOTION_KEY = 'rr.motion'

/** 초기화가 지우는 기기 저장 전부. 한 곳에 모아 둔다 — 흩어 두면 하나가 남는다. */
export const LOCAL_KEYS = [
  'rr.avatar',
  'rr.board',
  'rr.boom',
  'rr.tutorial.done',
  'rr.name.ask',
  MOTION_KEY,
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
export function createSettings({ account, onSurrender, onReset }) {
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

  /** 한 줄. 이름 왼쪽, 손잡이 오른쪽. */
  const row = (name, control, note = '') =>
    `<div class="row"><div class="t"><b>${name}</b>${note ? `<span>${note}</span>` : ''}</div>` +
    `<div class="c">${control}</div></div>`

  function draw() {
    const motion = reduceMotion()
    const tail = String(account?.() ?? '').slice(-4)
    el.body.innerHTML =
      // 아직 안 붙은 것은 **잠긴 채로** 둔다. 동작 없는 손잡이를 열어 두면
      // 눌러 보고 아무 일도 안 생기는 것을 배우게 된다.
      row('소리', '<span class="soon">다음 조각에서 붙는다</span>', '효과음 · 배경음') +
      row('언어', '<span class="soon">영어는 다음 조각에서 붙는다</span>', '한국어') +
      row(
        '움직임 줄이기',
        `<button class="tg${motion ? ' on' : ''}" data-act="motion" type="button">` +
          `<i></i></button>`,
        '연출을 줄인다 · 전투는 그대로다',
      ) +
      (tail ? row('내 계정', `<span class="mono">…${tail}</span>`, '문의할 때 쓴다') : '') +
      (inGame
        ? row(
            '항복',
            asking === 'surrender'
              ? '<button class="danger go" data-act="surrender-yes" type="button">항복한다</button>' +
                '<button class="ghost" data-act="cancel" type="button">그만두기</button>'
              : '<button class="danger" data-act="surrender" type="button">항복</button>',
            asking === 'surrender' ? '이 판이 끝난다 · 순위는 지금 자리로 기록된다' : '판을 끝내고 홈으로',
          )
        : '') +
      row(
        '데이터 초기화',
        asking === 'reset'
          ? '<button class="danger go" data-act="reset-yes" type="button">지운다</button>' +
            '<button class="ghost" data-act="cancel" type="button">그만두기</button>'
          : '<button class="danger" data-act="reset" type="button">초기화</button>',
        asking === 'reset'
          ? '전적 · 젬 · 패스 · 산 아바타 · 닉네임이 사라진다 · 되돌릴 수 없다'
          : '이 기기와 계정을 처음으로',
      ) +
      `<div class="ver">Reroll Beasts · 에셋 전량 CC0 (CREDITS.md)</div>`
  }

  el.body.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-act]')
    if (!btn) return
    const act = btn.dataset.act

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
