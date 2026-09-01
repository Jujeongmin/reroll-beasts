import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { effectText, unknownKeys, traitById, traitDetail } from '../game/src/trait-info.js'

const data = await loadData()
const allTraits = [...data.traits.origins, ...data.traits.classes]

describe('시너지 효과 문구', () => {
  it('모든 시너지의 모든 단계가 문장으로 나온다', () => {
    // 표에 없는 키는 조용히 빠진다. 그 누락을 화면이 아니라 여기서 잡는다.
    for (const t of allTraits) {
      t.effects.forEach((e, i) => {
        expect(unknownKeys(e), `${t.id} ${i + 1}단계`).toEqual([])
        expect(effectText(e), `${t.id} ${i + 1}단계`).toBeTruthy()
      })
    }
  })

  it('부호를 살려 쓴다', () => {
    expect(effectText({ hp: 250, scope: 'trait' })).toBe('체력 +250')
    expect(effectText({ critTakenPct: -40, scope: 'trait' })).toContain('-40%')
  })

  it('꼬리표 키는 따로 문장을 만들지 않고 본 키에 붙는다', () => {
    // shieldTicks 는 "보호막" 문장 안에 초로 들어가야지 별도 항목이면 안 된다
    const t = effectText({ shieldPctMaxHp: 20, shieldTicks: 150, scope: 'trait' })
    expect(t).toBe('최대 체력의 20% 보호막 (5초)')
    expect(t.split(',')).toHaveLength(1)
  })

  it('틱을 초로 환산한다', () => {
    expect(effectText({ dodgePct: 30, dodgeTicks: 90, scope: 'trait' })).toContain('3초')
  })

  it('scope 는 효과가 아니므로 문장에 안 들어간다', () => {
    expect(effectText({ hp: 100, scope: 'trait' })).toBe('체력 +100')
  })
})

describe('시너지 상세', () => {
  it('단계마다 활성 여부가 보유 수를 따른다', () => {
    const t = allTraits[0]
    const d = traitDetail(t.id, t.steps[0], data)
    expect(d.steps[0].active).toBe(true)
    expect(d.steps[1].active).toBe(false)

    const none = traitDetail(t.id, t.steps[0] - 1, data)
    expect(none.steps.every((s) => !s.active)).toBe(true)
  })

  it('보유 유닛을 표시한다', () => {
    const t = allTraits[0]
    const members = traitDetail(t.id, 0, data).members
    const owned = new Set([members[0].id])
    const d = traitDetail(t.id, 1, data, owned)
    expect(d.members[0].owned).toBe(true)
    expect(d.members.slice(1).every((m) => !m.owned)).toBe(true)
  })

  it('구성 유닛이 티어 오름차순이다', () => {
    for (const t of allTraits) {
      const tiers = traitDetail(t.id, 0, data).members.map((m) => m.tier)
      expect([...tiers].sort((a, b) => a - b), t.id).toEqual(tiers)
    }
  })

  it('구성 유닛 수가 검증기의 불변식과 맞는다', () => {
    // 각 시너지의 보유 유닛 수 >= 최대 활성 단계
    for (const t of allTraits) {
      const d = traitDetail(t.id, 0, data)
      expect(d.members.length, t.id).toBeGreaterThanOrEqual(Math.max(...t.steps))
    }
  })

  it('없는 시너지는 던진다', () => {
    expect(() => traitDetail('없는시너지', 0, data)).toThrow()
    expect(traitById(data.traits, '없는시너지')).toBeNull()
  })
})
