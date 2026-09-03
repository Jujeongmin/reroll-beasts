// 전적은 한 번 틀리면 되돌릴 근거가 없다 — 원본 기록을 안 남기고 누적만 하기
// 때문이다. 그래서 누적 규칙을 순수 함수로 떼어 여기서 못박는다.
import { describe, it, expect } from 'vitest'
import { mergeProfile } from '../sim/profile.js'

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
