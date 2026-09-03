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
