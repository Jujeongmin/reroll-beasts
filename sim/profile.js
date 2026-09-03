// 전적 누적. 규칙이 이 파일 하나에만 있어야 서버가 쓰는 값과 화면이 읽는
// 값이 같은 셈을 탄다.

/** 홈에 보이는 최근 판 수. 화면에 다섯 칸이라 여섯 번째는 남길 이유가 없다. */
const KEEP = 5

/**
 * 한 판이 끝난 전적을 누적한다.
 *
 * 새 객체를 낸다 — 서버가 유저 상태를 읽어 고쳐 쓰는 흐름이라, 원본을
 * 제자리에서 고치면 실패한 쓰기와 성공한 쓰기를 구분할 수 없게 된다.
 */
export function mergeProfile(prev, rank) {
  const p = prev ?? { games: 0, wins: 0, best: null, recent: [] }
  return {
    games: p.games + 1,
    wins: p.wins + (rank === 1 ? 1 : 0),
    best: p.best == null ? rank : Math.min(p.best, rank),
    recent: [rank, ...p.recent].slice(0, KEEP),
  }
}
