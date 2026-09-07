import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { createLobbyState, resolveRound, prepMs, roundSeed, markMine } from '../sim/lobbyRound.js'
import { totalRounds } from '../sim/rounds.js'

const data = await loadData()

/** 마감이 지난 시각. 규칙이 시계를 인자로 받으므로 기다릴 필요가 없다. */
const past = (state) => state.deadline + 1

function fresh(seed = 1234) {
  return createLobbyState({ seed, account: 'me', now: 0, data })
}

describe('createLobbyState', () => {
  it('8석을 채우고 0번만 사람이다', () => {
    const s = fresh()
    expect(s.seats).toHaveLength(data.lobby.size)
    expect(s.seats[0].isBot).toBe(false)
    expect(s.seats[0].account).toBe('me')
    expect(s.seats.slice(1).every((x) => x.isBot)).toBe(true)
  })

  it('봇은 입장 시점에 이미 판을 들고 있다', () => {
    // 안 그러면 첫 라운드에 빈 판과 싸워 전원이 부전승한다.
    const s = fresh()
    expect(s.seats.slice(1).every((x) => x.board.length > 0)).toBe(true)
    expect(s.seats[0].board).toHaveLength(0)
  })

  it('accounts 를 주면 사람이 앞자리부터 앉는다', () => {
    const s = createLobbyState({ seed: 1, accounts: ['a1', 'a2', 'a3'], now: 0, data })
    expect(s.seats[0].account).toBe('a1')
    expect(s.seats[2].account).toBe('a3')
    expect(s.seats[2].isBot).toBe(false)
    expect(s.seats[3].isBot).toBe(true)
    // 사람 자리는 판이 비어 있고 봇 자리는 차 있다
    expect(s.seats[1].board).toHaveLength(0)
    expect(s.seats[3].board.length).toBeGreaterThan(0)
  })

  it('8명이 다 사람이면 봇이 없다', () => {
    const acc = ['a','b','c','d','e','f','g','h']
    const s = createLobbyState({ seed: 1, accounts: acc, now: 0, data })
    expect(s.seats.every((x) => !x.isBot)).toBe(true)
  })

  it('첫 라운드 배치 시간이 나머지보다 길다', () => {
    expect(prepMs(1, data)).toBeGreaterThan(prepMs(2, data))
  })
})

describe('resolveRound — 마감 판정', () => {
  it('시각이 안 됐으면 아무것도 안 한다', () => {
    const s = fresh()
    const before = JSON.stringify(s)
    const r = resolveRound(s, s.deadline - 1, data)
    expect(r.changed).toBe(false)
    expect(JSON.stringify(s)).toBe(before)
  })

  it('시각이 지나면 라운드가 넘어간다', () => {
    const s = fresh()
    const r = resolveRound(s, past(s), data)
    expect(r.changed).toBe(true)
    expect(s.round).toBe(2)
    expect(s.phase).toBe('prep')
  })

  it('early 면 마감 전에도 넘어간다 — 1인 방 전용 허용', () => {
    const s = fresh()
    const r = resolveRound(s, 0, data, { early: true })
    expect(r.changed).toBe(true)
    expect(s.round).toBe(2)
  })

  it('early 라도 끝난 판은 안 돈다', () => {
    const s = fresh()
    s.phase = 'done'
    expect(resolveRound(s, 0, data, { early: true }).changed).toBe(false)
  })

  it('끝난 판은 다시 안 돈다', () => {
    const s = fresh()
    s.phase = 'done'
    expect(resolveRound(s, past(s), data).changed).toBe(false)
  })

  it('다음 마감이 지금 기준으로 다시 잡힌다', () => {
    const s = fresh()
    const now = past(s)
    resolveRound(s, now, data)
    expect(s.deadline).toBe(now + prepMs(2, data))
  })
})

