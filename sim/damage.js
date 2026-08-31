// 피해 공식. defK 는 combat.json > damage.defK.
// dmg = atk × defK / (defK + def) — 방어력이 defK 와 같으면 정확히 절반이 된다.

export function physicalDamage(atk, def, defK) {
  return Math.max(1, Math.floor((atk * defK) / (defK + Math.max(0, def))))
}

export function magicDamage(power, mr, defK) {
  return Math.max(1, Math.floor((power * defK) / (defK + Math.max(0, mr))))
}

// dealt 는 요청된 피해량이 아니라 **실제로 흡수된 양**이다.
// 흡혈과 마나 획득이 이 값을 곱하므로, 과잉 피해를 그대로 돌려주면
// HP 50 남은 적을 1000 으로 마무리한 흡혈 유닛이 500 을 회복한다.
// 보호막이 막은 몫은 흡수에 포함한다 — 실제로 들어간 피해다.
export function applyDamage(victim, amount) {
  if (!victim.alive) return { dealt: 0, died: false }

  let remaining = amount
  let absorbed = 0

  if (victim.shield > 0) {
    const byShield = Math.min(victim.shield, remaining)
    victim.shield -= byShield
    remaining -= byShield
    absorbed += byShield
  }

  const byHp = Math.min(victim.hp, remaining)
  victim.hp -= byHp
  absorbed += byHp

  let died = false
  if (victim.hp <= 0) {
    victim.hp = 0
    victim.alive = false
    died = true
  }

  return { dealt: absorbed, died }
}
