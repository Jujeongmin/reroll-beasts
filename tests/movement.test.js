import { describe, it, expect } from 'vitest'
import { buildBoard } from '../sim/hex.js'
import { stepToward } from '../sim/movement.js'
import combat from '../game/public/data/combat.json' with { type: 'json' }

const board = buildBoard(combat.board)

function at(row, col) {
  return board.indexOf(row, col)
}

describe('stepToward', () => {
  it('타겟에 더 가까워지는 인접 타일을 고른다', () => {
    const self = { id: 0, tile: at(5, 3) }
    const target = { id: 1, tile: at(0, 3) }
    const next = stepToward(board, self, target, new Map())
    expect(next).not.toBeNull()
    expect(board.dist[next][target.tile]).toBeLessThan(board.dist[self.tile][target.tile])
  })

  it('점유된 타일로는 가지 않는다', () => {
    const self = { id: 0, tile: at(5, 3) }
    const target = { id: 1, tile: at(0, 3) }
    const free = stepToward(board, self, target, new Map())

    const occupied = new Map([[free, 99]])
    const next = stepToward(board, self, target, occupied)
    expect(next).not.toBe(free)
  })

  it('모든 인접이 막히면 null 이다', () => {
    const self = { id: 0, tile: at(5, 3) }
    const target = { id: 1, tile: at(0, 3) }
    const occupied = new Map(board.neighbors[self.tile].map((t) => [t, 99]))
    expect(stepToward(board, self, target, occupied)).toBeNull()
  })

  it('여러 후보가 같은 거리면 타일 인덱스가 작은 쪽을 고른다 (결정론)', () => {
    const self = { id: 0, tile: at(5, 3) }
    const target = { id: 1, tile: at(0, 3) }

    // 전제 검증 — 거리를 줄이는 후보가 둘 이상이고 서로 거리가 같아야
    // 타이브레이크가 실제로 시험된다. 전제가 깨지면 이 테스트는 무의미하다.
    const curDist = board.dist[self.tile][target.tile]
    const improving = board.neighbors[self.tile].filter(
      (nb) => board.dist[nb][target.tile] < curDist,
    )
    const bestDist = Math.min(...improving.map((nb) => board.dist[nb][target.tile]))
    const tied = improving.filter((nb) => board.dist[nb][target.tile] === bestDist)
    expect(tied.length).toBeGreaterThan(1)

    // 동률이면 타일 인덱스 최소값. 비교가 <= 로 바뀌면 마지막 동률 후보가
    // 선택되므로 이 단언이 깨진다.
    expect(stepToward(board, self, target, new Map())).toBe(Math.min(...tied))
  })

  it('자기 타일은 점유로 쳐도 무시한다', () => {
    const self = { id: 0, tile: at(5, 3) }
    const target = { id: 1, tile: at(0, 3) }
    const occupied = new Map([[self.tile, self.id]])
    expect(stepToward(board, self, target, occupied)).not.toBeNull()
  })

  it('이미 타겟 자리에 인접하면 그 방향 한 칸을 고른다', () => {
    const self = { id: 0, tile: at(3, 3) }
    const targetTile = board.neighbors[self.tile].find((t) => board.tiles[t].row === 2)
    const target = { id: 1, tile: targetTile }
    const next = stepToward(board, self, target, new Map())
    expect(board.dist[next][target.tile]).toBe(0)
  })
})
