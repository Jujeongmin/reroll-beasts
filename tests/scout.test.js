// 배치 중 정찰 송신.
//
// 이 파일이 지키는 것은 **두 경로가 갈려 있다**는 사실 하나다:
//   · 배치 중  = 쓰로틀. 안 누르면 드래그 한 번에 초 수십 번이 나가 SDK 가
//                "Too many calls" 로 거절한다 (제한 10회/초)
//   · 전투 직전 = 쓰로틀 없음. 쓰로틀은 창 안의 마지막 호출을 버리는데, 그게
//                최종 보드면 서버가 한 라운드 전 판으로 판정한다
// 이 갈림은 눈으로 안 보인다 — 화면은 어느 쪽이든 똑같이 그려지고, 어긋남은
// 남의 화면에서만 드러난다. 그래서 테스트가 대신 본다.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { loadData } from '@sim/data.js'

let createServerMatchmaker
let shopSeedFor
let startQueue
let data

beforeAll(async () => {
  // SDK 는 import 시점에 localStorage 를 읽는다 — 브라우저 전제 모듈이라
  // 노드에선 그 줄에서 바로 터진다. 매치메이커가 그 SDK 를 끌고 온다.
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  ;({ createServerMatchmaker, shopSeedFor, startQueue } = await import('../game/src/serverMatchmaker.js'))
  data = await loadData()
})

