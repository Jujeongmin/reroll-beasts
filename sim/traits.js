// 보드 구성 → 시너지 활성 단계.
// 같은 unitId 는 몇 개를 놓든 1로 센다 (오토체스 표준).

export function activeTraits(unitList, traitsData) {
  const seen = new Set()
  const counts = new Map()

  for (const u of unitList) {
    if (seen.has(u.unitId)) continue
    seen.add(u.unitId)
    counts.set(u.origin, (counts.get(u.origin) ?? 0) + 1)
    counts.set(u.class, (counts.get(u.class) ?? 0) + 1)
  }

  const result = new Map()
  const all = [...traitsData.origins, ...traitsData.classes]

  for (const t of all) {
    const count = counts.get(t.id) ?? 0
    let step = 0
    for (let i = 0; i < t.steps.length; i++) {
      if (count >= t.steps[i]) step = i + 1
    }
    result.set(t.id, {
      count,
      step,
      effect: step > 0 ? t.effects[step - 1] : null,
    })
  }

  return result
}
