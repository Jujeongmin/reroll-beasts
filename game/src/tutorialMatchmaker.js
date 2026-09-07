// 튜토리얼의 상대. 서버 없이 돈다.
//
// 봇 로비를 되살리지 않는 이유: 튜토리얼은 **매번 같은 이야기**여야 한다.
// 무작위 봇을 세우면 어떤 사람은 첫 전투에서 이기고 어떤 사람은 진다 —
// 그러면 "이렇게 하면 이긴다"를 가르칠 수가 없다. 상대를 대본이 고정한다.
//
// 모양은 serverMatchmaker 와 같다. main.js 는 어느 쪽이 꽂혔는지 모른다.

import { simulate } from '@sim/combat.js'
import { t } from './i18n.js'

/** 상대 편성. 1티어 하나 — 배운 대로 두면 이긴다. */
const FOE_BOARD = [{ unitId: 'frog', star: 1, tile: 0, items: [] }]

/**
 * @param {object} o
 * @param {object} o.data  로드된 규칙 데이터
 */
export function createTutorialMatchmaker({ data }) {
  // 좌석 둘. 순위표가 읽는 모양을 맞춰 둔다 — 화면이 로비와 같은 코드를 탄다.
  const seats = [
    {
      id: 0,
      name: t('seat.me'),
      account: 'tutorial',
      isBot: false,
      isPlayer: true,
      hp: data.economy.startHp,
      level: data.levels.startLevel,
      board: [],
      alive: true,
      streak: 0,
      lastWon: null,
    },
    {
      id: 1,
      name: t('seat.dummy'),
      account: null,
      isBot: true,
      isPlayer: false,
      hp: data.economy.startHp,
      level: 1,
      board: FOE_BOARD,
      alive: true,
      streak: 0,
      lastWon: null,
    },
  ]

  return {
    seats,

    // 시드를 박아 둔다. 튜토리얼 전투는 매번 같은 장면이어야 한다.
    roundSeed: () => 1234,

    round() {
      // 좌석 0 이 나다 — 서버 규칙(낮은 번호가 A)과 같은 답이다.
      return { pairs: [[0, 1]], opponentId: 1, ghostId: null, iAmA: true }
    },

    opponentBoard: () => FOE_BOARD,

    // 둘뿐이라 남의 대진이 없다.
    otherFights: () => [],
    applyFights: () => {},

    opponentSeat: () => seats[1],

    /** 다음 라운드. 튜토리얼은 한 판이라 여기까지 오면 할 일이 없다. */
    advance() {},

    /** 서버가 없다. 화면이 부르지만 보낼 곳이 없다. */
    pushBoard() {},

    /**
     * 판정은 여기서 한다 — 서버가 없으니 클라가 곧 심판이다. 튜토리얼은
     * 기록에 안 남으므로 조작될 것도 없다.
     */
    resolve(entries) {
      return simulate({ boardA: entries, boardB: FOE_BOARD, seed: 1234, data })
    },
  }
}
