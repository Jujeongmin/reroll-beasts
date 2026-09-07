// 광고 보상. 순수 함수 — 서버가 이 함수로 지급한다.
//
// 지면은 보상형뿐이다(보고 싶을 때 보는 것). 부활·무료 리롤처럼 판에 손대는
// 광고는 만들지 않는다. 지금 지면은 하나: 결과판에서 "광고 보고 이번 판 패스
// 경험치 2배".
//
// 지급량은 **여기 표**가 정한다. SDK 가 돌려주는 result.reward 는 화면 힌트일
// 뿐 믿을 값이 아니다 — 클라가 만들어 보낼 수 있는 값을 지급 근거로 쓰면 그게
// 조작 창구다.

import { xpForRank, addPassXp } from './pass.js'

/**
 * 지면 표. id 는 SDK 에 넘기는 placementId 와 글자 그대로 같아야 한다.
 *
 * dailyCap: 하루에 몇 번. 지면마다 따로 센다. 상한이 없으면 광고를 무한히
 * 돌려 패스를 하루에 끝낸다 — 그러면 패스가 파는 "플레이해서 얻는다"가 없다.
 */
export const PLACEMENTS = {
  'result-double': { kind: 'pass_xp_double', dailyCap: 3 },
}

/** 하루 기록의 빈 꼴. */
const EMPTY = { day: null, count: 0, matches: [] }

/**
 * 광고를 끝까지 본 사람에게 줄 것을 낸다.
 *
 * 판정 순서가 곧 거절 사유의 순서다. 모르는 지면 → 이 판이 아니다 → 이미
 * 받았다 → 오늘 상한. 앞엣것이 뒤엣것보다 "왜 안 되는가"를 더 분명히 말한다.
 *
 * @param {object|null} profile 지급 전 프로필
 * @param {object} o
 * @param {string} o.placementId
 * @param {string} o.matchId  이 판. 프로필의 lastMatch 와 같아야 한다 — 정산이
 *   안 된 판이나 다른 판의 광고로 받을 수 없다
 * @param {number} o.rank     이 판의 내 등수. 경험치가 등수에서 나온다
 * @param {boolean} o.ranked
 * @param {string} o.dayKey   오늘(UTC). 상한을 세는 단위
 * @returns {{ok: boolean, why?: string, profile?: object, xp?: number}}
 */
export function adReward(profile, { placementId, matchId, rank, ranked, dayKey }, data) {
  const place = PLACEMENTS[placementId]
  if (!place) return { ok: false, why: 'unknown_placement' }
  if (!profile) return { ok: false, why: 'no_profile' }
  if (!matchId || profile.lastMatch !== matchId) return { ok: false, why: 'no_match' }

  const prev = profile.ads?.[placementId] ?? EMPTY
  // 날이 바뀌었으면 셈을 비운다. 같은 날이면 이어 센다.
  const today = prev.day === dayKey ? prev : { ...EMPTY, day: dayKey }
  if (today.matches.includes(matchId)) return { ok: false, why: 'already' }
  if (today.count >= place.dailyCap) return { ok: false, why: 'cap' }

  if (place.kind !== 'pass_xp_double') return { ok: false, why: 'unknown_placement' }
  // "2배" = 이번 판이 준 만큼을 한 번 더. 등수에서 다시 계산한다 — 프로필에
  // 지난 판 경험치를 따로 적어 두지 않는다.
  const xp = xpForRank(rank, data, { ranked })
  if (!(xp > 0)) return { ok: false, why: 'nothing' }

  const pass = addPassXp(profile.pass ?? null, xp, data)
  return {
    ok: true,
    xp,
    profile: {
      ...profile,
      pass: { xp: pass.xp, level: pass.level, premium: pass.premium },
      gems: (profile.gems ?? 0) + pass.earned,
      ads: {
        ...(profile.ads ?? {}),
        [placementId]: {
          day: dayKey,
          count: today.count + 1,
          // 최근 몇 판만 든다. 전부 들면 프로필이 끝없이 자란다.
          matches: [matchId, ...today.matches].slice(0, 5),
        },
      },
    },
  }
}
