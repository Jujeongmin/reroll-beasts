// 랭크. 순위 → LP 증감 → 티어.
//
// 규칙이 여기 하나에만 있어야 서버가 매긴 값과 화면이 읽는 값이 같은 셈을
// 탄다. 판정은 서버가 한다 — 클라가 LP 를 올려 보내면 그대로 믿게 된다.

/**
 * 순위별 LP 증감. 8인 기준이고 4위가 0 이다 — 절반보다 잘하면 오르고
 * 못하면 내린다. 1위만 크게 주면 4~5위가 의미 없는 판이 되고, 평평하게
 * 주면 1위를 노릴 이유가 없다.
 */
const LP_BY_RANK = [0, 40, 28, 14, 0, -12, -20, -26, -32]

/** 티어. 문턱은 **아래에서부터** 읽는다 — 마지막으로 넘은 칸이 내 티어다. */
const TIERS = [
  { id: 'bronze', name: '브론즈', at: 0 },
  { id: 'silver', name: '실버', at: 300 },
  { id: 'gold', name: '골드', at: 700 },
  { id: 'platinum', name: '플래티넘', at: 1200 },
  { id: 'diamond', name: '다이아', at: 1800 },
]

/**
 * 이 순위로 얻는 LP.
 *
 * 표 밖의 순위(8인이 아닌 방)는 0 을 준다 — 없는 규칙을 지어내느니 안 주는
 * 편이 낫다. 지금 방은 늘 8석이지만 나중에 인원이 바뀔 수 있다.
 */
export function lpForRank(rank) {
  return LP_BY_RANK[rank] ?? 0
}

/**
 * LP 를 더한다. 0 아래로는 안 내려간다 — 음수 LP 는 "얼마나 못하는가"를
 * 재는 값이 되는데, 그건 이 게임이 하려는 말이 아니다.
 */
export function addLp(lp, rank) {
  return Math.max(0, (lp ?? 0) + lpForRank(rank))
}

/** 그 LP 의 티어. */
export function tierOf(lp) {
  let found = TIERS[0]
  for (const t of TIERS) if ((lp ?? 0) >= t.at) found = t
  return found
}

/**
 * 다음 티어까지 남은 LP 와 그 구간에서의 진행도(0~1).
 *
 * 최고 티어면 다음이 없다 — null 을 준다. 화면이 "다이아 · 2100" 처럼
 * 숫자만 보여주면 된다.
 */
export function tierProgress(lp) {
  const value = lp ?? 0
  const i = TIERS.findIndex((t) => t.id === tierOf(value).id)
  const next = TIERS[i + 1]
  if (!next) return null
  const from = TIERS[i].at
  return {
    next,
    need: next.at - value,
    ratio: (value - from) / (next.at - from),
  }
}

export { TIERS }
