// 유닛 정보 문구. 스탯은 sim/stats 가, 설명은 여기가 만든다.
//
// units.json 에는 스킬 **설명문이 없다** — 파라미터만 있다. 설명을 따로 적어 두면
// 수치를 고칠 때마다 두 곳을 맞춰야 하고, 언젠가 반드시 어긋난다.
// 그래서 파라미터에서 문장을 만든다. 화면에 뜬 숫자가 곧 시뮬이 쓰는 숫자다.

import { unitById } from '@sim/data.js'
import { resolveStats } from '@sim/stats.js'
import { applyItems } from '@sim/items.js'
import { t } from './i18n.js'

const TICK_RATE = 30
const sec = (ticks) => (ticks / TICK_RATE).toFixed(1).replace(/\.0$/, '')

// 이름표는 **키만** 든다. 문장은 t() 가 만든다 — 여기에 한국어를 박으면
// 영어 화면에서도 한국어가 뜬다.
const STAT_KEY = {
  def: 'stat.def',
  atkPct: 'stat.atkPct',
  damageTakenPct: 'stat.damageTakenPct',
  shield: 'stat.shield',
  shieldAndDef: 'stat.shieldAndDef',
  dot: 'stat.dot',
}

/** 스킬 파라미터 → 한 문장. 타입마다 읽는 값이 다르다. */
export function skillText(unit) {
  const { type, params: p } = unit.skill
  switch (type) {
    case 'single': {
      const hits = p.hits > 1 ? t('skill.hits', { n: p.hits }) : ''
      const pierce = p.pierceCount
        ? t('skill.pierce', { n: p.pierceCount, pct: p.piercePct })
        : ''
      // 덧붙는 효과들. **적힌 것만 적는다** — 여기서 문장을 지어내면 카드가
      // 판보다 앞서 나간다. 실행기가 읽는 키와 이 목록이 짝이다
      // (tools/validate.mjs 의 SKILL_PARAMS 가 그 짝을 지킨다).
      const extra = []
      if (p.defIgnorePct) extra.push(t('skill.defIgnore', { pct: p.defIgnorePct }))
      if (p.lifestealPct) extra.push(t('skill.lifesteal', { pct: p.lifestealPct }))
      if (p.stunTicks) extra.push(t('skill.stun', { sec: sec(p.stunTicks) }))
      if (p.pull) extra.push(t('skill.pull'))
      if (p.manaRefillOnKill) extra.push(t('skill.manaRefill'))
      if (p.releapOnKill) extra.push(t('skill.releap'))
      return [t('skill.single', { pct: p.dmgPct, hits, pierce }), ...extra].join(' ')
    }
    case 'aoe': {
      const burst = p.dmgPct ? t('skill.aoeBurst', { r: p.radius, pct: p.dmgPct }) : ''
      const dot = p.tickDamagePct
        ? t('skill.aoeDot', { r: p.radius, sec: sec(p.durationTicks), pct: p.tickDamagePct })
        : ''
      return [burst, dot].filter(Boolean).join(' ')
    }
    case 'buff': {
      const who = t(p.target === 'self' ? 'target.self' : 'target.allies')
      const parts = []
      if (p.amountPctMaxHp) parts.push(t('skill.shield', { pct: p.amountPctMaxHp }))
      if (p.amount) {
        const label = t(STAT_KEY[p.stat] ?? p.stat)
        const sign = p.amount > 0 ? '+' : ''
        parts.push(`${label} ${sign}${p.amount}${p.stat.endsWith('Pct') ? '%' : ''}`)
      }
      return t('skill.buff', { who, sec: sec(p.durationTicks), what: parts.join(', ') })
    }
    case 'summon':
      return t('skill.summon', { n: p.count, pct: p.hpPct })
    default:
      return ''
  }
}

// 아이템 12종 효과를 사람이 읽는 한 줄로. items.json 의 effect 키에서
// 직접 뽑는다 — 아이템마다 문장을 따로 박아 두면 수치를 고칠 때 여기가
// 안 맞아진다(카드에 적힌 효과와 실제 전투 수치가 갈린다).
const ITEM_STAT_KEY = {
  hp: 'stat.hp',
  def: 'stat.def',
  mr: 'stat.mr',
  power: 'stat.ap',
  manaStart: 'stat.mana',
  atkPct: 'stat.atkPct',
  attackSpeedPct: 'stat.as',
  critChancePct: 'stat.crit',
  thornsPct: 'stat.thorns',
  lifestealPct: 'stat.lifesteal',
  auraAtkPct: 'stat.aura',
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
  if (e.pierceCount) parts.push(t('item.pierce', { n: e.pierceCount, pct: e.piercePct ?? 0 }))
  for (const [key, labelKey] of Object.entries(ITEM_STAT_KEY)) {
    if (!(key in e)) continue
    const v = e[key]
    const sign = v > 0 ? '+' : ''
    parts.push(`${t(labelKey)} ${sign}${v}${ITEM_PCT_KEYS.has(key) ? '%' : ''}`)
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
