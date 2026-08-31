// 스탯 해석. 단일소스는 combat.json 의 tierBase × classModifier × starMultiplier 다.
// units.json 에는 스탯을 적지 않는다.
// 지속 상태로 쓰일 값은 전부 정수로 내린다 (critChance 만 0~1 실수).

const STAR_SCALED = ['hp', 'atk', 'power']

export function resolveStats(unit, star, combatCfg) {
  const base = combatCfg.tierBase[String(unit.tier)]
  const mod = combatCfg.classModifier[unit.class]
  const starMult = combatCfg.starMultiplier[star - 1]

  // 내림을 두 번 한다. 중복이 아니다 —
  // 1성 스탯을 먼저 정수로 확정하고, 성급은 그 확정된 정수를 곱한다.
  // 그래야 화면에 보이는 1성 스탯과 2·3성 값이 정확한 배수 관계가 된다.
  // 한 번에 내리면 floor(650×1.35×1.8)=1579 인데
  // 표시값 기준으로는 floor(877×1.8)=1578 이라 UI 와 시뮬이 어긋난다.
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
