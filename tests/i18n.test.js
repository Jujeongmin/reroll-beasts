// 문자열 표. 한쪽 언어에만 있는 키는 그 언어에서 **키가 그대로 화면에 뜬다** —
// 배포 뒤가 아니라 여기서 걸려야 한다.
import { describe, it, expect } from 'vitest'
import { STRINGS, LANGS, t, textOf, lang, setLang } from '../game/src/i18n.js'

// 언어를 더할 때마다 이 검사를 고쳐 쓸 일이 없도록, 표에 있는 언어를 모두
// 훑는다. 손으로 적어 두면 새 언어만 조용히 안 걸린다.
const ALL = Object.keys(STRINGS)

describe('문자열 표', () => {
  it('모든 언어가 같은 키를 갖는다', () => {
    const base = Object.keys(STRINGS.en).sort()
    for (const l of ALL) {
      expect(Object.keys(STRINGS[l]).sort(), l).toEqual(base)
    }
  })

  it('빈 문장이 없다', () => {
    for (const l of ALL) {
      for (const [k, v] of Object.entries(STRINGS[l])) {
        expect(String(v).trim(), `${l}.${k}`).not.toBe('')
      }
    }
  })

  // 한쪽만 {n} 을 갖고 있으면 그 언어에서 숫자가 사라지거나 중괄호가 그대로 뜬다.
  it('자리표시자가 모든 언어에서 같다', () => {
    const marks = (s) => (String(s).match(/\{\w+\}/g) ?? []).sort().join()
    for (const l of ALL) {
      for (const k of Object.keys(STRINGS.en)) {
        expect(marks(STRINGS[l][k]), `${l}.${k}`).toBe(marks(STRINGS.en[k]))
      }
    }
  })

  // 설정 창은 이 목록으로 단추를 만든다. 표에만 있고 목록에 없으면 그 언어는
  // 넣어 놓고 아무도 고를 수 없다 — 반대면 눌러도 아무 일이 없는 단추가 된다.
  it('고를 수 있는 언어와 표가 어긋나지 않는다', () => {
    expect(LANGS.map((l) => l.id).sort()).toEqual(ALL.sort())
    for (const l of LANGS) expect(String(l.label).trim(), l.id).not.toBe('')
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
    setLang('ko')
  })

  it('새로 더한 언어도 고를 수 있다', () => {
    for (const id of ['ja', 'zh-Hant', 'zh-Hans']) {
      expect(setLang(id)).toBe(id)
      // 그 언어에서 키가 그대로 뜨면 옮기다 만 것이다.
      expect(t('menu.settings')).not.toBe('menu.settings')
    }
    setLang('ko')
  })

  // 번체와 간체는 **글자가 다르다**. "zh" 만 보고 하나로 몰면 절반은 못 읽는
  // 글자를 본다.
  it('번체와 간체는 서로 다른 표다', () => {
    expect(STRINGS['zh-Hant']['menu.settings']).not.toBe(STRINGS['zh-Hans']['menu.settings'])
  })
})
