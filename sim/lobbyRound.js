// 실시간 로비의 라운드 진행 규칙.
//
// 순수 함수다 — 시계도, 룸도, 네트워크도 모른다. **지금 시각을 인자로 받는다.**
// 서버가 Date.now() 를 넣어 부르고, 테스트는 아무 값이나 넣어 부른다. 그래서
// "마감 30초를 기다려야 검사할 수 있는 규칙"이 되지 않는다 — 서버 코드에
// 테스트용 뒷문을 뚫지 않아도 되는 이유다.
//
// 서버가 이 결과를 그대로 룸 상태에 쓴다. 클라에는 전투 로그를 보내지 않는다:
// 보드 두 개와 시드가 같으면 클라가 같은 로그를 스스로 만든다.

import { simulate } from './combat.js'
import { botBoard, pairUp } from './lobby.js'
import { createRng } from './rng.js'
import { roundAt, totalRounds, defeatDamage } from './rounds.js'

/** 이 라운드의 배치 시간(ms). 첫 판만 길다 — 살 것도 배울 것도 그때가 제일 많다. */
export function prepMs(round, data) {
  const s = round === 1 ? data.rounds.firstRoundSeconds : data.rounds.prepSeconds
  return s * 1000
}

/**
 * 라운드 시드. 대진·봇 편성·전투가 전부 여기서 갈라진다.
 *
 * 2654435761 은 홀수라 2^32 곱셈이 전단사다 — 라운드가 다르면 시드도 반드시
 * 다르다. itemSeed 와 같은 이유로 같은 상수를 쓴다.
 */
export function roundSeed(seed, round) {
  return (seed ^ 0x5f3a ^ (round * 2654435761)) >>> 0
}

/**
 * 이 라운드의 대진. **쌍 안을 좌석 번호 오름차순으로 정렬한다.**
 *
 * 정렬하는 이유: 전투는 A 가 선공이라 진영 배정이 결과에 섞인다. 쌍의 순서가
 * 셔플에서 나오면 클라(내가 항상 A 로 재생)와 서버(셔플 순서대로 판정)가
 * 다른 답을 낸다. 낮은 번호 = A 로 못 박으면 양쪽이 같은 계산을 한다.
 */
export function roundPairs(state) {
  const rng = createRng(roundSeed(state.seed, state.round))
  return pairUp(state.seats, rng).map(([x, y]) => (x < y ? [x, y] : [y, x]))
}

/** 한 판의 전투 시드. 서버 판정과 클라 재생이 같은 값을 써야 한다. */
export function fightSeed(seed, round, a, b) {
  return (roundSeed(seed, round) + a * 131 + b * 977) >>> 0
}

/**
 * 봇 좌석의 판을 이 라운드 세기로 다시 짠다.
 *
 * 봇은 라운드 사이에 상태를 안 들고 다닌다. 사람이 그 자리를 대체하면
 * (2단계) 이 함수가 그 좌석을 건너뛴다 — isBot 만 보면 된다.
 */
export function growBotSeats(state, data) {
  for (const seat of state.seats) {
    if (!seat.isBot || !seat.alive) continue
    const rng = createRng(roundSeed(state.seed, state.round) ^ (seat.id * 7919))
    seat.board = botBoard(state.round, rng, data)
  }
}

/**
 * 배치 마감을 처리한다. **state 를 제자리에서 고친다.**
 *
 * 아직 시각이 안 됐거나 이미 끝난 판이면 아무것도 안 하고 `changed: false` 를
 * 준다. 클라가 재촉해도 시각은 서버가 쥔 이 값으로만 판정된다.
 *
 * @param {object} state 로비 상태 (seed·round·phase·deadline·seats)
 * @param {number} now   지금 시각 (ms)
 * @param {object} data  규칙 데이터
 */
export function resolveRound(state, now, data, { early = false } = {}) {
  if (state.phase !== 'prep') return { changed: false, fights: [] }
  // early: 방에 사람이 하나뿐일 때 서버가 허용한다. 봇은 정찰을 안 하므로
  // 혼자 일찍 넘겨도 손해 보는 사람이 없다. 사람이 둘 이상이면 마감이 법이다.
  if (!early && now < state.deadline) return { changed: false, fights: [] }

  const info = roundAt(state.round, data.rounds)
  const pairs = roundPairs(state)

  const fights = []
  for (const [a, b] of pairs) {
    const seatA = state.seats[a]
    const seatB = state.seats[b]
    const seed = fightSeed(state.seed, state.round, a, b)
    const r = simulate({ boardA: seatA.board, boardB: seatB.board, seed, data })
    fights.push({
      a,
      b,
      winner: r.winner,
      survivorsA: r.survivorsA,
      survivorsB: r.survivorsB,
      seed,
    })
  }

  for (const f of fights) {
    const seatA = state.seats[f.a]
    const seatB = state.seats[f.b]
    const wonA = f.winner === 'A'
    const wonB = f.winner === 'B'
    // 무승부면 양쪽 다 진 것으로 친다 — 비기고 아무 일도 안 일어나면
    // 서로 약한 판을 세워 버티는 게 최선의 수가 된다.
    if (!wonA) seatA.hp = Math.max(0, seatA.hp - defeatDamage(f.survivorsB, info.damage))
    if (!wonB) seatB.hp = Math.max(0, seatB.hp - defeatDamage(f.survivorsA, info.damage))
    for (const [seat, won] of [
      [seatA, wonA],
      [seatB, wonB],
    ]) {
      // 연속 횟수는 승패 방향과 무관하게 센다 — 연승도 연패도 같은 표를 쓴다.
      seat.streak = seat.lastWon === won ? seat.streak + 1 : 1
      seat.lastWon = won
      if (seat.hp <= 0) seat.alive = false
    }
  }

  state.fights = fights
  state.pairs = pairs

  const survivors = state.seats.filter((s) => s.alive).length
  if (state.round >= totalRounds(data.rounds) || survivors <= 1) {
    state.phase = 'done'
  } else {
    state.round += 1
    state.deadline = now + prepMs(state.round, data)
    growBotSeats(state, data)
  }

  return { changed: true, fights }
}

