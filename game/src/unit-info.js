// 유닛 정보 문구. 스탯은 sim/stats 가, 설명은 여기가 만든다.
//
// units.json 에는 스킬 **설명문이 없다** — 파라미터만 있다. 설명을 따로 적어 두면
// 수치를 고칠 때마다 두 곳을 맞춰야 하고, 언젠가 반드시 어긋난다.
// 그래서 파라미터에서 문장을 만든다. 화면에 뜬 숫자가 곧 시뮬이 쓰는 숫자다.

import { unitById } from '@sim/data.js'
import { resolveStats } from '@sim/stats.js'

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

/** 화면에 뿌릴 정보 한 덩어리. */
export function unitInfo(unitId, star, data) {
  const unit = unitById(data.units, unitId)
  if (!unit) throw new Error(`없는 유닛 id: ${unitId}`)
  const stats = resolveStats(unit, star, data.combat)
  return {
    unit,
    stats,
    skill: skillText(unit),
    // 공격 간격은 틱이다. 초당 횟수로 보여야 "빠른가"가 읽힌다.
    attacksPerSec: (TICK_RATE / stats.attackInterval).toFixed(2),
  }
}
