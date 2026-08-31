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
import { effectiveStat, damageTakenMultiplier } from './modifiers.js'

// 자기 진영 로컬 인덱스 → 전장 타일 인덱스.
export function toFieldTile(board, localIndex, team, boardCfg) {
  // 로컬 인덱스는 **양 팀 모두 앞줄부터** 센다.
  // A 의 앞줄은 allyRows 의 첫 행, B 의 앞줄은 enemyRows 의 마지막 행이다.
  //
  // 두 진영의 대응은 **180° 회전**이다 — 행을 뒤집고 열도 뒤집는다.
  // 반사(행만 뒤집기)로 하면 8행 균일 보드에서 오프셋이 번갈아 나올 때
  // 좌우가 어긋난다. 회전이라야 내 보드가 그대로 돌아 상대를 마주 본다
  // (TFT 가 쓰는 방식이다).
  //
  // 이 대응이 깨지면 A 로 저장한 스냅샷을 B 로 불러올 때 진형이 달라져
  // 비동기 PvP 가 성립하지 않는다.
  const rows = team === 'A' ? boardCfg.allyRows : [...boardCfg.enemyRows].reverse()
  let remain = localIndex
  for (const row of rows) {
    const width = boardCfg.rows[row]
    if (remain < width) {
      const col = team === 'A' ? remain : width - 1 - remain
      return board.indexOf(row, col)
    }
    remain -= width
  }
  return -1
}

// 제한 틱에 도달했을 때의 승패 규칙. 생존자가 많은 쪽이 이기고, 같으면 무승부다.
// 인라인 삼항으로 두면 이 분기에 도달하는 대진을 찾아야만 시험할 수 있어
// 밸런스 수치가 바뀔 때마다 테스트가 조용히 무의미해진다. 규칙만 떼어 고정한다.
export function resolveTimeout(survivorsA, survivorsB) {
  if (survivorsA === survivorsB) return 'draw'
  return survivorsA > survivorsB ? 'A' : 'B'
}

function buildCombatants(entries, team, data, board) {
  const combatCfg = data.combat

  // 존재 검사를 시너지 맵보다 먼저 돌린다. 뒤에 두면 아래 activeTraits 인자에서
  // u.origin 을 먼저 건드려 없는 id 가 정체불명의 TypeError 로 터진다.
  for (const e of entries) {
    if (!unitById(data.units, e.unitId)) throw new Error(`없는 유닛 id: ${e.unitId}`)
  }

  const traitMap = activeTraits(
    entries.map((e) => {
      const u = unitById(data.units, e.unitId)
      return { unitId: u.id, origin: u.origin, class: u.class }
    }),
    data.traits,
  )

  return entries.map((e, i) => {
    const unit = unitById(data.units, e.unitId)

    // 성급이 범위 밖이면 starMultiplier[star-1] 이 undefined 라 모든 스탯이 NaN 이 되고,
    // hp <= 0 이 영원히 거짓이 되어 아무도 죽지 않는 무적 전투가 조용히 만들어진다.
    // CLI 의 parseComp 만으로는 부족하다 — 서버가 남의 스냅샷을 재실행하는 경로가 본선이다.
    if (!Number.isInteger(e.star) || e.star < 1 || e.star > combatCfg.starMultiplier.length) {
      throw new Error(`성급이 1~${combatCfg.starMultiplier.length} 정수가 아니다: ${e.unitId} star ${e.star}`)
    }

    const effects = []
    for (const key of [unit.origin, unit.class]) {
      const t = traitMap.get(key)
      if (t && t.effect) effects.push(t.effect)
    }

    const base = resolveStats(unit, e.star, data.combat)
    const stats = applyTraitEffects(base, effects)

    const tile = toFieldTile(board, e.tile, team, data.combat.board)
    if (tile < 0) {
      const perSide = combatCfg.board.rows.reduce((a, n) => a + n, 0) / 2
      throw new Error(
        `보드 좌표가 범위를 벗어났다: team ${team}, tile ${e.tile} (0..${perSide - 1} 이어야 한다)`,
      )
    }

    return {
      localIndex: i,
      team,
      unitId: unit.id,
      star: e.star,
      skill: unit.skill,
      tile,
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

export function simulate({ boardA, boardB, seed, data }) {
  const cfg = data.combat
  const board = buildBoard(cfg.board)
  const rng = createRng(seed)
  const log = []

  const teamA = buildCombatants(boardA, 'A', data, board)
  const teamB = buildCombatants(boardB, 'B', data, board)

  // id 는 배열 순서가 아니라 **보드 상의 타일**로 정한다.
  // localIndex 로 정렬하면 그건 호출자의 배열 순서라, 같은 보드를 다른 순서로
  // 직렬화한 스냅샷이 다른 전투 결과를 낸다 — 비동기 PvP 가 무너진다.
  // 타일은 보드의 canonical 속성이고 한 진영 안에서 중복될 수 없으므로 전순서다.
  const all = [...teamA, ...teamB]

  // 같은 진영 안에 타일이 겹치면 id 정렬이 전순서가 아니게 된다.
  for (const team of ['A', 'B']) {
    const tiles = all.filter((c) => c.team === team).map((c) => c.tile)
    if (new Set(tiles).size !== tiles.length) {
      throw new Error(`같은 진영에 겹친 타일이 있다: team ${team}`)
    }
  }

  all.sort((x, y) => (x.team === y.team ? x.tile - y.tile : x.team < y.team ? -1 : 1))
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
          const { dealt, toShield, toHp } = applyDamage(c, b.amount)
          log.push({ tick, type: 'dot', casterId: b.sourceId ?? null, targetIds: [c.id], amount: dealt, toShield, toHp })
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
        const events = castSkill(
          { board, all, occupied, rng, combatCfg: cfg, tick, effectiveStat, damageTakenMultiplier },
          c,
        )
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

      const { died, dealt, toShield, toHp } = applyDamage(target, dmg)
      // 쿨다운을 interval 로 두면 1→0 으로 내리는 틱이 공격을 못 해
      // 실제 주기가 interval+1 이 된다. 1 을 빼서 데이터값과 일치시킨다.
      c.attackCooldown = Math.max(0, effectiveStat(c, 'attackInterval') - 1)
      c.mana = Math.min(cfg.mana.full, c.mana + cfg.mana.perAttack)
      if (target.alive) {
        target.mana = Math.min(
          cfg.mana.full,
          target.mana + Math.min(cfg.mana.onHitMax, Math.floor((dealt * cfg.mana.onHitPercent) / 100)),
        )
      }

      log.push({ tick, type: 'attack', casterId: c.id, targetIds: [target.id], amount: dealt, toShield, toHp, crit: isCrit })

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
  return finish(resolveTimeout(a, b))
}
