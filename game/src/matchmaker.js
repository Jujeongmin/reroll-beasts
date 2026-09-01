// 상대가 어디서 오는가.
//
// 지금은 전부 이 파일 안에서 만들어진다 — 봇 일곱을 세우고, 대진을 짜고,
// 남의 전투까지 여기서 돌린다. 서버가 붙으면 **이 파일만** 갈아끼운다:
// 같은 모양의 객체를 fetch 로 채워 돌려주면 main.js 는 한 줄도 안 바뀐다.
//
// 그래서 규칙은 여기 두지 않는다. 전투는 sim/combat, 성장은 sim/lobby 가
// 하고 이 파일은 **어느 판을 누구와 붙이는지만** 정한다. 서버판에서는 그
// 결정이 서버로 넘어가고, sim/ 은 서버에서 같은 코드가 그대로 돈다.
//
// 서버판이 반드시 다르게 해야 하는 것:
//   - 대진(pairUp)은 서버가 짠다. 클라가 짜면 상대를 고를 수 있다
//   - 체력·골드도 서버가 센다. 지금은 클라가 자기 값을 직접 고친다
//   - 시드 하나로 런 전체가 재현되므로, 서버는 같은 시드로 검산할 수 있다

import { createRng } from '@sim/rng.js'
import { pveBoard } from '@sim/rounds.js'
import {
  createLobby,
  pairUp,
  opponentOf,
  simulateOthers,
  applyOthers,
  growBots,
} from '@sim/lobby.js'

/**
 * 로컬 대전 상대. 나 + 봇 일곱이 한 로비에서 돈다.
 *
 * @param {object} o
 * @param {object} o.data  로드된 규칙 데이터
 * @param {number} o.seed  런 시드. 대진·성장·전투가 전부 여기서 갈라진다
 */
export function createLocalMatchmaker({ data, seed }) {
  const seats = createLobby(data, createRng(seed))

  /** 라운드 시드. 대진·편성·전투가 전부 여기서 갈라져 나온다. */
  const roundSeed = (n) => (seed + n * 7919) >>> 0

  // 이번 라운드 대진. round() 가 채우고 나머지가 읽는다.
  let pairs = []
  let opponentId = null
  let ghostId = null

  return {
    /** 순위표·정찰이 읽는 좌석 배열. 서버판에서는 스냅샷 목록이 된다. */
    seats,

    roundSeed,

    /**
     * 이번 라운드 대진을 짠다.
     *
     * 살아 있는 사람이 홀수라 내 짝이 비면 **유령**을 세운다 — 다른 사람의
     * 진형을 그대로 복사해 붙는 것이다 (TFT 의 유령 라운드와 같다).
     * 중립 몹을 세우면 "지금 사람과 붙는 건가"가 매 라운드 흐려진다.
     */
    round(n) {
      pairs = pairUp(seats, createRng(roundSeed(n)))
      opponentId = opponentOf(pairs, 0)
      ghostId = null
      if (opponentId === null) {
        const others = seats.filter((p) => !p.isPlayer && p.hp > 0 && p.board.length > 0)
        if (others.length > 0) {
          ghostId = others[createRng(roundSeed(n) ^ 0x5f3a).int(others.length)].id
        }
      }
      return { pairs, opponentId, ghostId }
    },

    /**
     * 이번 라운드에 내가 붙는 진형.
     *
     * 배치 화면의 미리보기와 실제 전투가 **같은 값**을 써야 한다. 두 곳에서
     * 따로 뽑으면 건너편에 서 있던 것과 실제로 붙는 것이 달라진다.
     */
    opponentBoard(n) {
      const id = opponentId ?? ghostId
      if (id !== null && id !== undefined) return seats[id].board
      // 살아 있는 사람이 나뿐일 때의 보루. 실제로는 거의 오지 않는다.
      return pveBoard(0, createRng(roundSeed(n)), data)
    },

    /**
     * 남의 대진을 돌려만 본다 (체력은 안 건드린다).
     *
     * 내 전투를 보는 중에 아무나 눌러 그 판을 볼 수 있어야 하고, 그러려면
     * 로그가 그때 이미 있어야 한다. 서버판에서는 이 자리가 fetch 다.
     */
    otherFights(n) {
      return simulateOthers(seats, pairs, { seed: roundSeed(n), data })
    },

    /** 남의 전투 결과를 체력·연승에 반영한다. */
    applyFights(fights, { stageDamage }) {
      return applyOthers(seats, fights, { stageDamage })
    },

    /** 이번 라운드 내 상대. 내 승패를 그 좌석에도 반영해야 한다. */
    opponentSeat() {
      return opponentId === null ? null : seats[opponentId]
    },

    /** 다음 라운드 준비. 지금은 봇이 자라고, 서버판에서는 스냅샷을 새로 받는다. */
    advance(n) {
      growBots(seats, n, createRng(roundSeed(n) ^ 0x9e37), data)
    },
  }
}
