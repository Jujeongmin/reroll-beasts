import { describe, it, expect } from 'vitest'
import { loadData, unitById } from '../sim/data.js'
import { createRng } from '../sim/rng.js'
import {
  growthAt,
  botBoard,
  createLobby,
  pairUp,
  opponentOf,
  resolveOthers,
  growBots,
  standings,
} from '../sim/lobby.js'

const data = await loadData()
const perSide = data.combat.board.rows.reduce((a, n) => a + n, 0) / 2

describe('봇 성장', () => {
  it('라운드가 갈수록 인원과 티어 상한이 오른다', () => {
    const early = growthAt(1, data.lobby)
    const late = growthAt(23, data.lobby)
    expect(late.units).toBeGreaterThan(early.units)
    expect(late.maxTier).toBeGreaterThan(early.maxTier)
  })

  it('마지막 라운드도 표가 덮는다', () => {
    // 안 덮으면 후반 봇이 초반 세기로 남아 난이도가 뒤집힌다
    expect(growthAt(23, data.lobby)).toBe(data.lobby.growth.at(-1))
  })
})

describe('봇 보드', () => {
  it('편성 인원과 성급이 성장표를 따른다', () => {
    for (const r of [1, 5, 12, 20, 23]) {
      const g = growthAt(r, data.lobby)
      const b = botBoard(r, createRng(r), data)
      expect(b.length, `라운드 ${r}`).toBe(g.units)
      expect(b.every((e) => e.star === g.star)).toBe(true)
    }
  })

  it('티어 상한을 넘는 유닛을 쓰지 않는다', () => {
    for (const r of [1, 5, 12]) {
      const g = growthAt(r, data.lobby)
      for (const e of botBoard(r, createRng(r * 7), data)) {
        expect(unitById(data.units, e.unitId).tier).toBeLessThanOrEqual(g.maxTier)
      }
    }
  })

  it('같은 유닛을 두 번 세우지 않는다', () => {
    const b = botBoard(20, createRng(3), data)
    expect(new Set(b.map((e) => e.unitId)).size).toBe(b.length)
  })

  it('타일이 겹치지 않고 진영 안에 있다', () => {
    const b = botBoard(23, createRng(9), data)
    const tiles = b.map((e) => e.tile)
    expect(new Set(tiles).size).toBe(tiles.length)
    expect(Math.max(...tiles)).toBeLessThan(perSide)
  })

  it('근접이 앞, 원거리가 뒤에 선다', () => {
    // 아무렇게나 세우면 봇 원거리가 앞에서 먼저 죽어 난이도가 라운드와 무관해진다
    const b = botBoard(23, createRng(11), data)
    const ranges = b.map((e) => data.combat.classModifier[unitById(data.units, e.unitId).class].range)
    expect([...ranges].sort((a, c) => a - c)).toEqual(ranges)
  })

  it('같은 시드면 같은 편성, 다른 시드면 달라진다', () => {
    expect(botBoard(12, createRng(4), data)).toEqual(botBoard(12, createRng(4), data))
    const seen = new Set([1, 2, 3, 4, 5].map((s) => botBoard(12, createRng(s), data).map((e) => e.unitId).join()))
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('로비', () => {
  it('나 + 봇 7 로 시작하고 나만 보드가 비어 있다', () => {
    const l = createLobby(data, createRng(1))
    expect(l).toHaveLength(data.lobby.size)
    expect(l[0].isPlayer).toBe(true)
    expect(l[0].board).toEqual([])
    expect(l.slice(1).every((p) => p.board.length > 0)).toBe(true)
    expect(l.every((p) => p.hp === data.economy.startHp)).toBe(true)
  })

  it('대진이 살아 있는 사람만 둘씩 묶는다', () => {
    const l = createLobby(data, createRng(2))
    l[3].hp = 0
    l[5].hp = 0
    const pairs = pairUp(l, createRng(2))
    const used = pairs.flat()
    expect(used).not.toContain(3)
    expect(used).not.toContain(5)
    expect(new Set(used).size).toBe(used.length)
    // 6명이면 3쌍
    expect(pairs).toHaveLength(3)
  })

  it('홀수면 한 명이 남는다', () => {
    const l = createLobby(data, createRng(2))
    l[7].hp = 0
    const pairs = pairUp(l, createRng(5))
    expect(pairs).toHaveLength(3)
    expect(pairs.flat()).toHaveLength(6)
  })

  it('내 상대를 대진에서 찾는다', () => {
    const l = createLobby(data, createRng(6))
    const pairs = pairUp(l, createRng(6))
    const opp = opponentOf(pairs, 0)
    expect(opp).not.toBeNull()
    expect(opp).not.toBe(0)
    expect(pairs.some((p) => p.includes(0) && p.includes(opp))).toBe(true)
  })

  it('짝이 없으면 null 이다', () => {
    expect(opponentOf([[1, 2]], 0)).toBeNull()
  })
})

describe('남의 판 정산', () => {
  it('진 쪽만 체력이 깎이고 내 체력은 안 건드린다', () => {
    const l = createLobby(data, createRng(8))
    const pairs = [
      [0, 1],
      [2, 3],
    ]
    const before = l.map((p) => p.hp)
    const res = resolveOthers(l, pairs, { seed: 5, stageDamage: 2, data })

    // 내 대진은 건너뛴다 — 그건 화면이 재생하고 나서 정산한다
    expect(res).toHaveLength(1)
    expect(l[0].hp).toBe(before[0])
    expect(l[1].hp).toBe(before[1])

    const changed = [2, 3].filter((i) => l[i].hp !== before[i])
    expect(changed.length, '무승부면 0, 승패가 나면 1').toBeLessThanOrEqual(1)
  })

  it('체력이 0 아래로 안 내려간다', () => {
    const l = createLobby(data, createRng(8))
    l[2].hp = 1
    l[3].board = []
    resolveOthers(l, [[2, 3]], { seed: 5, stageDamage: 40, data })
    expect(l[2].hp).toBeGreaterThanOrEqual(0)
  })
})

describe('봇 아이템', () => {
  it('첫 라운드에는 아무도 아이템이 없다', () => {
    const board = botBoard(1, createRng(1), data)
    expect(board.every((e) => e.items.length === 0)).toBe(true)
  })

  it('후반 라운드에는 아이템이 붙는다', () => {
    const board = botBoard(23, createRng(1), data)
    const total = board.reduce((n, e) => n + e.items.length, 0)
    expect(total).toBeGreaterThan(0)
  })

  it('유닛당 칸 수를 넘지 않는다', () => {
    const board = botBoard(23, createRng(1), data)
    for (const e of board) expect(e.items.length).toBeLessThanOrEqual(data.items.slotsPerUnit)
  })

  it('지급 라운드 수를 넘게 주지 않는다', () => {
    const board = botBoard(23, createRng(1), data)
    const total = board.reduce((n, e) => n + e.items.length, 0)
    expect(total).toBeLessThanOrEqual(data.items.grantRounds.length)
  })

  it('같은 시드는 같은 아이템을 낸다', () => {
    const a = botBoard(23, createRng(9), data)
    const b = botBoard(23, createRng(9), data)
    expect(a).toEqual(b)
  })
})

describe('성장 · 순위', () => {
  it('탈락자와 나는 보드를 새로 짜지 않는다', () => {
    const l = createLobby(data, createRng(9))
    l[4].hp = 0
    const before = { me: l[0].board, dead: l[4].board, alive: l[1].board }
    growBots(l, 20, createRng(9), data)
    expect(l[0].board).toBe(before.me)
    expect(l[4].board).toBe(before.dead)
    expect(l[1].board).not.toBe(before.alive)
  })

  it('체력 내림차순으로 세운다', () => {
    const l = createLobby(data, createRng(10))
    l[0].hp = 12
    l[1].hp = 40
    l[2].hp = 0
    const s = standings(l)
    expect(s[0].hp).toBe(40)
    expect(s.at(-1).hp).toBe(0)
    const hps = s.map((p) => p.hp)
    expect([...hps].sort((a, b) => b - a)).toEqual(hps)
  })
})
