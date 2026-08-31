// 전장 기하. 6행(적 3행 + 아군 3행), 행마다 칸 수와 가로 오프셋이 다르다.
// 인접은 타일 중심 사이 유클리드 거리로 정하고, 거리는 인접 그래프 위 BFS 홉 수다.
// 비정규 격자에서도 거리가 정수로 떨어져 결정론이 보장된다.

export function buildBoard(cfg) {
  const { rows, rowOffset, rowHeight, adjacencyThreshold, allyRows } = cfg

  const tiles = []
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row]; col++) {
      tiles.push({
        index: tiles.length,
        row,
        col,
        cx: col + rowOffset[row],
        cy: row * rowHeight,
      })
    }
  }

  const tileCount = tiles.length

  const lookup = new Map()
  for (const t of tiles) lookup.set(t.row * 100 + t.col, t.index)

  const neighbors = tiles.map(() => [])
  for (let a = 0; a < tileCount; a++) {
    for (let b = a + 1; b < tileCount; b++) {
      const dx = tiles[a].cx - tiles[b].cx
      const dy = tiles[a].cy - tiles[b].cy
      if (Math.sqrt(dx * dx + dy * dy) <= adjacencyThreshold) {
        neighbors[a].push(b)
        neighbors[b].push(a)
      }
    }
  }
  // 결정론적 순회를 위해 인덱스 오름차순으로 고정한다.
  for (const list of neighbors) list.sort((x, y) => x - y)

  const dist = []
  for (let start = 0; start < tileCount; start++) {
    const row = new Array(tileCount).fill(Infinity)
    row[start] = 0
    const queue = [start]
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head]
      for (const nb of neighbors[cur]) {
        if (row[nb] === Infinity) {
          row[nb] = row[cur] + 1
          queue.push(nb)
        }
      }
    }
    dist.push(row)
  }

  const allySet = new Set(allyRows)

  return {
    tileCount,
    tiles,
    neighbors,
    dist,
    indexOf(row, col) {
      const found = lookup.get(row * 100 + col)
      return found === undefined ? -1 : found
    },
    side(tileIndex) {
      return allySet.has(tiles[tileIndex].row) ? 'ally' : 'enemy'
    },
  }
}
