// 시너지 효과 문구. units.json 과 같은 이유로 traits.json 에도 설명문이 없다 —
// 수치만 있다. 설명을 따로 적어 두면 밸런스를 만질 때 두 곳을 맞춰야 하고
// 언젠가 반드시 어긋난다. 여기서 수치를 읽어 문장을 만든다.

const TICK_RATE = 30
const sec = (t) => (t / TICK_RATE).toFixed(1).replace(/\.0$/, '')
import { t } from './i18n.js'

const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

/**
 * 효과 키 → 문장 조각.
 *
 * 여기 없는 키는 **그냥 빠진다**. 그래서 키를 새로 쓰면 화면에서만 조용히
 * 사라지는데, 그걸 막으려고 tests 가 모든 시너지의 모든 단계를 훑는다.
 */
const RENDER = {
  hp: (v) => t('trait.hp', { v: signed(v) }),
  def: (v) => t('trait.def', { v: signed(v) }),
  power: (v) => t('trait.ap', { v: signed(v) }),
  atkPct: (v) => t('trait.atk', { v: signed(v) }),
  attackSpeedPct: (v) => t('trait.as', { v: signed(v) }),
  range: (v) => t('trait.range', { v: signed(v) }),
  manaStart: (v) => t('trait.startMana', { v: signed(v) }),
  manaOnKill: (v) => t('trait.killMana', { v: signed(v) }),
  manaCostPct: (v) => t('trait.mana', { v: signed(v) }),
  critChancePct: (v) => t('trait.crit', { v: signed(v) }),
  critDamagePct: (v) => t('trait.critDmg', { v: signed(v) }),
  critTakenPct: (v) => t('trait.critTaken', { v: signed(v) }),
  dodgePct: (v, e) =>
    t('trait.dodge', { v }) + (e.dodgeTicks ? t('trait.forSec', { sec: sec(e.dodgeTicks) }) : ''),
  regenPctPer5s: (v) => t('trait.regen', { v }),
  shieldPctMaxHp: (v, e) =>
    t('skill.shield', { pct: v }) + (e.shieldTicks ? t('trait.forSec', { sec: sec(e.shieldTicks) }) : ''),
  doubleStrikeChance: (v) => t('trait.doubleHit', { v }),
  splashOnSkillPct: (v) => t('trait.splash', { v }),
  deathBlastPct: (v, e) => t('trait.deathBlast', { r: e.deathBlastRadius ?? 1, v }),
  pierceCount: (v, e) => t('trait.pierce', { v, pct: e.piercePct ?? 100 }),
  aoeRadius: (v) => t('trait.skillRadius', { v: signed(v) }),
  leapToBackline: () => t('trait.leap'),
  revive: (v) => t('trait.revive', { pct: v.hpPct, n: v.perRound }),
  allyDef: (v) => t('trait.teamDef', { v: signed(v) }),
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
