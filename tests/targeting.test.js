import { describe, it, expect } from 'vitest'
import { buildBoard } from '../sim/hex.js'
import { findTarget } from '../sim/targeting.js'
import combat from '../game/public/data/combat.json' with { type: 'json' }

const board = buildBoard(combat.board)

function c(id, team, row, col, alive = true) {
  return { id, team, tile: board.indexOf(row, col), hp: alive ? 100 : 0, alive }
}

describe('findTarget', () => {
  it('적이 없으면 null 이다', () => {
    const self = c(0, 'A', 5, 0)
    expect(findTarget(board, self, [self])).toBeNull()
  })

  it('살아있는 적 중 가장 가까운 쪽을 고른다', () => {
    const self = c(0, 'A', 3, 3)
    const near = c(1, 'B', 2, 3)
    const far = c(2, 'B', 0, 0)
    expect(findTarget(board, self, [self, near, far]).id).toBe(1)
  })

  it('죽은 적은 고르지 않는다', () => {
    const self = c(0, 'A', 3, 3)
    const dead = c(1, 'B', 2, 3, false)
    const live = c(2, 'B', 0, 0)
    expect(findTarget(board, self, [self, dead, live]).id).toBe(2)
  })

  it('같은 팀은 고르지 않는다', () => {
    const self = c(0, 'A', 3, 3)
    const mate = c(1, 'A', 3, 4)
    const foe = c(2, 'B', 0, 0)
    expect(findTarget(board, self, [self, mate, foe]).id).toBe(2)
  })

  it('거리가 같으면 id 가 작은 쪽을 고른다 (결정론)', () => {
    const self = c(0, 'A', 3, 3)
    const left = c(5, 'B', 2, 2)
    const right = c(2, 'B', 2, 4)
    // 좌우 대칭 위치라 거리가 같아야 한다. 같지 않다면 이 테스트의 전제가 깨진 것이다.
    expect(board.dist[self.tile][left.tile]).toBe(board.dist[self.tile][right.tile])
    expect(findTarget(board, self, [self, left, right]).id).toBe(2)
  })

  it('배열 순서를 바꿔도 같은 대상을 고른다', () => {
    const self = c(0, 'A', 3, 3)
    const x = c(9, 'B', 2, 2)
    const y = c(4, 'B', 2, 4)
    const p1 = findTarget(board, self, [self, x, y])
    const p2 = findTarget(board, self, [self, y, x])
    expect(p1.id).toBe(p2.id)
  })
})