describe('개인 상점 시드', () => {
  it('같은 방에서도 계정이 다르면 상점 난수열이 다르다', () => {
    expect(shopSeedFor(1234, 'alice')).not.toBe(shopSeedFor(1234, 'bob'))
  })

  it('같은 방과 계정은 재접속해도 같은 시드를 얻는다', () => {
    expect(shopSeedFor(1234, 'Alice')).toBe(shopSeedFor(1234, 'alice'))
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('queue recovery', () => {
  it('retries registration after an initial network failure', async () => {
    vi.useFakeTimers()
    const remoteFunction = vi.fn().mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ status: 'waiting' })
    const queue = startQueue({ server: { remoteFunction, onGlobalMessage() {} }, mode: 'normal', data })
    await vi.advanceTimersByTimeAsync(data.lobby.matching.pollMs)
    expect(remoteFunction.mock.calls.slice(0, 2).map(c => c[0])).toEqual(['joinQueue', 'joinQueue'])
    queue.cancel()
  })

  it('ignores a response arriving after cancellation', async () => {
    vi.useFakeTimers()
    let resolve
    const onUpdate = vi.fn()
    const remoteFunction = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r }))
      .mockResolvedValue({ ok: true })
    const queue = startQueue({ server: { remoteFunction, onGlobalMessage() {} }, mode: 'normal', data, onUpdate })
    queue.cancel()
    resolve({ status: 'waiting' })
    await vi.advanceTimersByTimeAsync(data.lobby.matching.pollMs * 2)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(remoteFunction).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
})

/**
 * 보낸 것을 그대로 적어 두는 가짜 서버. 로비 입장만 진짜처럼 답한다.
 *
 * humans 는 사람이 앉은 좌석의 계정이다 — 매치 방에는 사람이 여덟까지 앉고,
 * 그때 "어느 좌석이 나인가"가 계정으로만 갈린다.
 */
function fakeServer({ account = 'test', humans = null } = {}) {
  const calls = []
  const people = humans ?? { 0: account }
  const seats = Array.from({ length: 8 }, (_, id) => ({
    id,
    account: people[id] ?? null,
    isBot: !people[id],
    hp: 100,
    alive: true,
    streak: 0,
    board: [],
    level: 3,
  }))
  const handlers = new Map()
  const server = {
    account,
    connected: true,
    async remoteFunction(fn, args, opts) {
      if (fn === 'joinLobby') return { seed: 1234, round: 1, seats, phase: 'prep', deadline: 0 }
      calls.push({ fn, args, throttle: opts?.throttle ?? null })
      return { ok: true }
    },
    onRoomMessage(room, kind, fn) {
      handlers.set(kind, fn)
    },
    onGlobalMessage() {},
  }
  /** 서버가 방송한 것처럼 흘려 넣는다. */
  const emit = (kind, msg) => handlers.get(kind)?.(msg)
  return { calls, server, seats, emit }
}

const board = (tile) => [{ unitId: 'frog', star: 1, tile, items: [] }]
const boards = (calls) => calls.filter((c) => c.fn === 'updateBoard')

describe('정찰 송신', () => {
  it('updates opponent level and sanitized board without replacing my newer board', async () => {
    const { server, seats, emit } = fakeServer({ humans: { 0: 'test', 1: 'other' } })
    await createServerMatchmaker({ data, server })
    seats[0].board = board(4)
    emit('LEVEL_CHANGED', { id: 1, level: 4, board: board(3) })
    expect(seats[1].level).toBe(4)
    expect(seats[1].board).toEqual(board(3))
    emit('LEVEL_CHANGED', { id: 0, level: 4, board: board(1) })
    expect(seats[0].board).toEqual(board(4))
  })

  it('배치가 초 33번 바뀌어도 송신은 제한 아래로 눌린다', async () => {
    vi.useFakeTimers()
    const { calls, server } = fakeServer()
    const mm = await createServerMatchmaker({ data, server })

    for (let i = 0; i < 33; i++) {
      mm.pushBoardLive(board(i))
      await vi.advanceTimersByTimeAsync(30)
    }
    await vi.advanceTimersByTimeAsync(400)

    const sent = boards(calls)
    // 약 1.4초 동안. 10회/초 제한의 절반도 안 쓴다.
    expect(sent.length).toBeLessThanOrEqual(7)
    expect(sent.every((c) => c.throttle > 0)).toBe(true)
  })

  it('연타가 끝나면 마지막 판이 반드시 간다', async () => {
    vi.useFakeTimers()
    const { calls, server } = fakeServer()
    const mm = await createServerMatchmaker({ data, server })

    // 창 하나 안에서 몰아친다. 첫 호출만 나가고 나머지는 버려지는 구간이다.
    for (let i = 0; i < 5; i++) {
      mm.pushBoardLive(board(i))
      await vi.advanceTimersByTimeAsync(10)
    }
    await vi.advanceTimersByTimeAsync(500)

    // 버려진 채로 끝나면 남의 화면에 옮기다 만 판이 남는다.
    expect(boards(calls).at(-1).args[0][0].tile).toBe(4)
  })

  it('같은 판은 다시 안 보낸다', async () => {
    vi.useFakeTimers()
    const { calls, server } = fakeServer()
    const mm = await createServerMatchmaker({ data, server })

    mm.pushBoardLive(board(3))
    await vi.advanceTimersByTimeAsync(500)
    const after = boards(calls).length
    mm.pushBoardLive(board(3))
    mm.pushBoardLive(board(3))
    await vi.advanceTimersByTimeAsync(500)

    expect(boards(calls).length).toBe(after)
  })

  it('전투 직전 확정 송신은 쓰로틀을 안 탄다', async () => {
    const { calls, server } = fakeServer()
    const mm = await createServerMatchmaker({ data, server })

    await mm.pushBoard(board(9))

    expect(boards(calls)).toHaveLength(1)
    expect(boards(calls)[0].throttle).toBe(null)
  })

  it('예약된 정찰이 확정 송신 뒤를 덮지 않는다', async () => {
    vi.useFakeTimers()
    const { calls, server } = fakeServer()
    const mm = await createServerMatchmaker({ data, server })

    // 창을 열어 둔 채(첫 송신) 한 번 더 바꾸면 그 값이 예약으로 남는다.
    mm.pushBoardLive(board(1))
    await vi.advanceTimersByTimeAsync(20)
    mm.pushBoardLive(board(2))
    // 그 예약이 살아 있는 동안 전투가 시작된다.
    await mm.pushBoard(board(7))
    await vi.advanceTimersByTimeAsync(1000)

    // 마지막에 서버가 쥔 판이 전투에 쓴 판이어야 한다.
    expect(boards(calls).at(-1).args[0][0].tile).toBe(7)
  })

  it('레벨도 같은 규칙으로 나간다', async () => {
    vi.useFakeTimers()
    const { calls, server } = fakeServer()
    const mm = await createServerMatchmaker({ data, server })

    mm.pushLevel(4)
    mm.pushLevel(4)
    mm.pushLevel(5)
    await vi.advanceTimersByTimeAsync(500)

    const levels = calls.filter((c) => c.fn === 'updateLevel')
    expect(levels.map((c) => c.args[0])).toEqual([4, 5])
    expect(levels.every((c) => c.throttle > 0)).toBe(true)
  })
})

describe('좌석 식별 — 매치 방', () => {
  // 사람이 여럿인 방에서 "사람 = 나"로 치면 남의 좌석이 전부 내 좌석으로
  // 표시된다. 순위표의 [나] 표시, 남의 판 구경, 정찰이 전부 어긋난다.
  it('사람이 여덟이어도 내 좌석은 하나다', async () => {
    const humans = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, `acc${i}`]))
    const { server, seats } = fakeServer({ account: 'acc5', humans })
    await createServerMatchmaker({ data, server })
    expect(seats.filter((s) => s.isPlayer).map((s) => s.id)).toEqual([5])
  })

  it('남의 배치가 들어온다 — 이게 정찰이다', async () => {
    const humans = { 0: 'me', 1: 'you' }
    const { server, seats, emit } = fakeServer({ account: 'me', humans })
    await createServerMatchmaker({ data, server })

    emit('BOARD_CHANGED', { id: 1, board: board(3) })
    expect(seats[1].board).toEqual(board(3))
  })

  it('내 판이 되돌아와도 덮어쓰지 않는다 — 이미 내 화면이 최신이다', async () => {
    const { server, seats, emit } = fakeServer({ account: 'me', humans: { 0: 'me' } })
    await createServerMatchmaker({ data, server })

    seats[0].board = board(1)
    emit('BOARD_CHANGED', { id: 0, board: board(9) })
    expect(seats[0].board).toEqual(board(1))
  })

  it('내가 없는 방이면 들어가지 않는다 — 남의 좌석으로 굴리느니 실패가 낫다', async () => {
    const { server } = fakeServer({ account: 'me', humans: { 0: 'other' } })
    await expect(createServerMatchmaker({ data, server })).rejects.toThrow('내 좌석')
  })
})
