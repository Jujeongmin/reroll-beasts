// 순위는 "언제 죽었나" 로 정해진다. 이 규칙이 흔들리면 전적이 통째로 거짓말이
// 되는데, 화면에서는 몇 판 지나야 드러난다 — 그래서 여기서 잡는다.
import { describe, it, expect } from 'vitest'
import { assignRanks } from '../sim/lobbyRound.js'

/** 좌석 8개. alive/hp/account 만 순위에 쓰인다. */
function seats(spec) {
  return spec.map((s, id) => ({
    id,
    account: s.bot ? null : `0xacc${id}`,
    isBot: !!s.bot,
    hp: s.hp ?? 100,
    alive: s.alive !== false,
  }))
}

describe('assignRanks', () => {
  it('한 명 탈락하면 꼴찌 순위가 박힌다', () => {
    const state = { seats: seats([{ alive: false, hp: 0 }, {}, {}, {}, {}, {}, {}, {}]) }
    const out = assignRanks(state)
    expect(state.seats[0].rank).toBe(8)
    expect(out).toEqual([{ account: '0xacc0', rank: 8 }])
  })

  it('같은 라운드에 둘이 죽으면 같은 순위다', () => {
    const state = {
      seats: seats([{ alive: false, hp: 0 }, { alive: false, hp: 0 }, {}, {}, {}, {}, {}, {}]),
    }
    assignRanks(state)
    expect(state.seats[0].rank).toBe(7)
    expect(state.seats[1].rank).toBe(7)
  })

  it('봇은 반환에 안 들어간다 — 계정이 없다', () => {
    const state = {
      seats: seats([{ alive: false, hp: 0, bot: true }, {}, {}, {}, {}, {}, {}, {}]),
    }
    const out = assignRanks(state)
    expect(state.seats[0].rank).toBe(8)
    expect(out).toEqual([])
  })

  it('이미 순위가 박힌 좌석은 다시 안 매긴다', () => {
    const state = { seats: seats([{ alive: false, hp: 0 }, {}, {}, {}, {}, {}, {}, {}]) }
    assignRanks(state)
    const out = assignRanks(state)
    expect(out).toEqual([])
    expect(state.seats[0].rank).toBe(8)
  })

  it('마지막 하나가 남으면 1위가 박힌다', () => {
    const dead = { alive: false, hp: 0 }
    const state = { seats: seats([{}, dead, dead, dead, dead, dead, dead, dead]) }
    const out = assignRanks(state)
    expect(state.seats[0].rank).toBe(1)
    expect(out.find((x) => x.rank === 1).account).toBe('0xacc0')
  })

  it('완주로 끝나면 남은 생존자는 체력 순, 동체력은 동순위', () => {
    const dead = { alive: false, hp: 0 }
    const state = {
      seats: seats([{ hp: 30 }, { hp: 50 }, { hp: 30 }, dead, dead, dead, dead, dead]),
    }
    assignRanks(state, { final: true })
    expect(state.seats[1].rank).toBe(1)
    expect(state.seats[0].rank).toBe(2)
    expect(state.seats[2].rank).toBe(2)
  })
})
