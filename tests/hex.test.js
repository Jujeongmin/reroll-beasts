import { describe, it, expect } from 'vitest'
import { buildBoard } from '../sim/hex.js'
import combat from '../game/public/data/combat.json' with { type: 'json' }

const board = buildBoard(combat.board)

// 보드 모양은 데이터가 정한다. 여기서 수치를 다시 적으면 보드를 바꿀 때마다
// 두 곳을 고쳐야 하고, 한쪽만 고치면 테스트가 조용히 무의미해진다.
const cfg = combat.board
const TOTAL = cfg.rows.reduce((a, n) => a + n, 0)
const PER_SIDE = TOTAL / 2

describe('buildBoard', () => {
  it('타일 수가 rows 합과 같고 진영이 반씩 나뉜다', () => {
    expect(board.tileCount).toBe(TOTAL)
    expect(board.tiles).toHaveLength(TOTAL)
    expect(PER_SIDE).toBe(28)
    expect(board.tiles.filter((t) => board.side(t.index) === 'ally')).toHaveLength(PER_SIDE)
    expect(board.tiles.filter((t) => board.side(t.index) === 'enemy')).toHaveLength(PER_SIDE)
  })

  it('행별 칸 수가 설정과 같다', () => {
    const counts = cfg.rows.map(() => 0)
    for (const t of board.tiles) counts[t.row]++
    expect(counts).toEqual(cfg.rows)
  })

  it('행 폭이 회전 대응을 이룬다 (행 r 과 마지막-r 의 폭이 같다)', () => {
    const n = cfg.rows.length
    for (let r = 0; r < n; r++) expect(cfg.rows[r]).toBe(cfg.rows[n - 1 - r])
  })

  it('indexOf 가 행·열로 타일 인덱스를 되돌린다', () => {
    for (const t of board.tiles) {
      expect(board.indexOf(t.row, t.col)).toBe(t.index)
    }
  })

  it('없는 좌표는 -1 이다', () => {
    expect(board.indexOf(0, cfg.rows[0])).toBe(-1)
    expect(board.indexOf(cfg.rows.length, 0)).toBe(-1)
    expect(board.indexOf(-1, 0)).toBe(-1)
  })

  it('enemyRows 는 적, allyRows 는 아군이다', () => {
    for (const r of cfg.enemyRows) expect(board.side(board.indexOf(r, 0))).toBe('enemy')
    for (const r of cfg.allyRows) expect(board.side(board.indexOf(r, 0))).toBe('ally')
    expect(cfg.enemyRows.length + cfg.allyRows.length).toBe(cfg.rows.length)
  })

  it('내부 타일은 인접이 6개다 (벌집이 실제로 맞물린다)', () => {
    // 7-8-7 구조에서는 마주 보는 두 앞줄이 정렬돼 교전선이 좁은 통로였다.
    // 균일 폭 + 오프셋 교대라야 내부가 온전한 벌집이 된다.
    const six = board.neighbors.filter((n) => n.length === 6).length
    expect(six).toBeGreaterThan(board.tileCount * 0.4)
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
