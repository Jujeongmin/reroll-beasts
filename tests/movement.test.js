import { describe, it, expect } from 'vitest'
import { buildBoard } from '../sim/hex.js'
import { stepToward } from '../sim/movement.js'
import combat from '../game/public/data/combat.json' with { type: 'json' }

const board = buildBoard(combat.board)

function at(row, col) {
  return board.indexOf(row, col)
}

/** 유닛을 실제로 걷게 해서 도착 여부와 걸음 수를 잰다. */
function walk(selfTile, targetTile, blocked, range = 1, maxSteps = 60) {
  const self = { id: 0, tile: selfTile }
  const target = { id: 1, tile: targetTile }
  const occupied = new Map([[targetTile, 1], ...blocked.map((t, i) => [t, 100 + i])])
  const path = []
  for (let i = 0; i < maxSteps; i++) {
    if (board.dist[self.tile][targetTile] <= range) return { arrived: true, path }
    occupied.set(self.tile, self.id)
    const next = stepToward(board, self, target, occupied, range)
    if (next === null) return { arrived: false, path }
    occupied.delete(self.tile)
    self.tile = next
    path.push(next)
  }
  return { arrived: false, path }
}

describe('stepToward', () => {
  it('타겟에 더 가까워지는 인접 타일을 고른다', () => {
    const self = { id: 0, tile: at(5, 3) }
    const target = { id: 1, tile: at(0, 3) }
    const next = stepToward(board, self, target, new Map())
    expect(board.dist[next][target.tile]).toBeLessThan(board.dist[self.tile][target.tile])
  })

  it('이미 사거리 안이면 움직이지 않는다', () => {
    const self = { id: 0, tile: at(3, 3) }
    const targetTile = board.neighbors[self.tile].find((t) => board.tiles[t].row === 2)
    const target = { id: 1, tile: targetTile }
    expect(stepToward(board, self, target, new Map(), 1)).toBeNull()
  })

  it('사거리 안에 들어오면 더 다가가지 않는다', () => {
    // walk 헬퍼로 재면 헬퍼가 자기 기준으로 먼저 멈춰서 사거리를 무시해도 통과한다.
    // stepToward 를 직접 불러야 사거리가 실제로 쓰이는지가 걸린다.
    const targetTile = at(0, 3)
    const start = board.tiles.findIndex((_, i) => board.dist[i][targetTile] === 3)
    expect(start).toBeGreaterThanOrEqual(0)
    const self = { id: 0, tile: start }
    const target = { id: 1, tile: targetTile }

    expect(stepToward(board, self, target, new Map(), 3)).toBeNull()

    const closer = stepToward(board, self, target, new Map(), 2)
    expect(closer).not.toBeNull()
    expect(board.dist[closer][targetTile]).toBe(2)
  })

  it('점유된 타일로는 가지 않는다', () => {
    const self = { id: 0, tile: at(5, 3) }
    const target = { id: 1, tile: at(0, 3) }
    const occupied = new Map(board.neighbors[self.tile].map((t) => [t, 9]))
    occupied.set(target.tile, 1)
    expect(stepToward(board, self, target, occupied, 1)).toBeNull()
  })

  it('자기 타일은 점유로 쳐도 무시한다', () => {
    const self = { id: 0, tile: at(5, 3) }
    const target = { id: 1, tile: at(0, 3) }
    const occupied = new Map([[self.tile, self.id]])
    expect(stepToward(board, self, target, occupied, 1)).not.toBeNull()
  })

  it('같은 깊이의 목적지가 여럿이면 인덱스가 작은 칸으로 간다', () => {
    // 기대값은 보드에서 따로 세운다 (구현을 다시 쓰지 않는다).
    const targetTile = at(0, 3)
    const start = board.tiles.findIndex(
      (_, i) =>
        board.dist[i][targetTile] === 3 &&
        board.neighbors[i].filter((n) => board.dist[n][targetTile] <= 2).length >= 2,
    )
    expect(start).toBeGreaterThanOrEqual(0)

    const goals = board.neighbors[start].filter((n) => board.dist[n][targetTile] <= 2)
    const next = stepToward(board, { id: 0, tile: start }, { id: 1, tile: targetTile }, new Map(), 2)
    expect(next).toBe(Math.min(...goals))
  })
})

describe('길찾기 — 아군이 앞을 막을 때', () => {
  // 이게 이 모듈의 존재 이유다. 탐욕 방식은 앞줄이 막히면 후보가 전부 점유라
  // null 을 내고, 그 유닛은 전투가 끝날 때까지 서 있기만 한다.
  it('앞이 막혀도 돌아서 사거리 안까지 간다', () => {
    const start = at(7, 3)
    const targetTile = at(0, 3)
    // 출발 칸의 이웃 중 타겟 쪽으로 가까워지는 칸을 전부 막는다
    const wall = board.neighbors[start].filter(
      (t) => board.dist[t][targetTile] < board.dist[start][targetTile],
    )
    expect(wall.length).toBeGreaterThan(0)

    const r = walk(start, targetTile, wall, 1)
    expect(r.arrived).toBe(true)
    // 벽을 밟고 지나가지 않았어야 한다
    for (const w of wall) expect(r.path).not.toContain(w)
  })

  it('한 줄 전체가 막혀도 옆으로 우회한다', () => {
    const start = at(7, 3)
    const targetTile = at(0, 3)
    // 6행을 통째로 벽으로 세운다. 단, 양 끝 한 칸씩은 열어 둔다.
    const wall = []
    for (let c = 1; c < combat.board.rows[6] - 1; c++) wall.push(at(6, c))

    const r = walk(start, targetTile, wall, 1)
    expect(r.arrived).toBe(true)
    for (const w of wall) expect(r.path).not.toContain(w)
  })

  it('완전히 갇히면 움직이지 않는다', () => {
    const self = { id: 0, tile: at(7, 3) }
    const target = { id: 1, tile: at(0, 3) }
    const occupied = new Map(board.neighbors[self.tile].map((t) => [t, 9]))
    expect(stepToward(board, self, target, occupied, 1)).toBeNull()
  })

  it('길이 없어도 가까워지는 칸이 있으면 조금이라도 붙는다', () => {
    // 벽은 다음 틱이면 열릴 수 있다. 여기서 굳어 버리면 영영 못 움직인다.
    // 타겟을 대각선 방향에 둬 옆걸음으로도 거리가 줄게 만든다.
    const start = at(7, 5)
    const targetTile = at(0, 0)
    const wall = []
    for (let c = 0; c < combat.board.rows[6]; c++) wall.push(at(6, c))

    const self = { id: 0, tile: start }
    const target = { id: 1, tile: targetTile }
    const occupied = new Map(wall.map((t) => [t, 9]))
    const next = stepToward(board, self, target, occupied, 1)
    expect(next).not.toBeNull()
    expect(board.dist[next][targetTile]).toBeLessThan(board.dist[start][targetTile])
  })
})
