// 클라가 서버로 올리는 값을 거른다.
//
// **서버는 클라를 믿지 않는다.** 배치는 클라가 만들어 보내는 값이다. 안 거르면
// 두 가지가 한꺼번에 무너진다:
//
//   · 없는 유닛 id 하나면 마감 계산이 예외를 내고 **그 방 전체가** 라운드를
//     못 넘긴다. 조작한 사람이 아니라 같은 방 일곱 명이 멈춘다
//   · 5성·28명 배치가 그대로 판정에 든다
//
// 순수 함수인 이유는 나머지 sim 과 같다: 서버가 이 함수로 거르고, 테스트가
// 같은 함수로 검산한다.
//
// **이 파일은 형식과 값의 범위만 본다.** "정말 그 말을 샀는가"(골드·합성·
// 아이템 획득)는 아직 서버가 안 센다 — 그러려면 서버가 상점과 지갑을 쥐어야
// 하고, 그건 이 조각보다 크다. 여기서 막는 것은 **판이 멈추는 값**과 눈에
// 띄는 조작이다.

/** 내 진영 칸 수. 판 절반이 내 것이다. */
export function halfTiles(data) {
  const rows = data.combat.board.rows
  const all = rows.reduce((n, r) => n + r, 0)
  return Math.floor(all / 2)
}

/**
 * 제출된 배치를 서버가 받아들일 모양으로 거른다.
 *
 * 버릴 뿐 던지지 않는다 — 조작된 요청 하나에 방이 멈추면 조작한 쪽이 이긴다.
 *
 * @param {unknown} board  클라가 보낸 값. 무엇이든 올 수 있다
 * @param {object} data    규칙 표
 * @param {object} o
 * @param {number} o.cap   배치 인원 상한(= 그 좌석의 레벨)
 */
export function sanitizeBoard(board, data, { cap = 0 } = {}) {
  if (!Array.isArray(board)) return []
  const ids = new Set(data.units.units.map((u) => u.id))
  const itemIds = new Set(data.items.items.map((i) => i.id))
  const maxStar = data.combat.starMultiplier.length
  const tiles = halfTiles(data)
  const slots = data.items.slotsPerUnit
  // 유한한 정수만 상한으로 친다. NaN 이 들어오면 `out.length >= NaN` 이 늘
  // 거짓이라 **인원 제한이 통째로 사라진다** — 클라가 레벨로 숫자가 아닌 것을
  // 보내면 서버의 Math.floor 가 그 NaN 을 만든다. 모르는 상한은 0 이다:
  // 아무도 못 세우는 편이, 아무나 다 세우는 것보다 눈에 빨리 띈다.
  const limit = Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : 0

  const used = new Set()
  const out = []
  for (const c of board) {
    if (out.length >= limit) break
    if (!c || typeof c !== 'object') continue
    if (!ids.has(c.unitId)) continue
    if (!Number.isInteger(c.star) || c.star < 1 || c.star > maxStar) continue
    if (!Number.isInteger(c.tile) || c.tile < 0 || c.tile >= tiles) continue
    // 한 칸에 둘이 서면 전투가 무너진다. 먼저 온 것을 남긴다 — 순서를 규칙으로
    // 삼아야 같은 입력이 늘 같은 결과를 낸다.
    if (used.has(c.tile)) continue
    used.add(c.tile)
    const items = Array.isArray(c.items)
      ? c.items.filter((id) => itemIds.has(id)).slice(0, slots)
      : []
    out.push({ unitId: c.unitId, star: c.star, tile: c.tile, items })
  }
  return out
}
