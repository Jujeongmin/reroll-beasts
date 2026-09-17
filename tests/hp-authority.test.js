// 체력의 주인은 서버다.
//
// 사람 여럿인 방에서 서로 보는 체력이 달랐다. 두 갈래였다:
//   1. 전투 연출이 먼저 끝난 사람이 판정을 부르고, 그 방송이 **아직 연출
//      중인 사람**에게 먼저 닿는다. 그 사람은 정산에서 이미 깎인 체력을 한
//      번 더 깎았다.
//   2. 각자 정찰로 받은 상대 판으로 전투를 돌렸다. 상대의 마지막 수정은
//      마감 순간에 올라와 늦게 닿으므로 사람마다 다른 전투를 봤다.
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { loadData } from '@sim/data.js'
import { createLobbyState, resolveRound } from '@sim/lobbyRound.js'

let createServerMatchmaker
let data

beforeAll(async () => {
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  ;({ createServerMatchmaker } = await import('../game/src/serverMatchmaker.js'))
  data = await loadData()
})

const ME = 'me'

function room() {
  const s = createLobbyState({ seed: 7, accounts: [ME, 'you'], now: 0, data })
  for (const seat of s.seats) seat.board = [{ unitId: 'frog', star: 1, tile: seat.id, items: [] }]
  return s
}

/** 서버 흉내. resolveRound 는 진짜 sim 으로 판정하고 방송도 낸다. */
function fakeServer(state) {
  const server = JSON.parse(JSON.stringify(state))
  const handlers = {}
  const calls = []
  const broadcast = (name, m) => handlers[name]?.(m)
  const remoteFunction = vi.fn(async (name) => {
    calls.push(name)
    if (name === 'joinMatchRoom') return JSON.parse(JSON.stringify(state))
    if (name === 'resolveRound') {
      const { changed, fights } = resolveRound(server, Infinity, data)
      if (changed) {
        broadcast('ROUND_RESOLVED', {
          round: server.round,
          phase: server.phase,
          deadline: server.deadline,
          fights: fights.map(({ boardA, boardB, ...f }) => f),
          seats: server.seats.map((s) => ({ id: s.id, hp: s.hp, alive: s.alive, streak: s.streak })),
        })
      }
      return JSON.parse(JSON.stringify(server))
    }
    return { ok: true }
  })
  return {
    calls,
    server,
    broadcast,
    client: {
      account: ME,
      remoteFunction,
      onRoomMessage: (_room, name, fn) => (handlers[name] = fn),
    },
  }
}

describe('체력은 서버 판정을 따른다', () => {
  it('연출 중에 판정 방송이 와도 남의 체력을 두 번 깎지 않는다', async () => {
    const state = room()
    const fake = fakeServer(state)
    const mm = await createServerMatchmaker({ data, server: fake.client, roomId: 'r' })
    const n = state.round
    mm.round(n)
    const others = mm.otherFights(n)
    expect(others.length).toBeGreaterThan(0)

    // 다른 사람이 먼저 판정을 불렀다 — 방송이 연출 도중에 닿는다.
    await fake.client.remoteFunction('resolveRound', [])
    const truth = fake.server.seats.map((s) => s.hp)
    expect(mm.seats.map((s) => s.hp)).toEqual(truth)

    // 이제 내 연출이 끝나 정산한다.
    mm.applyFights(others, { stageDamage: 5, round: n })
    expect(mm.seats.map((s) => s.hp)).toEqual(truth)
    expect(mm.judgedThrough()).toBe(n)
  })

  it('전투는 서버가 판정한 판으로 돌린다 — 늦은 정찰 판이 아니라', async () => {
    const state = room()
    const fake = fakeServer(state)
    const mm = await createServerMatchmaker({ data, server: fake.client, roomId: 'r' })
    const n = state.round
    mm.round(n)
    // 서버에는 누군가의 마지막 판이 들어갔는데, 내 미러에는 아직 안 왔다.
    const late = [{ unitId: 'frog', star: 3, tile: 3, items: [] }]
    fake.server.seats[3].board = late

    const fights = await mm.judge(n, { gapMs: 0 })
    expect(fights).not.toBeNull()
    const f = fights.find((x) => x.a === 3 || x.b === 3)
    expect(f.a === 3 ? f.boardA : f.boardB).toEqual(late)
    // 남의 전투 재생도 서버 판을 쓴다 — 승패가 서버와 같다.
    for (const o of mm.otherFights(n)) {
      const s = fights.find((x) => x.a === o.a && x.b === o.b)
      expect(o.winner).toBe(s.winner)
    }
  })

  it('판정받은 라운드는 다음으로 넘어갈 때 또 청하지 않는다', async () => {
    // 1인 방은 부르는 즉시 판정되므로, 또 부르면 다음 라운드가 빈손으로 돈다.
    const state = room()
    const fake = fakeServer(state)
    const mm = await createServerMatchmaker({ data, server: fake.client, roomId: 'r' })
    const n = state.round
    mm.round(n)
    await mm.judge(n, { gapMs: 0 })
    const before = fake.calls.filter((c) => c === 'resolveRound').length
    mm.advance(n + 1)
    expect(fake.calls.filter((c) => c === 'resolveRound').length).toBe(before)
  })
})
