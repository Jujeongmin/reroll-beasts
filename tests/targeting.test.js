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
    // 등거리 쌍을 좌표로 박아두면 보드 모양이 바뀔 때마다 조용히 무의미해진다.
    // 보드에서 직접 찾는다.
    const self = c(0, 'A', 3, 3)
    const enemyTiles = board.tiles
      .filter((t) => board.side(t.index) === 'enemy')
      .map((t) => t.index)
    let pair = null
    for (let i = 0; i < enemyTiles.length && !pair; i++) {
      for (let j = i + 1; j < enemyTiles.length; j++) {
        if (board.dist[self.tile][enemyTiles[i]] === board.dist[self.tile][enemyTiles[j]]) {
          pair = [enemyTiles[i], enemyTiles[j]]
          break
        }
      }
    }
    expect(pair).not.toBeNull()

    // 큰 id 를 배열 앞에 둔다 — 정렬이 아니라 id 비교로 골라야 통과한다.
    const high = { id: 5, team: 'B', tile: pair[0], hp: 100, alive: true }
    const low = { id: 2, team: 'B', tile: pair[1], hp: 100, alive: true }
    expect(findTarget(board, self, [self, high, low]).id).toBe(2)
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
