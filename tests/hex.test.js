import { describe, it, expect } from 'vitest'
import { buildBoard } from '../sim/hex.js'
import combat from '../game/public/data/combat.json' with { type: 'json' }

const board = buildBoard(combat.board)

describe('buildBoard', () => {
  it('타일이 44칸이다 (진영당 22칸)', () => {
    expect(board.tileCount).toBe(44)
    expect(board.tiles).toHaveLength(44)
  })

  it('행별 칸 수가 7/8/7/7/8/7 이다', () => {
    const counts = [0, 0, 0, 0, 0, 0]
    for (const t of board.tiles) counts[t.row]++
    expect(counts).toEqual([7, 8, 7, 7, 8, 7])
  })

  it('indexOf 가 행·열로 타일 인덱스를 되돌린다', () => {
    for (const t of board.tiles) {
      expect(board.indexOf(t.row, t.col)).toBe(t.index)
    }
  })

  it('없는 좌표는 -1 이다', () => {
    expect(board.indexOf(0, 7)).toBe(-1)
    expect(board.indexOf(6, 0)).toBe(-1)
  })

  it('행 0~2 는 적, 행 3~5 는 아군이다', () => {
    expect(board.side(board.indexOf(0, 0))).toBe('enemy')
    expect(board.side(board.indexOf(2, 3))).toBe('enemy')
    expect(board.side(board.indexOf(3, 0))).toBe('ally')
    expect(board.side(board.indexOf(5, 6))).toBe('ally')
  })

  it('인접은 대칭이다', () => {
    for (let a = 0; a < board.tileCount; a++) {
      for (const b of board.neighbors[a]) {
        expect(board.neighbors[b]).toContain(a)
      }
    }
  })

  it('자기 자신은 인접이 아니다', () => {
    for (let a = 0; a < board.tileCount; a++) {
      expect(board.neighbors[a]).not.toContain(a)
    }
  })

  it('인접 목록은 타일 인덱스 오름차순이다 (이동 타이브레이크의 기반)', () => {
    for (let a = 0; a < board.tileCount; a++) {
      const list = board.neighbors[a]
      expect(list).toEqual([...list].sort((x, y) => x - y))
    }
  })

  it('거리는 대칭이고 자기 자신은 0 이다', () => {
    for (let a = 0; a < board.tileCount; a++) {
      expect(board.dist[a][a]).toBe(0)
      for (let b = 0; b < board.tileCount; b++) {
        expect(board.dist[a][b]).toBe(board.dist[b][a])
      }
    }
  })

  it('인접한 두 타일의 거리는 1 이다', () => {
    for (let a = 0; a < board.tileCount; a++) {
      for (const b of board.neighbors[a]) expect(board.dist[a][b]).toBe(1)
    }
  })

  it('모든 타일이 서로 도달 가능하다 (그래프가 연결되어 있다)', () => {
    for (let a = 0; a < board.tileCount; a++) {
      for (let b = 0; b < board.tileCount; b++) {
        expect(board.dist[a][b]).toBeLessThan(Infinity)
      }
    }
  })

  it('모든 거리가 정수다', () => {
    for (let a = 0; a < board.tileCount; a++) {
      for (let b = 0; b < board.tileCount; b++) {
        expect(Number.isInteger(board.dist[a][b])).toBe(true)
      }
    }
  })
})
