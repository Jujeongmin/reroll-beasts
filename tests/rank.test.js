// 순위는 "언제 죽었나" 로 정해진다. 이 규칙이 흔들리면 전적이 통째로 거짓말이
// 되는데, 화면에서는 몇 판 지나야 드러난다 — 그래서 여기서 잡는다.
import { describe, it, expect } from 'vitest'
import { assignRanks } from '../sim/lobbyRound.js'
import { divisionOf, divisionLabel, nextDivisionLabel, phaseOf, lpDelta, phaseProgress, addLp, lpForRank, PLACEMENT, SOFT } from '../sim/rank.js'

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

describe('divisionOf', () => {
  it('티어를 다섯 칸으로 나눈다 — 5 가 가장 낮고 1 이 가장 높다', () => {
    expect(divisionLabel(700)).toBe('골드 5')
    expect(divisionLabel(1199)).toBe('골드 1')
  })

  it('칸 하나는 티어 폭의 5분의 1이다', () => {
    // 골드는 700~1200 이라 한 칸이 100 이다.
    expect(divisionOf(700).to - divisionOf(700).from).toBe(100)
    expect(divisionOf(812).division).toBe(4)
  })

  it('문턱 바로 아래가 위 칸으로 새지 않는다', () => {
    expect(divisionOf(1199.9).division).toBe(1)
    expect(divisionLabel(1200)).toBe('플래티넘 5')
  })

  it('최고 티어도 다섯 칸이다 — 정해 둔 폭을 자로 쓴다', () => {
    expect(divisionLabel(1800)).toBe('다이아 5')
    expect(divisionLabel(1920)).toBe('다이아 4')
    expect(divisionLabel(2280)).toBe('다이아 1')
  })

  it('최고 칸 위로는 계속 1 단계다 — 그 위를 또 나누면 끝이 없다', () => {
    expect(divisionLabel(9999)).toBe('다이아 1')
    // 갈 곳이 없으니 "다음 칸까지 얼마" 도 없다. 없는 목표를 적으면 거짓말이다.
    expect(divisionOf(9999).to).toBe(null)
    expect(divisionOf(9999).need).toBe(null)
    expect(divisionOf(9999).ratio).toBe(1)
  })

  it('바로 위 칸의 이름은 티어를 넘어서도 이어진다', () => {
    expect(nextDivisionLabel(1199)).toBe('플래티넘 5')
    expect(nextDivisionLabel(1750)).toBe('다이아 5')
    expect(nextDivisionLabel(1800)).toBe('다이아 4')
    // 마지막 칸에는 위가 없다.
    expect(nextDivisionLabel(2280)).toBe(null)
  })

  it('음수 LP 도 견딘다 — 가장 낮은 칸으로 떨어진다', () => {
    expect(divisionOf(-50).division).toBe(5)
  })
})

describe('배치 · 준배치', () => {
  it('첫 다섯 판은 배치, 다음 열 판은 준배치, 그 뒤는 평소다', () => {
    expect(phaseOf(0)).toBe('placement')
    expect(phaseOf(4)).toBe('placement')
    expect(phaseOf(5)).toBe('soft')
    expect(phaseOf(14)).toBe('soft')
    expect(phaseOf(15)).toBe('normal')
  })

  it('배치 1위 한 판은 브론즈 한 티어(300) 이상이다 — 거의 1티어가 규칙이다', () => {
    expect(lpDelta(1, 0)).toBeGreaterThanOrEqual(300)
  })

  it('배치 표는 1위가 가장 크고 단조 감소다', () => {
    for (let r = 2; r <= 8; r++) expect(PLACEMENT.byRank[r]).toBeLessThan(PLACEMENT.byRank[r - 1])
    expect(PLACEMENT.byRank).toHaveLength(9)
  })

  it('준배치는 평소의 배수이고 배율은 1 보다 크다', () => {
    expect(SOFT.scale).toBeGreaterThan(1)
    expect(lpDelta(1, 5)).toBe(lpForRank(1) * SOFT.scale)
    expect(lpDelta(8, 14)).toBe(lpForRank(8) * SOFT.scale)
  })

  it('어느 구간에서도 LP 는 0 아래로 안 간다', () => {
    expect(addLp(10, 8, 0)).toBe(0)
    expect(addLp(10, 8, 5)).toBe(0)
    expect(addLp(10, 8, 99)).toBe(0)
  })

  it('몇 판째인지 센다 — 첫 판이 1/5, 여섯째 판이 준배치 1/10', () => {
    expect(phaseProgress(0)).toEqual({ phase: 'placement', n: 1, of: 5 })
    expect(phaseProgress(5)).toEqual({ phase: 'soft', n: 1, of: 10 })
    expect(phaseProgress(15)).toBe(null)
  })
})
