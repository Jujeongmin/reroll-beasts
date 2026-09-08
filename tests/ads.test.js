// 광고 보상. 서버가 이 함수로 지급하므로 여기서 못박는다 — 화면에서만 막으면
// 조작된 호출 하나로 광고를 안 본 경험치가 들어온다.
import { describe, it, expect, beforeAll } from 'vitest'
import { loadData } from '../sim/data.js'
import { adReward, PLACEMENTS } from '../sim/ads.js'
import { xpForRank } from '../sim/pass.js'

let data
beforeAll(async () => {
  data = await loadData()
})

const MATCH = 'room#123'
const base = () => ({ lastMatch: MATCH, pass: { xp: 0, level: 1, premium: false }, gems: 0 })
const args = (o = {}) => ({ placementId: 'result-double', matchId: MATCH, rank: 1, ranked: true, dayKey: '2026-09-07', ...o })

describe('adReward', () => {
  it('이번 판이 준 만큼을 한 번 더 준다 — 등수에서 다시 센다', () => {
    const r = adReward(base(), args(), data)
    expect(r.ok).toBe(true)
    expect(r.xp).toBe(xpForRank(1, data, { ranked: true }))
    expect(r.profile.pass.xp).toBe(r.xp)
  })

  it('일반 판은 일반 판 배율로 준다', () => {
    const r = adReward(base(), args({ ranked: false, rank: 3 }), data)
    expect(r.ok).toBe(true)
    expect(r.xp).toBe(xpForRank(3, data, { ranked: false }))
  })

  it('모르는 지면은 거절한다 — 지급량은 표가 정한다', () => {
    expect(adReward(base(), args({ placementId: 'revive' }), data).why).toBe('unknown_placement')
  })

  it('정산된 그 판이 아니면 거절한다 — 다른 판 광고로 못 받는다', () => {
    expect(adReward(base(), args({ matchId: 'room#999' }), data).why).toBe('no_match')
    expect(adReward({ ...base(), lastMatch: null }, args(), data).why).toBe('no_match')
  })

  it('한 판에 한 번이다', () => {
    const first = adReward(base(), args(), data)
    const again = adReward(first.profile, args(), data)
    expect(again.why).toBe('already')
  })

  it('하루 상한을 넘기면 거절하고, 날이 바뀌면 다시 센다', () => {
    let p = base()
    const cap = PLACEMENTS['result-double'].dailyCap
    for (let i = 0; i < cap; i++) {
      const r = adReward({ ...p, lastMatch: `m${i}` }, args({ matchId: `m${i}` }), data)
      expect(r.ok, `${i}번째`).toBe(true)
      p = r.profile
    }
    const over = adReward({ ...p, lastMatch: 'mX' }, args({ matchId: 'mX' }), data)
    expect(over.why).toBe('cap')
    const tomorrow = adReward({ ...p, lastMatch: 'mX' }, args({ matchId: 'mX', dayKey: '2026-09-08' }), data)
    expect(tomorrow.ok).toBe(true)
    expect(tomorrow.profile.ads['result-double'].count).toBe(1)
  })

  it('프로필이 없으면 줄 자리가 없다', () => {
    expect(adReward(null, args(), data).why).toBe('no_profile')
  })

  it('지면 id 는 SDK 에 넘기는 글자와 같다 — 하이픈 소문자', () => {
    for (const id of Object.keys(PLACEMENTS)) expect(id).toMatch(/^[a-z-]+$/)
  })
})

describe('하루 상자', () => {
  const chest = (o = {}) => ({ placementId: 'daily-chest', dayKey: '2026-09-08', ...o })
  const gems = PLACEMENTS['daily-chest'].gems

  it('판과 무관하게 받는다 — 판을 안 해도 받을 수 있는 유일한 젬이다', () => {
    const r = adReward({ gems: 0 }, chest(), data)
    expect(r.ok).toBe(true)
    expect(r.gems).toBe(gems)
    expect(r.profile.gems).toBe(gems)
  })

  it('하루 한 번이다', () => {
    const first = adReward({ gems: 0 }, chest(), data)
    const again = adReward(first.profile, chest(), data)
    expect(again.ok).toBe(false)
    expect(['already', 'cap']).toContain(again.why)
  })

  it('날이 바뀌면 다시 받는다', () => {
    const first = adReward({ gems: 0 }, chest(), data)
    const tomorrow = adReward(first.profile, chest({ dayKey: '2026-09-09' }), data)
    expect(tomorrow.ok).toBe(true)
    expect(tomorrow.profile.gems).toBe(gems * 2)
  })

  it('패스 경험치는 안 건드린다 — 젬만 주는 지면이다', () => {
    const before = { gems: 0, pass: { xp: 40, level: 1, premium: false } }
    const r = adReward(before, chest(), data)
    expect(r.xp).toBe(0)
    expect(r.profile.pass).toEqual(before.pass)
  })

  it('전적이 없으면 줄 자리가 없다', () => {
    expect(adReward(null, chest(), data).why).toBe('no_profile')
  })

  it('결과판 지면은 여전히 그 판이 정산됐어야 한다 — 하루 열쇠로 못 받는다', () => {
    const r = adReward({ gems: 0 }, { placementId: 'result-double', dayKey: '2026-09-08' }, data)
    expect(r.why).toBe('no_match')
  })
})
