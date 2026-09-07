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
  priceOf,
  canBuyCosmetic,
  boardChoices,
  resolveBoard,
  boardColors,
  cosmeticById,
  boomChoices,
  resolveBoom,
  boomFx,
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

describe('젬으로 사는 것', () => {
  const gemAv = (d) => d.cosmetics.avatars.find((a) => a.unlock === 'gem')
  const passAv = (d) => d.cosmetics.avatars.find((a) => a.unlock === 'pass')
  const rankAv = (d) => d.cosmetics.avatars.find((a) => a.unlock === 'rank')

  it('젬 전용만 판다 — 패스·랭크 보상을 팔면 그 트랙을 도는 이유가 사라진다', () => {
    expect(priceOf(gemAv(data), data)).toBeGreaterThan(0)
    expect(priceOf(passAv(data), data)).toBe(null)
    expect(priceOf(rankAv(data), data)).toBe(null)
    expect(canBuyCosmetic(passAv(data), { gems: 99999 }, data).ok).toBe(false)
    expect(canBuyCosmetic(rankAv(data), { gems: 99999 }, data).ok).toBe(false)
  })

  it('파는 것에는 모두 값이 붙어 있다 — 값 없는 상품은 공짜가 된다', () => {
    const sellable = [...data.cosmetics.avatars, ...data.cosmetics.boards].filter(
      (x) => x.unlock === data.cosmetics.shop.sellUnlock,
    )
    expect(sellable.length).toBeGreaterThan(0)
    for (const x of sellable) expect(priceOf(x, data), x.id).toBeGreaterThan(0)
  })

  it('젬이 모자라면 못 산다', () => {
    const a = gemAv(data)
    expect(canBuyCosmetic(a, { gems: a.price - 1 }, data).ok).toBe(false)
    expect(canBuyCosmetic(a, { gems: a.price }, data).ok).toBe(true)
  })

  it('산 것은 바로 열린다', () => {
    const a = gemAv(data)
    expect(isUnlocked(a, { gems: 9999 })).toBe(false)
    expect(isUnlocked(a, { avatars: [a.id] })).toBe(true)
    expect(canBuyCosmetic(a, { gems: 9999, avatars: [a.id] }, data).ok).toBe(false)
  })

  it('패스 보상 아바타는 둘뿐이다 — 다 패스에 있으면 다른 해금 경로가 죽는다', () => {
    expect(data.cosmetics.avatars.filter((a) => a.unlock === 'pass').length).toBe(2)
  })
})

