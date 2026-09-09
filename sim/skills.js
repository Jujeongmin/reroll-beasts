// 스킬 실행기. 타입은 single · aoe · buff · summon 4가지뿐이다.
// 유닛 26종의 스킬은 전부 이 4개 실행기 + params 조합으로 표현된다.
// 새 스킬을 추가할 때 실행기를 늘리지 않는다. params 를 늘린다.

import { magicDamage, applyDamage } from './damage.js'
import { backlineTile, pullTile } from './movement.js'

function findById(all, id) {
  return all.find((u) => u.id === id)
}

function enemiesWithin(ctx, centerTile, radius, team) {
  return ctx.all
    .filter((u) => u.alive && u.team !== team && ctx.board.dist[centerTile][u.tile] <= radius)
    .sort((a, b) => a.id - b.id)
}

function castSingle(ctx, caster) {
  const target = caster.targetId == null ? null : findById(ctx.all, caster.targetId)
  if (!target || !target.alive) return []

  const p = caster.skill.params
  const hits = p.hits ?? 1
  const defK = ctx.combatCfg.damage.defK

  let total = 0
  let toShield = 0
  let toHp = 0
  for (let i = 0; i < hits; i++) {
    if (!target.alive) break
    const raw = Math.floor((caster.stats.power * (p.dmgPct ?? 100)) / 100)
    const baseMr = ctx.effectiveStat(target, 'mr')
    const mr = p.defIgnorePct ? Math.floor(baseMr * (1 - p.defIgnorePct / 100)) : baseMr
    const mult = ctx.damageTakenMultiplier(target)
    const dmg = Math.floor(magicDamage(raw, mr, defK) * mult)
    const hit = applyDamage(target, dmg)
    total += hit.dealt
    toShield += hit.toShield
    toHp += hit.toHp
  }

  const events = [
    { tick: ctx.tick, type: 'skill_single', casterId: caster.id, targetIds: [target.id], amount: total, toShield, toHp },
  ]

  // 이 시전으로 죽었나. 아래 처치 효과들이 전부 이 한 값을 본다 — 각자
  // target.alive 를 다시 보면 그 사이에 낀 효과(관통·끌어당김)가 값을 바꾼다.
  const killed = !target.alive

  // ── 관통 ──
  // 사수 시너지(평타 관통)와 **같은 규칙**을 쓴다: 대상보다 나에게서 먼 적을
  // 가까운 순으로, 같으면 id 순. 전에는 이 params 를 아무도 안 읽어서 카드에만
  // "뒤쪽 2명에게 60% 관통" 이 뜨고 판에서는 아무 일도 안 일어났다.
  const pierceCount = p.pierceCount ?? 0
  if (pierceCount > 0 && total > 0) {
    const dist = ctx.board.dist[caster.tile]
    const behind = ctx.all
      .filter(
        (v) =>
          v.alive &&
          v.team !== caster.team &&
          v.id !== target.id &&
          dist[v.tile] > dist[target.tile],
      )
      .sort((x, y) => dist[x.tile] - dist[y.tile] || x.id - y.id)
      .slice(0, pierceCount)
    if (behind.length > 0) {
      const raw = Math.floor((caster.stats.power * (p.dmgPct ?? 100)) / 100)
      const scale = p.piercePct ?? 100
      const ids = []
      const hits = []
      let pierced = 0
      for (const v of behind) {
        const mult = ctx.damageTakenMultiplier(v)
        const full = magicDamage(raw, ctx.effectiveStat(v, 'mr'), defK) * mult
        const hit = applyDamage(v, Math.floor((full * scale) / 100))
        pierced += hit.dealt
        hits.push({ id: v.id, toShield: hit.toShield, toHp: hit.toHp })
        ids.push(v.id)
      }
      events.push({
        tick: ctx.tick,
        type: 'skill_pierce',
        casterId: caster.id,
        targetIds: ids,
        amount: pierced,
        hits,
      })
    }
  }

  // ── 기절 ──
  // 스탯 버프와 같은 통에 담는다. effectiveStat 은 모르는 stat 을 그냥
  // 지나치므로 수치에는 영향이 없고, 만료도 남들과 같은 한 줄이 처리한다.
  if (p.stunTicks > 0 && target.alive) {
    target.buffs.push({
      stat: 'stun',
      amount: 0,
      expiresAt: ctx.tick + p.stunTicks,
      sourceId: caster.id,
    })
    events.push({
      tick: ctx.tick,
      type: 'stun',
      casterId: caster.id,
      targetIds: [target.id],
      durationTicks: p.stunTicks,
    })
  }

  // ── 끌어당김 ──
  // 내 옆 빈 칸으로 당긴다. 이동 쿨다운을 다시 채우는 이유: 안 채우면 당겨진
  // 말이 다음 틱에 곧장 걸어 나가 당긴 값이 사라진다.
  if (p.pull && target.alive) {
    const spot = pullTile(ctx.board, caster, target, ctx.occupied)
    if (spot >= 0) {
      ctx.occupied.delete(target.tile)
      target.tile = spot
      ctx.occupied.set(spot, target.id)
      target.moveCooldown = ctx.combatCfg.moveInterval
      events.push({ tick: ctx.tick, type: 'move', casterId: target.id, tile: spot })
    }
  }

  // ── 처치 보상 ──
  // 마나 충전: 다음 틱에 곧장 다시 쓴다. 연쇄가 무한하지 않은 이유는 **매번
  // 죽여야** 이어지기 때문이다 — 적 수가 상한이다.
  if (killed && p.manaRefillOnKill) caster.mana = ctx.combatCfg.mana.full
  // 재도약: 죽이면 다시 뒷줄로 뛴다. 자리 고르는 규칙은 전투 시작의 암살자
  // 도약과 같은 함수다.
  if (killed && p.releapOnKill && caster.alive) {
    const foes = ctx.all.filter((o) => o.alive && o.team !== caster.team)
    const spot = backlineTile(ctx.board, caster, foes, ctx.occupied)
    if (spot >= 0) {
      ctx.occupied.delete(caster.tile)
      caster.tile = spot
      ctx.occupied.set(spot, caster.id)
      events.push({ tick: ctx.tick, type: 'leap', casterId: caster.id, tile: spot })
    }
  }

  // 버섯 4단계: 단일 스킬이 옆칸으로 튄다. 원래 대상은 이미 맞았으므로 뺀다.
  const splashPct = caster.traits?.splashOnSkillPct ?? 0
  if (splashPct > 0 && total > 0) {
    const near = enemiesWithin(ctx, target.tile, 1, caster.team).filter((v) => v.id !== target.id)
    const ids = []
    const hits = []
    let splashTotal = 0
    for (const v of near) {
      // 튄 피해는 **실제로 들어간 양** 기준이다. 요청값 기준으로 하면
      // 보호막이 막은 몫까지 옆으로 퍼져 원본보다 세진다.
      const hit = applyDamage(v, Math.floor((total * splashPct) / 100))
      splashTotal += hit.dealt
      hits.push({ id: v.id, toShield: hit.toShield, toHp: hit.toHp })
      ids.push(v.id)
    }
    if (ids.length > 0) {
      events.push({
        tick: ctx.tick,
        type: 'skill_splash',
        casterId: caster.id,
        targetIds: ids,
        amount: splashTotal,
        hits,
      })
    }
  }

  if (p.lifestealPct) {
    // 실제로 회복된 양을 로그에 남긴다. 상한 전 값을 남기면 재생기가
    // maxHp 를 넘겨 복원해 시뮬과 어긋난다.
    const before = caster.hp
    caster.hp = Math.min(caster.maxHp, caster.hp + Math.floor((total * p.lifestealPct) / 100))
    const healed = caster.hp - before
    if (healed > 0) {
      events.push({ tick: ctx.tick, type: 'heal', casterId: caster.id, targetIds: [caster.id], amount: healed })
    }
  }

  return events
}

