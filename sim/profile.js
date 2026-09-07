// 전적 누적. 규칙이 이 파일 하나에만 있어야 서버가 쓰는 값과 화면이 읽는
// 값이 같은 셈을 탄다.

/** 홈에 보이는 최근 판 수. 화면에 다섯 칸이라 여섯 번째는 남길 이유가 없다. */
import { advancePass } from './pass.js'
import { addLp } from './rank.js'

const KEEP = 5

/** 0 이상의 정수만 센다. 나머지는 없던 값으로 친다. */
function count(v) {
  return Number.isInteger(v) && v >= 0 ? v : 0
}

/**
 * 한 판이 끝난 전적을 누적한다.
 *
 * 새 객체를 낸다 — 서버가 유저 상태를 읽어 고쳐 쓰는 흐름이라, 원본을
 * 제자리에서 고치면 실패한 쓰기와 성공한 쓰기를 구분할 수 없게 된다.
 *
 * **프로필이 있다고 전적 칸이 있는 건 아니다.** 닉네임을 먼저 정하면
 * `{ name }` 만 든 프로필이 생긴다(setName). 그래서 객체 하나를 통째로
 * 기본값으로 갈음하지 않고 **칸마다** 친다 — 한 칸이 비었다고 첫 판 정산이
 * 통째로 터지면 같은 방 사람들 기록까지 안 남는다.
 */
export function mergeProfile(prev, rank) {
  const p = prev ?? {}
  const best = Number.isInteger(p.best) && p.best > 0 ? p.best : null
  const recent = Array.isArray(p.recent) ? p.recent : []
  return {
    games: count(p.games) + 1,
    wins: count(p.wins) + (rank === 1 ? 1 : 0),
    best: best == null ? rank : Math.min(best, rank),
    recent: [rank, ...recent].slice(0, KEEP),
  }
}

/**
 * 판 하나가 프로필에 남기는 것 **전부**.
 *
 * 서버가 이 함수 하나만 부르게 하는 이유: 전에는 서버가 mergeProfile 의
 * 결과(전적 칸만 든 객체)를 그대로 프로필로 저장했다. 그래서 판이 끝날
 * 때마다 **이름·산 아바타·고른 겉모습이 지워졌다.** 돈 주고 산 것이 사라지는
 * 자리라, 무엇을 남기고 무엇을 갱신하는지를 여기 한 곳에 적어 둔다.
 *
 * 모르는 칸은 건드리지 않고 넘긴다(`...base`) — 나중에 칸이 하나 늘 때
 * 이 함수를 안 고쳐도 살아남는다.
 */
export function applyMatchResult(prev, rank, data, { ranked = true } = {}) {
  const base = prev ?? {}
  const pass = advancePass(base.pass ?? null, rank, data, { ranked })
  return {
    ...base,
    ...mergeProfile(base, rank),
    // LP 는 랭크 방에서만 움직인다. 봇이 섞이는 일반 판이 점수를 좌우하면
    // 티어가 실력을 안 가리킨다.
    lp: ranked ? addLp(base.lp ?? 0, rank) : (base.lp ?? 0),
    pass: { xp: pass.xp, level: pass.level, premium: pass.premium },
    // 패스는 증분만 준다. 잔액을 패스가 계산하면 패스와 지갑이 한 덩어리가 된다.
    gems: (base.gems ?? 0) + pass.earned,
  }
}
