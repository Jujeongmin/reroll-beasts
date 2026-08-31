// 버프가 반영된 스탯과 피해 감소 배율.
// combat.js 와 skills.js 가 둘 다 써야 하는데 combat.js 가 skills.js 를
// import 하므로, 여기 따로 두어 순환 import 를 피한다.

export function effectiveStat(c, key) {
  let value = c.stats[key]
  let pct = 0
  for (const b of c.buffs) {
    if (b.stat === key) value += b.amount
    if (b.stat === `${key}Pct`) pct += b.amount
  }
  if (pct !== 0) value = Math.floor(value * (1 + pct / 100))
  return value
}

export function damageTakenMultiplier(c) {
  let pct = 0
  for (const b of c.buffs) if (b.stat === 'damageTakenPct') pct += b.amount
  return 1 + pct / 100
}
