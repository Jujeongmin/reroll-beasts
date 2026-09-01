import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { createRng } from '../sim/rng.js'
import { totalRounds, roundAt, pveBoard, defeatDamage } from '../sim/rounds.js'

const data = await loadData()
const R = data.rounds

describe('라운드 번호', () => {
  it('총 23라운드다', () => {
    expect(totalRounds(R)).toBe(23)
  })

  it('스테이지 경계에서 번호가 넘어간다', () => {
    // 스테이지 1 은 3라운드다. 4번째는 2-1 이어야 한다.
    expect(roundAt(1, R).label).toBe('1-1')
    expect(roundAt(3, R).label).toBe('1-3')
    expect(roundAt(4, R).label).toBe('2-1')
    expect(roundAt(8, R).label).toBe('2-5')
    expect(roundAt(9, R).label).toBe('3-1')
    expect(roundAt(23, R).label).toBe('5-5')
  })

  it('마지막 라운드를 넘으면 null 이다', () => {
    expect(roundAt(24, R)).toBeNull()
  })

  it('stageIndex 가 0부터고 stage 는 1부터다', () => {
    // PvE 편성 배열은 0부터 색인하고 화면 표기는 1부터다. 둘을 섞으면
    // 스테이지 하나가 통째로 밀린 편성이 나온다.
    expect(roundAt(1, R)).toMatchObject({ stage: 1, stageIndex: 0 })
    expect(roundAt(23, R)).toMatchObject({ stage: 5, stageIndex: 4 })
  })

  it('스테이지 1 은 전부 PvE, 이후는 5라운드만 PvE 다', () => {
    for (const n of [1, 2, 3]) expect(roundAt(n, R).isPve).toBe(true)
    for (const n of [4, 5, 6, 7]) expect(roundAt(n, R).isPve).toBe(false)
    expect(roundAt(8, R).isPve).toBe(true)
  })

  it('패배 피해 계수가 스테이지를 따라 커진다', () => {
    const dmg = [1, 4, 9, 14, 19].map((n) => roundAt(n, R).damage)
    expect(dmg).toEqual([0, 2, 3, 5, 7])
  })
})

describe('PvE 편성', () => {
  it('스테이지 정의대로 인원과 성급을 낸다', () => {
    R.pve.forEach((def, i) => {
      const board = pveBoard(i, createRng(1), data)
      expect(board).toHaveLength(def.count)
      for (const e of board) {
        expect(e.star).toBe(def.star)
        expect(def.units).toContain(e.unitId)
      }
    })
  })

  it('타일이 0부터 겹치지 않게 채워진다', () => {
    const board = pveBoard(4, createRng(7), data)
    const tiles = board.map((e) => e.tile)
    expect(new Set(tiles).size).toBe(tiles.length)
    expect(tiles).toEqual([...tiles].sort((a, b) => a - b))
    expect(tiles[0]).toBe(0)
  })

  it('같은 유닛을 두 번 쓰지 않는다', () => {
    const board = pveBoard(4, createRng(7), data)
    const ids = board.map((e) => e.unitId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('같은 시드면 같은 편성, 다른 시드면 달라진다', () => {
    // 섞기를 빼면 첫 번째는 통과하고 두 번째가 깨진다
    const a = pveBoard(4, createRng(3), data)
    const b = pveBoard(4, createRng(3), data)
    expect(a).toEqual(b)

    const seeds = [1, 2, 3, 4, 5, 6].map((s) =>
      pveBoard(4, createRng(s), data)
        .map((e) => e.unitId)
        .join(','),
    )
    expect(new Set(seeds).size).toBeGreaterThan(1)
  })

  it('없는 스테이지는 던진다', () => {
    expect(() => pveBoard(99, createRng(1), data)).toThrow()
  })
})

describe('패배 피해', () => {
  it('스테이지 계수에 살아남은 적 수를 더한다', () => {
    expect(defeatDamage(0, 3)).toBe(3)
    expect(defeatDamage(5, 3)).toBe(8)
    expect(defeatDamage(8, 7)).toBe(15)
  })

  it('스테이지 5 전멸 패배가 시작 HP 의 절반을 넘지 않는다', () => {
    // 넘으면 후반 두 판에 탈락해 23라운드 구조가 무너진다
    const worst = defeatDamage(R.pve[4].count, R.stages[4].damage)
    expect(worst).toBeLessThanOrEqual(data.economy.startHp / 2)
  })
})
