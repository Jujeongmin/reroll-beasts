// 판이 끝나는 자리.
//
// 여기서 지키는 것은 하나다: **등수는 서버가 박고, 클라는 그것을 받아 온다.**
// 죽는 순간과 등수가 박히는 순간은 같지 않아서, 클라가 자기 체력만 보고
// 결과판을 그리면 등수 칸이 `–` 인 채로 굳는다. 그 어긋남은 봇 방(사람이 나
// 하나)에서만 드러나 손으로는 잘 안 잡힌다 — 사람이 여럿이면 남의 마감
// 호출이 우연히 대신 돌려 주기 때문이다.
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { loadData } from '@sim/data.js'
import { createLobbyState } from '@sim/lobbyRound.js'

let createServerMatchmaker
let data

beforeAll(async () => {
  // SDK 가 import 시점에 localStorage 를 읽는다. scout.test.js 와 같은 이유다.
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  ;({ createServerMatchmaker } = await import('../game/src/serverMatchmaker.js'))
  data = await loadData()
})

const ME = 'me'

/** 방 하나를 흉내 낸다. joinMatchRoom 이 준 상태를 그대로 들고 있는다. */
function fakeServer(state, extra = {}) {
  const calls = []
  const remoteFunction = vi.fn(async (name, args) => {
    calls.push(name)
    if (name === 'joinMatchRoom') return state
    if (name === 'getLobby') return extra.lobby ?? state
    if (name === 'resolveRound') return extra.resolved ?? null
    return { ok: true }
  })
  return {
    calls,
    server: { account: ME, remoteFunction, onRoomMessage() {} },
  }
}

/** 사람 하나(나) + 봇 일곱인 방. 봇 방이 이 버그가 드러나는 자리다. */
function room() {
  const s = createLobbyState({ seed: 99, accounts: [ME], now: 0, data })
  for (const seat of s.seats) seat.board = [{ unitId: 'frog', star: 1, tile: seat.id, items: [] }]
  return s
}

describe('탈락한 뒤의 결과판', () => {
  it('서버에 마감을 재촉하는 길이 있다', async () => {
    // 마감을 부르는 곳이 advance 하나뿐이면, 죽은 사람은 그 자리에서 정산을
    // 끝내고 나가므로 아무도 안 부른다. 봇 방에서는 대신 불러 줄 사람도 없다.
    const { server, calls } = fakeServer(room())
    const mm = await createServerMatchmaker({ data, server, roomId: 'r1' })
    await mm.resolveNow()
    expect(calls.filter((c) => c === 'resolveRound').length).toBe(1)
  })

  it('서버가 박은 등수를 좌석에 채운다', async () => {
    const state = room()
    // 서버 쪽 사본: 내가 5등으로 죽었고 6번 좌석도 함께 나갔다.
    const lobby = JSON.parse(JSON.stringify(state))
    lobby.seats[0].hp = 0
    lobby.seats[0].alive = false
    lobby.seats[0].rank = 5
    lobby.seats[6].alive = false
    lobby.seats[6].rank = 5

    const { server } = fakeServer(state, { lobby })
    const mm = await createServerMatchmaker({ data, server, roomId: 'r1' })
    expect(mm.seats[0].rank ?? null).toBe(null)

    await mm.refreshSeats()
    expect(mm.seats[0].rank).toBe(5)
    expect(mm.seats[0].alive).toBe(false)
    expect(mm.seats[6].rank).toBe(5)
  })

  it('남의 마지막 판은 서버 것으로 덮고, 내 판은 안 덮는다', async () => {
    // 내 판은 방금 싸운 그것이 화면에 있다. 서버 사본은 정찰 쓰로틀 때문에
    // 한 박자 늦을 수 있으므로 덮으면 결과판에 지난 판이 뜬다.
    const state = room()
    const lobby = JSON.parse(JSON.stringify(state))
    lobby.seats[0].board = [{ unitId: 'orc', star: 1, tile: 0, items: [] }]
    lobby.seats[3].board = [{ unitId: 'wizard', star: 2, tile: 3, items: [] }]

    const { server } = fakeServer(state, { lobby })
    const mm = await createServerMatchmaker({ data, server, roomId: 'r1' })
    const mineBefore = mm.seats[0].board

    await mm.refreshSeats()
    expect(mm.seats[0].board).toBe(mineBefore)
    expect(mm.seats[0].board[0].unitId).toBe('frog')
    expect(mm.seats[3].board[0].unitId).toBe('wizard')
  })

  it('서버가 안 되면 좌석을 그대로 둔다', async () => {
    // 등수를 못 받아 오는 것과 등수를 지어내는 것은 다르다. 후자는 화면에
    // 뜬 등수와 실제로 받은 LP 가 서로 다른 말을 하게 만든다.
    const state = room()
    const server = {
      account: ME,
      remoteFunction: vi.fn(async (name) => {
        if (name === 'joinMatchRoom') return state
        if (name === 'getLobby') throw new Error('offline')
        return { ok: true }
      }),
      onRoomMessage() {},
    }
    const mm = await createServerMatchmaker({ data, server, roomId: 'r1' })
    await expect(mm.refreshSeats()).resolves.toBe(mm.seats)
    expect(mm.seats[0].rank ?? null).toBe(null)
  })
})
