// 홈은 상태가 셋(접속 중·실패·접속됨)이고 각각이 화면으로 성립해야 한다.
// 하나라도 비면 그 상태에 빠진 사람은 멈춘 화면을 본다. DOM 없이 검사할 수
// 있도록 결정을 순수 함수로 떼어 놨다.
import { describe, it, expect } from 'vitest'
import { homeView } from '../game/src/home-state.js'

const data = { lobby: { size: 8 } }
const base = { status: 'ready', hasAuth: true, profile: null, queue: null, data }

describe('homeView', () => {
  it('접속 중이면 메뉴가 눌리지 않는다', () => {
    const v = homeView({ ...base, status: 'connecting' })
    expect(v.menu).toBe('disabled')
    expect(v.notice).toContain('붙는 중')
  })

  it('인증이 없으면 로컬 실행이라고 정확히 말한다', () => {
    const v = homeView({ ...base, status: 'failed', hasAuth: false })
    expect(v.menu).toBe('disabled')
    expect(v.notice).toContain('로컬')
    expect(v.notice).not.toContain('서버 오류')
  })

  it('인증이 있는데 실패면 서버 쪽 문제로 말한다', () => {
    const v = homeView({ ...base, status: 'failed', hasAuth: true })
    expect(v.notice).toContain('서버')
    expect(v.notice).not.toContain('로컬')
  })

  it('접속되면 메뉴가 열린다', () => {
    expect(homeView(base).menu).toBe('enabled')
  })

  it('기록이 없으면 첫 판을 기다린다고 쓴다 — 0 으로 채우지 않는다', () => {
    const v = homeView(base)
    expect(v.profile).toBe(null)
    expect(v.notice).toBe(null)
  })

  it('전적이 있으면 머리줄과 최근 기록을 만든다', () => {
    const profile = { games: 12, wins: 2, best: 1, recent: [3, 5, 1, 8, 2] }
    const v = homeView({ ...base, profile })
    expect(v.profile.head).toBe('전적 12판 · 최고 1위')
    expect(v.profile.recent).toEqual([3, 5, 1, 8, 2])
  })

  it('대기 중에는 메뉴가 사라지고 대기줄이 그 자리를 쓴다', () => {
    const v = homeView({
      ...base,
      queue: { mode: 'normal', queued: 3, waitedMs: 12400 },
    })
    expect(v.menu).toBe('hidden')
    expect(v.queue.text).toBe('일반 대기 3/8 · 12초')
  })

  it('랭크 대기는 랭크라고 쓴다', () => {
    const v = homeView({
      ...base,
      queue: { mode: 'ranked', queued: 8, waitedMs: 0 },
    })
    expect(v.queue.text).toBe('랭크 대기 8/8 · 0초')
  })
})

describe('튜토리얼 버튼', () => {
  it('서버에 못 붙어도 튜토리얼은 눌린다 — 배울 곳까지 잠기면 안 된다', () => {
    expect(homeView({ ...base, status: 'failed', hasAuth: false }).tutorial).toBe('enabled')
    expect(homeView({ ...base, status: 'connecting' }).tutorial).toBe('enabled')
  })

  it('대기 중에는 튜토리얼도 감춘다 — 큐를 두고 다른 데로 가면 안 된다', () => {
    const v = homeView({ ...base, queue: { mode: 'normal', queued: 2, waitedMs: 0 } })
    expect(v.tutorial).toBe('hidden')
  })
})

describe('프로필 티어', () => {
  const withLp = (lp) => homeView({
    ...base,
    profile: { games: 9, wins: 1, best: 2, recent: [2], lp },
  }).profile

  it('LP 에서 티어를 만든다 — 티어를 서버에 저장하지 않는다', () => {
    expect(withLp(0).tier).toBe('브론즈')
    expect(withLp(300).tier).toBe('실버')
    expect(withLp(1800).tier).toBe('다이아')
  })

  it('다음 티어까지 남은 LP 와 진행도를 준다', () => {
    const v = withLp(100)
    expect(v.next.name).toBe('실버')
    expect(v.next.need).toBe(200)
    expect(v.next.ratio).toBeCloseTo(1 / 3, 3)
  })

  it('최고 티어면 다음이 없다 — 막대를 안 그린다', () => {
    expect(withLp(2000).next).toBe(null)
  })

  it('LP 가 없던 전적은 0 으로 읽는다 — 예전 기록에는 lp 가 없다', () => {
    expect(withLp(undefined).lp).toBe(0)
    expect(withLp(undefined).tier).toBe('브론즈')
  })
})
