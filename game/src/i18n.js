// 문자열 표.
//
// **키가 없으면 키를 그대로 그린다.** 빈 화면보다 낫고, 빠뜨린 자리가 화면에서
// 바로 눈에 띈다 — 조용히 빈칸으로 두면 배포 뒤에야 발견한다.
//
// 언어는 기기에 저장한다(rr.lang). 계정에 두면 값 하나 바꾸는 데 서버 왕복이
// 필요하고, 기기마다 다른 언어를 쓰는 사람이 있다.
//
// 영어는 직역이 아니다. 그 자리에서 하는 일을 영어로 쓴 것이다 — 한국어 문장을
// 그대로 옮기면 버튼 폭을 넘기거나, 게임에서 안 쓰는 말이 된다.

const LANG_KEY = 'rr.lang'

import ko from './lang/ko.js'
import en from './lang/en.js'

/**
 * 문구 표. 언어 하나가 파일 하나다(game/src/lang/).
 *
 * 영어가 **기준선**이다 — 어느 언어에 키가 없으면 영어로 떨어진다. 한국어로
 * 떨어지면 일본어·중국어 화면에 한국어가 섞여 뜨는데, 그건 그 화면을 보는
 * 사람에게 아무 뜻도 없다.
 */
export const STRINGS = {
  ko,
  en,
}

let current = null

/**
 * 지금 언어. 저장된 값이 없으면 **기기가 쓰는 언어**를 따른다 — 처음 온 사람에게
 * 무엇으로 볼지 묻지 않는다.
 */
export function lang() {
  if (current) return current
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'ko' || saved === 'en') return (current = saved)
  } catch {
    // 저장소를 못 읽는 브라우저가 있다. 기기 언어만 본다.
  }
  const nav = String(globalThis.navigator?.language ?? 'ko').toLowerCase()
  return (current = nav.startsWith('ko') ? 'ko' : 'en')
}

/** 언어를 바꾼다. 화면은 부르는 쪽이 다시 그린다 — 여기서 DOM 을 모른다. */
export function setLang(v) {
  current = v === 'en' ? 'en' : 'ko'
  try {
    localStorage.setItem(LANG_KEY, current)
  } catch {
    // 못 적어도 이번 판에는 바뀐다.
  }
  return current
}

/** 키 → 문장. `{n}` 같은 자리는 vars 로 채운다. */
export function t(key, vars) {
  const table = STRINGS[lang()] ?? STRINGS.ko
  let s = table[key]
  if (s == null) return key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  }
  return s
}

/**
 * 데이터에 든 이름·설명. `{ ko, en }` 이면 지금 언어를, 문자열이면 그대로.
 *
 * 문자열도 받는 이유: 데이터 파일을 한 번에 다 옮기지 않는다. 아직 한국어만
 * 있는 줄도 화면에는 떠야 하고, 그래야 옮기는 도중에도 게임이 돈다.
 */
export function textOf(field) {
  if (field == null) return ''
  if (typeof field === 'string') return field
  return field[lang()] ?? field.ko ?? field.en ?? ''
}

/** `data-i18n` 이 붙은 요소를 채운다. 정적 문구는 이 한 번으로 끝난다. */
/**
 * innerHTML 에 남의 글자를 넣기 전에 건다. 이름 규칙(checkName)이 지금은
 * 기호를 막지만, 안전이 규칙 한 줄에 매달려 있으면 그 줄이 바뀌는 날
 * 순위표·좌석·결과판이 한꺼번에 뚫린다.
 */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n)
  }
  for (const el of root.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria))
  }
  // 입력칸 안내는 textContent 가 아니라 속성이다. HTML 에 적힌 한국어를 두면
  // 영어로 보는 사람 눈에는 그것만 한국어로 남는다.
  for (const el of root.querySelectorAll('[data-i18n-ph]')) {
    el.setAttribute('placeholder', t(el.dataset.i18nPh))
  }
}
