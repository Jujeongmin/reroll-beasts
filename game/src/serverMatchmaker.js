// 서버 로비 매치메이커. 상대가 어디서 오는지를 아는 유일한 파일이다 —
// main.js 는 여기서 받은 객체를 화면에 잇기만 한다.
//
// ── 결정론 미러 ──────────────────────────────────────────
// 서버가 준 시드 하나로 클라가 **서버와 같은 함수**(sim/lobbyRound.js)를 돌려
// 대진·봇 편성·전투를 전부 미리 계산한다. 서버가 마감에 판정한 값과 반드시
// 같다 — 같은 코드, 같은 시드, 같은 보드니까. 그래서 라운드마다 서버 응답을
// 기다릴 필요가 없다: 클라는 즉시 진행하고, 서버는 같은 계산으로 검증하며,
// ROUND_RESOLVED 가 오면 미러를 맞춰 어긋남을 잡는다.
//
// 접속이 안 되면 떨어질 곳이 없다. 홈이 실패 상태로 남고 게임은 안 열린다 —
// 봇과 붙으면서 사람과 붙는 줄 아는 것보다 못 붙었다고 듣는 편이 낫다.

import { GameServer } from '@agent8/gameserver/dist/src/server/GameServer'
import { simulate } from '@sim/combat.js'
import { roundPairs, fightSeed, growBotSeats, markMine } from '@sim/lobbyRound.js'
import { pveBoard } from '@sim/rounds.js'
import { createRng } from '@sim/rng.js'

// 정찰 송신 간격(ms). 초 4회면 SDK 의 10회/초 제한에 한참 못 미치고, 남이
// 내 판을 보는 눈에는 즉시로 읽힌다. 더 촘촘히 보내도 사람은 구분 못 한다.
const SCOUT_MS = 250

/**
 * 서버 로비에 붙는다. 접속·입장까지 끝난 매치메이커를 돌려준다.
 *
 * 실패하면 던진다 — 홈이 그것을 실패 상태로 그린다. 조용히 삼키면 "서버에
 * 붙은 줄 알았는데 아니었다"가 되므로 성공/실패를 밖에 알린다.
 */
// 접속 대기 상한. 인증 없는 로컬 실행에서는 이 시간만큼 기다렸다 실패한다 —
// 길게 잡을수록 홈이 그만큼 오래 회색으로 멈춰 있다.
export async function connectServer({ timeoutMs = 3500 } = {}) {
  const server = GameServer.getInstance()
  const ok = await Promise.race([
    server.connect(),
    new Promise((r) => setTimeout(() => r(false), timeoutMs)),
  ])
  if (!ok || !server.connected) throw new Error('게임서버 접속 실패')
  return server
}

/**
 * 매칭 큐를 돌린다. 서버엔 타이머가 없어 **폴링이 진행의 트리거**다 —
 * 대기자 각자가 두드리고, 조건을 처음 본 호출이 방을 만든다.
 *
 * MATCH_FOUND 푸시도 같이 듣는다. 폴링만 두면 최대 pollMs 만큼 늦고, 푸시만
 * 두면 그 한 번을 놓쳤을 때 영영 안 잡힌다 — 둘 다 두고 먼저 오는 쪽을 쓴다.
 */
export function startQueue({ server, mode, data, onUpdate, onMatched }) {
  const pollMs = data.lobby.matching.pollMs
  let stopped = false
  let timer = null
  let off = null

  const done = (roomId) => {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    off?.()
    onMatched(roomId)
  }
  off = server.onGlobalMessage('MATCH_FOUND', (m) => done(m.roomId))

  const tick = async (first) => {
    if (stopped) return
    try {
      const r = await server.remoteFunction(first ? 'joinQueue' : 'pollQueue', [mode])
      if (r?.status === 'matched') return done(r.roomId)
      if (r?.status === 'waiting') onUpdate?.(r)
    } catch (err) {
      onUpdate?.({ status: 'error', message: err?.message })
    }
    timer = setTimeout(() => tick(false), pollMs)
  }
  tick(true)

  return {
    cancel() {
      if (stopped) return
      stopped = true
      clearTimeout(timer)
      off?.()
      server.remoteFunction('leaveQueue', [mode], { needResponse: false })
    },
  }
}

