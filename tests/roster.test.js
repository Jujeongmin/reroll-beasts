import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { createRng } from '../sim/rng.js'
import { sellValue } from '../sim/economy.js'
import {
  createRun,
  startRun,
  boardCount,
  population,
  findUnit,
  allUnits,
  resolveMerges,
  refreshShop,
  buy,
  buyXp,
  sell,
  moveTo,
  toCombatEntries,
  tilesPerSide,
} from '../sim/roster.js'

const data = await loadData()

function seed(overrides = {}) {
  return Object.assign(createRun(data), overrides)
}

/** 재고가 넉넉한 풀. 풀 고갈이 아니라 로스터 규칙만 보고 싶을 때 쓴다. */
const richPool = () => new Map(data.units.units.map((u) => [u.id, 50]))

function putBench(state, list) {
  list.forEach(([unitId, star], i) => {
    state.bench[i] = { uid: state.nextUid++, unitId, star }
  })
  return state
}

describe('런 시작', () => {
  it('시작 값이 데이터를 따른다', () => {
    const s = createRun(data)
    expect(s.gold).toBe(data.economy.startGold)
    expect(s.hp).toBe(data.economy.startHp)
    expect(s.level).toBe(data.levels.startLevel)
    expect(s.bench).toHaveLength(data.economy.benchSlots)
    expect(s.board).toHaveLength(tilesPerSide(data))
    expect(tilesPerSide(data)).toBe(28)
  })

  it('시작 상점은 공짜다', () => {
    const { state } = startRun(data, createRng(1))
    expect(state.gold).toBe(data.economy.startGold)
    expect(state.shop.filter(Boolean).length).toBe(data.shop.slots)
  })
})

describe('구매', () => {
  it('골드를 티어만큼 깎고 벤치에 올리고 상점 칸을 비운다', () => {
    const s = seed({ gold: 10, shop: ['cat', 'dragon', null, null, null] })
    expect(buy(s, richPool(), 0, data).ok).toBe(true)
    expect(s.gold).toBe(9) // cat 은 T1
    expect(s.shop[0]).toBeNull()
    expect(s.bench[0].unitId).toBe('cat')
    expect(s.bench[0].star).toBe(1)
  })

  it('골드가 모자라면 거절하고 상태를 건드리지 않는다', () => {
    const s = seed({ gold: 2, shop: ['dragon', null, null, null, null] })
    const before = JSON.stringify(s)
    expect(buy(s, richPool(), 0, data).ok).toBe(false)
    expect(JSON.stringify(s)).toBe(before)
  })

  it('빈 칸은 살 수 없다', () => {
    const s = seed({ gold: 99 })
    expect(buy(s, richPool(), 0, data).ok).toBe(false)
  })

  it('벤치가 꽉 차고 합성도 안 되면 거절한다', () => {
    const s = seed({ gold: 99, shop: ['dragon', null, null, null, null] })
    putBench(s, Array(9).fill(['cat', 1]))
    // cat 9장은 곧장 3성 하나가 되므로, 만석을 만들려면 서로 다른 유닛이어야 한다
    s.bench = ['cat', 'bunny', 'chicken', 'pigeon', 'mushnub', 'goleling', 'green_blob', 'pink_blob', 'spiky_blob'].map(
      (unitId, i) => ({ uid: 500 + i, unitId, star: 1 }),
    )
    const gold = s.gold
    expect(buy(s, richPool(), 0, data).ok).toBe(false)
    expect(s.gold).toBe(gold)
  })

  it('벤치가 꽉 차도 합성이 완성되면 살 수 있다', () => {
    // 이 예외가 없으면 벤치 만석일 때 눈앞의 2성을 영영 못 만든다
    const s = seed({ gold: 99, shop: ['cat', null, null, null, null] })
    putBench(s, [
      ['cat', 1],
      ['cat', 1],
      ['bunny', 1],
      ['chicken', 1],
      ['pigeon', 1],
      ['mushnub', 1],
      ['goleling', 1],
      ['green_blob', 1],
      ['pink_blob', 1],
    ])
    expect(buy(s, richPool(), 0, data).ok).toBe(true)
    const cats = allUnits(s).filter((u) => u.unitId === 'cat')
    expect(cats).toHaveLength(1)
    expect(cats[0].star).toBe(2)
  })
})

