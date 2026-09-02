// 아이템 → 스탯 · 전투 특수효과.
//
// stats.js 에 넣지 않는다. 거기는 이미 "티어×직업×성급 해석"과 "시너지 병합"
// 두 주제를 갖고 있고, 아이템까지 넣으면 한 파일에 셋이 산다.
//
// 적용 순서는 base → 시너지 → 아이템이다. 퍼센트는 계통별로 따로 곱한다 —
// 시너지 +20% 와 강철검 +20% 가 1.2×1.2 = 1.44 배다. 한 번에 더해 1.4 로
// 만들면 시너지 코드가 아이템을 알아야 한다.

/** 아이템 하나를 더하면 몇이 되는가 — 고정값 스탯 키. */
const FLAT = ['hp', 'def', 'mr', 'power', 'manaStart']

export function itemById(itemsData, id) {
  return itemsData.items.find((i) => i.id === id)
}

function effectsOf(itemIds, itemsData) {
  return itemIds.map((id) => {
    const item = itemById(itemsData, id)
    // 없는 id 를 건너뛰면 "왜 이 아이템이 아무 효과가 없나"를 전투 로그에서
    // 역추적해야 한다. 스냅샷을 서버가 재실행하는 경로가 본선이므로 즉시 던진다.
    if (!item) throw new Error(`없는 아이템 id: ${id}`)
    return item.effect
  })
}

/**
 * 숫자 스탯에 아이템을 얹는다. 원본은 건드리지 않는다.
 *
 * 퍼센트는 모아서 **한 번만** 곱한다 — 같은 계통끼리는 더한다.
 * 강철검 2개는 1.2×1.2 가 아니라 1.4 다 (칸을 두 개 쓴 대가가 선형이라야
 * 세 번째 칸의 가치를 계산할 수 있다).
 */
export function applyItems(stats, itemIds, itemsData) {
  const out = { ...stats }
  if (itemIds.length === 0) return out

  let atkPct = 0
  let attackSpeedPct = 0

  for (const e of effectsOf(itemIds, itemsData)) {
    for (const k of FLAT) if (e[k]) out[k] += e[k]
    if (e.atkPct) atkPct += e.atkPct
    if (e.attackSpeedPct) attackSpeedPct += e.attackSpeedPct
    if (e.critChancePct) out.critChance += e.critChancePct / 100
  }

  if (atkPct !== 0) out.atk = Math.floor(out.atk * (1 + atkPct / 100))
  if (attackSpeedPct !== 0) {
    out.attackInterval = Math.max(6, Math.floor(out.attackInterval / (1 + attackSpeedPct / 100)))
  }

  for (const k of FLAT) out[k] = Math.floor(out[k])
  return out
}

// 개수만큼 더하는 것과 큰 값을 쓰는 것.
// 배수(piercePct)와 반경(auraRadius)을 더하면 아이템 두 개로 판을 덮는다.
const SPECIAL_SUM = ['pierceCount', 'thornsPct', 'lifestealPct', 'auraAtkPct']
const SPECIAL_MAX = ['piercePct', 'auraRadius']

/** 스탯 표에 안 들어가는 아이템 효과. combat.js 가 traits 묶음과 합쳐 쓴다. */
export function itemSpecials(itemIds, itemsData) {
  const out = {
    pierceCount: 0,
    piercePct: 0,
    thornsPct: 0,
    lifestealPct: 0,
    auraAtkPct: 0,
    auraRadius: 0,
  }
  for (const e of effectsOf(itemIds, itemsData)) {
    for (const k of SPECIAL_SUM) if (e[k]) out[k] += e[k]
    for (const k of SPECIAL_MAX) if (e[k]) out[k] = Math.max(out[k], e[k])
  }
  return out
}

/**
 * 시너지 묶음과 아이템 묶음을 하나로 만든다.
 *
 * a 의 키를 하나도 잃지 않는다 — 전투 루프가 traitSpecials 의 모든 키를
 * 읽으므로, 여기서 빠지면 그 효과가 조용히 사라진다.
 */
export function mergeSpecials(a, b) {
  const out = { ...a }
  for (const k of SPECIAL_SUM) out[k] = (out[k] ?? 0) + (b[k] ?? 0)
  for (const k of SPECIAL_MAX) out[k] = Math.max(out[k] ?? 0, b[k] ?? 0)
  return out
}
