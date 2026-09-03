// 닉네임 규칙.
//
// 순수 함수인 이유는 나머지와 같다: **서버가 이 함수로 검산한다.** 화면에서만
// 막으면 조작된 요청 하나로 아무 이름이나 들어가고, 그 이름은 남의 화면에
// 그대로 뜬다.
//
// 유일성은 여기서 안 본다 — 그건 전체 목록을 봐야 알 수 있어 순수 함수가
// 아니다. 지금은 동명이인을 허용한다(순위표는 등수로 구분된다).

/** 화면에 들어가는 칸 기준. 이보다 길면 좌석 이름이 줄바꿈된다. */
export const NAME_MIN = 2
export const NAME_MAX = 10

// 기본 이름이 쓰는 말. 남이 기본 이름인 척하는 것을 막는다 — "유저1234" 는
// 계정에서 자동으로 나오는 이름이라 아무나 쓰면 누가 누군지 흐려진다.
const RESERVED = ['유저', '봇', 'admin', 'gm', '운영자']

// 한글·영문·숫자와 낱말 사이 공백 하나까지. 기호를 열면 보이지 않는 문자나
// 방향 제어 문자로 남의 화면을 망가뜨릴 수 있다.
const OK = /^[가-힣a-zA-Z0-9]+(?: [가-힣a-zA-Z0-9]+)*$/

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
  if (len < NAME_MIN) return { ok: false, why: `${NAME_MIN}자 이상` }
  if (len > NAME_MAX) return { ok: false, why: `${NAME_MAX}자 이하` }
  if (!OK.test(name)) return { ok: false, why: '한글·영문·숫자만' }
  const low = name.toLowerCase()
  if (RESERVED.some((w) => low.startsWith(w.toLowerCase()))) return { ok: false, why: '못 쓰는 이름' }
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
