// 유닛 정보 문구. 스탯은 sim/stats 가, 설명은 여기가 만든다.
//
// units.json 에는 스킬 **설명문이 없다** — 파라미터만 있다. 설명을 따로 적어 두면
// 수치를 고칠 때마다 두 곳을 맞춰야 하고, 언젠가 반드시 어긋난다.
// 그래서 파라미터에서 문장을 만든다. 화면에 뜬 숫자가 곧 시뮬이 쓰는 숫자다.

import { unitById } from '@sim/data.js'
import { resolveStats } from '@sim/stats.js'
import { applyItems } from '@sim/items.js'

const TICK_RATE = 30
const sec = (ticks) => (ticks / TICK_RATE).toFixed(1).replace(/\.0$/, '')

const STAT_LABEL = {
  def: '방어력',
  atkPct: '공격력',
  damageTakenPct: '받는 피해',
  shield: '보호막',
  shieldAndDef: '보호막·방어력',
  dot: '지속 피해',
}

/** 스킬 파라미터 → 한 문장. 타입마다 읽는 값이 다르다. */
export function skillText(unit) {
  const { type, params: p } = unit.skill
  switch (type) {
    case 'single': {
      const hits = p.hits > 1 ? ` ×${p.hits}회` : ''
      const pierce = p.pierceCount
        ? ` 뒤쪽 ${p.pierceCount}명에게 ${p.piercePct}% 관통.`
        : ''
      return `대상에게 주문력의 ${p.dmgPct}% 피해${hits}.${pierce}`
    }
    case 'aoe': {
      const burst = p.dmgPct ? `반경 ${p.radius} 에 주문력의 ${p.dmgPct}% 피해.` : ''
      const dot = p.tickDamagePct
        ? `반경 ${p.radius} 에 ${sec(p.durationTicks)}초간 초당 주문력의 ${p.tickDamagePct}% 피해.`
        : ''
      return [burst, dot].filter(Boolean).join(' ')
    }
    case 'buff': {
      const who = p.target === 'self' ? '자신' : '아군 전체'
      const parts = []
      if (p.amountPctMaxHp) parts.push(`최대 체력의 ${p.amountPctMaxHp}% 보호막`)
      if (p.amount) {
        const label = STAT_LABEL[p.stat] ?? p.stat
        const sign = p.amount > 0 ? '+' : ''
        parts.push(`${label} ${sign}${p.amount}${p.stat.endsWith('Pct') ? '%' : ''}`)
      }
      return `${who}에게 ${sec(p.durationTicks)}초간 ${parts.join(', ')}.`
    }
    case 'summon':
      return `죽을 때 ${p.count}기를 최대 체력 ${p.hpPct}% 로 소환.`
    default:
      return ''
  }
}

// 아이템 12종 효과를 사람이 읽는 한 줄로. items.json 의 effect 키에서
// 직접 뽑는다 — 아이템마다 문장을 따로 박아 두면 수치를 고칠 때 여기가
// 안 맞아진다(카드에 적힌 효과와 실제 전투 수치가 갈린다).
const ITEM_STAT_LABEL = {
  hp: '최대 체력',
  def: '방어력',
  mr: '마법저항',
  power: '주문력',
  manaStart: '시작 마나',
  atkPct: '공격력',
  attackSpeedPct: '공격속도',
  critChancePct: '치명타 확률',
  thornsPct: '반사 피해',
  lifestealPct: '흡혈',
  auraAtkPct: '인접 아군 공격력',
}
// 퍼센트로 보여줄 키. 나머지(hp·def·mr·power·manaStart)는 고정값이다.
const ITEM_PCT_KEYS = new Set([
  'atkPct',
  'attackSpeedPct',
  'critChancePct',
  'thornsPct',
  'lifestealPct',
  'auraAtkPct',
])

/** 아이템 하나의 효과 한 줄. */
export function itemEffectText(item) {
  const e = item.effect ?? {}
  const parts = []
  // 관통 두 키(pierceCount·piercePct)는 한 아이템의 한 효과라 묶어 적는다 —
  // 따로 적으면 "1명" 과 "40%" 가 무슨 관계인지 안 읽힌다.
  if (e.pierceCount) parts.push(`관통 ${e.pierceCount}명 · ${e.piercePct ?? 0}%`)
  for (const [key, label] of Object.entries(ITEM_STAT_LABEL)) {
    if (!(key in e)) continue
    const v = e[key]
    const sign = v > 0 ? '+' : ''
    parts.push(`${label} ${sign}${v}${ITEM_PCT_KEYS.has(key) ? '%' : ''}`)
  }
  return parts.join(' · ')
}

/**
 * 화면에 뿌릴 정보 한 덩어리.
 *
 * items 를 넘기면 스탯 표에 아이템이 반영된다 — 전투(sim/items.js applyItems)와
 * 같은 함수를 쓰므로 카드 숫자와 실제 전투 수치가 어긋나지 않는다.
 * 시너지는 아직 안 반영한다 — 이건 이 함수가 생기기 전부터 있던 생략이고
 * 범위가 다른 얘기라 여기서 같이 고치지 않는다.
 */
export function unitInfo(unitId, star, data, items = []) {
  const unit = unitById(data.units, unitId)
  if (!unit) throw new Error(`없는 유닛 id: ${unitId}`)
  const base = resolveStats(unit, star, data.combat)
  const stats = items.length > 0 ? applyItems(base, items, data.items) : base
  return {
    unit,
    stats,
    skill: skillText(unit),
    // 공격 간격은 틱이다. 초당 횟수로 보여야 "빠른가"가 읽힌다.
    attacksPerSec: (TICK_RATE / stats.attackInterval).toFixed(2),
  }
}