function castAoe(ctx, caster) {
  const target = caster.targetId == null ? null : findById(ctx.all, caster.targetId)
  if (!target) return []

  const p = caster.skill.params
  const defK = ctx.combatCfg.damage.defK
  // 마법사 5단계: 스킬 범위가 넓어진다.
  const radius = (p.radius ?? 0) + (caster.traits?.aoeRadius ?? 0)
  const victims = enemiesWithin(ctx, target.tile, radius, caster.team)
  if (victims.length === 0) return []

  const raw = Math.floor((caster.stats.power * (p.dmgPct ?? 100)) / 100)

  let total = 0
  const ids = []
  // 합계만 남기면 대상별 피해를 되찾을 수 없다. victims 는 이미 id 오름차순이라
  // hits 도 같은 순서 — targetIds 와 인덱스가 맞는다.
  const hits = []
  for (const v of victims) {
    let toShield = 0
    let toHp = 0
    if (raw > 0) {
      const vMr = ctx.effectiveStat(v, 'mr')
      const vMult = ctx.damageTakenMultiplier(v)
      const hit = applyDamage(v, Math.floor(magicDamage(raw, vMr, defK) * vMult))
      total += hit.dealt
      toShield = hit.toShield
      toHp = hit.toHp
    }
    hits.push({ id: v.id, toShield, toHp })
    if (p.tickDamagePct) {
      v.buffs.push({
        stat: 'dot',
        amount: Math.floor((caster.stats.power * p.tickDamagePct) / 100),
        expiresAt: ctx.tick + p.durationTicks,
        sourceId: caster.id,
      })
    }
    ids.push(v.id)
  }

  return [{ tick: ctx.tick, type: 'skill_aoe', casterId: caster.id, targetIds: ids, amount: total, hits }]
}

