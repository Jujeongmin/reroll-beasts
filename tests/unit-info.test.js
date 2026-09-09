import { describe, it, expect } from 'vitest'
import { loadData, unitById } from '../sim/data.js'
import { resolveStats } from '../sim/stats.js'
import { skillText, unitInfo } from '../game/src/unit-info.js'

const data = await loadData()
const textOf = (id) => skillText(unitById(data.units, id))

describe('스킬 설명', () => {
  it('모든 유닛이 빈 문장이 아니다', () => {
    // 타입이 하나라도 빠지면 그 유닛만 설명이 사라진다 — 화면에서만 티가 난다
    for (const u of data.units.units) {
      expect(skillText(u), u.id).toBeTruthy()
    }
  })

  it('단일 대상: 피해 배율과 타수를 읽는다', () => {
    // cat = dmgPct 90, hits 3
    const t = textOf('cat')
    expect(t).toContain('90%')
    expect(t).toContain('×3회')
  })

  it('타수가 1이면 "×1회" 를 붙이지 않는다', () => {
    expect(textOf('pigeon')).not.toContain('×')
  })

  it('관통이 있으면 관통 수치를 덧붙인다', () => {
    // chicken = pierceCount 2, piercePct 60
    const t = textOf('chicken')
    expect(t).toContain('2명')
    expect(t).toContain('60%')
  })

  it('지속 피해 범위기는 초 단위로 환산한다', () => {
    // ghost_skull = radius 1, tickDamagePct 34, durationTicks 120 → 4초
    const t = textOf('ghost_skull')
    expect(t).toContain('4초')
    expect(t).toContain('34%')
    // 즉발 피해가 0 이면 그 문장은 아예 빼야 한다
    expect(t).not.toContain('0% 피해')
  })

  it('단일기에 붙는 효과를 빠짐없이 적는다', () => {
    // 이 아홉 유닛은 파라미터를 들고도 카드에 한 줄도 안 나왔다 — 실행기가
    // 안 읽었기 때문이다. 이제는 실행기도 읽고 카드도 적어야 한다.
    expect(textOf('blue_demon')).toContain('기절')
    expect(textOf('frog')).toContain('끌어당')
    expect(textOf('orc_skull')).toContain('마나')
    expect(textOf('ninja')).toContain('도약')
    expect(textOf('ghost')).toContain('무시')
    expect(textOf('chicken')).toContain('관통')
  })

  it('버프는 대상·지속·수치를 모두 담는다', () => {
    // pink_blob = self, def +45, 90틱
    const t = textOf('pink_blob')
    expect(t).toContain('자신')
    expect(t).toContain('3초')
    expect(t).toContain('방어력 +45')
  })

  it('음수 버프는 부호를 그대로 보여준다', () => {
    // goleling = damageTakenPct -45 → "받는 피해 -45%"
    const t = textOf('goleling')
    expect(t).toContain('-45%')
    expect(t).not.toContain('+-')
  })

  it('보호막은 최대 체력 비율로 읽는다', () => {
    // cactoro_big = amountPctMaxHp 18
    expect(textOf('cactoro_big')).toContain('18% 보호막')
  })

  it('소환은 마릿수와 체력 비율을 담는다', () => {
    const t = textOf('green_blob')
    expect(t).toContain('2기')
    expect(t).toContain('40%')
  })
})

describe('유닛 정보', () => {
  it('스탯이 sim 의 계산과 정확히 같다', () => {
    // 화면이 따로 계산하면 표시값과 전투값이 어긋난다
    for (const star of [1, 2, 3]) {
      const info = unitInfo('cat', star, data)
      expect(info.stats).toEqual(resolveStats(unitById(data.units, 'cat'), star, data.combat))
    }
  })

  it('초당 공격 횟수가 공격 간격의 역수다', () => {
    const info = unitInfo('cat', 1, data)
    expect(Number(info.attacksPerSec)).toBeCloseTo(30 / info.stats.attackInterval, 2)
  })

  it('성급이 오르면 체력·공격력이 오른다', () => {
    const a = unitInfo('cat', 1, data).stats
    const b = unitInfo('cat', 2, data).stats
    expect(b.hp).toBeGreaterThan(a.hp)
    expect(b.atk).toBeGreaterThan(a.atk)
    // 사거리는 성급을 안 탄다
    expect(b.range).toBe(a.range)
  })

  it('없는 유닛이면 던진다', () => {
    expect(() => unitInfo('없는유닛', 1, data)).toThrow()
  })
})
