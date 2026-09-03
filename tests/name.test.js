// 닉네임 규칙. 서버가 이 함수로 검산하므로 여기서 못박는다 — 화면에서만
// 막으면 조작된 요청 하나로 아무 이름이나 남의 화면에 뜬다.
import { describe, it, expect } from 'vitest'
import { checkName, normalizeName, displayName, NAME_MIN, NAME_MAX } from '../sim/name.js'

describe('normalizeName', () => {
  it('앞뒤 공백을 떼고 사이 공백은 하나로 줄인다', () => {
    expect(normalizeName('  고수  ')).toBe('고수')
    expect(normalizeName('개구리   왕자')).toBe('개구리 왕자')
  })

  it('없는 값도 빈 문자열로 다룬다 — 던지면 이름 하나로 서버가 죽는다', () => {
    expect(normalizeName(null)).toBe('')
    expect(normalizeName(undefined)).toBe('')
  })
})

describe('checkName', () => {
  it('한글·영문·숫자를 받는다', () => {
    for (const n of ['고수', 'Frog9', '개구리 왕자', 'aa']) {
      expect(checkName(n).ok, n).toBe(true)
    }
  })

  it('길이를 지킨다', () => {
    expect(checkName('가').ok).toBe(false)
    expect(checkName('가'.repeat(NAME_MAX)).ok).toBe(true)
    expect(checkName('가'.repeat(NAME_MAX + 1)).ok).toBe(false)
  })

  it('기호와 보이지 않는 문자를 막는다 — 남의 화면을 망가뜨릴 수 있다', () => {
    for (const n of ['고수!', 'a​b', '<b>x</b>', '😀😀', '고수‮']) {
      expect(checkName(n).ok, n).toBe(false)
    }
  })

  it('기본 이름 행세를 막는다', () => {
    expect(checkName('유저1234').ok).toBe(false)
    expect(checkName('운영자').ok).toBe(false)
    expect(checkName('GM1').ok).toBe(false)
  })

  it('통과한 이름은 다듬은 값으로 돌려준다 — 저장은 그 값이어야 한다', () => {
    expect(checkName('  개구리   왕자 ').name).toBe('개구리 왕자')
  })

  it('못 쓰면 왜인지 사람 말로 준다', () => {
    expect(typeof checkName('가').why).toBe('string')
  })
})

describe('displayName', () => {
  it('정한 이름이 있으면 그것을 쓴다', () => {
    expect(displayName('고수', '0xabcdef1234')).toBe('고수')
  })

  it('없거나 규칙에 안 맞으면 계정 꼬리로 만든다', () => {
    expect(displayName(null, '0xabcdef1234')).toBe('유저1234')
    expect(displayName('!!', '0xabcdef1234')).toBe('유저1234')
  })

  it('계정이 없어도 안 던진다', () => {
    expect(displayName(null, null)).toBe('유저')
  })

  it('최소 길이는 2 다 — 한 글자 이름은 목록에서 안 읽힌다', () => {
    expect(NAME_MIN).toBe(2)
  })
})
