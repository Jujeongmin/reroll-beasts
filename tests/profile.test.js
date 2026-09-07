// 전적은 한 번 틀리면 되돌릴 근거가 없다 — 원본 기록을 안 남기고 누적만 하기
// 때문이다. 그래서 누적 규칙을 순수 함수로 떼어 여기서 못박는다.
import { describe, it, expect } from 'vitest'
import { mergeProfile, applyMatchResult } from '../sim/profile.js'
import { lpForRank } from '../sim/rank.js'
import { loadData } from '../sim/data.js'

describe('mergeProfile', () => {
  it('첫 판이면 없던 전적을 만든다', () => {
    expect(mergeProfile(null, 3)).toEqual({
      games: 1,
      wins: 0,
      best: 3,
      recent: [3],
    })
  })

  it('1위면 wins 가 오른다', () => {
    expect(mergeProfile(null, 1).wins).toBe(1)
  })

  it('최고 순위는 더 낮은 숫자로만 갱신된다', () => {
    const p = { games: 1, wins: 0, best: 2, recent: [2] }
    expect(mergeProfile(p, 5).best).toBe(2)
    expect(mergeProfile(p, 1).best).toBe(1)
  })

  it('최근 기록은 새 것이 앞이고 다섯 개까지만 남는다', () => {
    let p = null
    for (const r of [8, 7, 6, 5, 4, 3]) p = mergeProfile(p, r)
    expect(p.recent).toEqual([3, 4, 5, 6, 7])
    expect(p.games).toBe(6)
  })

  it('원본을 안 고친다 — 서버가 같은 값을 두 번 쓰면 안 된다', () => {
    const p = { games: 1, wins: 0, best: 4, recent: [4] }
    mergeProfile(p, 2)
    expect(p).toEqual({ games: 1, wins: 0, best: 4, recent: [4] })
  })
})

describe('mergeProfile — 전적 없는 프로필', () => {
  // 닉네임을 먼저 정하면 프로필은 있는데 전적 칸은 없다(setName 이 { name } 만
  // 쓴다). 그 상태로 첫 판이 끝나면 여기서 터졌다 — 판 하나가 통째로 정산을
  // 못 하고, 같은 방의 남들 기록까지 안 남는다.
  it('닉네임만 있는 프로필에도 전적을 쌓는다', () => {
    expect(mergeProfile({ name: 'tester' }, 1)).toEqual({
      games: 1,
      wins: 1,
      best: 1,
      recent: [1],
    })
  })

  it('칸이 하나씩 비어 있어도 그 칸만 기본값으로 친다', () => {
    expect(mergeProfile({ games: 3, recent: [2] }, 4)).toEqual({
      games: 4,
      wins: 0,
      best: 4,
      recent: [4, 2],
    })
  })

  it('망가진 값이 와도 셈이 이어진다 — 저장이 한 번 어긋나도 판은 끝나야 한다', () => {
    expect(mergeProfile({ games: 'x', wins: null, best: 0, recent: 'nope' }, 2)).toEqual({
      games: 1,
      wins: 0,
      best: 2,
      recent: [2],
    })
  })
})

const data = await loadData()

describe('applyMatchResult — 판 하나가 프로필에 남기는 것 전부', () => {

  const owner = () => ({
    name: '홍길동',
    owned: ['avatar_fox'],
    look: { board: 'ember', avatar: 'avatar_fox', boom: 'boom_star' },
    gems: 100,
    lp: 200,
    pass: { xp: 40, level: 1, premium: true },
    games: 3,
    wins: 1,
    best: 2,
    recent: [2, 5, 7],
  })

  // 이걸 안 지키면 판 한 번 돌 때마다 산 아바타와 닉네임이 지워진다.
  // 돈 주고 산 것이 사라지는 자리라 다른 어떤 것보다 먼저다.
  it('전적과 무관한 칸(이름·보유·겉모습)은 그대로 남는다', () => {
    const next = applyMatchResult(owner(), 1, data)
    expect(next.name).toBe('홍길동')
    expect(next.owned).toEqual(['avatar_fox'])
    expect(next.look).toEqual({ board: 'ember', avatar: 'avatar_fox', boom: 'boom_star' })
    expect(next.pass.premium).toBe(true)
  })

  it('전적·LP·패스·젬을 한 번에 올린다', () => {
    const next = applyMatchResult(owner(), 1, data)
    expect(next.games).toBe(4)
    expect(next.wins).toBe(2)
    expect(next.best).toBe(1)
    expect(next.lp).toBe(owner().lp + lpForRank(1))
    expect(next.pass.xp).toBeGreaterThan(owner().pass.xp)
    expect(next.gems).toBeGreaterThanOrEqual(owner().gems)
  })

  it('일반 판은 LP 를 안 건드리고 경험치는 절반이다', () => {
    const casual = applyMatchResult(owner(), 1, data, { ranked: false })
    const ranked = applyMatchResult(owner(), 1, data, { ranked: true })
    expect(casual.lp).toBe(owner().lp)
    expect(casual.pass.xp - owner().pass.xp).toBeLessThan(ranked.pass.xp - owner().pass.xp)
  })

  it('아무것도 없는 계정도 판 하나로 프로필이 선다', () => {
    const next = applyMatchResult(null, 4, data)
    expect(next.games).toBe(1)
    expect(next.lp).toBe(lpForRank(4))
    expect(next.gems).toBe(0)
  })

  it('원본을 안 고친다', () => {
    const p = owner()
    applyMatchResult(p, 1, data)
    expect(p).toEqual(owner())
  })
})
