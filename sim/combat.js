// 전투 메인 루프. 순수 함수다 — DOM·PixiJS·fetch 를 쓰지 않는다.
// (보드A, 보드B, 시드) → 전투 로그. 같은 입력이면 항상 같은 로그가 나온다.
// view/board 는 이 로그를 재생만 하고, 서버는 같은 코드로 결과를 검증한다.

import { buildBoard } from './hex.js'
import { createRng } from './rng.js'
import { unitById } from './data.js'
import { activeTraits } from './traits.js'
import { resolveStats, applyTraitEffects } from './stats.js'
import { findTarget } from './targeting.js'
import { stepToward } from './movement.js'
import { physicalDamage, applyDamage } from './damage.js'
import { castSkill } from './skills.js'

// 자기 진영 0..21 → 전장 타일 인덱스.
// A 팀은 아래 3행(3,4,5), B 팀은 위 3행을 좌우 반전 없이 그대로 쓴다.
function toFieldTile(board, localIndex, team, boardCfg) {
  const rows = team === 'A' ? boardCfg.allyRows : boardCfg.enemyRows
  let remain = localIndex
  for (const row of rows) {
    const width = boardCfg.rows[row]
    if (remain < width) return board.indexOf(row, remain)
    remain -= width
  }
  return -1
}

function buildCombatants(entries, team, data, board) {
  const traitMap = activeTraits(
    entries.map((e) => {
      const u = unitById(data.units, e.unitId)
      return { unitId: u.id, origin: u.origin, class: u.class }
    }),
    data.traits,
  )

  return entries.map((e, i) => {
    const unit = unitById(data.units, e.unitId)
    if (!unit) throw new Error(`없는 유닛 id: ${e.unitId}`)

    const effects = []
    for (const key of [unit.origin, unit.class]) {
      const t = traitMap.get(key)
      if (t && t.effect) effects.push(t.effect)
    }

    const base = resolveStats(unit, e.star, data.combat)
    const stats = applyTraitEffects(base, effects)

    return {
      localIndex: i,
      team,
      unitId: unit.id,
      star: e.star,
      skill: unit.skill,
      tile: toFieldTile(board, e.tile, team, data.combat.board),
      hp: stats.hp,
      maxHp: stats.hp,
      shield: 0,
      mana: stats.manaStart,
      alive: true,
      deathLogged: false,
      buffs: [],
      targetId: null,
      attackCooldown: 0,
      stats,
    }
  })
}

function effectiveStat(c, key) {
  let value = c.stats[key]
  let pct = 0
  for (const b of c.buffs) {
    if (b.stat === key) value += b.amount
    if (b.stat === `${key}Pct`) pct += b.amount
  }
  if (pct !== 0) value = Math.floor(value * (1 + pct / 100))
  return value
}

function damageTakenMultiplier(c) {
  let pct = 0
  for (const b of c.buffs) if (b.stat === 'damageTakenPct') pct += b.amount
  return 1 + pct / 100
}

export function simulate({ boardA, boardB, seed, data }) {
  const cfg = data.combat
  const board = buildBoard(cfg.board)
  const rng = createRng(seed)
  const log = []

  const teamA = buildCombatants(boardA, 'A', data, board)
  const teamB = buildCombatants(boardB, 'B', data, board)

  // id 는 팀 A 먼저, 각 팀 안에서는 지정 순서대로 부여한다.
  // 이 id 가 모든 타이브레이크의 기준이므로 결정론의 뿌리다.
  const all = [...teamA, ...teamB]
  all.sort((x, y) => (x.team === y.team ? x.localIndex - y.localIndex : x.team < y.team ? -1 : 1))
  all.forEach((c, i) => {
    c.id = i
  })

  for (const c of all) {
    log.push({ tick: 0, type: 'spawn', casterId: c.id, unitId: c.unitId, team: c.team, tile: c.tile, star: c.star })
  }

  const aliveCount = (team) => all.filter((c) => c.alive && c.team === team).length

  let tick = 0
  const finish = (winner) => {
    log.push({ tick, type: 'end', winner })
    return {
      winner,
      ticks: tick,
      survivorsA: aliveCount('A'),
      survivorsB: aliveCount('B'),
      log,
    }
  }

  if (aliveCount('A') === 0 && aliveCount('B') === 0) return finish('draw')
  if (aliveCount('B') === 0) return finish('A')
  if (aliveCount('A') === 0) return finish('B')

  for (tick = 1; tick <= cfg.maxTicks; tick++) {
    const occupied = new Map()
    for (const c of all) if (c.alive) occupied.set(c.tile, c.id)

    // id 오름차순 고정 순회. 배열 순서에 의존하지 않는다.
    for (const c of all) {
      if (!c.alive) continue

      // 만료된 버프 제거
      c.buffs = c.buffs.filter((b) => b.expiresAt > tick)

      // 지속 피해
      for (const b of c.buffs) {
        if (b.stat === 'dot' && tick % cfg.tickRate === 0) {
          applyDamage(c, b.amount)
        }
      }
      if (!c.alive) {
        if (!c.deathLogged) {
          c.deathLogged = true
          log.push({ tick, type: 'death', casterId: c.id })
        }
        continue
      }

      const target = findTarget(board, c, all)
      if (!target) continue
      c.targetId = target.id

      const dist = board.dist[c.tile][target.tile]
      const range = effectiveStat(c, 'range')

      if (dist > range) {
        const next = stepToward(board, c, target, occupied)
        if (next !== null) {
          occupied.delete(c.tile)
          c.tile = next
          occupied.set(next, c.id)
          log.push({ tick, type: 'move', casterId: c.id, tile: next })
        }
        continue
      }

      if (c.mana >= cfg.mana.full) {
        c.mana = 0
        const events = castSkill({ board, all, occupied, rng, combatCfg: cfg, tick }, c)
        for (const e of events) log.push(e)
        for (const other of all) {
          if (!other.alive && !other.deathLogged) {
            other.deathLogged = true
            log.push({ tick, type: 'death', casterId: other.id })
          }
        }
        continue
      }

      if (c.attackCooldown > 0) {
        c.attackCooldown--
        continue
      }

      const atk = effectiveStat(c, 'atk')
      const isCrit = rng.int(10000) < Math.floor(c.stats.critChance * 10000)
      let dmg = physicalDamage(atk, effectiveStat(target, 'def'), cfg.damage.defK)
      if (isCrit) dmg = Math.floor(dmg * cfg.damage.critMultiplier)
      dmg = Math.floor(dmg * damageTakenMultiplier(target))

      const { died } = applyDamage(target, dmg)
      c.attackCooldown = effectiveStat(c, 'attackInterval')
      c.mana = Math.min(cfg.mana.full, c.mana + cfg.mana.perAttack)
      target.mana = Math.min(
        cfg.mana.full,
        target.mana + Math.min(cfg.mana.onHitMax, Math.floor((dmg * cfg.mana.onHitPercent) / 100)),
      )

      log.push({ tick, type: 'attack', casterId: c.id, targetIds: [target.id], amount: dmg, crit: isCrit })

      if (died) {
        target.deathLogged = true
        occupied.delete(target.tile)
        log.push({ tick, type: 'death', casterId: target.id })
      }
    }

    if (aliveCount('A') === 0 && aliveCount('B') === 0) return finish('draw')
    if (aliveCount('B') === 0) return finish('A')
    if (aliveCount('A') === 0) return finish('B')
  }

  tick = cfg.maxTicks
  const a = aliveCount('A')
  const b = aliveCount('B')
  return finish(a === b ? 'draw' : a > b ? 'A' : 'B')
}
