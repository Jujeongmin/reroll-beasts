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

/**
 * 스탯 표에 안 들어가는 시너지 효과를 한 덩어리로 모은다.
 *
 * 왜 따로 두나: applyTraitEffects 가 돌려주는 건 "숫자 스탯"이고, 여기 있는
 * 것들은 전투 중 **행동**을 바꾼다 (도약 · 관통 · 부활 …). 같은 객체에 섞으면
 * effectiveStat 이 모르는 키를 스탯으로 읽어 조용히 NaN 을 만든다.
 *
 * 합치는 규칙:
 *   퍼센트·확률 — 더한다 (여러 시너지가 겹칠 수 있다)
 *   반경·횟수   — 큰 값을 쓴다 (더하면 3단계 하나로 판을 덮는다)
 *   지속 틱     — 큰 값을 쓴다 (짧은 쪽이 긴 쪽을 깎으면 안 된다)
 *   깃발        — 하나라도 켜져 있으면 켠다
 */
export function traitSpecials(effects) {
  const out = {
    critDamagePct: 0,
    critTakenPct: 0,
    manaCostPct: 0,
    manaOnKill: 0,
    aoeRadius: 0,
    splashOnSkillPct: 0,
    doubleStrikeChance: 0,
    dodgePct: 0,
    dodgeTicks: 0,
    regenPctPer5s: 0,
    shieldPctMaxHp: 0,
    shieldTicks: 0,
    deathBlastPct: 0,
    deathBlastRadius: 0,
    pierceCount: 0,
    piercePct: 0,
    leapToBackline: false,
    reviveHpPct: 0,
    revivePerRound: 0,
  }
  const SUM = [
    'critDamagePct',
    'critTakenPct',
    'manaCostPct',
    'manaOnKill',
    'splashOnSkillPct',
    'doubleStrikeChance',
    'dodgePct',
    'regenPctPer5s',
    'shieldPctMaxHp',
    'deathBlastPct',
  ]
  const MAX = ['aoeRadius', 'dodgeTicks', 'shieldTicks', 'deathBlastRadius', 'pierceCount', 'piercePct']

  for (const e of effects) {
    if (!e) continue
    for (const k of SUM) if (e[k]) out[k] += e[k]
    for (const k of MAX) if (e[k]) out[k] = Math.max(out[k], e[k])
    if (e.leapToBackline) out.leapToBackline = true
    if (e.revive) {
      out.reviveHpPct = Math.max(out.reviveHpPct, e.revive.hpPct ?? 0)
      out.revivePerRound = Math.max(out.revivePerRound, e.revive.perRound ?? 0)
    }
  }
  return out
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
