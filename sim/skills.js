// 스킬 실행기. 타입은 single · aoe · buff · summon 4가지뿐이다.
// 유닛 26종의 스킬은 전부 이 4개 실행기 + params 조합으로 표현된다.
// 새 스킬을 추가할 때 실행기를 늘리지 않는다. params 를 늘린다.

import { magicDamage, applyDamage } from './damage.js'

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
  for (let i = 0; i < hits; i++) {
    if (!target.alive) break
    const raw = Math.floor((caster.stats.power * (p.dmgPct ?? 100)) / 100)
    const mr = p.defIgnorePct ? Math.floor(target.stats.mr * (1 - p.defIgnorePct / 100)) : target.stats.mr
    const dmg = magicDamage(raw, mr, defK)
    const { dealt } = applyDamage(target, dmg)
    total += dealt
  }

  if (p.lifestealPct) {
    caster.hp = Math.min(caster.maxHp, caster.hp + Math.floor((total * p.lifestealPct) / 100))
  }

  return [{ tick: ctx.tick, type: 'skill_single', casterId: caster.id, targetIds: [target.id], amount: total }]
}

function castAoe(ctx, caster) {
  const target = caster.targetId == null ? null : findById(ctx.all, caster.targetId)
  if (!target) return []

  const p = caster.skill.params
  const defK = ctx.combatCfg.damage.defK
  const victims = enemiesWithin(ctx, target.tile, p.radius ?? 0, caster.team)
  if (victims.length === 0) return []

  const raw = Math.floor((caster.stats.power * (p.dmgPct ?? 100)) / 100)

  let total = 0
  const ids = []
  for (const v of victims) {
    if (raw > 0) {
      const { dealt } = applyDamage(v, magicDamage(raw, v.stats.mr, defK))
      total += dealt
    }
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

  return [{ tick: ctx.tick, type: 'skill_aoe', casterId: caster.id, targetIds: ids, amount: total }]
}

function castBuff(ctx, caster) {
  const p = caster.skill.params
  const receivers =
    p.target === 'allies'
      ? ctx.all.filter((u) => u.alive && u.team === caster.team).sort((a, b) => a.id - b.id)
      : [caster]

  const ids = []
  for (const r of receivers) {
    if (p.amountPctMaxHp) {
      r.shield += Math.floor((r.maxHp * p.amountPctMaxHp) / 100)
    }
    if (p.amount) {
      r.buffs.push({ stat: p.stat, amount: p.amount, expiresAt: ctx.tick + p.durationTicks })
    }
    ids.push(r.id)
  }

  return [{ tick: ctx.tick, type: 'skill_buff', casterId: caster.id, targetIds: ids }]
}

function castSummon(ctx, caster) {
  // onDeath 트리거는 사망 처리 시점에 combat.js 가 부른다. 시전 시점에는 아무것도 하지 않는다.
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
  return exec(ctx, caster)
}
