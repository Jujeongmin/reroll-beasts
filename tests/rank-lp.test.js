// LP·티어 규칙. 한 번 틀리면 되돌릴 근거가 없다 — 누적만 하고 원본 기록을
// 안 남기기 때문이다. 그래서 표와 경계를 여기서 못박는다.
import { describe, it, expect } from 'vitest'
import {
  lpForRank,
  addLp,
  tierOf,
  tierProgress,
  sortLeaderboard,
  rankOf,
  TIERS,
} from '../sim/rank.js'

describe('lpForRank', () => {
  it('1위가 가장 크고 8위가 가장 작다', () => {
    expect(lpForRank(1)).toBe(40)
    expect(lpForRank(8)).toBe(-32)
  })

  it('4위가 0 이다 — 절반보다 잘하면 오르고 못하면 내린다', () => {
    expect(lpForRank(4)).toBe(0)
    expect(lpForRank(3)).toBeGreaterThan(0)
    expect(lpForRank(5)).toBeLessThan(0)
  })

  it('순위가 낮을수록 LP 가 작다 — 뒤집힌 구간이 없어야 한다', () => {
    for (let r = 1; r < 8; r++) {
      expect(lpForRank(r)).toBeGreaterThan(lpForRank(r + 1))
    }
  })

  it('표에 없는 순위는 0 이다 — 없는 규칙을 지어내지 않는다', () => {
    expect(lpForRank(0)).toBe(0)
    expect(lpForRank(9)).toBe(0)
    expect(lpForRank(undefined)).toBe(0)
  })
})

describe('addLp', () => {
  it('없던 LP 에 더할 수 있다', () => {
    expect(addLp(null, 1)).toBe(40)
  })

  it('0 아래로는 안 내려간다', () => {
    expect(addLp(10, 8)).toBe(0)
    expect(addLp(0, 8)).toBe(0)
  })
})

describe('tierOf', () => {
  it('시작은 브론즈다', () => {
    expect(tierOf(0).id).toBe('bronze')
    expect(tierOf(null).id).toBe('bronze')
  })

  it('문턱에 닿는 순간 다음 티어다', () => {
    expect(tierOf(299).id).toBe('bronze')
    expect(tierOf(300).id).toBe('silver')
    expect(tierOf(1800).id).toBe('diamond')
  })

  it('최고 티어 위로는 더 안 올라간다', () => {
    expect(tierOf(99999).id).toBe('diamond')
  })
})

describe('tierProgress', () => {
  it('다음 티어까지 남은 LP 를 센다', () => {
    const p = tierProgress(100)
    expect(p.next.id).toBe('silver')
    expect(p.need).toBe(200)
    expect(p.ratio).toBeCloseTo(100 / 300, 5)
  })

  it('구간 시작에서는 0, 끝에서는 1 에 가깝다', () => {
    expect(tierProgress(0).ratio).toBe(0)
    expect(tierProgress(299).ratio).toBeCloseTo(299 / 300, 5)
  })

  it('최고 티어면 다음이 없다', () => {
    expect(tierProgress(2000)).toBe(null)
  })

  it('티어 문턱은 오름차순이다 — 순서가 뒤집히면 tierOf 가 조용히 틀린다', () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i].at).toBeGreaterThan(TIERS[i - 1].at)
    }
  })
})

describe('순위표', () => {
  const rows = [
    { account: 'c', lp: 700, best: 3 },
    { account: 'a', lp: 900, best: 1 },
    { account: 'b', lp: 700, best: 1 },
    { account: 'd', lp: 0, best: 8 },
  ]

  it('LP 내림차순이다', () => {
    expect(sortLeaderboard(rows).map((r) => r.account)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('동점이면 최고 순위가 좋은 쪽이 앞이다', () => {
    const s = sortLeaderboard(rows)
    expect(s[1].account).toBe('b')
    expect(s[2].account).toBe('c')
  })

  it('LP·최고까지 같으면 계정 순으로 고정한다 — 새로고침마다 등수가 바뀌면 안 된다', () => {
    const tie = [
      { account: 'z', lp: 100, best: 2 },
      { account: 'y', lp: 100, best: 2 },
    ]
    expect(sortLeaderboard(tie).map((r) => r.account)).toEqual(['y', 'z'])
    expect(sortLeaderboard([...tie].reverse()).map((r) => r.account)).toEqual(['y', 'z'])
  })

  it('원본을 안 고친다', () => {
    const before = rows.map((r) => r.account)
    sortLeaderboard(rows)
    expect(rows.map((r) => r.account)).toEqual(before)
  })

  it('등수는 1부터, 없으면 null', () => {
    expect(rankOf(rows, 'a')).toBe(1)
    expect(rankOf(rows, 'd')).toBe(4)
    expect(rankOf(rows, '없는사람')).toBe(null)
  })
})
