// 시너지 효과 문구. units.json 과 같은 이유로 traits.json 에도 설명문이 없다 —
// 수치만 있다. 설명을 따로 적어 두면 밸런스를 만질 때 두 곳을 맞춰야 하고
// 언젠가 반드시 어긋난다. 여기서 수치를 읽어 문장을 만든다.

const TICK_RATE = 30
const sec = (t) => (t / TICK_RATE).toFixed(1).replace(/\.0$/, '')
const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

/**
 * 효과 키 → 문장 조각.
 *
 * 여기 없는 키는 **그냥 빠진다**. 그래서 키를 새로 쓰면 화면에서만 조용히
 * 사라지는데, 그걸 막으려고 tests 가 모든 시너지의 모든 단계를 훑는다.
 */
const RENDER = {
  hp: (v) => `체력 ${signed(v)}`,
  def: (v) => `방어력 ${signed(v)}`,
  power: (v) => `주문력 ${signed(v)}`,
  atkPct: (v) => `공격력 ${signed(v)}%`,
  attackSpeedPct: (v) => `공격 속도 ${signed(v)}%`,
  range: (v) => `사거리 ${signed(v)}`,
  manaStart: (v) => `시작 마나 ${signed(v)}`,
  manaOnKill: (v) => `처치 시 마나 ${signed(v)}`,
  manaCostPct: (v) => `마나 소모 ${signed(v)}%`,
  critChancePct: (v) => `치명타 확률 ${signed(v)}%`,
  critDamagePct: (v) => `치명타 피해 ${signed(v)}%`,
  critTakenPct: (v) => `받는 치명타 피해 ${signed(v)}%`,
  dodgePct: (v, e) =>
    `회피 ${v}%${e.dodgeTicks ? ` (${sec(e.dodgeTicks)}초)` : ''}`,
  regenPctPer5s: (v) => `5초마다 최대 체력의 ${v}% 회복`,
  shieldPctMaxHp: (v, e) =>
    `최대 체력의 ${v}% 보호막${e.shieldTicks ? ` (${sec(e.shieldTicks)}초)` : ''}`,
  doubleStrikeChance: (v) => `${v}% 확률로 두 번 때림`,
  splashOnSkillPct: (v) => `스킬이 주변에 ${v}% 만큼 튐`,
  deathBlastPct: (v, e) =>
    `죽을 때 반경 ${e.deathBlastRadius ?? 1} 에 주문력의 ${v}% 폭발`,
  pierceCount: (v, e) => `뒤쪽 ${v}명에게 ${e.piercePct ?? 100}% 관통`,
  aoeRadius: (v) => `스킬 범위 ${signed(v)}`,
  leapToBackline: () => '전투 시작 시 상대 뒷줄로 도약',
  revive: (v) => `죽으면 체력 ${v}% 로 한 번 부활`,
  allyDef: (v) => `아군 전체 방어력 ${signed(v)}`,
}

// 다른 키의 꼬리표라 따로 문장을 만들지 않는다
const FOLLOWER = new Set(['dodgeTicks', 'shieldTicks', 'deathBlastRadius', 'piercePct'])
// 효과가 아니라 적용 대상 표기다
const META = new Set(['scope'])

/** 효과 하나 → 사람이 읽는 문장. */
export function effectText(effect) {
  const parts = []
  for (const [key, value] of Object.entries(effect)) {
    if (META.has(key) || FOLLOWER.has(key)) continue
    const render = RENDER[key]
    if (!render) continue
    parts.push(render(value, effect))
  }
  return parts.join(', ')
}

/** 문장을 못 만든 키. 테스트가 이걸로 누락을 잡는다. */
export function unknownKeys(effect) {
  return Object.keys(effect).filter((k) => !META.has(k) && !FOLLOWER.has(k) && !RENDER[k])
}

export function traitById(traitsData, id) {
  return [...traitsData.origins, ...traitsData.classes].find((t) => t.id === id) ?? null
}

/**
 * 화면에 뿌릴 시너지 한 덩어리.
 *
 * `owned` 는 내가 갖고 있는 유닛 id 집합이다. 안 가진 유닛은 회색으로 그려야
 * "뭘 더 구하면 되는가" 가 보인다.
 */
export function traitDetail(id, count, data, owned = new Set()) {
  const def = traitById(data.traits, id)
  if (!def) throw new Error(`없는 시너지: ${id}`)

  const steps = def.steps.map((need, i) => ({
    need,
    text: effectText(def.effects[i]),
    active: count >= need,
  }))

  const members = data.units.units
    .filter((u) => u.origin === id || u.class === id)
    .sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id))
    .map((u) => ({ id: u.id, name: u.name.ko, tier: u.tier, owned: owned.has(u.id) }))

  return { id, name: def.name.ko, count, steps, members }
}
