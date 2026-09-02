/**
 * Agent8 GameServer — 실시간 8인 로비.
 *
 * 이 파일이 있는 이유: **대진·체력·전투를 서버가 쥔다.** 클라가 짜면 상대를
 * 고르거나 체력을 고칠 수 있다. 라운드당 계산이 3.5ms 라 서버가 다 해도 싸다.
 *
 * 규칙은 여기 없다 — 전부 sim/lobbyRound.js 에 있고 이 파일은 배선만 한다:
 * 룸 읽고, 규칙 부르고, 룸에 쓰고, 알린다. 규칙을 sim/ 에 두는 이유는
 * 클라 쪽과 같다(순수 함수라 테스트가 시계를 기다리지 않는다). 마감 30초를
 * 기다려야 검사되는 규칙이면 테스트가 못 덮는다.
 *
 * 데이터는 **JSON 을 직접 import** 한다. sim/data.js 의 loadData 는 못 쓴다 —
 * Node 분기가 fs 와 import.meta.url 을 쓰는데 서버는 isolated-vm 이라 fs 가
 * 없고, 번들러가 IIFE 로 묶으며 import.meta 도 빈다. 번들에 박아도 규칙
 * 수치의 단일소스는 game/public/data/ 그대로다.
 *
 * ── 타이머가 없다 ────────────────────────────────────────
 * 이 런타임엔 cron 도 setInterval 도 없다. 서버는 스스로 못 깨어난다.
 * 그래서 배치 마감은 **서버가 시각을 정하고, 클라가 그 시각이 지났다고
 * 찾아오면 서버가 검증하고 진행한다.** 판정은 resolveRound 가 Date.now() 로
 * 하므로 일찍 부르면 거부된다 — 타이머를 앞당기는 조작이 안 통한다.
 */
import { createLobbyState, resolveRound } from '../../sim/lobbyRound.js'
import { simulate } from '../../sim/combat.js'
import { totalRounds } from '../../sim/rounds.js'
import combat from '../../game/public/data/combat.json'
import units from '../../game/public/data/units.json'
import traits from '../../game/public/data/traits.json'
import shop from '../../game/public/data/shop.json'
import economy from '../../game/public/data/economy.json'
import levels from '../../game/public/data/levels.json'
import rounds from '../../game/public/data/rounds.json'
import lobby from '../../game/public/data/lobby.json'
import items from '../../game/public/data/items.json'

const DATA: any = { combat, units, traits, shop, economy, levels, rounds, lobby, items }

interface Entry {
  unitId: string
  star: number
  tile: number
  items?: string[]
}

/** 룸 상태에서 로비를 꺼낸다. 없으면 null. */
async function readLobby(): Promise<any | null> {
  const room = await $room.getRoomState()
  return room.lobby ?? null
}

export class Server {
  async ping(): Promise<string> {
    return 'pong'
  }

  /**
   * 로비에 들어간다. 1단계는 **1인 1룸**이다 — 매칭이 아직 없으므로 빈 자리를
   * 전부 봇으로 채운다. 그래서 동시접속이 0명이어도 지금 당장 플레이가 된다.
   * 2단계에서 이 함수가 큐를 보고 방을 고르게 바뀐다.
   */
  async joinLobby(): Promise<any> {
    const account = $sender.account
    await $global.joinRoom(`solo-${account}`)

    const existing = await readLobby()
    if (existing) return existing

    // 룸 시드. sim/ 밖이라 Date.now 를 써도 결정론이 안 깨진다 — 한 번 정해
    // 룸 상태에 박아 두면 이후 대진·봇 편성은 전부 이 값에서 재현된다.
    const seed = (Date.now() ^ hashAccount(account)) >>> 0
    const state = createLobbyState({ seed, account, now: Date.now(), data: DATA })
    await $room.updateRoomState({ lobby: state })
    return state
  }

  async getLobby(): Promise<any | null> {
    return readLobby()
  }

