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
export function resolveRound(state, now, data) {
  if (state.phase !== 'prep') return { changed: false, fights: [] }
  if (now < state.deadline) return { changed: false, fights: [] }

  const info = roundAt(state.round, data.rounds)
  const rng = createRng(roundSeed(state.seed, state.round))
  const pairs = pairUp(state.seats, rng)

  const fights = []
  for (const [a, b] of pairs) {
    const seatA = state.seats[a]
    const seatB = state.seats[b]
    const seed = (roundSeed(state.seed, state.round) + a * 131 + b * 977) >>> 0
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

/** 새 로비 한 판. 0번이 사람이고 나머지는 봇이다. */
export function createLobbyState({ seed, account, now, data }) {
  const names = data.lobby.names
  const seats = []
  for (let i = 0; i < data.lobby.size; i++) {
    seats.push({
      id: i,
      name: names[i] ?? `봇${i}`,
      // 2단계에서 나머지 자리도 계정으로 채운다. isBot 이 그 갈림길이다.
      account: i === 0 ? account : null,
      isBot: i !== 0,
      hp: data.economy.startHp,
      level: data.levels.startLevel,
      board: [],
      alive: true,
      streak: 0,
      lastWon: null,
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