/**
 * 로비에 붙은 매치메이커를 만든다.
 *
 * roomId 를 주면 그 매치 방(사람들이 모인 방), 없으면 1인 방(봇 7). 1인 방은
 * 지금 홈에서 못 들어가지만 서버 함수가 살아 있다 — 튜토리얼이 그 위에 선다.
 */
export async function createServerMatchmaker({ data, server, roomId = null, timeoutMs = 3500 }) {
  server = server ?? (await connectServer({ timeoutMs }))

  const state = roomId
    ? await server.remoteFunction('joinMatchRoom', [roomId])
    : await server.remoteFunction('joinLobby', [])
  if (!state || !state.seats) throw new Error('로비 입장 실패')

  // 좌석 미러. prep 의 순위표가 그대로 읽는 배열이라 모양을 로컬판과 맞춘다.
  // isPlayer 는 **나** 다(사람 전부가 아니다) — 매치 방에는 사람이 여덟까지
  // 앉는다. 판정은 sim 의 markMine 이 한다.
  markMine(state.seats, server.account)

  const seats = state.seats
  const mySeat = seats.find((s) => s.isPlayer)
  // 내 좌석이 없으면 진행할 수 없다. 남의 좌석을 내 것으로 삼으면 그 사람
  // 판에 내 말을 놓고, 정산도 그 사람 것으로 받는다 — 조용히 굴리면 안 된다.
  if (!mySeat) throw new Error('로비에 내 좌석이 없다')

  // 이번 라운드 대진. round() 가 채우고 나머지가 읽는다.
  let pairs = []
  let opponentId = null

  // 서버 브로드캐스트로 미러를 맞춘다. 1인 방(봇 7)에선 조용하고, 매치
  // 방에선 **다른 사람의 배치가 이 경로로 실시간으로 들어온다** — 정찰이다.
  const myRoom = roomId ?? `solo-${server.account}`
  server.onRoomMessage(myRoom, 'BOARD_CHANGED', (m) => {
    const seat = seats[m.id]
    // 내 좌석만 건너뛴다 — 내가 보낸 판이 되돌아온 것이라 이미 최신이다.
    // 남(사람이든 봇이든)의 판은 **전부 받는다**. 이게 정찰이다.
    if (seat && !seat.isPlayer) seat.board = m.board
  })
  // 겉모습(무대·아바타). 남이 바꾸면 그 좌석에 붙여 둔다 — 구경 갔을 때
  // 그 사람 무대가 보이고, 그 사람 아바타가 내 판에 서야 한다.
  server.onRoomMessage(myRoom, 'LOOK_CHANGED', (m) => {
    const seat = seats[m.id]
    if (!seat) return
    seat.skin = m.skin
    seat.avatar = m.avatar
    seat.boom = m.boom
  })
  server.onRoomMessage(myRoom, 'ROUND_RESOLVED', (m) => {
    // 서버 판정으로 미러를 다시 맞춘다. 결정론이 지켜졌으면 이미 같은 값이라
    // 아무것도 안 바뀐다 — 이 동기화는 어긋남을 잡는 안전망이다.
    for (const s of m.seats ?? []) {
      const seat = seats[s.id]
      if (!seat) continue
      seat.hp = s.hp
      seat.alive = s.alive
      seat.streak = s.streak
    }
  })

  /**
   * 정찰용 송신기. 배치 중에는 판이 드래그 한 번에 수십 번 바뀌는데,
   * SDK 는 같은 함수를 초 10회 넘게 부르면 거절한다 — 쓰로틀이 필수다.
   *
   * SDK 쓰로틀은 leading-only(창의 첫 호출만 보내고 나머지는 버린다)라
   * 그것만 두면 **드래그가 끝난 자리가 안 나간다**: 남의 화면엔 옮기다 만
   * 판이 남는다. 창이 지난 뒤 마지막 값을 한 번 더 보내 따라잡게 한다.
   *
   * 같은 값은 안 보낸다 — refresh() 는 상점·정보창처럼 판과 무관한 일로도
   * 불리고, 그때마다 서버가 룸 상태를 쓰고 방송하면 남의 대역만 축낸다.
   */
  function scoutSender(fn) {
    let timer = null
    let pending = null
    let queued = null
    let lastAt = 0
    const send = (args) => {
      lastAt = Date.now()
      server.remoteFunction(fn, args, { throttle: SCOUT_MS, throttleKey: 'scout' })
    }
    return {
      push(...args) {
        const key = JSON.stringify(args)
        if (key === queued) return
        queued = key
        pending = args
        const waited = Date.now() - lastAt
        // 예약이 걸려 있어도 지금 보내면 그게 곧 최신이다. 안 끄면 예약이
        // 곧바로 뒤따라 같은 판을 한 번 더 보낸다.
        clearTimeout(timer)
        if (waited >= SCOUT_MS) return send(args)
        // 창 안이라 지금 보내면 버려진다. 창이 열릴 때 **마지막 값**으로 간다 —
        // 그사이 더 바뀌면 이 예약이 그 값으로 덮인다. 경계에 딱 맞추면 몇 ms
        // 일러 또 버려지므로 여유를 둔다.
        timer = setTimeout(() => pending && send(pending), SCOUT_MS - waited + 30)
      },
      /** 확정 송신이 앞지를 때 쓴다. 늦게 도착한 정찰이 최종 보드를 덮으면 안 된다. */
      cancel() {
        clearTimeout(timer)
        pending = null
        queued = null
      },
    }
  }
  const boardScout = scoutSender('updateBoard')
  const levelScout = scoutSender('updateLevel')
  const avatarScout = scoutSender('updateAvatar')

  // 남의 아바타. 좌석마다 마지막으로 받은 **위치와 어느 판에 있는지**를 들고
  // 있고, 화면이 그걸 읽어 그린다 — 여기서 3D 를 만지면 매치메이커가 무대를
  // 알게 된다.
  const avatars = new Map()
  server.onRoomMessage(myRoom, 'AVATAR_MOVED', (m) => {
    if (m.id === mySeat.id) return
    avatars.set(m.id, { x: m.x, z: m.z, at: m.at })
  })

  /**
   * 전투에 쓸 **최종** 보드를 알린다.
   *
   * 쓰로틀을 안 쓴다 — 쓰로틀은 창 안의 마지막 호출을 버릴 수 있는데, 전투
   * 직전의 최종 보드가 그 마지막 호출이다. 그게 빠지면 서버가 한 라운드 전
   * 판으로 판정한다. 라운드당 한 번이라 10회/초 제한과도 멀다(정찰 경로는
   * 쓰로틀을 타므로 그 카운터를 안 건드린다).
   *
   * 예약된 정찰을 먼저 끈다. 안 끄면 이 호출 뒤에 낡은 판이 도착해 서버가
   * 화면과 다른 판으로 판정한다.
   */
  function pushBoard(entries) {
    boardScout.cancel()
    return server.remoteFunction('updateBoard', [entries]).catch(() => {})
  }

  return {
    seats,

    /** 내 전투의 시드. 서버가 판정에 쓰는 값과 같은 식으로 만든다. */
    roundSeed(n) {
      const pair = pairs.find((p) => p.includes(mySeat.id))
      if (!pair) return fightSeed(state.seed, n, mySeat.id, mySeat.id)
      return fightSeed(state.seed, n, pair[0], pair[1])
    },

    /**
     * 이번 라운드 대진을 짠다. 서버를 기다리지 않는다 — roundPairs 는
     * 시드에서 결정론으로 나오므로 서버가 마감에 낼 답과 같다.
     */
    round(n) {
      state.round = n
      pairs = roundPairs(state)
      const pair = pairs.find((p) => p.includes(mySeat.id))
      opponentId = pair ? (pair[0] === mySeat.id ? pair[1] : pair[0]) : null
      return { pairs, opponentId, ghostId: null }
    },

    opponentBoard(n) {
      if (opponentId !== null) return seats[opponentId].board
      // 짝이 없다(홀수 생존). 보루로 PvE 를 세운다 — 로컬판과 같은 규칙.
      return pveBoard(0, createRng(fightSeed(state.seed, n, 0, 0)), data)
    },

    /**
     * 남의 대진을 돌려 본다. 시드가 서버 판정과 같으므로 결과도 같다 —
     * 관전 화면이 서버가 셈한 것과 똑같은 전투를 보여준다.
     */
    otherFights(n) {
      const out = []
      for (const [a, b] of pairs) {
        if (a === mySeat.id || b === mySeat.id) continue
        const result = simulate({
          boardA: seats[a].board,
          boardB: seats[b].board,
          seed: fightSeed(state.seed, n, a, b),
          data,
        })
        out.push({ a, b, winner: result.winner, result })
      }
      return out
    },

    /** 남의 전투 결과를 체력·연승에 반영한다. 로컬판(applyOthers)과 같은 셈. */
    applyFights(fights, { stageDamage }) {
      for (const f of fights) {
        const A = seats[f.a]
        const B = seats[f.b]
        const wonA = f.winner === 'A'
        const wonB = f.winner === 'B'
        if (!wonA) A.hp = Math.max(0, A.hp - stageDamage - f.result.survivorsB)
        if (!wonB) B.hp = Math.max(0, B.hp - stageDamage - f.result.survivorsA)
        for (const [seat, won] of [
          [A, wonA],
          [B, wonB],
        ]) {
          seat.streak = seat.lastWon === won ? seat.streak + 1 : 1
          seat.lastWon = won
          if (seat.hp <= 0) seat.alive = false
        }
      }
    },

    opponentSeat() {
      return opponentId === null ? null : seats[opponentId]
    },

    /**
     * 다음 라운드 준비. 봇 판은 클라가 서버와 같은 함수로 미리 짠다 —
     * 서버 응답을 기다리면 정산 화면이 네트워크에 묶인다.
     *
     * 서버에는 진행을 알린다(내 최종 보드 → 마감 처리). 1인 방이라 early 가
     * 허용되어 즉시 넘어가고, 실패해도 클라는 계속 돈다 — 다음 호출이 서버를
     * 따라잡게 하고, ROUND_RESOLVED 동기화가 어긋남을 맞춘다.
     */
    advance(n) {
      state.round = n
      growBotSeats(state, data)
      server.remoteFunction('resolveRound', [], { needResponse: false })
    },

    /** 전투 직전 확정 송신. 서버 판정의 근거라 유실되면 안 된다. */
    pushBoard,

    /** 배치 중 실시간 정찰. 남이 내 자리를 열어 두고 있으면 이 경로로 보인다. */
    pushBoardLive(entries) {
      boardScout.push(entries)
    },

    /**
     * 내 겉모습(무대·아바타). 좌석에 붙여 남에게 보이게 한다.
     *
     * 쓰로틀을 안 태운다 — 겉모습은 판마다 한 번 바꿀까 말까 한 값이라
     * 초당 여러 번 나갈 일이 없다.
     */
    pushLook(boardId, avatarId, boomId) {
      return server.remoteFunction('updateLook', [boardId, avatarId, boomId]).catch(() => {})
    },

    /** 레벨도 정찰 대상이다 — 상대 레벨이 다음 판 인원을 말한다. */
    pushLevel(level) {
      levelScout.push(level)
    },

    /**
     * 내 아바타 위치. 정찰과 같은 쓰로틀을 탄다 — 걷는 동안 초당 수십
     * 프레임이 나가면 SDK 가 10회/초에서 거절한다.
     */
    pushAvatar(pos, at) {
      avatarScout.push(pos.x, pos.z, at)
    },

    /**
     * 지금 그 판 위에 서 있는 남들. 내 판을 보고 있는 사람이 여기 나온다 —
     * 그게 아바타를 만든 이유다.
     */
    avatarsOn(seatId) {
      const out = []
      for (const [id, a] of avatars) if (a.at === seatId) out.push({ id, x: a.x, z: a.z })
      return out
    },

    /** 서버 시드. 상점 리롤 등 런 전체 무작위성의 뿌리로 쓴다. */
    seed: state.seed,
  }
}