/**
 * 새 로비 한 판.
 *
 * accounts 로 사람 계정들을 앞자리부터 앉히고 나머지는 봇이다. 1인 방은
 * accounts 가 하나(연습·폴백), 매치 방은 큐에서 모인 만큼이다. 좌석 순서가
 * 대진 시드에 섞이므로 **호출자가 정렬해 넘겨야** 8명 전원이 같은 방을 만든다.
 */
export function createLobbyState({ seed, account, accounts, now, data }) {
  const people = accounts ?? [account]
  const names = data.lobby.names
  const seats = []
  for (let i = 0; i < data.lobby.size; i++) {
    const who = people[i] ?? null
    seats.push({
      id: i,
      // 사람은 계정 꼬리로 구분한다 — 익명 계정이라 달리 부를 이름이 없다.
      name: who ? `유저${String(who).slice(-4)}` : (names[i] ?? `봇${i}`),
      account: who,
      isBot: !who,
      hp: data.economy.startHp,
      level: data.levels.startLevel,
      board: [],
      alive: true,
      streak: 0,
      lastWon: null,
      // 무대 스킨. **좌석에 붙는다** — 남의 판을 구경 가면 그 사람 무대가
      // 보여야 한다. 스킨을 각자 화면에만 두면 산 사람만 자기 판에서 보고,
      // 그러면 남에게 보여 줄 수 없는 것을 판 셈이 된다.
      skin: data.cosmetics.boardDefault,
      // 아바타도 같은 이유로 좌석에 붙는다 — 남의 판에 서 있는 내 모습이
      // 기본 캐릭터로 보이면 아바타를 산 값이 화면에 안 남는다.
      avatar: data.cosmetics.avatarDefault,
      // 승리 이펙트. 진 판에 떨어지는 물건이라 **남이 보는 값**이다.
      boom: data.cosmetics.boomDefault,
    })
  }
  const state = {
    seed,
    round: 1,
    phase: 'prep',
    deadline: now + prepMs(1, data),
    seats,
    fights: [],
    pairs: [],
  }
  growBotSeats(state, data)
  return state
}

/**
 * 탈락한 좌석에 순위를 박는다.
 *
 * 순위를 **죽는 그 자리에서** 정하는 이유: 나중에 되짚으려면 누가 언제
 * 죽었는지를 따로 적어 둬야 하는데, 그 기록이 상태와 어긋나는 순간 전적이
 * 조용히 거짓말을 시작한다. 같은 라운드에 죽은 좌석은 가를 근거가 없으므로
 * 같은 순위를 준다.
 *
 * final 은 23라운드를 다 채워 끝난 경우다. 살아남은 사람들 사이는 체력으로
 * 가른다 — 그때까지 덜 맞은 쪽이 더 잘한 것이다.
 */
export function assignRanks(state, { final = false } = {}) {
  const out = []
  const take = (seat, rank) => {
    if (seat.rank != null) return
    seat.rank = rank
    if (seat.account) out.push({ account: seat.account, rank })
  }

  const alive = state.seats.filter((s) => s.alive)
  for (const seat of state.seats) {
    if (!seat.alive) take(seat, alive.length + 1)
  }

  if (alive.length === 1) take(alive[0], 1)
  else if (final && alive.length > 1) {
    // 체력 내림차순. 같은 체력이면 같은 순위이고, 그다음은 인원수만큼 건너뛴다
    // (공동 2위가 둘이면 다음은 4위) — 스포츠 순위와 같은 셈법이다.
    const sorted = [...alive].sort((a, b) => b.hp - a.hp)
    let rank = 1
    let seen = 0
    let prevHp = null
    for (const seat of sorted) {
      seen += 1
      if (seat.hp !== prevHp) {
        rank = seen
        prevHp = seat.hp
      }
      take(seat, rank)
    }
  }

  return out
}
