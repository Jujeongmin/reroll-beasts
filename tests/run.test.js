import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { simulate } from '../sim/combat.js'
import { matchup, parseComp } from '../sim/run.mjs'

const data = await loadData()

describe('parseComp', () => {
  it('문자열을 보드 배열로 바꾼다', () => {
    expect(parseComp('frog:2:0,cactoro_blob:1:5')).toEqual([
      { unitId: 'frog', star: 2, tile: 0 },
      { unitId: 'cactoro_blob', star: 1, tile: 5 },
    ])
  })

  it('빈 문자열은 빈 배열이다', () => {
    expect(parseComp('')).toEqual([])
  })

  it('성급을 생략하면 1성이다', () => {
    expect(parseComp('cat::3')).toEqual([{ unitId: 'cat', star: 1, tile: 3 }])
  })

  it('성급이 숫자가 아니면 터진다', () => {
    expect(() => parseComp('cat:abc:3')).toThrow(/성급/)
  })

  it('타일이 없으면 터진다', () => {
    expect(() => parseComp('cat:1')).toThrow(/타일/)
  })

  it('유닛 id 가 비면 터진다', () => {
    expect(() => parseComp(':1:3')).toThrow(/유닛 id/)
  })

  it('성급 범위를 벗어나면 터진다', () => {
    expect(() => parseComp('cat:4:3')).toThrow(/성급/)
  })
})

describe('matchup', () => {
  const weak = parseComp('pink_blob:1:0')
  const strong = parseComp('dino:3:0,dragon:3:1,blue_demon:3:2')

  it('시행 횟수만큼 돌린다', () => {
    const r = matchup(weak, strong, 10, data)
    expect(r.winsA + r.winsB + r.draws).toBe(10)
  })

  it('압도적인 쪽 승률이 1 이다', () => {
    expect(matchup(weak, strong, 20, data).winRateA).toBe(0)
    expect(matchup(strong, weak, 20, data).winRateA).toBe(1)
  })

  it('평균 틱을 낸다', () => {
    expect(matchup(weak, strong, 5, data).avgTicks).toBeGreaterThan(0)
  })

  it('같은 시행 횟수면 결과가 재현된다', () => {
    expect(matchup(weak, strong, 15, data)).toEqual(matchup(weak, strong, 15, data))
  })

  it('시행마다 0..N-1 시드를 쓴다 (상수 시드면 평균 틱이 단일 판과 같아진다)', () => {
    const TRIALS = 20
    // 대진 선택이 이 테스트의 전제다.
    //  · 짧은 압살(weak vs strong)은 치명타가 결과를 못 바꿔 틱이 고정된다
    //  · 동일 거울전은 서로 못 죽여 매 시드 maxTicks 로 고정된다
    // 둘 다 평균이 단일 판과 같아져 상수 시드 구현과 구분이 안 된다.
    // 아래 4v4 혼합은 20시드에서 고유 틱이 7종 나온다.
    const mixA = parseComp('pink_blob:2:0,cactoro_blob:2:1,goleling:2:2,cat:2:3')
    const mixB = parseComp('ghost:2:0,chicken:2:1,pigeon:2:2,green_blob:2:3')
    const perSeed = Array.from({ length: TRIALS }, (_, seed) =>
      simulate({ boardA: mixA, boardB: mixB, seed, data }).ticks,
    )
    const expected = Math.floor(perSeed.reduce((a, b) => a + b, 0) / TRIALS)

    // 전제 — 평균이 단일 판과 달라야 상수 시드 구현과 구분된다.
    // 이 단언이 깨지면 이 대진은 시드에 둔감한 것이므로 테스트가 무의미하다.
    expect(expected).not.toBe(perSeed[0])

    // avgTicks 가 0..19 시드 평균과 정확히 일치해야 시드 수열이 고정된 것이다.
    expect(matchup(mixA, mixB, TRIALS, data).avgTicks).toBe(expected)
  })
})
