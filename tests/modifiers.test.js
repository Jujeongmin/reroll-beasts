import { describe, it, expect } from 'vitest'
import { damageTakenMultiplier } from '../sim/modifiers.js'

function combatant(buffs) {
  return { buffs }
}

describe('damageTakenMultiplier', () => {
  it('버프가 없으면 1 이다', () => {
    expect(damageTakenMultiplier(combatant([]))).toBe(1)
  })

  it('-50% 버프 하나면 0.5 다', () => {
    expect(damageTakenMultiplier(combatant([{ stat: 'damageTakenPct', amount: -50 }]))).toBe(0.5)
  })

  it('-50% 버프 두 개면 0 이다', () => {
    expect(
      damageTakenMultiplier(
        combatant([
          { stat: 'damageTakenPct', amount: -50 },
          { stat: 'damageTakenPct', amount: -50 },
        ]),
      ),
    ).toBe(0)
  })

  it('-50% 버프 세 개면 음수가 아니라 0 으로 클램프된다', () => {
    expect(
      damageTakenMultiplier(
        combatant([
          { stat: 'damageTakenPct', amount: -50 },
          { stat: 'damageTakenPct', amount: -50 },
          { stat: 'damageTakenPct', amount: -50 },
        ]),
      ),
    ).toBe(0)
  })
})
