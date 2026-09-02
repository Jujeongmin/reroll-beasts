// 서버 로비 매치메이커. createLocalMatchmaker 와 같은 모양의 객체를 낸다 —
// main.js 는 어느 쪽이 꽂혔는지 모른다 (그 파일 주석이 처음부터 그렇게
// 설계해 뒀다: "서버가 붙으면 이 파일만 갈아끼운다").
//
// ── 결정론 미러 ──────────────────────────────────────────
// 서버가 준 시드 하나로 클라가 **서버와 같은 함수**(sim/lobbyRound.js)를 돌려
// 대진·봇 편성·전투를 전부 미리 계산한다. 서버가 마감에 판정한 값과 반드시
// 같다 — 같은 코드, 같은 시드, 같은 보드니까. 그래서 라운드마다 서버 응답을
// 기다릴 필요가 없다: 클라는 즉시 진행하고, 서버는 같은 계산으로 검증하며,
// ROUND_RESOLVED 가 오면 미러를 맞춰 어긋남을 잡는다.
//
// 서버가 죽거나 로컬 개발이라 접속이 안 되면 이 파일 대신 기존
// createLocalMatchmaker 로 떨어진다 — main.js 의 try/catch 가 그 갈림길이다.

import { GameServer } from '@agent8/gameserver/dist/src/server/GameServer'
import { simulate } from '@sim/combat.js'
import { roundPairs, fightSeed, growBotSeats } from '@sim/lobbyRound.js'
import { pveBoard } from '@sim/rounds.js'
import { createRng } from '@sim/rng.js'

/**
 * 서버 로비에 붙는다. 접속·입장까지 끝난 매치메이커를 돌려준다.
 *
 * 실패하면 던진다 — 호출자가 로컬 매치메이커로 갈아탄다. 조용히 봇 모드로
 * 떨어지면 "서버에 붙은 줄 알았는데 혼자였다"가 되므로 성공/실패를 밖에 알린다.
 */
// 접속 대기 상한. 로컬 개발(서버 미배포)에서는 이 시간만큼 부팅이 늦어지고
// 봇 로비로 떨어진다 — 길게 잡을수록 오프라인 개발이 그만큼 매번 느려진다.
export async function createServerMatchmaker({ data, timeoutMs = 3500 }) {
  const server = GameServer.getInstance()
  const ok = await Promise.race([
    server.connect(),
    new Promise((r) => setTimeout(() => r(false), timeoutMs)),
  ])
  if (!ok || !server.connected) throw new Error('게임서버 접속 실패')

  const state = await server.remoteFunction('joinLobby', [])
  if (!state || !state.seats) throw new Error('로비 입장 실패')

  // 좌석 미러. prep 의 순위표가 그대로 읽는 배열이라 모양을 로컬판과 맞춘다.
  for (const seat of state.seats) seat.isPlayer = !seat.isBot

  const seats = state.seats
  const mySeat = seats.find((s) => s.isPlayer)

  // 이번 라운드 대진. round() 가 채우고 나머지가 읽는다.
  let pairs = []
  let opponentId = null

  // 서버 브로드캐스트로 미러를 맞춘다. 1단계(1인 방)에선 조용하지만,
  // 2단계에서 다른 사람의 배치가 이 경로로 실시간으로 들어온다 — 정찰이다.
  const roomId = `solo-${server.account}`
  server.onRoomMessage(roomId, 'BOARD_CHANGED', (m) => {
    const seat = seats[m.id]
    if (seat && !seat.isPlayer) seat.board = m.board
  })
  server.onRoomMessage(roomId, 'ROUND_RESOLVED', (m) => {
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
   * 내 보드를 서버에 알린다.
   *
   * 쓰로틀을 안 쓴다 — 쓰로틀은 창 안의 마지막 호출을 버릴 수 있는데, 전투
   * 직전의 최종 보드가 그 마지막 호출이다. 그게 빠지면 서버가 한 라운드 전
   * 판으로 판정한다. 지금은 전투 시작 때 한 번만 부르므로 10회/초 제한과도
   * 멀다. 2단계에서 배치 중 실시간 송신을 붙일 때만 쓰로틀 경로를 더한다.
   */
  function pushBoard(entries) {
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

    /** 배치가 바뀔 때 prep 이 부른다. 2단계에서 남들이 이걸 실시간으로 본다. */
    pushBoard,

    /** 서버 시드. 상점 리롤 등 런 전체 무작위성의 뿌리로 쓴다. */
    seed: state.seed,
  }
}
