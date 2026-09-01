// 전장 타일 → 3D 월드 좌표.
//
// 2D 때와 달리 원근을 손으로 만들지 않는다 — 카메라를 기울이면 원근은 공짜다.
// 여기서는 평면(XZ) 위 격자 좌표만 낸다.
//
// **타일 간격을 상수로 박지 않는다.** 육각 모델의 실제 경계상자를 재서
// 거기서 유도한다. 모델이 바뀌면 간격도 따라온다.

/**
 * 육각 모델의 경계상자로 격자 간격을 정한다.
 *
 * 뾰족머리(pointy-top)는 z 가 더 길고, 납작머리(flat-top)는 x 가 더 길다.
 * 벌집이 맞물리려면 **꼭짓점이 있는 축의 간격을 3/4 로 줄여야** 한다.
 */
export function hexSpacing(size) {
  const pointyTop = size.z >= size.x
  return pointyTop
    ? { stepX: size.x, stepZ: size.z * 0.75, pointyTop }
    : { stepX: size.x * 0.75, stepZ: size.z, pointyTop }
}

/**
 * 전장 타일 좌표. 시뮬의 타일 인덱스 순서와 정확히 같은 순서로 낸다
 * (행 0 부터, 각 행은 열 0 부터) — sim/hex.js 의 buildBoard 와 같은 규칙이다.
 */
export function buildBoard3D(boardCfg, spacing) {
  const { rows, rowOffset } = boardCfg
  const { stepX, stepZ } = spacing

  // 보드 전체를 하나의 좌표계로 놓고 가운데를 잡는다. 행마다 따로 중앙정렬하면
  // 폭이 다른 행끼리 중심이 어긋나 벌집이 안 맞는다 — 2D 에서 한 번 겪었다.
  // 지금은 전 행이 7칸이라 어긋날 일이 없지만, 규칙은 데이터가 정하게 둔다.
  let lo = Infinity
  let hi = -Infinity
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r]; c++) {
      const p = c + (rowOffset[r] ?? 0)
      if (p < lo) lo = p
      if (p > hi) hi = p
    }
  }
  const midCol = (lo + hi) / 2
  const midRow = (rows.length - 1) / 2

  const tiles = []
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r]; c++) {
      tiles.push({
        index: tiles.length,
        row: r,
        col: c,
        x: (c + (rowOffset[r] ?? 0) - midCol) * stepX,
        z: (r - midRow) * stepZ,
      })
    }
  }

  return {
    tiles,
    width: (hi - lo + 1) * stepX,
    depth: rows.length * stepZ,
  }
}
