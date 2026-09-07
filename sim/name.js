// 닉네임 규칙.
//
// 순수 함수인 이유는 나머지와 같다: **서버가 이 함수로 검산한다.** 화면에서만
// 막으면 조작된 요청 하나로 아무 이름이나 들어가고, 그 이름은 남의 화면에
// 그대로 뜬다.
//
// 유일성은 여기서 안 본다 — 그건 전체 목록을 봐야 알 수 있어 순수 함수가
// 아니다. 동명이인은 **허용하고 보이는 자리에서 가른다**: 같은 목록에 같은
// 이름이 둘 이상이면 그 줄들에만 계정 꼬리를 붙인다(tagDuplicates).

/**
 * 화면에 들어가는 칸 기준.
 *
 * 8 인 이유: 우측 좌석 칸이 이름에 93px 를 준다. 한글 열 자는 그것만으로
 * 이미 넘치고, 동명이인이면 꼬리(#1234)가 더 붙는다 — 잘린 이름은 누구인지
 * 알려 주는 일을 못 한다. 여덟 자가 칸에 꼭 맞는 최대다(87px).
 * 동명이인이라 꼬리가 붙으면 그때는 이름 쪽이 말줄임으로 줄고 꼬리가 남는다.
 */
export const NAME_MIN = 2
export const NAME_MAX = 8

// 기본 이름이 쓰는 말. 남이 기본 이름인 척하는 것을 막는다 — "유저1234" 는
// 계정에서 자동으로 나오는 이름이라 아무나 쓰면 누가 누군지 흐려진다.
const RESERVED = ['유저', '봇', 'admin', 'gm', '운영자']

// 한글·영문·숫자와 낱말 사이 공백 하나까지. 기호를 열면 보이지 않는 문자나
// 방향 제어 문자로 남의 화면을 망가뜨릴 수 있다.
//
// **낱자도 받는다**(U+3131~U+3163: ㄱ~ㅎ, ㅏ~ㅣ). "ㅋㅋㅋ" 나 "ㅇㅇ" 는 한국어를
// 쓰는 사람에게 멀쩡한 이름이고, 완성형만 받으면 그게 왜 거절되는지 설명할 길이
// 없다. 받는 것은 그 **호환 자모** 한 칸씩이다 — 옛한글 자모(U+1100 블록)는
// 여러 개가 한 글자로 겹쳐 쌓여 줄 높이를 밀어낸다.
const JAMO = '\u3131-\u3163'
const CH = `[가-힣${JAMO}a-zA-Z0-9]`
const OK = new RegExp(`^${CH}+(?: ${CH}+)*$`)

/**
 * 다듬은 이름. 앞뒤 공백을 떼고 사이 공백은 하나로 줄인다.
 *
 * 다듬기를 검사보다 먼저 두는 이유: "  고수  " 를 거절하는 대신 "고수" 로
 * 받아 주는 편이 낫다. 사람이 실수하는 자리는 대개 공백이다.
 */
export function normalizeName(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 쓸 수 있는 이름인가. 못 쓰면 왜인지 같이 준다.
 *
 * @returns {{ok: boolean, name?: string, why?: string}}
 */
export function checkName(raw) {
  const name = normalizeName(raw)
  // 코드포인트로 센다 — 이모지는 어차피 OK 정규식에서 막히지만, 길이를 UTF-16
  // 단위로 세면 한 글자가 두 칸으로 잡히는 문자가 생긴다.
  const len = [...name].length
  if (len < NAME_MIN) return { ok: false, why: 'name_short' }
  if (len > NAME_MAX) return { ok: false, why: 'name_long' }
  if (!OK.test(name)) return { ok: false, why: 'name_chars' }
  const low = name.toLowerCase()
  if (RESERVED.some((w) => low.startsWith(w.toLowerCase()))) return { ok: false, why: 'name_reserved' }
  return { ok: true, name }
}

/**
 * 화면에 띄울 이름. 정한 이름이 없으면 계정에서 만든다.
 *
 * 계정 전체를 안 쓰는 이유: 남의 지갑 주소를 목록에 뿌릴 이유가 없다.
 */
export function displayName(profileName, account) {
  const c = checkName(profileName)
  if (c.ok) return c.name
  return `유저${String(account ?? '').slice(-4)}`
}

/**
 * 계정 꼬리 네 자리. 겹치는 이름을 가르는 최소한의 표식이다.
 *
 * 계정 전체가 아니라 꼬리인 이유: 목록에 남의 지갑 주소를 뿌릴 이유가 없다.
 * 네 자리는 같은 목록 안(최대 여덟 명, 순위표 열 줄)에서 겹치기 어렵다 —
 * 세상 전체에서 유일하려는 값이 아니다.
 */
export function accountTag(account) {
  return String(account ?? '').slice(-4)
}

/**
 * 목록 안에서 **이름이 겹치는 사람에게만** 꼬리를 붙인다.
 *
 * 항상 붙이지 않는 이유: 겹치는 일은 드문데 늘 "고수#1234" 로 뜨면 이름이
 * 이름으로 안 읽힌다. 문제는 "같은 목록에 같은 이름이 둘"일 때만 생기므로,
 * 그때만 답하면 된다.
 *
 * 유일성 자체는 여기서 못 본다(전체 목록을 봐야 안다) — 이름은 겹치게 두고
 * 보이는 자리에서만 가른다.
 *
 * 붙인 문자열이 아니라 **둘로 나눠** 준다. 좌석 칸은 이름이 길면 말줄임으로
 * 자르는데, 하나로 붙여 보내면 잘리는 쪽이 꼬리다 — 가르려고 붙인 것이
 * 제일 먼저 사라진다. 나눠 주면 화면이 이름만 줄이고 꼬리는 남긴다.
 *
 * @param {{text: string, tag?: string}[]} rows 이미 화면 글자로 푼 이름과 꼬리
 * @returns {{name: string, tag: string}[]} tag 는 안 겹치면 빈 문자열
 */
export function tagDuplicates(rows) {
  const seen = new Map()
  for (const r of rows ?? []) {
    const k = String(r?.text ?? '')
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  return (rows ?? []).map((r) => {
    const name = String(r?.text ?? '')
    const tag = String(r?.tag ?? '')
    // 꼬리가 없으면 붙일 것이 없다 — 봇에게는 계정이 없다.
    return { name, tag: tag && seen.get(name) > 1 ? tag : '' }
  })
}

/** 한 줄짜리 글(title 속성 등)에 쓸 때. 화면 칸이 없는 자리다. */
export const joinTag = (r) => (r?.tag ? `${r.name}#${r.tag}` : (r?.name ?? ''))