function castBuff(ctx, caster) {
  const p = caster.skill.params
  const receivers =
    p.target === 'allies'
      ? ctx.all.filter((u) => u.alive && u.team === caster.team).sort((a, b) => a.id - b.id)
      : [caster]

  const ids = []
  // 보호막은 대상별 maxHp 의 백분율이라 값이 제각각이다. 대상마다 따로 남긴다.
  // 로그에 효과를 안 실으면 재생기가 hk1_shield·mk2_bulwark 를 아예 못 본다.
  const grants = []
  for (const r of receivers) {
    let shieldGranted = 0
    if (p.amountPctMaxHp) {
      shieldGranted = Math.floor((r.maxHp * p.amountPctMaxHp) / 100)
      r.shield += shieldGranted
    }
    grants.push({ id: r.id, shieldGranted })
    if (p.amount && p.stat !== 'shieldAndDef') {
      r.buffs.push({ stat: p.stat, amount: p.amount, expiresAt: ctx.tick + p.durationTicks })
    }
    // shieldAndDef 는 보호막과 방어력 두 몫이다. 위 amountPctMaxHp 가 보호막을,
    // 여기서 amount 를 방어력 버프로 나눠 붙인다. 한 덩어리로 두면
    // effectiveStat 이 'shieldAndDef' 를 모르는 키로 보고 통째로 버린다.
    if (p.stat === 'shieldAndDef' && p.amount) {
      r.buffs.push({ stat: 'def', amount: p.amount, expiresAt: ctx.tick + p.durationTicks })
    }
    ids.push(r.id)
  }

  return [
    {
      tick: ctx.tick,
      type: 'skill_buff',
      casterId: caster.id,
      targetIds: ids,
      stat: p.stat ?? null,
      amount: p.amount ?? 0,
      durationTicks: p.durationTicks ?? 0,
      grants,
    },
  ]
}

function castSummon(ctx, caster) {
  // 1단계에는 사망 시점 훅이 없다. onDeath 소환은 2단계 몫이다 —
  // 전투 중 유닛 생성은 id 배정·타일 선택·결정론 보장이 새로 필요하다.
  // 지금은 아무 일도 하지 않는다.
  if (caster.skill.params.trigger === 'onDeath') return []
  return [{ tick: ctx.tick, type: 'skill_summon', casterId: caster.id, targetIds: [], unitId: caster.skill.params.unitId }]
}

const EXECUTORS = {
  single: castSingle,
  aoe: castAoe,
  buff: castBuff,
  summon: castSummon,
}

export function castSkill(ctx, caster) {
  const exec = EXECUTORS[caster.skill.type]
  if (!exec) throw new Error(`알 수 없는 스킬 타입: ${caster.skill.type}`)
  // 폴백을 두면 호출자가 ctx 키를 빠뜨렸을 때 조용히 버프·피해감소를 무시한
  // 옛 동작으로 되돌아간다. 틀리게 통과하느니 크게 터지는 편이 낫다.
  if (!ctx.effectiveStat || !ctx.damageTakenMultiplier) {
    throw new Error('castSkill ctx 에 effectiveStat 과 damageTakenMultiplier 가 필요하다')
  }
  return exec(ctx, caster)
}
