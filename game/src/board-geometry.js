// 전장 타일 → 화면 좌표. TFT 식 육각 벌집 + 2.5D 원근.
//
// 전장은 6행이다. 위 3행이 적 진영(멀리), 아래 3행이 내 진영(가까이).
// 스펙 §3.3 대로 위로 갈수록 좁고 작게 그려 깊이를 만든다.
//
// **육각형이 서로 맞물려야 한다.** 뾰족머리(pointy-top) 육각을 반 칸씩 어긋난
// 행으로 쌓으면 벌집이 된다. 그러려면 행 간격이 임의값이 아니라 육각 크기에서
// 나와야 한다 — 정육각 기준 행 간격은 외접원 반지름의 1.5배다.
// 여기에 원근 압축(SQUASH)을 세로로만 곱한다.
//
// 이 모듈은 순수하다. PixiJS 를 모른다. 좌표와 꼭짓점만 낸다.

/** 가장 먼 행의 크기 배율. 가까운 행이 1.0 */
const FAR = 0.66

/** 세로 압축. 1.0 이면 정육각, 낮을수록 위에서 내려다본 각도가 커진다 */
const SQUASH = 0.56

export function buildGeometry(boardCfg, viewport) {
  const { rows, rowOffset } = boardCfg
  const rowCount = rows.length

  const scale = []
  for (let r = 0; r < rowCount; r++) {
    scale.push(FAR + (1 - FAR) * (r / (rowCount - 1)))
  }

  // 가장 넓은 행이 화면 폭에 맞도록 칸 폭을 정한다.
  const widest = Math.max(...rows)
  const nearScale = scale[rowCount - 1]
  const tileW = (viewport.width * 0.9) / (widest + 0.5) / nearScale

  // 뾰족머리 육각: 폭 = √3·R  →  R = 폭/√3.  행 간격 = 1.5·R (원근 압축 적용)
  const radiusOf = (s) => (tileW * s) / Math.sqrt(3)
  const rowGap = (s) => 1.5 * radiusOf(s) * SQUASH

  // 전체 높이를 재서 화면 안에 들어오게 정규화한다
  let totalH = 0
  for (let r = 0; r < rowCount; r++) totalH += rowGap(scale[r])
  const fit = Math.min(1, (viewport.height * 0.86) / (totalH + radiusOf(1) * SQUASH * 2))

  const rowY = []
  let y = viewport.height * 0.1 + radiusOf(scale[0]) * SQUASH * fit
  for (let r = 0; r < rowCount; r++) {
    rowY.push(y)
    y += rowGap(scale[r]) * fit
  }

  const cx = viewport.width / 2
  const tiles = []
  for (let r = 0; r < rowCount; r++) {
    const s = scale[r]
    const w = rows[r]
    const stepX = tileW * s * 1.03 // 이음매를 살짝 겹쳐 벌집 사이 틈을 없앤다
    const R = radiusOf(s) * fit
    const ry = R * SQUASH
    const offset = (rowOffset[r] ?? 0) - 0.5

    for (let c = 0; c < w; c++) {
      const x = cx + (c - (w - 1) / 2 + offset) * stepX
      tiles.push({
        x,
        y: rowY[r],
        scale: s,
        row: r,
        col: c,
        // 뾰족머리 육각의 꼭짓점 6개 (위·오른위·오른아래·아래·왼아래·왼위)
        hex: [
          [x, rowY[r] - ry],
          [x + stepX / 2, rowY[r] - ry / 2],
          [x + stepX / 2, rowY[r] + ry / 2],
          [x, rowY[r] + ry],
          [x - stepX / 2, rowY[r] + ry / 2],
          [x - stepX / 2, rowY[r] - ry / 2],
        ],
        // 유닛 발이 닿는 곳 — 육각 중심보다 살짝 아래
        footY: rowY[r] + ry * 0.35,
      })
    }
  }

  const mid = Math.floor(rowCount / 2)
  return {
    tiles,
    rowY,
    scale,
    tileW,
    battleLineY: (rowY[mid - 1] + rowY[mid]) / 2,
  }
}
