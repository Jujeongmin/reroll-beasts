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
  avatarAnims,
  avatarPrice,
  canBuyAvatar,
  shopAvatars,
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

describe('avatarAnims', () => {
  it('팩마다 다른 이름표를 준다 — 섞으면 한쪽이 안 움직인다', () => {
    const chars = data.cosmetics.avatars.find((a) => a.pack === 'chars')
    const cute = data.cosmetics.avatars.find((a) => a.pack === 'cute')
    expect(avatarAnims(chars.id, data).cheer).toBe('Victory')
    expect(avatarAnims(cute.id, data).cheer).toBe('Dance')
    expect(avatarAnims(chars.id, data).poke).toBe('RecieveHit')
    expect(avatarAnims(cute.id, data).poke).toBe('HitRecieve')
  })

  it('모든 아바타가 아는 팩을 가리킨다', () => {
    for (const a of data.cosmetics.avatars) {
      expect(data.cosmetics.packs[a.pack], `${a.id} 의 팩 ${a.pack}`).toBeTruthy()
    }
  })

  it('없는 id 는 기본값의 이름표를 쓴다', () => {
    expect(avatarAnims('없음', data).idle).toBe('Idle')
  })
})

describe('젬 상점', () => {
  const passAv = (d) => d.cosmetics.avatars.find((a) => a.unlock === 'pass')
  const rankAv = (d) => d.cosmetics.avatars.find((a) => a.unlock === 'rank')

  it('패스 아바타만 판다 — 랭크는 실력 표식이라 팔면 뜻을 잃는다', () => {
    expect(avatarPrice(passAv(data), data)).toBeGreaterThan(0)
    expect(avatarPrice(rankAv(data), data)).toBe(null)
    expect(avatarPrice({ unlock: 'free' }, data)).toBe(null)
  })

  it('늦게 열리는 것일수록 비싸다', () => {
    const list = data.cosmetics.avatars.filter((a) => a.unlock === 'pass')
    const sorted = [...list].sort((a, b) => a.passLevel - b.passLevel)
    for (let i = 1; i < sorted.length; i++) {
      expect(avatarPrice(sorted[i], data)).toBeGreaterThan(avatarPrice(sorted[i - 1], data))
    }
  })

  it('젬이 모자라면 못 산다', () => {
    const a = passAv(data)
    const price = avatarPrice(a, data)
    expect(canBuyAvatar(a, { gems: price - 1 }, data).ok).toBe(false)
    expect(canBuyAvatar(a, { gems: price }, data).ok).toBe(true)
  })

  it('이미 열린 것은 안 판다 — 젬만 사라진다', () => {
    const a = passAv(data)
    const rich = { gems: 99999, passLevel: 99 }
    expect(canBuyAvatar(a, rich, data).ok).toBe(false)
    expect(canBuyAvatar(a, { gems: 99999, avatars: [a.id] }, data).ok).toBe(false)
  })

  it('산 것은 단계에 못 가도 쓸 수 있다 — 그러라고 판 것이다', () => {
    const a = passAv(data)
    expect(isUnlocked(a, { passLevel: 1 })).toBe(false)
    expect(isUnlocked(a, { passLevel: 1, avatars: [a.id] })).toBe(true)
    expect(resolveAvatar(a.id, data, { passLevel: 1, avatars: [a.id] })).toBe(a.id)
  })

  it('목록은 가진 것도 남긴다 — 빠지면 목록이 판마다 달라진다', () => {
    const poor = shopAvatars(data, {})
    const rich = shopAvatars(data, { gems: 99999, passLevel: 99 })
    expect(rich.length).toBe(poor.length)
    expect(rich.every((x) => x.have)).toBe(true)
    expect(poor.every((x) => !x.have)).toBe(true)
  })
})
