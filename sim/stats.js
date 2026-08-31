// 스탯 해석. 단일소스는 combat.json 의 tierBase × classModifier × starMultiplier 다.
// units.json 에는 스탯을 적지 않는다.
// 지속 상태로 쓰일 값은 전부 정수로 내린다 (critChance 만 0~1 실수).

const STAR_SCALED = ['hp', 'atk', 'power']

export function resolveStats(unit, star, combatCfg) {
  const base = combatCfg.tierBase[String(unit.tier)]
  const mod = combatCfg.classModifier[unit.class]
  const starMult = combatCfg.starMultiplier[star - 1]

  const scale = (key) => {
    const raw = Math.floor(base[key] * mod[key])
    return STAR_SCALED.includes(key) ? Math.floor(raw * starMult) : raw
  }

  return {
    hp: scale('hp'),
    atk: scale('atk'),
    def: scale('def'),
    mr: scale('mr'),
    power: scale('power'),
    attackInterval: Math.max(6, Math.floor(base.attackInterval * mod.attackInterval)),
    range: mod.range,
    critChance: mod.critChance,
    manaStart: base.manaStart,
  }
}

export function applyTraitEffects(base, effects) {
  const out = { ...base }

  let atkPct = 0
  let attackSpeedPct = 0

  for (const e of effects) {
    if (!e) continue
    if (e.hp) out.hp += e.hp
    if (e.def) out.def += e.def
    if (e.allyDef) out.def += e.allyDef
    if (e.mr) out.mr += e.mr
    if (e.power) out.power += e.power
    if (e.range) out.range += e.range
    if (e.manaStart) out.manaStart += e.manaStart
    if (e.atkPct) atkPct += e.atkPct
    if (e.attackSpeedPct) attackSpeedPct += e.attackSpeedPct
    if (e.critChancePct) out.critChance += e.critChancePct / 100
  }

  if (atkPct !== 0) out.atk = Math.floor(out.atk * (1 + atkPct / 100))
  if (attackSpeedPct !== 0) {
    out.attackInterval = Math.max(6, Math.floor(out.attackInterval / (1 + attackSpeedPct / 100)))
  }

  out.hp = Math.floor(out.hp)
  out.def = Math.floor(out.def)
  out.mr = Math.floor(out.mr)
  out.power = Math.floor(out.power)
  out.manaStart = Math.floor(out.manaStart)

  return out
}
