// 닉네임 규칙. 서버가 이 함수로 검산하므로 여기서 못박는다 — 화면에서만
// 막으면 조작된 요청 하나로 아무 이름이나 남의 화면에 뜬다.
import { describe, it, expect } from 'vitest'
import {
  checkName,
  normalizeName,
  displayName,
  guestName,
  NAME_MIN,
  NAME_MAX,
  tagDuplicates,
  accountTag,
} from '../sim/name.js'
import { STRINGS } from '../game/src/i18n.js'

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
    // 칸이 정한 값이다 — 여기가 늘면 좌석 이름이 잘린다.
    expect(NAME_MAX).toBe(8)
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

  // 지어낸 이름은 **언어를 든 채로** 낸다. 한 방에 언어가 다른 여덟 명이
  // 앉으므로, 만드는 쪽(서버)은 받는 사람의 언어를 알 수가 없다.
  it('없거나 규칙에 안 맞으면 계정 꼬리로 만든다', () => {
    expect(displayName(null, '0xabcdef1234').ko).toBe('유저1234')
    expect(displayName('!!', '0xabcdef1234').ko).toBe('유저1234')
    expect(displayName(null, '0xabcdef1234').en).toBe('Player 1234')
    expect(displayName(null, '0xabcdef1234').ja).toBe('プレイヤー1234')
  })

  it('계정이 없어도 안 던진다', () => {
    expect(displayName(null, null).ko).toBe('유저')
    // 꼬리가 없으면 뒤에 공백도 없다.
    expect(displayName(null, null).en).toBe('Player')
  })

  it('우리가 파는 모든 언어를 든다 — 한 언어가 빠지면 그 화면만 남의 말로 뜬다', () => {
    const g = guestName('0xabcdef1234')
    for (const l of Object.keys(STRINGS)) {
      expect(String(g[l] ?? '').trim(), l).not.toBe('')
    }
  })

  it('최소 길이는 2 다 — 한 글자 이름은 목록에서 안 읽힌다', () => {
    expect(NAME_MIN).toBe(2)
  })
})

describe('낱자 이름', () => {
  it('ㅋㅋㅋ · ㅇㅇ 처럼 낱자만으로도 지을 수 있다', () => {
    expect(checkName('ㅋㅋㅋ').ok).toBe(true)
    expect(checkName('ㅇㅇ').ok).toBe(true)
    expect(checkName('ㅎㅎㅎㅎ').ok).toBe(true)
  })

  it('낱자와 완성형을 섞어도 된다 — 조합하다 만 것도 이름이 된다', () => {
    expect(checkName('ㅇㅏ차').ok).toBe(true)
  })

  it('낱자도 한 글자로 센다 — 하나뿐이면 여전히 짧다', () => {
    expect(checkName('ㄱ').why).toBe('name_short')
  })

  it('옛한글 자모는 안 받는다 — 겹쳐 쌓여 줄 높이를 밀어낸다', () => {
    // U+1100(ᄀ) · U+1161(ᅡ) 은 호환 자모가 아니라 조합용 낱자다.
    expect(checkName('\u1100\u1161').why).toBe('name_chars')
  })
})

describe('tagDuplicates', () => {
  it('겹치지 않으면 아무것도 안 붙는다', () => {
    expect(tagDuplicates([{ text: '고수', tag: '1234' }, { text: '하수', tag: 'abcd' }]))
      .toEqual([{ name: '고수', tag: '' }, { name: '하수', tag: '' }])
  })

  it('같은 이름이 둘이면 그 둘에만 꼬리가 붙는다', () => {
    expect(
      tagDuplicates([
        { text: '고수', tag: '1234' },
        { text: '하수', tag: 'abcd' },
        { text: '고수', tag: 'ef01' },
      ]),
    ).toEqual([
      { name: '고수', tag: '1234' },
      { name: '하수', tag: '' },
      { name: '고수', tag: 'ef01' },
    ])
  })

  it('꼬리가 없으면 안 붙인다 — 봇에게는 계정이 없다', () => {
    expect(tagDuplicates([{ text: '봇1' }, { text: '봇1' }])).toEqual([{ name: '봇1', tag: '' }, { name: '봇1', tag: '' }])
  })

  it('빈 목록도 견딘다', () => {
    expect(tagDuplicates([])).toEqual([])
    expect(tagDuplicates(null)).toEqual([])
  })
})

describe('accountTag', () => {
  it('계정 꼬리 네 자리다 — 주소 전체를 뿌리지 않는다', () => {
    expect(accountTag('0xabcdef1234')).toBe('1234')
  })

  it('계정이 없으면 빈 값이다', () => {
    expect(accountTag(null)).toBe('')
  })
})
