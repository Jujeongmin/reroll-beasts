// 데이터 불변식 검사. 밸런스를 만졌으면 반드시 돌린다.
// 스펙 §12.4 의 8개 불변식을 검사하고, 위반 메시지 배열을 되돌린다.

import { loadData } from '../sim/data.js'

const SKILL_TYPES = new Set(['single', 'aoe', 'buff', 'summon'])

export function validate(data) {
  const errors = []
  const { combat, units, traits, shop } = data
  const list = units.units

  const originIds = new Set(traits.origins.map((o) => o.id))
  const classIds = new Set(traits.classes.map((c) => c.id))
  const allTraits = [...traits.origins, ...traits.classes]

  // 1. 레벨별 티어 확률 합 = 100
  for (const [level, odds] of Object.entries(shop.tierOdds)) {
    const sum = odds.reduce((a, b) => a + b, 0)
    if (sum !== 100) errors.push(`레벨 ${level} 의 티어 확률 합이 ${sum} 이다 (100 이어야 한다)`)
    if (odds.length !== 5) errors.push(`레벨 ${level} 의 티어 확률 항목이 ${odds.length} 개다 (5 여야 한다)`)
  }

  // 2. 모든 유닛이 실재하는 종족 1개 + 직업 1개를 갖는다
  for (const u of list) {
    if (!originIds.has(u.origin)) errors.push(`유닛 ${u.id} 가 없는 종족 "${u.origin}" 을 참조한다`)
    if (!classIds.has(u.class)) errors.push(`유닛 ${u.id} 가 없는 직업 "${u.class}" 을 참조한다`)
    if (!SKILL_TYPES.has(u.skill?.type)) errors.push(`유닛 ${u.id} 의 스킬 타입 "${u.skill?.type}" 이 4종에 없다`)
    if (!combat.tierBase[String(u.tier)]) errors.push(`유닛 ${u.id} 의 티어 ${u.tier} 에 tierBase 정의가 없다`)
    if (!combat.classModifier[u.class]) errors.push(`유닛 ${u.id} 의 직업 계수 "${u.class}" 가 combat.json 에 없다`)
  }

  // 3. 각 시너지의 보유 유닛 수 >= 최대 활성 단계
  // 4. 각 시너지에 T1 진입점이 존재
  // 9. steps 와 effects 길이 일치
  for (const t of allTraits) {
    const members = list.filter((u) => u.origin === t.id || u.class === t.id)
    const maxStep = Math.max(...t.steps)
    if (members.length < maxStep) {
      errors.push(`시너지 ${t.id} 의 보유 유닛이 ${members.length} 종인데 최대 활성 단계가 ${maxStep} 이다`)
    }
    if (!members.some((u) => u.tier === 1)) {
      errors.push(`시너지 ${t.id} 에 T1 진입점이 없다 (초반에 노선을 탈 수 없다)`)
    }
    if (t.steps.length !== t.effects.length) {
      errors.push(`시너지 ${t.id} 의 steps 길이(${t.steps.length})와 effects 길이(${t.effects.length})가 다르다`)
    }
  }

  // 5. 티어별 종수와 shop.pool 정의 일치
  for (const [tier, def] of Object.entries(shop.pool)) {
    const actual = list.filter((u) => String(u.tier) === tier).length
    if (actual !== def.unitCount) {
      errors.push(`티어별 종수 불일치: T${tier} 실제 ${actual} 종 vs pool 정의 ${def.unitCount} 종`)
    }
  }

  // 6. T5 3성 봉쇄 확인 (3성 필요 매수 > T5 종당 풀 매수)
  const need3 = shop.starUpCopies['3']
  const t5copies = shop.pool['5'].copiesPerUnit
  if (t5copies >= need3) {
    errors.push(`T5 3성이 봉쇄되지 않았다: 종당 ${t5copies} 장 >= 3성 필요 ${need3} 장`)
  }

  // 7. 성급 배율이 3단계다
  if (!Array.isArray(combat.starMultiplier) || combat.starMultiplier.length !== 3) {
    errors.push('combat.json > starMultiplier 는 3개 원소 배열이어야 한다')
  }

  // 8. 보드 정의 정합성
  const b = combat.board
  if (b.rows.length !== b.rowOffset.length) {
    errors.push(`보드 rows 길이(${b.rows.length})와 rowOffset 길이(${b.rowOffset.length})가 다르다`)
  }
  const perSide = b.rows.reduce((a, n) => a + n, 0) / 2
  if (perSide !== 22) errors.push(`진영당 칸 수가 ${perSide} 이다 (22 여야 한다)`)

  return errors
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
if (isMain) {
  const data = await loadData()
  const errors = validate(data)
  if (errors.length > 0) {
    console.error(`불변식 위반 ${errors.length} 건:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log('불변식 통과')
}
