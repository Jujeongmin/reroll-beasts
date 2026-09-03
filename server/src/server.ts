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
 * 그래서 마감도 매칭도 **클라 호출이 트리거**다: 서버는 시각·조건만 쥐고,
 * 클라가 찾아올 때 판정한다. 동시 호출은 $lock 으로 한 번만 처리된다.
 */
import { createLobbyState, resolveRound, assignRanks } from '../../sim/lobbyRound.js'
import { mergeProfile } from '../../sim/profile.js'
import { addLp, sortLeaderboard, rankOf } from '../../sim/rank.js'
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
   * 연습 로비. **1인 1룸** — 빈 자리를 전부 봇으로 채운다. 매칭 없이 바로
   * 시작하므로 동시접속이 0명이어도 지금 당장 플레이가 된다.
   */
  async joinLobby(): Promise<any> {
    const account = $sender.account
    await $global.joinRoom(`solo-${account}`)

    const existing = await readLobby()
    if (existing) return existing

    // 룸 시드. sim/ 밖이라 Date.now 를 써도 결정론이 안 깨진다 — 한 번 정해
    // 룸 상태에 박아 두면 이후 대진·봇 편성은 전부 이 값에서 재현된다.
    const seed = (Date.now() ^ hashAccount(account)) >>> 0
    const state: any = createLobbyState({ seed, account, now: Date.now(), data: DATA })
    // 1인 방은 랭크가 아니다. 모드를 상태에 박아 두면 마감 때 방 이름을
    // 다시 파싱하지 않아도 된다 — 이름 규칙이 바뀌면 조용히 틀릴 자리다.
    state.mode = 'solo'
    await $room.updateRoomState({ lobby: state })
    return state
  }

  async getLobby(): Promise<any | null> {
    return readLobby()
  }

  /**
   * 내 전적. 없으면 null 을 준다 — 0 으로 채운 표는 "0판 · 최고 0위" 라는
   * 거짓 정보가 되고, 화면이 그걸 그대로 그린다.
   */
  async getProfile(): Promise<any | null> {
    const st: any = await $global.getMyState()
    return st?.profile ?? null
  }

  // ── 순위표 ──────────────────────────────────────────────
  //
  // 유저 상태는 계정 하나씩만 읽을 수 있다 — "전체에서 몇 등인가"를 물으려면
  // 따로 줄을 세워 둬야 한다. 그래서 랭크 판이 끝날 때마다 컬렉션에 적는다.

  /** 내 줄을 갱신한다. 없으면 만든다. */
  private async putLeaderboard(account: string, profile: any): Promise<void> {
    const rows = await $global.getCollectionItems('leaderboard')
    const mine: any = rows.find((x: any) => x.account === account)
    const row = { account, lp: profile.lp, games: profile.games, best: profile.best }
    if (mine) await $global.updateCollectionItem('leaderboard', { ...mine, ...row })
    else await $global.addCollectionItem('leaderboard', row)
  }

  /**
   * 상위 몇 명과 내 등수.
   *
   * 정렬을 서버가 직접 안 하고 sim/rank 를 부르는 이유: 동점 처리(최고 순위 →
   * 계정 순)가 흔들리면 새로고침할 때마다 등수가 바뀐다. 그 규칙은 테스트가
   * 덮는 자리에 있어야 한다.
   */
  async getLeaderboard(limit: number = 10): Promise<any> {
    const rows: any[] = await $global.getCollectionItems('leaderboard')
    const sorted = sortLeaderboard(rows)
    const me = $sender.account
    return {
      total: sorted.length,
      myRank: rankOf(rows, me),
      top: sorted.slice(0, Math.max(1, Math.min(50, limit))).map((r: any, i: number) => ({
        rank: i + 1,
        // 계정 전체를 넘기지 않는다 — 화면에 쓸 것도 아니고, 남의 지갑
        // 주소를 목록으로 뿌릴 이유가 없다.
        name: `유저${String(r.account).slice(-4)}`,
        mine: r.account === me,
        lp: r.lp ?? 0,
        games: r.games ?? 0,
      })),
    }
  }

  // ── 매칭 큐 ─────────────────────────────────────────────
  //
  // 일반: 기다리다 시간이 차면 있는 사람 + 봇으로 시작한다.
  // 랭크: 사람 8명이 찰 때까지 무한 대기한다.
  //
  // 서버가 스스로 못 깨어나므로 큐 진행도 클라 폴링이 트리거다 — 대기자
  // 각자가 pollQueue 를 부르고, 조건을 처음 본 호출이 방을 만든다. $lock 으로
  // 묶어 방이 두 개 생기지 않는다.

  async joinQueue(mode: 'normal' | 'ranked'): Promise<any> {
    const account = $sender.account
    const col = `mmqueue-${mode}`
    await $lock(`queue:${mode}`, async () => {
      const queued = await $global.getCollectionItems(col)
      if (!queued.find((x: any) => x.account === account)) {
        await $global.addCollectionItem(col, { account, at: Date.now() })
      }
    })
    return this.pollQueue(mode)
  }

  async leaveQueue(mode: 'normal' | 'ranked'): Promise<{ ok: boolean }> {
    const account = $sender.account
    const col = `mmqueue-${mode}`
    await $lock(`queue:${mode}`, async () => {
      const queued = await $global.getCollectionItems(col)
      const me = queued.find((x: any) => x.account === account)
      if (me) await $global.deleteCollectionItem(col, me.__id)
    })
    return { ok: true }
  }

  async pollQueue(mode: 'normal' | 'ranked'): Promise<any> {
    const account = $sender.account
    const col = `mmqueue-${mode}`
    return $lock(`queue:${mode}`, async () => {
      const queued = (await $global.getCollectionItems(col)).sort(
        (a: any, b: any) => a.at - b.at,
      )
      const me = queued.find((x: any) => x.account === account)
      if (!me) {
        // 큐에 없다 = 남의 폴링이 이미 나를 매치에 넣었다. 내 상태의 안내판을 본다.
        const st = await $global.getMyState()
        if (st.pendingRoom) return { status: 'matched', roomId: st.pendingRoom }
        return { status: 'idle' }
      }

      const size = DATA.lobby.size
      const full = queued.length >= size
      const timedOut =
        mode === 'normal' && Date.now() - me.at >= DATA.lobby.matching.normalWaitMs
      if (!full && !timedOut) {
        return { status: 'waiting', queued: queued.length, waitedMs: Date.now() - me.at }
      }

      // 방을 만든다 — 정원이 찼거나, 일반 매치의 대기 시간이 찼거나.
      const picked = queued.slice(0, size)
      // 좌석 순서가 대진 시드에 섞인다. 계정으로 정렬해야 8명 전원이 같은
      // 방을 계산한다 — 큐 도착 순서는 폴링 타이밍에 따라 흔들린다.
      const accounts = picked.map((x: any) => x.account).sort()
      const seed = (Date.now() ^ hashAccount(accounts.join('|'))) >>> 0
      const roomId = `match-${mode}-${seed.toString(36)}`

      await $global.addCollectionItem('matches', { roomId, accounts, seed, mode })
      for (const q of picked) {
        await $global.deleteCollectionItem(col, q.__id)
        await $global.updateUserState(q.account, { pendingRoom: roomId })
        // 폴링을 안 돌리고 있어도 즉시 안다. 폴링은 이 메시지를 놓쳤을 때의 보루다.
        $global.sendMessageToUser('MATCH_FOUND', q.account, { roomId })
      }
      return { status: 'matched', roomId }
    })
  }

  /**
   * 매치 방에 들어간다. 첫 진입자가 로비를 만든다 — matches 에 적힌 명단과
   * 시드로 만들므로 누가 먼저 들어와도 같은 방이 선다.
   */
  async joinMatchRoom(roomId: string): Promise<any> {
    await $global.joinRoom(roomId)
    // 안내판은 지운다. 남겨 두면 다음 큐에서 이 방으로 또 끌려온다.
    await $global.updateMyState({ pendingRoom: null })

    return $lock(`join:${roomId}`, async () => {
      const existing = await readLobby()
      if (existing) return existing

      const matches = await $global.getCollectionItems('matches')
      const match: any = matches.find((m: any) => m.roomId === roomId)
      if (!match) return null

      const state: any = createLobbyState({
        seed: match.seed,
        accounts: match.accounts,
        now: Date.now(),
        data: DATA,
      })
      // 랭크 판정의 근거다. 큐가 정한 모드를 방 상태에 박아 둔다.
      state.mode = match.mode
      await $room.updateRoomState({ lobby: state })
      return state
    })
  }

  /**
   * 내 배치를 알린다. **정찰의 핵심이다** — 이 브로드캐스트가 있어야 상대가
   * 지금 뭘 사고 어디에 두는지가 남들에게 보인다.
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

  /**
   * 아바타 위치. 방 사람들에게 그대로 흘린다.
   *
   * **룸 상태에 안 적는다.** 초당 몇 번씩 바뀌는 값이라 매번 상태를 쓰면
   * 보드·체력이 든 그 문서를 하루 종일 다시 쓰게 된다. 위치는 놓쳐도 다음
   * 것이 곧 오므로 방송만으로 충분하다 — 늦게 들어온 사람은 그 사람이
   * 한 걸음 뗄 때 비로소 보인다.
   */
  async updateAvatar(x: number, z: number, at: number): Promise<{ ok: boolean }> {
    const state = await readLobby()
    if (!state) return { ok: false }
    const seat = state.seats.find((s: any) => s.account === $sender.account)
    if (!seat) return { ok: false }
    // at = 지금 **어느 판에 서 있는가**. 남의 판을 구경 가면 그 좌석 번호다.
    // 이게 아바타의 존재 이유다 — 내 판을 누가 보고 있는지 알려면 보는 쪽이
    // 어디에 있는지가 같이 와야 한다.
    $room.broadcastToRoom('AVATAR_MOVED', { id: seat.id, x, z, at })
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

      // 순위는 서버가 박는다. 클라가 "나 1등"이라고 올리면 그대로 믿게 된다.
      const ranked = assignRanks(state, { final: state.phase === 'done' })
      // LP 는 **랭크 방에서만** 움직인다. 봇이 섞이는 일반 판이 랭크 점수를
      // 좌우하면 티어가 실력을 안 가리킨다.
      const scored = state.mode === 'ranked'
      for (const r of ranked) {
        const prev: any = await $global.getUserState(r.account)
        const profile = mergeProfile(prev?.profile ?? null, r.rank)
        // 티어는 저장하지 않는다 — LP 에서 언제든 나오는 값이라, 같이 적어
        // 두면 둘이 어긋날 자리를 하나 더 만드는 것뿐이다.
        if (scored) profile.lp = addLp(prev?.profile?.lp ?? 0, r.rank)
        else profile.lp = prev?.profile?.lp ?? 0
        await $global.updateUserState(r.account, { profile })
        // 순위표는 랭크 판에서만 갱신한다. 일반 판으로도 줄이 생기면 LP 0 인
        // 사람이 목록을 채워 "몇 등인가"가 아무 뜻도 없어진다.
        if (scored) await this.putLeaderboard(r.account, profile)
      }

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

/** 계정 문자열 → 32비트. 시드를 계정마다 갈라 놓기만 하면 된다. */
function hashAccount(account: string): number {
  let h = 2166136261
  for (let i = 0; i < account.length; i++) {
    h ^= account.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
