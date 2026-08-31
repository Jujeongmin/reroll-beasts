// 타겟 선택. 헥스 거리 최단 적을 고르고, 동률이면 id 가 작은 쪽을 고른다.
// id 타이브레이크가 결정론의 핵심이다. 배열 순서에 의존하면 안 된다.

export function findTarget(board, self, all) {
  let best = null
  let bestDist = Infinity

  for (const other of all) {
    if (other === self) continue
    if (!other.alive) continue
    if (other.team === self.team) continue

    const d = board.dist[self.tile][other.tile]
    if (d < bestDist || (d === bestDist && best !== null && other.id < best.id)) {
      best = other
      bestDist = d
    }
  }

  return best
}