describe('합성', () => {
  it('같은 유닛 1성 3장이 2성 하나가 된다', () => {
    const s = seed()
    putBench(s, [
      ['cat', 1],
      ['cat', 1],
      ['cat', 1],
    ])
    expect(resolveMerges(s, data)).toBe(1)
    expect(allUnits(s)).toHaveLength(1)
    expect(allUnits(s)[0].star).toBe(2)
  })

  it('9장이면 3성까지 연쇄한다', () => {
    const s = seed()
    putBench(s, Array(9).fill(['cat', 1]))
    expect(resolveMerges(s, data)).toBe(4) // 2성 3개 + 3성 1개
    expect(allUnits(s)).toHaveLength(1)
    expect(allUnits(s)[0].star).toBe(3)
  })

  it('최대 성급을 넘겨 합치지 않는다', () => {
    const s = seed()
    putBench(s, [
      ['cat', 3],
      ['cat', 3],
      ['cat', 3],
    ])
    expect(resolveMerges(s, data)).toBe(0)
    expect(allUnits(s)).toHaveLength(3)
  })

  it('성급이 다르면 합치지 않는다', () => {
    const s = seed()
    putBench(s, [
      ['cat', 1],
      ['cat', 1],
      ['cat', 2],
    ])
    expect(resolveMerges(s, data)).toBe(0)
  })

  it('합성 결과는 보드 자리를 벤치보다 먼저 차지한다', () => {
    // 배치해 둔 유닛이 합성 후 벤치로 내려가면 전투 직전에 진형이 무너진다
    const s = seed()
    s.board[5] = { uid: 100, unitId: 'cat', star: 1 }
    putBench(s, [
      ['cat', 1],
      ['cat', 1],
    ])
    resolveMerges(s, data)
    expect(s.board[5]?.star).toBe(2)
    expect(s.bench.filter(Boolean)).toHaveLength(0)
  })

  it('보드가 여럿이면 타일 번호가 앞선 쪽에 앉는다', () => {
    const s = seed()
    s.board[9] = { uid: 100, unitId: 'cat', star: 1 }
    s.board[2] = { uid: 101, unitId: 'cat', star: 1 }
    putBench(s, [['cat', 1]])
    resolveMerges(s, data)
    expect(s.board[2]?.star).toBe(2)
    expect(s.board[9]).toBeNull()
  })
})

describe('배치', () => {
  it('벤치에서 보드로 옮긴다', () => {
    const s = seed()
    putBench(s, [['cat', 1]])
    const uid = s.bench[0].uid
    expect(moveTo(s, uid, { where: 'board', index: 7 }, data).ok).toBe(true)
    expect(s.bench[0]).toBeNull()
    expect(s.board[7].uid).toBe(uid)
  })

  it('차 있는 칸으로 옮기면 자리를 맞바꾼다', () => {
    const s = seed()
    putBench(s, [
      ['cat', 1],
      ['bunny', 1],
    ])
    const a = s.bench[0].uid
    const b = s.bench[1].uid
    moveTo(s, a, { where: 'bench', index: 1 }, data)
    expect(s.bench[1].uid).toBe(a)
    expect(s.bench[0].uid).toBe(b)
  })

  it('레벨보다 많이 배치할 수 없다', () => {
    const s = seed({ level: 3 })
    for (let i = 0; i < 3; i++) s.board[i] = { uid: 900 + i, unitId: 'cat', star: 1 }
    putBench(s, [['bunny', 1]])
    expect(moveTo(s, s.bench[0].uid, { where: 'board', index: 10 }, data).ok).toBe(false)
    expect(boardCount(s)).toBe(3)
  })

  it('인원이 꽉 차도 보드 안에서의 이동은 막지 않는다', () => {
    // 인구 검사를 "목적지가 보드다" 만 보고 걸면 여기서 배치를 못 고친다
    const s = seed({ level: 3 })
    for (let i = 0; i < 3; i++) s.board[i] = { uid: 900 + i, unitId: 'cat', star: 1 }
    expect(moveTo(s, 900, { where: 'board', index: 20 }, data).ok).toBe(true)
    expect(s.board[20].uid).toBe(900)
    expect(s.board[0]).toBeNull()
  })

  it('인원이 꽉 차도 보드↔벤치 맞바꿈은 된다', () => {
    const s = seed({ level: 3 })
    for (let i = 0; i < 3; i++) s.board[i] = { uid: 900 + i, unitId: 'cat', star: 1 }
    putBench(s, [['bunny', 1]])
    const benchUid = s.bench[0].uid
    expect(moveTo(s, benchUid, { where: 'board', index: 0 }, data).ok).toBe(true)
    expect(boardCount(s)).toBe(3)
    expect(s.board[0].uid).toBe(benchUid)
    expect(s.bench[0].uid).toBe(900)
  })

  it('없는 칸으로는 못 옮긴다', () => {
    const s = seed()
    putBench(s, [['cat', 1]])
    const uid = s.bench[0].uid
    expect(moveTo(s, uid, { where: 'board', index: 28 }, data).ok).toBe(false)
    expect(moveTo(s, uid, { where: 'board', index: -1 }, data).ok).toBe(false)
  })

  it('인구는 레벨을 상한으로 센다', () => {
    const s = seed({ level: 6 })
    s.board[3] = { uid: 1, unitId: 'cat', star: 1 }
    expect(population(s)).toEqual({ used: 1, cap: 6 })
  })
})

