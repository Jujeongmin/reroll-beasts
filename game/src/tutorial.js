// 코치. 대본(sim/tutorial.js)이 정한 단계를 화면에 옮긴다.
//
// 규칙 판정은 여기 없다 — 어느 단계인지는 상태에서 나오고, 이 파일은 그
// 결과를 말풍선과 불빛으로 바꿀 뿐이다. 판정을 화면에 두면 테스트가 못 덮는다.

import { TUTORIAL_STEPS, tutorialStep } from '@sim/tutorial.js'
import { t } from './i18n.js'

/** 완료 표시. 지운 사람은 다시 본다 — 그게 맞다. */
const DONE_KEY = 'rr.tutorial.done'

export function isTutorialDone() {
  try {
    return localStorage.getItem(DONE_KEY) === '1'
  } catch {
    // 사파리 프라이빗 등에서 던진다. 못 읽으면 "안 봤다"로 친다 —
    // 두 번 보는 쪽이 못 보는 쪽보다 낫다.
    return false
  }
}

/**
 * "튜토리얼을 막 끝냈다" 는 쪽지.
 *
 * 이름은 **서버가 있어야** 정할 수 있는데(setName), 튜토리얼은 서버 없이
 * 돈다. 그래서 그 자리에서 못 묻고, 홈으로 나가 서버에 붙은 뒤에 묻는다.
 * 쪽지를 저장소에 남기는 이유: 튜토리얼을 끝내면 화면을 다시 띄우기 때문에
 * (location.reload) 메모리에 든 값은 살아남지 못한다.
 */
const ASK_NAME_KEY = 'rr.name.ask'

export function askNameLater() {
  try {
    localStorage.setItem(ASK_NAME_KEY, '1')
  } catch {
    // 못 적으면 안 묻는다. 이름은 홈에서 언제든 누를 수 있다.
  }
}

/** 쪽지를 집어 든다. **한 번만** 묻는다 — 매번 뜨면 잔소리가 된다. */
export function takeNameAsk() {
  try {
    const on = localStorage.getItem(ASK_NAME_KEY) === '1'
    localStorage.removeItem(ASK_NAME_KEY)
    return on
  } catch {
    return false
  }
}

export function markTutorialDone() {
  try {
    localStorage.setItem(DONE_KEY, '1')
  } catch {
    // 못 적어도 게임은 굴러가야 한다.
  }
}

/**
 * @param {object} o
 * @param {object} o.run       런 상태(run.state 를 읽는다)
 * @param {() => void} o.onFight  마지막 단계에서 "싸우자" 를 눌렀다
 * @param {() => void} o.onSkip   건너뛰기
 */
export function createCoach({ run, onFight, onSkip }) {
  const el = {
    root: document.getElementById('coach'),
    text: document.getElementById('coach-text'),
    fight: document.getElementById('coach-fight'),
    home: document.getElementById('coach-home'),
    skip: document.getElementById('coach-skip'),
  }

  // 시작 레벨을 붙잡아 둔다. "레벨이 올랐나"는 시작값과 비교해야 한다 —
  // 데이터의 startLevel 을 읽으면 나중에 그 값이 바뀔 때 조용히 틀린다.
  const ctx = { startLevel: run.state.level }

  let lit = null
  let index = -1
  // 끝난 뒤에는 단계 계산을 멈춘다 — 전투 결과 화면이 다시 "사라"로 덮인다.
  let finished = false

  function light(selector) {
    if (lit) lit.classList.remove('coach-lit')
    lit = selector ? document.querySelector(selector) : null
    if (lit) lit.classList.add('coach-lit')
  }

  el.fight.addEventListener('click', () => onFight())
  el.home.addEventListener('click', () => onSkip())
  el.skip.addEventListener('click', () => onSkip())

  return {
    show() {
      el.root.hidden = false
      index = -1
      this.sync()
    },
    hide() {
      el.root.hidden = true
      light(null)
    },
    /** 판이 바뀔 때마다 부른다. 단계가 넘어갔으면 화면을 고친다. */
    sync() {
      if (finished) return
      const i = tutorialStep(run.state, ctx)
      if (i === index) return
      index = i
      const step = TUTORIAL_STEPS[i]
      el.text.textContent = step.text
      el.fight.hidden = step.id !== 'fight'
      light(step.target)
    },

    /**
     * 전투까지 봤다. 시스템 대화상자(alert)로 끝내지 않는 이유: 그 창은
     * 게임 밖에서 뜨고, 지금까지 이어 온 코치의 말투가 거기서 끊긴다.
     */
    finish(won) {
      finished = true
      el.root.hidden = false
      el.text.textContent = won
        ? t('coach.won')
        : t('coach.lost')
      el.fight.hidden = true
      el.home.hidden = false
      el.skip.hidden = true
      light(null)
    },
  }
}
