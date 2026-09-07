// 문자열 표. 한쪽 언어에만 있는 키는 그 언어에서 **키가 그대로 화면에 뜬다** —
// 배포 뒤가 아니라 여기서 걸려야 한다.
import { describe, it, expect } from 'vitest'
import { STRINGS, t, textOf, lang, setLang } from '../game/src/i18n.js'

describe('문자열 표', () => {
  it('두 언어가 같은 키를 갖는다', () => {
    expect(Object.keys(STRINGS.ko).sort()).toEqual(Object.keys(STRINGS.en).sort())
  })

  it('빈 문장이 없다', () => {
    for (const l of ['ko', 'en']) {
      for (const [k, v] of Object.entries(STRINGS[l])) {
        expect(String(v).trim(), `${l}.${k}`).not.toBe('')
      }
    }
  })

  // 한쪽만 {n} 을 갖고 있으면 그 언어에서 숫자가 사라지거나 중괄호가 그대로 뜬다.
  it('자리표시자가 두 언어에서 같다', () => {
    const marks = (s) => (String(s).match(/\{\w+\}/g) ?? []).sort().join()
    for (const k of Object.keys(STRINGS.ko)) {
      expect(marks(STRINGS.en[k]), k).toBe(marks(STRINGS.ko[k]))
    }
  })
})

describe('t', () => {
  it('없는 키는 키를 그대로 준다 — 빈 화면보다 낫고 빠진 자리가 눈에 띈다', () => {
    expect(t('없는.키')).toBe('없는.키')
  })

  it('값을 끼워 넣는다', () => {
    expect(t('pass.level', { n: 7 })).toContain('7')
  })

  it('언어를 바꾸면 그 언어로 준다', () => {
    setLang('en')
    expect(t('menu.settings')).toBe('Settings')
    setLang('ko')
    expect(t('menu.settings')).toBe('설정')
  })
})

describe('textOf', () => {
  it('두 언어를 든 값에서 지금 언어를 꺼낸다', () => {
    setLang('ko')
    expect(textOf({ ko: '가', en: 'A' })).toBe('가')
    setLang('en')
    expect(textOf({ ko: '가', en: 'A' })).toBe('A')
    setLang('ko')
  })

  // 데이터 파일을 한 번에 다 옮기지 않는다. 아직 한국어만 있는 줄도 화면에는
  // 떠야 하고, 그래야 옮기는 도중에도 게임이 돈다.
  it('문자열이면 그대로 준다', () => {
    expect(textOf('그대로')).toBe('그대로')
  })

  it('한쪽 언어만 있으면 있는 쪽을 준다', () => {
    setLang('en')
    expect(textOf({ ko: '가' })).toBe('가')
    setLang('ko')
  })

  it('없으면 빈 문자열이다 — undefined 가 화면에 뜨면 안 된다', () => {
    expect(textOf(null)).toBe('')
    expect(textOf(undefined)).toBe('')
  })
})

describe('lang', () => {
  it('고른 언어가 남는다', () => {
    setLang('en')
    expect(lang()).toBe('en')
    setLang('ko')
    expect(lang()).toBe('ko')
  })

  it('아는 언어만 받는다 — 오타 하나로 표가 통째로 비면 안 된다', () => {
    expect(setLang('일본어')).toBe('ko')
  })
})
