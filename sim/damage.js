// 피해 공식. defK 는 combat.json > damage.defK.
// dmg = atk × defK / (defK + def) — 방어력이 defK 와 같으면 정확히 절반이 된다.

export function physicalDamage(atk, def, defK) {
  return Math.max(1, Math.floor((atk * defK) / (defK + Math.max(0, def))))
}

export function magicDamage(power, mr, defK) {
  return Math.max(1, Math.floor((power * defK) / (defK + Math.max(0, mr))))
}

export function applyDamage(victim, amount) {
  if (!victim.alive) return { dealt: 0, died: false }

  let remaining = amount
  if (victim.shield > 0) {
    const absorbed = Math.min(victim.shield, remaining)
    victim.shield -= absorbed
    remaining -= absorbed
  }

  victim.hp -= remaining
  let died = false
  if (victim.hp <= 0) {
    victim.hp = 0
    victim.alive = false
    died = true
  }

  return { dealt: amount, died }
}
