// 한 틱에 한 칸 이동. **길을 찾아서** 간다.
//
// 예전에는 "거리가 줄어드는 인접 칸" 중 하나를 고르는 탐욕 방식이었다.
// 그러면 앞을 아군이 막았을 때 후보가 전부 점유 상태가 되어 null 이 나오고,
// 그 유닛은 전투가 끝날 때까지 제자리에 선 채로 아무것도 못 한다.
// 돌아갈 길이 뻔히 있는데도 그렇다.
//
// 그래서 빈 칸만 밟는 BFS 로 **사거리 안에 드는 칸**까지의 최단 경로를 찾고,
// 그 첫 걸음을 되돌린다.

/**
 * 목적지는 타겟의 칸이 아니라 **타겟을 때릴 수 있는 칸**이다.
 * 근접(사거리 1)이면 타겟의 이웃, 원거리면 그보다 먼 칸도 목적지가 된다.
 */
function isGoal(board, tile, targetTile, range) {
  return board.dist[tile][targetTile] <= range
}

/**
 * 막혔을 때의 최후 수단: 갈 수 있는 인접 칸 중 타겟에 가장 가까워지는 칸.
 *
 * 길이 아예 없어도 조금씩 붙어 있게 한다. 여기서 null 을 내면 아군 벽 뒤의
 * 유닛이 통째로 굳는데, 벽은 다음 틱이면 움직여 열릴 수도 있다.
 */
function greedyStep(board, self, target, occupied) {
  let best = null
  let bestDist = board.dist[self.tile][target.tile]
  // neighbors 는 오름차순이므로 같은 거리면 작은 인덱스가 먼저 잡힌다 (결정론).
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

export function stepToward(board, self, target, occupied, range = 1) {
  if (isGoal(board, self.tile, target.tile, range)) return null

  const from = new Map([[self.tile, -1]])
  let frontier = [self.tile]

  while (frontier.length > 0) {
    const next = []
    // 같은 깊이에 목적지가 여럿이면 **인덱스가 작은 칸**을 고른다.
    //
    // 지금 보드에서는 이 비교가 결과를 바꾸지 않는다 — neighbors 가 오름차순이라
    // 먼저 발견되는 것이 곧 최소다 (전 조합을 훑어 확인했다). 그래도 남긴다:
    // 규칙이 탐색 순서에 기대지 않아야 보드 모양이나 BFS 방식이 바뀌어도 안전하다.
    let goal = -1

    for (const cur of frontier) {
      for (const nb of board.neighbors[cur]) {
        if (from.has(nb)) continue
        const holder = occupied.get(nb)
        // 점유된 칸은 벽이다. 타겟이 서 있는 칸도 밟고 지나갈 수 없다.
        if (holder !== undefined && holder !== self.id) continue
        from.set(nb, cur)
        next.push(nb)
        if (isGoal(board, nb, target.tile, range) && (goal < 0 || nb < goal)) goal = nb
      }
    }

    if (goal >= 0) {
      // 첫 걸음까지 거슬러 올라간다
      let cur = goal
      while (from.get(cur) !== self.tile) cur = from.get(cur)
      return cur
    }
    frontier = next
  }

  return greedyStep(board, self, target, occupied)
}

/**
 * 상대 뒷줄의 빈 칸. **암살자 도약과 스킬 재도약이 같이 쓴다.**
 *
 * 규칙: 상대 무리에 붙어 있는(가장 가까운 적까지 1칸 이내) 빈 칸 중 내가 선
 * 자리에서 가장 먼 곳. 거리가 같으면 **먼저 만난 칸**을 쓴다 — 타일을 0부터
 * 훑으므로 그게 곧 번호가 작은 칸이다. 이 타이브레이크가 결정론의 전부다:
 * 두 암살자가 같은 칸을 노려도 서버와 클라가 같은 답을 내야 한다.
 *
 * 없으면 -1. 판이 꽉 찼거나 상대가 다 죽은 경우다.
 */
export function backlineTile(board, self, foes, occupied) {
  if (foes.length === 0) return -1
  let best = -1
  let bestScore = -1
  for (let t = 0; t < board.tileCount; t++) {
    if (occupied.has(t)) continue
    const near = Math.min(...foes.map((o) => board.dist[t][o.tile]))
    if (near > 1) continue
    const score = board.dist[self.tile][t]
    if (score > bestScore) {
      bestScore = score
      best = t
    }
  }
  return best
}

/**
 * 끌어당길 자리: 내 옆의 빈 칸 중 그 말이 서 있던 자리에 가장 가까운 곳.
 *
 * 제일 가까운 칸을 고르는 이유는 그림이다 — 반대편으로 홱 돌아가는 것보다
 * 끌려오는 것처럼 보인다. neighbors 가 오름차순이라 동률이면 번호가 작은
 * 칸이 잡힌다.
 */
export function pullTile(board, self, victim, occupied) {
  let best = -1
  let bestDist = Infinity
  for (const nb of board.neighbors[self.tile]) {
    if (occupied.has(nb)) continue
    const d = board.dist[nb][victim.tile]
    if (d < bestDist) {
      bestDist = d
      best = nb
    }
  }
  return best
}
