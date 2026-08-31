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

  // 다음 행이 반 칸 어긋나 있으면 벌집처럼 맞물리므로 1.5R 간격이 맞다.
  // 같은 오프셋이면 세로로 정렬돼 꼭짓점끼리만 닿는다 — 그대로 두면 옆에
  // 삼각 틈이 벌어진다. 그 자리(교전선)는 간격을 좁혀 겹쳐 보이게 한다.
  //
  // **이건 그리기 보정이지 기하 변경이 아니다.** 보드가 거울 대칭이라
  // (toFieldTile 이 행 r ↔ 5-r 로 맞물린다 — 비동기 PvP 스냅샷의 전제)
  // rowOffset[2] 와 rowOffset[3] 이 같을 수밖에 없고, 마주 보는 두 앞줄은
  // 반드시 같은 x 에 선다. 대칭을 깨면 벌집은 매끈해지지만 스냅샷이 무너진다.
  const MESHED = 1.5
  const ALIGNED = 1.12
  const gapFactor = (r) =>
    r + 1 < rowCount && (rowOffset[r] ?? 0) === (rowOffset[r + 1] ?? 0) ? ALIGNED : MESHED

  // 전체 높이를 재서 화면 안에 들어오게 정규화한다
  let totalH = 0
  for (let r = 0; r < rowCount - 1; r++) totalH += radiusOf(scale[r]) * SQUASH * gapFactor(r)
  const fit = Math.min(1, (viewport.height * 0.86) / (totalH + radiusOf(1) * SQUASH * 2))

  const rowY = []
  let y = viewport.height * 0.1 + radiusOf(scale[0]) * SQUASH * fit
  for (let r = 0; r < rowCount; r++) {
    rowY.push(y)
    y += radiusOf(scale[r]) * SQUASH * gapFactor(r) * fit
  }

  // **보드 전체를 하나의 좌표계로 놓고 가운데를 잡는다.**
  // 행마다 따로 중앙정렬하면 안 된다 — 7칸 행과 8칸 행의 중심이 서로 어긋나
  // 벌집이 맞물리지 않는다. 시뮬(sim/hex.js)이 쓰는 좌표가 `col + rowOffset[row]`
  // 이고, 7칸 행은 0.5~6.5, 8칸 행은 0~7 로 **둘 다 중심이 3.5** 다.
  // 화면도 같은 좌표를 써야 시뮬이 계산한 인접 관계가 눈에 그대로 보인다.
  let lo = Infinity
  let hi = -Infinity
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < rows[r]; c++) {
      const p = c + (rowOffset[r] ?? 0)
      if (p < lo) lo = p
      if (p > hi) hi = p
    }
  }
  const midCol = (lo + hi) / 2

  const cx = viewport.width / 2
  const tiles = []
  for (let r = 0; r < rowCount; r++) {
    const s = scale[r]
    const w = rows[r]
    const stepX = tileW * s
    const R = radiusOf(s) * fit
    const ry = R * SQUASH

    for (let c = 0; c < w; c++) {
      const x = cx + (c + (rowOffset[r] ?? 0) - midCol) * stepX
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
