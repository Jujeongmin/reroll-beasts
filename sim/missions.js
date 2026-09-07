// 일일 미션.
//
// **오늘의 3개는 저장하지 않는다.** 날짜와 계정으로 다시 계산한다. 저장하면
// "목록이 없으면 만들어 준다" 는 분기가 생기고, 그 분기가 곧 목록이 두 벌
// (서버가 만든 것과 화면이 그린 것)이 되는 자리다. 서버와 화면이 같은 순수
// 함수를 돌리면 두 쪽이 다른 답을 낼 수 없다 — 이 저장소가 전투·LP·패스에서
// 계속 쓰는 방식 그대로다.
//
// 저장하는 것은 진행도와 수령 여부뿐이다.

import { createRng } from './rng.js'
import { unitById } from './data.js'
import { activeTraits } from './traits.js'

/**
 * 날짜 도장. UTC 로 읽는 이유는 season.js 와 같다 — 로컬 시간대로 읽으면 같은
 * 순간에 한국은 미션이 갈렸고 미국은 안 갈린 상태가 된다. 그러면 "오늘 것"이
 * 사람마다 다른 말이 된다.
 */
export function dayKeyOf(now) {
  return new Date(now).toISOString().slice(0, 10)
}

/** 문자열 → 32비트. 날짜와 계정을 한 시드로 접는다(server.ts 의 hashAccount 와 같은 셈). */
function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * 오늘의 미션. 같은 날·같은 계정이면 언제 물어도 같다.
 *
 * 계정을 시드에 섞는 이유: 전원이 같은 3개를 받으면 "오늘은 랭크 미션뿐이라
 * 할 게 없다" 가 모두에게 동시에 일어난다.
 *
 * 뽑은 것은 표에서 뺀다 — 같은 미션이 두 번 뽑히면 한 줄이 값 없이 자리만
 * 차지한다.
 */
export function missionsFor(dayKey, account, data) {
  const all = data.missions.missions
  const n = Math.min(data.missions.perDay, all.length)
  const rng = createRng(hash(`${dayKey}|${account ?? ''}`))
  const pool = [...all]
  const out = []
  for (let i = 0; i < n; i++) out.push(...pool.splice(rng.int(pool.length), 1))
  return out
}

/** 아무것도 안 한 사람의 오늘. */
function empty(dayKey, count) {
  return {
    day: dayKey,
    progress: Array(count).fill(0),
    claimed: Array(count).fill(false),
  }
}

/**
 * 날짜가 갈렸으면 판을 새로 깐다.
 *
 * 서버에 타이머가 없다(자정에 스스로 깨어날 수단이 없다) — 그래서 **누가
 * 찾아올 때** 판정한다. 마감·매칭이 쓰는 방식과 같다.
 *
 * 다 찬 미션도 함께 지운다. 남겨 두면 밀린 보상이 쌓여 매일 들어올 이유가
 * 없어진다 — 일주일 뒤에 몰아 받으면 되기 때문이다.
 */
export function rollMissions(prev, dayKey, count = 3) {
  if (prev?.day === dayKey && Array.isArray(prev.progress)) return prev
  return empty(dayKey, count)
}

/**
 * 이 미션이 판 하나에서 얼마나 나아가나.
 *
 * **셈법이 둘이다.** 판 수처럼 쌓이는 것(`add`)과, 3성·시너지처럼 한 판 안에서
 * 얼마나 갔나를 보는 것(`max`). 뒤엣것을 더하기로 세면 "시너지 3단계" 가
 * 1단계 세 판으로 채워진다 — 그건 다른 과제다.
 */
export function missionGain(kind, ctx, data) {
  const board = Array.isArray(ctx.board) ? ctx.board : []
  switch (kind) {
    case 'games':
      return { add: 1 }
    case 'rankedGames':
      return { add: ctx.ranked ? 1 : 0 }
    case 'top4':
      return { add: ctx.rank > 0 && ctx.rank <= 4 ? 1 : 0 }
    case 'firstPlace':
      return { add: ctx.rank === 1 ? 1 : 0 }
    case 'threeStar':
      return { add: board.some((c) => c.star >= 3) ? 1 : 0 }
    case 'traitStep': {
      // 화면이 시너지 막대를 그릴 때 쓰는 그 함수다. 여기서 다시 세면 두 답이 갈린다.
      //
      // **보드 칸을 그대로 넘기면 안 된다.** 칸에는 unitId 만 있고 종족·직업은
      // 유닛 표에 있다 — 그대로 넘기면 전부 0 단계로 읽혀 이 미션이 영원히
      // 안 찬다(예외도 안 난다). prep.js 의 renderTraits 와 같은 변환이다.
      const units = board
        .map((c) => unitById(data.units, c.unitId))
        .filter(Boolean)
        .map((u) => ({ unitId: u.id, origin: u.origin, class: u.class }))
      let best = 0
      for (const t of activeTraits(units, data.traits).values()) best = Math.max(best, t.step)
      return { max: best }
    }
    case 'itemsWorn':
      return { max: board.reduce((n, c) => n + (c.items?.length ?? 0), 0) }
    case 'boardFull':
      // 빈 판은 꽉 찬 것이 아니다 — 죽어서 판이 비었을 수도 있다.
      return { add: board.length > 0 && board.length >= ctx.level ? 1 : 0 }
    case 'roundWins':
      return { max: Math.max(0, ctx.roundWins ?? 0) }
    default:
      // 모르는 종류는 0 점이다. 표를 고칠 때 불변식이 먼저 잡는다.
      return { add: 0 }
  }
}

/**
 * 판 하나를 반영한 새 상태.
 *
 * 새 객체를 낸다 — 서버가 유저 상태를 읽어 고쳐 쓰는 흐름이라, 제자리에서
 * 고치면 실패한 쓰기와 성공한 쓰기를 구분할 수 없다(mergeProfile 과 같은 이유).
 */
export function advanceMissions(prev, ctx, data) {
  const list = missionsFor(ctx.dayKey, ctx.account, data)
  const state = rollMissions(prev, ctx.dayKey, list.length)
  const progress = list.map((m, i) => {
    const now = state.progress[i] ?? 0
    const gain = missionGain(m.kind, ctx, data)
    const next = gain.add != null ? now + gain.add : Math.max(now, gain.max)
    // 목표를 넘겨 쌓지 않는다 — 화면이 3/2 를 그리게 되고, 넘친 값은 아무
    // 뜻도 없다.
    return Math.min(m.target, next)
  })
  return { day: state.day, progress, claimed: [...state.claimed] }
}

/**
 * 다 찬 미션을 받는다. `xp` 가 0 이면 못 받은 것이다.
 *
 * 판정이 여기 있는 이유: 서버가 이 함수로 검산한다. 화면에서만 막으면 조작된
 * 호출 하나로 안 한 미션의 경험치가 들어온다.
 *
 * 지난 날짜의 진행도로는 못 받는다 — rollMissions 가 판을 새로 깔아 진행도가
 * 0 이 되고, 아래 검사에서 걸린다. 오늘 것만 오늘 받는다.
 */
export function claimMission(prev, index, { dayKey, account }, data) {
  const list = missionsFor(dayKey, account, data)
  const state = rollMissions(prev, dayKey, list.length)
  const m = list[index]
  if (!m || state.claimed[index] || (state.progress[index] ?? 0) < m.target) {
    return { state, xp: 0 }
  }
  const claimed = [...state.claimed]
  claimed[index] = true
  return { state: { ...state, claimed }, xp: m.xp }
}