  /**
   * 내 배치를 알린다. **정찰의 핵심이다** — 이 브로드캐스트가 있어야 상대가
   * 지금 뭘 사고 어디에 두는지가 남들에게 보인다.
   *
   * 클라는 throttle 을 걸어 부른다(일반 호출은 초당 10회 제한). 방 전체
   * 상태를 다시 싣지 않고 바뀐 좌석만 알린다 — 전체를 실으면 8인분 보드가
   * 매번 오간다.
   */
  async updateBoard(board: Entry[]): Promise<{ ok: boolean }> {
    const state = await readLobby()
    if (!state) return { ok: false }
    const seat = state.seats.find((s: any) => s.account === $sender.account)
    if (!seat || !seat.alive) return { ok: false }

    seat.board = Array.isArray(board) ? board.slice(0, 28) : []
    await $room.updateRoomState({ lobby: state })
    $room.broadcastToRoom('BOARD_CHANGED', { id: seat.id, board: seat.board })
    return { ok: true }
  }

  /** 레벨도 정찰 대상이다 — 상대 레벨이 다음 판 인원을 말한다. */
  async updateLevel(level: number): Promise<{ ok: boolean }> {
    const state = await readLobby()
    if (!state) return { ok: false }
    const seat = state.seats.find((s: any) => s.account === $sender.account)
    if (!seat) return { ok: false }
    seat.level = Math.max(1, Math.min(9, Math.floor(level)))
    await $room.updateRoomState({ lobby: state })
    $room.broadcastToRoom('LEVEL_CHANGED', { id: seat.id, level: seat.level })
    return { ok: true }
  }

  /**
   * 배치 마감. 클라가 "시간 됐다"고 찾아오면 서버가 시각을 검증하고 돌린다.
   *
   * $lock 으로 묶는 이유: 마감 순간엔 8명이 동시에 이 함수를 부른다. 안 묶으면
   * 같은 라운드가 여러 번 돌아 체력이 중복으로 깎인다. 락 안에서 다시 읽으므로
   * 두 번째 호출은 이미 넘어간 라운드를 보고 changed=false 로 빠진다.
   */
  async resolveRound(): Promise<any | null> {
    const roomId = $sender.roomId
    if (!roomId) return null

    return $lock(`round:${roomId}`, async () => {
      const state = await readLobby()
      if (!state) return null

      // 사람이 하나뿐인 방은 마감 전에도 넘어갈 수 있다. 봇은 정찰을 안 하니
      // 혼자 일찍 넘겨도 손해 보는 사람이 없다. 사람이 둘 이상이면 마감이 법이다.
      const humans = state.seats.filter((s: any) => !s.isBot && s.alive).length
      const { changed, fights } = resolveRound(state, Date.now(), DATA, { early: humans <= 1 })
      if (!changed) return state

      await $room.updateRoomState({ lobby: state })
      $room.broadcastToRoom('ROUND_RESOLVED', {
        round: state.round,
        phase: state.phase,
        deadline: state.deadline,
        fights,
        seats: state.seats.map((s: any) => ({
          id: s.id,
          hp: s.hp,
          alive: s.alive,
          streak: s.streak,
        })),
      })
      return state
    })
  }

  /**
   * 서버가 클라와 같은 전투 결과를 내는지 확인한다.
   *
   * 이 방식의 전제다 — 서버는 결과만 보내고 클라가 로그를 다시 만든다.
   * 답이 갈리면 화면과 판정이 어긋난다. 테스트가 이 값을 클라 실행 결과와
   * 대조한다.
   */
  async simProbe(): Promise<string> {
    const board = [{ unitId: 'frog', star: 1, tile: 0, items: [] }]
    const foe = [{ unitId: 'orc', star: 1, tile: 0, items: [] }]
    const r = simulate({ boardA: board, boardB: foe, seed: 7, data: DATA })
    return `winner=${r.winner} ticks=${r.ticks} log=${r.log.length} rounds=${totalRounds(DATA.rounds)} units=${DATA.units.units.length}`
  }
}

/** 계정 문자열 → 32비트. 룸 시드를 계정마다 갈라 놓기만 하면 된다. */
function hashAccount(account: string): number {
  let h = 2166136261
  for (let i = 0; i < account.length; i++) {
    h ^= account.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
