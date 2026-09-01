// 로비. 나 말고 7명이 같은 판을 돈다.
//
// §10 의 비동기 스냅샷이 붙기 전까지는 **봇**이 그 자리를 채운다. 봇이라도
// 라운드마다 실제로 서로 싸우고 체력을 잃어야 순위표가 정보가 된다 —
// 숫자를 지어내면 화면에 뜬 등수가 아무 뜻이 없다.
//
// 순수 함수다. 무작위성은 전부 rng 로 들어온다.

import { simulate } from './combat.js'
import { defeatDamage } from './rounds.js'

/** 이 라운드에 봇이 얼마나 강한가. */
export function growthAt(roundIndex, lobbyCfg) {
  return lobbyCfg.growth.find((g) => roundIndex <= g.untilRound) ?? lobbyCfg.growth.at(-1)
}

/**
 * 봇 한 명의 보드. 라운드가 갈수록 인원·티어·성급이 오른다.
 *
 * 타일은 **로컬 좌표**다 — 진영 변환은 combat.js 가 한다.
 * 앞줄부터 채우되 사거리가 긴 유닛을 뒤로 보낸다. 아무렇게나 세우면
 * 봇 원거리 유닛이 앞에서 먼저 죽어 난이도가 라운드와 무관해진다.
 */
export function botBoard(roundIndex, rng, data) {
  const g = growthAt(roundIndex, data.lobby)
  const pool = data.units.units.filter((u) => u.tier <= g.maxTier)

  const picked = []
  const seen = new Set()
  // 뽑기 시도 횟수를 유닛 수로 묶는다. 후보가 적을 때 무한루프가 되면 안 된다.
  for (let tries = 0; tries < pool.length * 4 && picked.length < g.units; tries++) {
    const u = pool[rng.int(pool.length)]
    if (seen.has(u.id)) continue
    seen.add(u.id)
    picked.push(u)
  }

  const range = (u) => data.combat.classModifier[u.class].range
  picked.sort((a, b) => range(a) - range(b) || a.id.localeCompare(b.id))

  const perRow = data.combat.board.rows[data.combat.board.allyRows[0]]
  return picked.map((u, i) => ({ unitId: u.id, star: g.star, tile: i }))
    .filter((e) => e.tile < perRow * data.combat.board.allyRows.length)
}

export function createLobby(data, rng) {
  return data.lobby.names.map((name, i) => ({
    id: i,
    name,
    isPlayer: i === 0,
    hp: data.economy.startHp,
    board: i === 0 ? [] : botBoard(1, rng, data),
    // 연속 승/패. 화면이 "지금 누가 달리고 있나"를 표시하려면 결과만으로는 모자란다.
    streak: 0,
    lastWon: null,
  }))
}

/**
 * 이번 라운드 대진. 살아 있는 사람만 섞어 둘씩 묶는다.
 * 홀수면 마지막 한 명은 그 라운드를 건너뛴다 (PvE 라운드가 그 자리를 메운다).
 */
export function pairUp(lobby, rng) {
  const alive = lobby.filter((p) => p.hp > 0).map((p) => p.id)
  for (let i = alive.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[alive[i], alive[j]] = [alive[j], alive[i]]
  }
  const pairs = []
  for (let i = 0; i + 1 < alive.length; i += 2) pairs.push([alive[i], alive[i + 1]])
  return pairs
}

/** 나와 붙는 상대. 짝이 없으면 null (그 라운드는 PvE 로 때운다). */
export function opponentOf(pairs, playerId = 0) {
  const pair = pairs.find((p) => p.includes(playerId))
  if (!pair) return null
  return pair[0] === playerId ? pair[1] : pair[0]
}

/**
 * 나를 뺀 나머지 대진을 실제로 돌려 체력을 깎는다.
 *
 * 봇끼리도 같은 simulate 를 쓴다. 따로 대충 계산하면 봇 순위가 내가 겪는
 * 전투와 다른 규칙을 따르게 되어, 화면의 등수가 거짓이 된다.
 */
/** 연속 기록. 승패 방향이 바뀌면 1 부터 다시 센다 — 연승도 연패도 같은 표를 쓴다. */
export function bumpStreak(seat, won) {
  seat.streak = seat.lastWon === won ? seat.streak + 1 : 1
  seat.lastWon = won
}

/**
 * 남의 대진을 **돌려만 본다.** 체력은 건드리지 않고 로그를 통째로 돌려준다.
 *
 * 적용과 나눈 이유: 내 전투가 재생되는 동안 남의 판도 구경할 수 있어야 하는데,
 * 그러려면 로그가 그때 이미 있어야 한다. 반면 체력은 내 판정이 끝난 뒤에
 * 한꺼번에 반영해야 순위표가 중간에 흔들리지 않는다.
 */
export function simulateOthers(lobby, pairs, { playerId = 0, seed, data }) {
  const out = []
  for (const [a, b] of pairs) {
    if (a === playerId || b === playerId) continue
    const result = simulate({
      boardA: lobby[a].board,
      boardB: lobby[b].board,
      seed: (seed + a * 131 + b * 977) >>> 0,
      data,
    })
    out.push({ a, b, winner: result.winner, result })
  }
  return out
}

/** simulateOthers 가 낸 결과를 체력·연승에 반영한다. */
export function applyOthers(lobby, fights, { stageDamage }) {
  for (const f of fights) {
    const pa = lobby[f.a]
    const pb = lobby[f.b]
    const r = f.result
    if (r.winner === 'A') pb.hp = Math.max(0, pb.hp - defeatDamage(r.survivorsA, stageDamage))
    else if (r.winner === 'B') pa.hp = Math.max(0, pa.hp - defeatDamage(r.survivorsB, stageDamage))
    // 무승부면 연속 기록을 건드리지 않는다 — 이기지도 지지도 않았다.
    if (r.winner !== null) {
      bumpStreak(pa, r.winner === 'A')
      bumpStreak(pb, r.winner === 'B')
    }
  }
  return fights.map(({ a, b, winner }) => ({ a, b, winner }))
}

/** 돌리고 바로 반영한다. 구경할 필요가 없는 쪽(테스트·정산 일괄)이 쓴다. */
export function resolveOthers(lobby, pairs, { playerId = 0, seed, stageDamage, data }) {
  return applyOthers(lobby, simulateOthers(lobby, pairs, { playerId, seed, data }), { stageDamage })
}

/** 라운드가 넘어갈 때 봇들의 보드를 다시 짠다. */
export function growBots(lobby, roundIndex, rng, data, { playerId = 0 } = {}) {
  for (const p of lobby) {
    if (p.id === playerId || p.hp <= 0) continue
    p.board = botBoard(roundIndex, rng, data)
  }
}

/** 체력 내림차순, 같으면 이름 순. 탈락자는 뒤로. */
export function standings(lobby) {
  return [...lobby].sort((x, y) => y.hp - x.hp || x.name.localeCompare(y.name))
}