describe('resolveRound — 전투와 피해', () => {
  it('살아 있는 사람을 둘씩 묶어 전부 싸운다', () => {
    const s = fresh()
    const { fights } = resolveRound(s, past(s), data)
    // 8석이면 4쌍이다
    expect(fights).toHaveLength(4)
    const ids = fights.flatMap((f) => [f.a, f.b]).sort((x, y) => x - y)
    expect(ids).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('진 쪽만 체력을 잃는다', () => {
    const s = fresh()
    const before = s.seats.map((x) => x.hp)
    const { fights } = resolveRound(s, past(s), data)
    for (const f of fights) {
      const lostA = s.seats[f.a].hp < before[f.a]
      const lostB = s.seats[f.b].hp < before[f.b]
      if (f.winner === 'A') expect(lostA).toBe(false)
      if (f.winner === 'B') expect(lostB).toBe(false)
      // 무승부면 양쪽 다 잃는다 — 비겨서 아무 일도 안 나면 약한 판으로
      // 버티는 게 최선의 수가 된다.
      if (f.winner === 'draw') expect(lostA && lostB).toBe(true)
    }
  })

  it('빈 판으로 서 있으면 진다', () => {
    // 사람은 아무것도 안 놓았다. 봇은 판을 들고 있다.
    const s = fresh()
    resolveRound(s, past(s), data)
    expect(s.seats[0].hp).toBeLessThan(data.economy.startHp)
  })

  it('체력이 0이 되면 탈락 처리된다', () => {
    const s = fresh()
    s.seats[0].hp = 1
    resolveRound(s, past(s), data)
    expect(s.seats[0].hp).toBe(0)
    expect(s.seats[0].alive).toBe(false)
  })

  it('탈락한 좌석은 다음 대진에 안 들어간다', () => {
    const s = fresh()
    s.seats[0].hp = 1
    resolveRound(s, past(s), data)
    const { fights } = resolveRound(s, past(s), data)
    expect(fights.flatMap((f) => [f.a, f.b])).not.toContain(0)
  })
})

describe('resolveRound — 종료 조건', () => {
  it('마지막 라운드를 넘기면 끝난다', () => {
    const s = fresh()
    s.round = totalRounds(data.rounds)
    resolveRound(s, past(s), data)
    expect(s.phase).toBe('done')
  })

  it('한 명만 남으면 끝난다', () => {
    const s = fresh()
    for (const seat of s.seats.slice(2)) {
      seat.alive = false
      seat.hp = 0
    }
    s.seats[0].hp = 1
    resolveRound(s, past(s), data)
    expect(s.phase).toBe('done')
  })
})

describe('결정론', () => {
  it('같은 시드는 같은 대진과 같은 전투 결과를 낸다', () => {
    const a = fresh(999)
    const b = fresh(999)
    const ra = resolveRound(a, past(a), data)
    const rb = resolveRound(b, past(b), data)
    expect(rb.fights).toEqual(ra.fights)
    expect(b.seats.map((x) => x.hp)).toEqual(a.seats.map((x) => x.hp))
  })

  it('시드가 다르면 대진이 갈린다', () => {
    const seen = new Set()
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = fresh(seed)
      resolveRound(s, past(s), data)
      seen.add(JSON.stringify(s.pairs))
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('라운드마다 시드가 반드시 달라진다', () => {
    const seeds = new Set()
    for (let n = 1; n <= totalRounds(data.rounds); n++) seeds.add(roundSeed(4242, n))
    expect(seeds.size).toBe(totalRounds(data.rounds))
  })
})

describe('한 판을 끝까지', () => {
  it('23라운드를 돌려도 상태가 깨지지 않는다', () => {
    const s = fresh(20260902)
    let guard = 0
    while (s.phase === 'prep' && guard++ < 100) {
      resolveRound(s, past(s), data)
      for (const seat of s.seats) {
        expect(seat.hp).toBeGreaterThanOrEqual(0)
        expect(seat.hp).toBeLessThanOrEqual(data.economy.startHp)
        expect(seat.alive).toBe(seat.hp > 0)
      }
    }
    expect(s.phase).toBe('done')
    expect(guard).toBeLessThan(100)
  })
})

describe('markMine — 내 좌석 찾기', () => {
  const seats = () => [
    { id: 0, account: '0xAAA', isBot: false },
    { id: 1, account: null, isBot: true },
    { id: 2, account: '0xBBB', isBot: false },
  ]

  // 사람이 여럿인 방에서 "사람 = 나" 로 치면 남의 좌석이 전부 내 좌석으로
  // 표시된다. 그러면 순위표의 [나] 표시, 남의 판 구경, 정찰 갱신이 전부
  // 엉뚱한 자리를 가리킨다.
  it('내 계정 좌석 하나만 나다', () => {
    const list = markMine(seats(), '0xBBB')
    expect(list.map((s) => s.isPlayer)).toEqual([false, false, true])
  })

  it('대소문자가 달라도 같은 계정이다 — 지갑 주소 표기가 갈린다', () => {
    expect(markMine(seats(), '0xbbb')[2].isPlayer).toBe(true)
  })

  it('내가 없는 방이면 아무 좌석도 내 것이 아니다 — 관전으로 들어올 수 있다', () => {
    expect(markMine(seats(), '0xCCC').some((s) => s.isPlayer)).toBe(false)
  })

  it('계정을 모르면 아무 좌석도 안 집는다 — 남의 자리를 내 자리로 쓰느니 없는 편이 낫다', () => {
    expect(markMine(seats(), null).some((s) => s.isPlayer)).toBe(false)
  })
})

describe('seat.wins — 라운드 승수', () => {
  // 승수는 순위로는 안 나온다. 4위로 끝나도 라운드는 다섯 번 이겼을 수 있다.
  // 미션("한 판에서 라운드 3승")이 이 값을 읽는다.
  it('새 좌석은 0 에서 시작한다', () => {
    const s = fresh(1)
    expect(s.seats.every((x) => x.wins === 0)).toBe(true)
  })

  it('이긴 좌석만 오른다', () => {
    const s = fresh(20260907)
    resolveRound(s, past(s), data)
    for (const seat of s.seats) {
      expect(seat.wins).toBe(seat.lastWon ? 1 : 0)
    }
  })

  it('여러 라운드에 걸쳐 쌓인다', () => {
    const s = fresh(777)
    for (let i = 0; i < 3 && s.phase === 'prep'; i++) resolveRound(s, past(s), data)
    expect(s.seats.reduce((n, x) => n + x.wins, 0)).toBeGreaterThan(0)
    // 한 판에 한 좌석이 이길 수 있는 최대는 돈 라운드 수다.
    expect(Math.max(...s.seats.map((x) => x.wins))).toBeLessThanOrEqual(3)
  })
})