describe('판매', () => {
  it('환급을 넣고 카드를 풀로 돌려준다', () => {
    const s = seed({ gold: 0 })
    putBench(s, [['dragon', 1]])
    const pool = richPool()
    const before = pool.get('dragon')
    expect(sell(s, pool, s.bench[0].uid, data).ok).toBe(true)
    expect(s.gold).toBe(sellValue('dragon', 1, data))
    expect(pool.get('dragon')).toBe(before + 1)
    expect(s.bench[0]).toBeNull()
  })

  it('2성을 팔면 합성에 든 3장이 전부 풀로 돌아간다', () => {
    const s = seed({ gold: 0 })
    putBench(s, [['cat', 2]])
    const pool = richPool()
    const before = pool.get('cat')
    sell(s, pool, s.bench[0].uid, data)
    expect(pool.get('cat')).toBe(before + data.shop.starUpCopies['2'])
  })

  it('보드에 놓인 유닛도 팔 수 있다', () => {
    const s = seed({ gold: 0 })
    s.board[4] = { uid: 77, unitId: 'cat', star: 1 }
    expect(sell(s, richPool(), 77, data).ok).toBe(true)
    expect(s.board[4]).toBeNull()
  })

  it('없는 유닛은 거절한다', () => {
    expect(sell(seed(), richPool(), 12345, data).ok).toBe(false)
  })
})

describe('리롤 · 경험치', () => {
  it('리롤은 골드를 쓰고 상점을 바꾸며 안 산 카드를 풀로 돌려준다', () => {
    const { state, pool } = startRun(data, createRng(21))
    state.gold = 10
    const old = [...state.shop]
    const totalBefore = [...pool.values()].reduce((a, b) => a + b, 0)
    expect(refreshShop(state, pool, createRng(22), data).ok).toBe(true)
    expect(state.gold).toBe(10 - data.shop.rerollCost)
    expect(state.shop).not.toEqual(old)
    // 5장 돌려주고 5장 새로 뽑았으니 총량은 그대로다
    expect([...pool.values()].reduce((a, b) => a + b, 0)).toBe(totalBefore)
  })

  it('골드가 모자라면 상점이 그대로다', () => {
    const { state, pool } = startRun(data, createRng(21))
    state.gold = data.shop.rerollCost - 1
    const old = [...state.shop]
    expect(refreshShop(state, pool, createRng(22), data).ok).toBe(false)
    expect(state.shop).toEqual(old)
  })

  it('경험치 구매가 골드를 쓰고 XP 를 올린다', () => {
    const s = seed({ gold: 10, level: 5, xp: 0 })
    expect(buyXp(s, data).ok).toBe(true)
    expect(s.gold).toBe(10 - data.shop.xpCost.gold)
    expect(s.xp).toBe(data.shop.xpCost.xp)
  })

  it('최대 레벨에서는 경험치를 팔지 않는다', () => {
    const s = seed({ gold: 99, level: 9 })
    expect(buyXp(s, data).ok).toBe(false)
    expect(s.gold).toBe(99)
  })
})

describe('전투로 넘기기', () => {
  it('보드에 놓인 유닛만, 로컬 타일 번호로 넘긴다', () => {
    const s = seed()
    s.board[0] = { uid: 1, unitId: 'cat', star: 2 }
    s.board[13] = { uid: 2, unitId: 'bunny', star: 1 }
    putBench(s, [['dragon', 1]]) // 벤치는 안 싸운다
    expect(toCombatEntries(s)).toEqual([
      { unitId: 'cat', star: 2, tile: 0 },
      { unitId: 'bunny', star: 1, tile: 13 },
    ])
  })
})

describe('유닛 찾기', () => {
  it('벤치와 보드 양쪽에서 찾는다', () => {
    const s = seed()
    s.board[2] = { uid: 50, unitId: 'cat', star: 1 }
    putBench(s, [['bunny', 1]])
    expect(findUnit(s, 50)).toMatchObject({ where: 'board', index: 2 })
    expect(findUnit(s, s.bench[0].uid)).toMatchObject({ where: 'bench', index: 0 })
    expect(findUnit(s, 9999)).toBeNull()
  })
})