describe('무대 스킨', () => {
  it('아바타와 같은 해금 규칙을 탄다', () => {
    const list = boardChoices(data, {})
    expect(list.length).toBe(data.cosmetics.boards.length)
    // 기본 무대는 늘 열려 있다 — 안 그러면 첫 판에 설 자리가 없다
    expect(list.find((b) => b.id === data.cosmetics.boardDefault).unlocked).toBe(true)
    expect(list.some((b) => !b.unlocked)).toBe(true)
  })

  it('잠긴 것을 고른 채로 남아 있으면 기본값으로 돌린다', () => {
    const locked = data.cosmetics.boards.find((b) => b.unlock !== 'free')
    expect(resolveBoard(locked.id, data, {})).toBe(data.cosmetics.boardDefault)
    expect(resolveBoard(locked.id, data, { avatars: [locked.id] })).toBe(locked.id)
    expect(resolveBoard('없는무대', data)).toBe(data.cosmetics.boardDefault)
  })

  it('모든 무대가 무대에 입힐 색을 다 갖고 있다 — 빠지면 그 칸만 기본색이 남는다', () => {
    for (const b of data.cosmetics.boards) {
      const c = boardColors(b.id, data)
      for (const k of ['floor', 'base', 'ground', 'ring']) {
        expect(c[k], `${b.id}.${k}`).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  it('아바타와 무대 id 가 겹치지 않는다 — 겹치면 하나를 사고 둘이 열린다', () => {
    const ids = [...data.cosmetics.avatars, ...data.cosmetics.boards].map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('cosmeticById 는 둘 다에서 찾는다', () => {
    expect(cosmeticById(data.cosmetics.avatars[0].id, data)).toBeTruthy()
    expect(cosmeticById(data.cosmetics.boards[0].id, data)).toBeTruthy()
    expect(cosmeticById('없음', data)).toBe(null)
  })
})

describe('승리 이펙트', () => {
  it('아바타·무대와 같은 해금 규칙을 탄다', () => {
    const list = boomChoices(data, {})
    expect(list.length).toBe(data.cosmetics.booms.length)
    expect(list.find((b) => b.id === data.cosmetics.boomDefault).unlocked).toBe(true)
    expect(list.some((b) => !b.unlocked)).toBe(true)
  })

  it('잠긴 걸 고른 채로 남아 있으면 기본값으로 돌린다', () => {
    const locked = data.cosmetics.booms.find((b) => b.unlock !== 'free')
    expect(resolveBoom(locked.id, data, {})).toBe(data.cosmetics.boomDefault)
    expect(resolveBoom(locked.id, data, { avatars: [locked.id] })).toBe(locked.id)
    expect(resolveBoom('없음', data)).toBe(data.cosmetics.boomDefault)
  })

  it('모든 이펙트가 그릴 명세를 다 갖고 있다 — 빠지면 그것만 안 터진다', () => {
    for (const b of data.cosmetics.booms) {
      const fx = boomFx(b.id, data)
      expect(fx.color, b.id).toMatch(/^#[0-9a-f]{6}$/i)
      for (const k of ['ring', 'burst', 'spark']) expect(typeof fx[k], `${b.id}.${k}`).toBe('string')
      expect(fx.shots, b.id).toBeGreaterThan(0)
    }
  })

  it('id 가 아바타·무대와 안 겹친다 — 겹치면 하나를 사고 둘이 열린다', () => {
    const ids = [
      ...data.cosmetics.avatars,
      ...data.cosmetics.boards,
      ...data.cosmetics.booms,
    ].map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('파는 이펙트에는 값이 붙어 있다', () => {
    for (const b of data.cosmetics.booms) {
      if (b.unlock === data.cosmetics.shop.sellUnlock) expect(priceOf(b, data)).toBeGreaterThan(0)
    }
  })
})

describe('프리미엄 전용 패스 보상', () => {
  const prem = { id: 'x', unlock: 'pass', passLevel: 9, passTrack: 'premium' }
  const free = { id: 'y', unlock: 'pass', passLevel: 9, passTrack: 'free' }
  const old = { id: 'z', unlock: 'pass', passLevel: 9 }

  // 단계만 보고 열면 안 산 사람도 프리미엄 보상을 다 갖는다 — 그러면 살
  // 이유가 사라진다.
  it('단계에 닿아도 안 샀으면 안 열린다', () => {
    expect(isUnlocked(prem, { passLevel: 25, premium: false })).toBe(false)
    expect(isUnlocked(prem, { passLevel: 25 })).toBe(false)
  })

  it('샀고 단계도 닿았으면 열린다', () => {
    expect(isUnlocked(prem, { passLevel: 9, premium: true })).toBe(true)
  })

  it('샀어도 단계가 모자라면 안 열린다 — 사면 다 주는 것이 아니다', () => {
    expect(isUnlocked(prem, { passLevel: 8, premium: true })).toBe(false)
  })

  it('무료 트랙은 사든 안 사든 단계만 본다', () => {
    expect(isUnlocked(free, { passLevel: 9 })).toBe(true)
    // passTrack 이 없는 줄은 무료로 친다 — 기존 보상을 안 고쳐도 살아 있다.
    expect(isUnlocked(old, { passLevel: 9 })).toBe(true)
  })

  it('젬으로 산 것은 그대로 열린다 — 산 것이 제일 먼저다', () => {
    expect(isUnlocked(prem, { passLevel: 1, avatars: ['x'] })).toBe(true)
  })

  it('왜 잠겼는지 프리미엄이라고 말한다', () => {
    expect(lockReason(prem)).toContain('프리미엄')
    expect(lockReason(free)).not.toContain('프리미엄')
  })
})
