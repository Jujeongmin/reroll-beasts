// 시즌 경계. 하루 차이로 패스가 닫히고 보상이 갈리므로 끝나는 날 처리가
// 흔들리면 안 된다 — 그날 전체가 시즌이어야 한다.
import { describe, it, expect, beforeAll } from 'vitest'
import { loadData } from '../sim/data.js'
import { seasonAt, daysLeft, seasonProgress } from '../sim/season.js'

let data
beforeAll(async () => {
  data = await loadData()
})

const at = (iso) => Date.parse(iso)

describe('seasonAt', () => {
  it('시작 전에는 시즌이 없다', () => {
    expect(seasonAt(at('2026-08-31T23:59:59Z'), data)).toBe(null)
  })

  it('시작일 자정부터 시즌이다', () => {
    expect(seasonAt(at('2026-09-01T00:00:00Z'), data)?.id).toBe('s1')
  })

  it('끝나는 날은 하루 전체가 시즌이다 — 그날 오전에 닫히면 하루를 도둑맞는다', () => {
    expect(seasonAt(at('2026-12-31T00:00:00Z'), data)?.id).toBe('s1')
    expect(seasonAt(at('2026-12-31T23:59:59Z'), data)?.id).toBe('s1')
  })

  it('다음 날 자정에는 끝나 있다', () => {
    expect(seasonAt(at('2027-01-01T00:00:00Z'), data)).toBe(null)
  })
})

describe('daysLeft', () => {
  it('마지막 날에는 1 이다 — 0 은 이미 끝난 것으로 읽힌다', () => {
    expect(daysLeft(at('2026-12-31T10:00:00Z'), data)).toBe(1)
  })

  it('시작일에는 구간 전체가 남아 있다', () => {
    expect(daysLeft(at('2026-09-01T00:00:00Z'), data)).toBe(122)
  })

  it('시즌 밖이면 null', () => {
    expect(daysLeft(at('2027-02-01T00:00:00Z'), data)).toBe(null)
  })
})

describe('seasonProgress', () => {
  it('시작에서 0, 끝에서 1 에 닿는다', () => {
    expect(seasonProgress(at('2026-09-01T00:00:00Z'), data)).toBe(0)
    expect(seasonProgress(at('2026-12-31T23:59:59Z'), data)).toBeCloseTo(1, 3)
  })

  it('중간은 0 과 1 사이다', () => {
    const p = seasonProgress(at('2026-11-01T00:00:00Z'), data)
    expect(p).toBeGreaterThan(0.4)
    expect(p).toBeLessThan(0.6)
  })
})
