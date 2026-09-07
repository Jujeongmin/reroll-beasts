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

/**
 * 순위표 정렬. LP 내림차순이 기본이고, 같으면 최고 순위가 좋은 쪽, 그것도
 * 같으면 계정 순이다.
 *
 * 동점을 계정 순으로까지 가르는 이유: 정렬이 흔들리면 같은 LP 인 사람들의
 * 등수가 새로고침할 때마다 바뀐다. 근거 없는 순서라도 **고정**돼야 한다.
 *
 * 원본을 안 고친다 — 서버가 컬렉션에서 읽은 배열을 그대로 넘기는데, 그걸
 * 제자리에서 뒤집으면 같은 요청 안에서 다른 계산이 이미 뒤집힌 걸 본다.
 */
export function sortLeaderboard(rows) {
  return [...rows].sort(
    (a, b) =>
      (b.lp ?? 0) - (a.lp ?? 0) ||
      (a.best ?? 99) - (b.best ?? 99) ||
      String(a.account).localeCompare(String(b.account)),
  )
}

/** 그 계정의 등수(1부터). 목록에 없으면 null. */
export function rankOf(rows, account) {
  const i = sortLeaderboard(rows).findIndex((r) => r.account === account)
  return i < 0 ? null : i + 1
}

/**
 * 한 티어를 몇 칸으로 나누나.
 *
 * 나누는 이유는 눈금이다. 골드 한 칸이 500 LP 라 한 판(±30)으로는 막대가
 * 거의 안 움직인다 — 이겼는데 아무것도 안 변한 것처럼 보인다. 다섯으로
 * 나누면 한 칸이 100 이라 한 판이 눈에 보이고, 올라갈 자리도 자주 온다.
 */
const DIVISIONS = 5

/**
 * 지금 몇 티어 몇 단계인가.
 *
 * 단계는 **5 가 가장 낮고 1 이 가장 높다** — 롤을 해 본 사람에게 익숙한
 * 방향이고, "골드 1" 이 골드의 끝이라는 읽기가 자연스럽다.
 *
 * 최고 티어는 단계가 없다(division: null). 위가 안 막혀 있어 다섯으로 나눌
 * 눈금이 없다 — 없는 칸을 지어내느니 안 나누는 편이 낫다.
 *
 * @returns {{tier: object, division: number|null, from: number, to: number|null,
 *            need: number|null, ratio: number}}
 */
export function divisionOf(lp) {
  const value = Math.max(0, lp ?? 0)
  const tier = tierOf(value)
  const i = TIERS.findIndex((t) => t.id === tier.id)
  const next = TIERS[i + 1]
  if (!next) {
    return { tier, division: null, from: tier.at, to: null, need: null, ratio: 1 }
  }
  const step = (next.at - tier.at) / DIVISIONS
  // 티어 문턱 바로 아래에서 마지막 칸을 넘어가지 않게 묶는다.
  const idx = Math.min(DIVISIONS - 1, Math.floor((value - tier.at) / step))
  const from = tier.at + step * idx
  const to = from + step
  return {
    tier,
    division: DIVISIONS - idx,
    from,
    to,
    need: Math.ceil(to - value),
    ratio: Math.max(0, Math.min(1, (value - from) / step)),
  }
}

/** 화면에 적을 이름. "골드 3", 최고 티어는 "다이아". */
export function divisionLabel(lp) {
  const d = divisionOf(lp)
  return d.division ? `${d.tier.name} ${d.division}` : d.tier.name
}

/**
 * 바로 위 칸의 이름. 최고 티어면 null.
 *
 * 문턱 LP 를 그대로 다시 읽는다 — 단계 안에서 세면 골드 1 위가 플래티넘 5
 * 라는 것을 여기서 또 알아야 하고, 그 앎이 divisionOf 와 어긋날 자리가 된다.
 */
export function nextDivisionLabel(lp) {
  const d = divisionOf(lp)
  return d.to === null ? null : divisionLabel(d.to)
}

export { DIVISIONS }

export { TIERS }
