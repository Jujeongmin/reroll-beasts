// 시즌. 분기 단위로 돌고, 패스 단계와 랭크 보상이 이 구간을 따라간다.
//
// 시각을 인자로 받는 이유: sim/ 은 Date.now 를 못 쓴다(순수해야 테스트가
// 시계를 안 기다린다). 지금이 언제인지는 부르는 쪽이 안다.
//
// 날짜를 UTC 자정으로 읽는 이유: 로컬 시간대로 읽으면 같은 순간에 한국은
// 시즌이 끝났고 미국은 안 끝난 상태가 된다 — 그러면 "누가 시즌 안에
// 끝냈나"가 사람마다 다른 답이 된다.

const DAY = 86400000

/** 'YYYY-MM-DD' → UTC 자정의 밀리초. */
function utcDay(text) {
  return Date.parse(`${text}T00:00:00Z`)
}

/**
 * 그 시각의 시즌. 어느 구간에도 안 들면 null 이다 — 시즌 사이의 빈 기간을
 * 지어내지 않는다(다음 시즌 표를 안 적어 둔 상태일 수도 있다).
 */
export function seasonAt(now, data) {
  const list = data.season.seasons
  for (const s of list) {
    // 끝나는 날은 **그날 전체**가 시즌이다. 12/31 에 끝난다고 적어 놓고
    // 12/31 오전에 닫히면 하루를 도둑맞은 것처럼 읽힌다.
    if (now >= utcDay(s.start) && now < utcDay(s.end) + DAY) return s
  }
  return null
}

/**
 * 남은 날. 오늘이 마지막 날이면 1 이다 — 0 은 "이미 끝났다"로 읽힌다.
 * 시즌 밖이면 null.
 */
export function daysLeft(now, data) {
  const s = seasonAt(now, data)
  if (!s) return null
  return Math.max(0, Math.ceil((utcDay(s.end) + DAY - now) / DAY))
}

/** 진행도 0~1. 화면의 막대가 읽는다. */
export function seasonProgress(now, data) {
  const s = seasonAt(now, data)
  if (!s) return null
  const from = utcDay(s.start)
  const to = utcDay(s.end) + DAY
  return Math.max(0, Math.min(1, (now - from) / (to - from)))
}
