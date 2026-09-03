// 코스메틱 해금. 화면에서만 잠그면 잠금은 장식이다 — 나중에 서버가 같은
// 함수로 검산하므로 규칙이 여기서 못박혀야 한다.
import { describe, it, expect, beforeAll } from 'vitest'
import { loadData } from '../sim/data.js'
import {
  isUnlocked,
  lockReason,
  resolveAvatar,
  avatarChoices,
  avatarFile,
} from '../sim/cosmetics.js'

let data
beforeAll(async () => {
  data = await loadData()
})

describe('isUnlocked', () => {
  it('무료는 언제나 열려 있다', () => {
    expect(isUnlocked({ unlock: 'free' })).toBe(true)
    expect(isUnlocked({ unlock: 'free' }, {})).toBe(true)
  })

  it('패스는 단계가 차야 열린다', () => {
    const item = { unlock: 'pass', passLevel: 5 }
    expect(isUnlocked(item, { passLevel: 4 })).toBe(false)
    expect(isUnlocked(item, { passLevel: 5 })).toBe(true)
    expect(isUnlocked(item, {})).toBe(false)
  })

  it('랭크는 티어가 닿아야 열린다', () => {
    const item = { unlock: 'rank', tier: 'gold' }
    // 골드 문턱은 700 LP
    expect(isUnlocked(item, { lp: 699 })).toBe(false)
    expect(isUnlocked(item, { lp: 700 })).toBe(true)
    expect(isUnlocked(item, { lp: 5000 })).toBe(true)
  })

  it('모르는 티어 이름은 잠근다 — 오타 하나로 전부 열리면 안 된다', () => {
    expect(isUnlocked({ unlock: 'rank', tier: '없는티어' }, { lp: 99999 })).toBe(false)
  })

  it('모르는 해금 방식도 잠근다', () => {
    expect(isUnlocked({ unlock: '언젠가' }, { lp: 99999, passLevel: 99 })).toBe(false)
  })
})

describe('lockReason', () => {
  it('왜 잠겼는지 사람 말로 준다', () => {
    expect(lockReason({ unlock: 'pass', passLevel: 12 })).toContain('12')
    expect(lockReason({ unlock: 'rank', tier: 'gold' })).toContain('골드')
  })
})

describe('resolveAvatar', () => {
  it('안 고른 사람은 기본값을 쓴다', () => {
    expect(resolveAvatar(null, data)).toBe(data.cosmetics.avatarDefault)
  })

  it('없는 id 는 기본값으로 떨어진다 — 데이터에서 줄이 빠질 수 있다', () => {
    expect(resolveAvatar('사라진스킨', data)).toBe(data.cosmetics.avatarDefault)
  })

  it('잠긴 걸 고른 채로 남아 있으면 기본값으로 돌린다', () => {
    const locked = data.cosmetics.avatars.find((a) => a.unlock !== 'free')
    expect(resolveAvatar(locked.id, data, {})).toBe(data.cosmetics.avatarDefault)
  })

  it('열린 것은 그대로 쓴다', () => {
    const free = data.cosmetics.avatars.filter((a) => a.unlock === 'free')
    for (const a of free) expect(resolveAvatar(a.id, data)).toBe(a.id)
  })
})

describe('avatarChoices', () => {
  it('잠긴 것에는 사유가 붙는다', () => {
    const list = avatarChoices(data, {})
    expect(list.length).toBe(data.cosmetics.avatars.length)
    for (const c of list) {
      if (c.unlocked) expect(c.reason).toBe(null)
      else expect(typeof c.reason).toBe('string')
    }
  })

  it('가진 게 늘면 열리는 것도 는다', () => {
    const poor = avatarChoices(data, {}).filter((c) => c.unlocked).length
    const rich = avatarChoices(data, { passLevel: 99, lp: 99999 }).filter((c) => c.unlocked).length
    expect(rich).toBeGreaterThan(poor)
  })
})

describe('avatarFile', () => {
  it('id 로 모델 파일을 찾는다', () => {
    const first = data.cosmetics.avatars[0]
    expect(avatarFile(first.id, data)).toBe(first.file)
  })

  it('없는 id 면 기본값의 파일이다', () => {
    const def = data.cosmetics.avatars.find((a) => a.id === data.cosmetics.avatarDefault)
    expect(avatarFile('없음', data)).toBe(def.file)
  })
})
