// 클라가 서버로 올리는 판을 거른다.
//
// 이 파일이 지키는 것: **서버는 클라를 믿지 않는다.** 배치는 클라가 만들어
// 보내는 값이라, 거르지 않으면 (1) 없는 유닛 id 하나로 마감 계산이 예외를 내
// 그 방 전체가 라운드를 못 넘기고, (2) 5성·28명 같은 값이 그대로 판정에 든다.
import { describe, it, expect, beforeAll } from 'vitest'
import { loadData } from '../sim/data.js'
import { sanitizeBoard } from '../sim/submit.js'

let data
beforeAll(async () => {
  data = await loadData()
})

const one = (over = {}) => ({ unitId: 'green_blob', star: 1, tile: 0, items: [], ...over })

describe('sanitizeBoard', () => {
  it('멀쩡한 판은 그대로 통과한다', () => {
    const board = [one(), one({ tile: 5, star: 2 })]
    expect(sanitizeBoard(board, data, { cap: 9 })).toEqual(board)
  })

  it('배열이 아니면 빈 판이다', () => {
    expect(sanitizeBoard(null, data, { cap: 9 })).toEqual([])
    expect(sanitizeBoard('board', data, { cap: 9 })).toEqual([])
  })

  it('없는 유닛은 버린다 — 이게 마감 계산을 통째로 멈추던 값이다', () => {
    expect(sanitizeBoard([one({ unitId: '없는말' }), one({ tile: 1 })], data, { cap: 9 })).toEqual([
      one({ tile: 1 }),
    ])
  })

  it('성급은 1..최대만 — 5성은 없다', () => {
    const out = sanitizeBoard([one({ star: 5 }), one({ tile: 1, star: 0 }), one({ tile: 2, star: 3 })], data, { cap: 9 })
    expect(out).toEqual([one({ tile: 2, star: 3 })])
  })

  it('내 진영 밖 칸은 버린다', () => {
    const out = sanitizeBoard([one({ tile: 28 }), one({ tile: -1 }), one({ tile: 27 })], data, { cap: 9 })
    expect(out).toEqual([one({ tile: 27 })])
  })

  it('한 칸에 둘은 못 선다 — 겹치면 전투가 무너진다', () => {
    const out = sanitizeBoard([one(), one({ star: 3 })], data, { cap: 9 })
    expect(out).toEqual([one()])
  })

  it('배치 인원은 레벨까지다', () => {
    const board = [0, 1, 2, 3].map((tile) => one({ tile }))
    expect(sanitizeBoard(board, data, { cap: 2 })).toEqual(board.slice(0, 2))
  })

  it('없는 아이템과 칸 넘치는 아이템을 거른다', () => {
    const out = sanitizeBoard(
      [one({ items: ['steel_sword', '없는아이템', 'swift_gloves', 'steel_sword', 'swift_gloves'] })],
      data,
      { cap: 9 },
    )
    expect(out[0].items).toEqual(['steel_sword', 'swift_gloves', 'steel_sword'])
  })

  it('원본을 안 고친다 — 거른 값과 보낸 값이 둘 다 필요하다', () => {
    const board = [one({ items: ['steel_sword'] })]
    sanitizeBoard(board, data, { cap: 1 })
    expect(board).toEqual([one({ items: ['steel_sword'] })])
  })
})
