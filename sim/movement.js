// 한 틱에 한 칸 이동. 타겟까지 거리가 줄어드는 인접 타일 중
// 타일 인덱스가 가장 작은 것을 고른다 (결정론).
// 후보가 전부 점유되어 있으면 null 을 되돌리고, 호출자는 그 틱을 대기한다.

export function stepToward(board, self, target, occupied) {
  const curDist = board.dist[self.tile][target.tile]
  let best = null
  let bestDist = curDist

  for (const nb of board.neighbors[self.tile]) {
    const holder = occupied.get(nb)
    if (holder !== undefined && holder !== self.id) continue

    const d = board.dist[nb][target.tile]
    if (d < bestDist) {
      best = nb
      bestDist = d
    }
  }

  return best
}
