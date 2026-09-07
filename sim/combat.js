// 전투 메인 루프. 순수 함수다 — DOM·PixiJS·fetch 를 쓰지 않는다.
// (보드A, 보드B, 시드) → 전투 로그. 같은 입력이면 항상 같은 로그가 나온다.
// view/board 는 이 로그를 재생만 하고, 서버는 같은 코드로 결과를 검증한다.

import { buildBoard } from './hex.js'
import { createRng } from './rng.js'
import { unitById } from './units.js'
import { activeTraits } from './traits.js'
import { resolveStats, applyTraitEffects, traitSpecials } from './stats.js'
import { applyItems, itemSpecials, mergeSpecials } from './items.js'
import { findTarget } from './targeting.js'
import { stepToward } from './movement.js'
import { physicalDamage, magicDamage, applyDamage } from './damage.js'
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

    // 아이템은 **시너지 다음**에 얹는다. 퍼센트가 계통별로 따로 곱해진다.
    const items = e.items ?? []
    if (items.length > data.items.slotsPerUnit) {
      throw new Error(
        `아이템이 칸 수를 넘는다: ${e.unitId} 가 ${items.length} 개 (최대 ${data.items.slotsPerUnit})`,
      )
    }
    const base = resolveStats(unit, e.star, data.combat)
    const stats = applyItems(applyTraitEffects(base, effects), items, data.items)
    // 숫자 스탯이 아닌 것들(도약·관통·부활·반사·흡혈 …)은 따로 실어 둔다.
    // stats 에 섞으면 effectiveStat 이 모르는 키를 읽어 조용히 NaN 이 된다.
    const traits = mergeSpecials(traitSpecials(effects), itemSpecials(items, data.items))

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
      items,
      skill: unit.skill,
      tile,
      hp: stats.hp,
      maxHp: stats.hp,
      shield: 0,
      mana: stats.manaStart,
      traits,
      // 부활은 라운드당 정해진 횟수만 쓴다. 남은 횟수를 여기서 센다.
      revivesLeft: traits.revivePerRound,
      alive: true,
      deathLogged: false,
      buffs: [],
      targetId: null,
      attackCooldown: 0,
      moveCooldown: 0,
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
    // maxHp 를 실어 보낸다. 없으면 재생 쪽이 로그의 피해 총합으로 역산해야 하는데,
    // 끝까지 살아남은 유닛은 하한만 나와 HP 바가 틀린 값을 그린다.
    log.push({
      tick: 0,
      type: 'spawn',
      casterId: c.id,
      unitId: c.unitId,
      team: c.team,
      tile: c.tile,
      star: c.star,
      items: c.items,
      maxHp: c.maxHp,
      mana: c.mana,
      manaFull: cfg.mana.full,
    })
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

  /**
   * 이 틱에 죽은 말들을 정리한다.
   *
   * 부활이 남아 있으면 되살리고, 아니면 죽음을 확정하고 폭발을 터뜨린다.
   * 평타·지속피해·스킬 어느 쪽으로 죽었든 여기 한 곳을 지난다.
   */
  function sweepDeaths(tickNow, occupied) {
    for (const c of all) {
      if (c.alive || c.deathLogged) continue

      // 망자 4 · 부활 3: 라운드당 정해진 횟수만큼 되살아난다.
      if (c.traits.reviveHpPct > 0 && c.revivesLeft > 0) {
        c.revivesLeft--
        c.alive = true
        c.shield = 0
        c.hp = Math.max(1, Math.floor((c.maxHp * c.traits.reviveHpPct) / 100))
        // 되살아난 자리를 다시 점유한다. 안 하면 남이 그 칸으로 걸어 들어온다.
        occupied.set(c.tile, c.id)
        log.push({ tick: tickNow, type: 'revive', casterId: c.id, hp: c.hp })
        continue
      }

      c.deathLogged = true
      occupied.delete(c.tile)
      log.push({ tick: tickNow, type: 'death', casterId: c.id })

      // 망자 3·4 · 부활 2·3: 죽을 때 주변에 마법 피해.
      const blastPct = c.traits.deathBlastPct
      if (blastPct <= 0) continue
      const radius = c.traits.deathBlastRadius
      const raw = Math.floor((c.stats.power * blastPct) / 100)
      const ids = []
      const hits = []
      let total = 0
      for (const v of all) {
        if (!v.alive || v.team === c.team) continue
        if (board.dist[c.tile][v.tile] > radius) continue
        const dmg = Math.floor(
          magicDamage(raw, effectiveStat(v, 'mr'), cfg.damage.defK) * damageTakenMultiplier(v),
        )
        const hit = applyDamage(v, dmg)
        total += hit.dealt
        hits.push({ id: v.id, toShield: hit.toShield, toHp: hit.toHp })
        ids.push(v.id)
      }
      if (ids.length > 0) {
        log.push({
          tick: tickNow,
          type: 'death_blast',
          casterId: c.id,
          targetIds: ids,
          amount: total,
          hits,
        })
      }
      // 폭발로 또 죽을 수 있다. 연쇄는 이 while 이 받는다.
    }
    // 폭발이 새 시체를 만들었으면 한 번 더 돈다.
    if (all.some((c) => !c.alive && !c.deathLogged)) sweepDeaths(tickNow, occupied)
  }

  // ── 전투 시작 효과 ────────────────────────────────────
  //
  // 첫 틱 전에 한 번만 건다. 틱 루프 안에서 하면 매 틱 다시 걸려
  // 보호막이 영원히 안 닳고, 도약은 매 틱 뒷줄로 순간이동한다.
  {
    const occupied0 = new Map()
    for (const c of all) if (c.alive) occupied0.set(c.tile, c.id)

    // 승리의 깃발: 인접 아군의 공격력을 올린다.
    //
    // **전투 시작 시점의 인접**으로 고정한다. 매 틱 다시 재면 움직일 때마다
    // 공격력이 출렁이고, 로그만으로는 그 변화를 복원할 수 없다.
    for (const c of all) {
      if (c.traits.auraAtkPct <= 0) continue
      for (const ally of all) {
        // 자기 자신은 뺀다. 깃발을 든 사람이 제일 세지면 오라가 아니다.
        if (ally.id === c.id || ally.team !== c.team || !ally.alive) continue
        if (board.dist[c.tile][ally.tile] > c.traits.auraRadius) continue
        ally.buffs.push({
          stat: 'atkPct',
          amount: c.traits.auraAtkPct,
          expiresAt: Infinity,
          sourceId: c.id,
        })
      }
    }

    // 탱커 6단계: 최대 체력 비례 보호막.
    for (const c of all) {
      const pct = c.traits.shieldPctMaxHp
      if (pct <= 0) continue
      c.shield = Math.floor((c.maxHp * pct) / 100)
      // 지속시간이 있으면 만료 틱을 적어 둔다. 0 이면 전투 내내 남는다.
      c.shieldUntil = c.traits.shieldTicks > 0 ? c.traits.shieldTicks : Infinity
      log.push({ tick: 0, type: 'shield', casterId: c.id, amount: c.shield })
    }

    // 암살자: 상대 뒷줄로 도약.
    //
    // "뒷줄"은 상대 진영에서 **나로부터 가장 먼 줄**이다. 빈 칸 중 가장 먼
    // 곳으로 보낸다 — 거리가 같으면 타일 번호가 작은 쪽. id 오름차순으로
    // 처리해야 두 암살자가 같은 칸을 노려도 결과가 하나로 정해진다.
    for (const c of all) {
      if (!c.traits.leapToBackline) continue
      const foes = all.filter((o) => o.alive && o.team !== c.team)
      if (foes.length === 0) continue
      // 상대들이 서 있는 칸에서 가장 먼 쪽 = 상대 뒷줄.
      let best = -1
      let bestScore = -1
      for (let t = 0; t < board.tileCount; t++) {
        if (occupied0.has(t)) continue
        // 상대 무리에서 가장 가까운 적까지의 거리. 이게 작을수록 적진 깊숙이다.
        const near = Math.min(...foes.map((o) => board.dist[t][o.tile]))
        if (near > 1) continue
        // 내 시작 칸에서 먼 쪽이 뒷줄이다.
        const score = board.dist[c.tile][t]
        if (score > bestScore || (score === bestScore && best >= 0 && t < best)) {
          bestScore = score
          best = t
        }
      }
      if (best < 0) continue
      occupied0.delete(c.tile)
      c.tile = best
      occupied0.set(best, c.id)
      log.push({ tick: 0, type: 'leap', casterId: c.id, tile: best })
    }
  }

  for (tick = 1; tick <= cfg.maxTicks; tick++) {
    const occupied = new Map()
    for (const c of all) if (c.alive) occupied.set(c.tile, c.id)
    // 이 틱에 마나가 얼마나 변했는지 끝에서 비교해 로그에 싣는다.
    // 화면이 마나를 다시 계산하면 규칙이 두 군데 살게 된다 — 로그가 말해야 한다.
    for (const c of all) c.manaAtTickStart = c.mana

    for (const c of all) {
      if (!c.alive) continue
      // 보호막 만료. 남은 값을 로그에 남겨야 화면이 띠를 지운다.
      if (c.shieldUntil !== undefined && tick > c.shieldUntil && c.shield > 0) {
        c.shield = 0
        log.push({ tick, type: 'shield', casterId: c.id, amount: 0 })
      }
      // 슬라임 5단계: 5초마다 최대 체력 비례 회복.
      const regen = c.traits.regenPctPer5s
      if (regen > 0 && tick % (cfg.tickRate * 5) === 0) {
        const before = c.hp
        c.hp = Math.min(c.maxHp, c.hp + Math.floor((c.maxHp * regen) / 100))
        const healed = c.hp - before
        if (healed > 0) {
          log.push({ tick, type: 'heal', casterId: c.id, targetIds: [c.id], amount: healed })
        }
      }
    }

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
        sweepDeaths(tick, occupied)
        if (!c.alive) continue
      }

      const target = findTarget(board, c, all)
      if (!target) continue
      c.targetId = target.id

      const dist = board.dist[c.tile][target.tile]
      const range = effectiveStat(c, 'range')

      if (dist > range) {
        // 이동에도 공격과 같은 주기가 있다. 없으면 틱마다 한 칸씩 —
        // 초당 30칸이라 판을 0.2초에 가로지르고, 화면에서는 순간이동으로 보인다.
        if (c.moveCooldown > 0) {
          c.moveCooldown--
          continue
        }
        // 사거리를 넘긴다 — 목적지는 타겟의 칸이 아니라 **때릴 수 있는 칸**이다.
        const next = stepToward(board, c, target, occupied, range)
        if (next !== null) {
          occupied.delete(c.tile)
          c.tile = next
          occupied.set(next, c.id)
          // 공격 쿨다운과 같은 이유로 1 을 뺀다: 내리는 틱은 움직이지 못하므로
          // 그대로 두면 실제 주기가 moveInterval+1 이 된다.
          c.moveCooldown = Math.max(0, cfg.moveInterval - 1)
          log.push({ tick, type: 'move', casterId: c.id, tile: next })
        }
        continue
      }

      // 마법사 3·5단계: 스킬 비용이 내려간다 (manaCostPct 는 음수).
      const manaCost = Math.max(
        1,
        Math.floor((cfg.mana.full * (100 + c.traits.manaCostPct)) / 100),
      )
      if (c.mana >= manaCost) {
        c.mana = 0
        const events = castSkill(
          { board, all, occupied, rng, combatCfg: cfg, tick, effectiveStat, damageTakenMultiplier },
          c,
        )
        for (const e of events) log.push(e)
        sweepDeaths(tick, occupied)
        continue
      }

      if (c.attackCooldown > 0) {
        c.attackCooldown--
        continue
      }

      // 날개 4·6: 전투 시작 뒤 잠깐 회피가 붙는다. 데이터의 dodgeTicks 가
      // 그 창이다 (90틱 = 3초). 시작 난전을 버티라고 있는 효과다.
      const dodging = target.traits.dodgePct > 0 && tick <= target.traits.dodgeTicks
      if (dodging && rng.int(100) < target.traits.dodgePct) {
        c.attackCooldown = Math.max(0, effectiveStat(c, 'attackInterval') - 1)
        log.push({ tick, type: 'dodge', casterId: target.id, targetIds: [c.id] })
        continue
      }

      /** 한 대. 관통·연타가 같은 계산을 타야 하므로 여기 한 번만 적는다. */
      const strike = (victim, scalePct) => {
        const atk = effectiveStat(c, 'atk')
        const isCrit = rng.int(10000) < Math.floor(c.stats.critChance * 10000)
        let dmg = physicalDamage(atk, effectiveStat(victim, 'def'), cfg.damage.defK)
        if (isCrit) {
          // 암살자 3·4 는 치명타 배수를 올리고, 슬라임 3·5 는 **받는 쪽**에서
          // 그 초과분을 깎는다. 배수 전체가 아니라 초과분에만 걸어야
          // critTakenPct -100 이 평타를 0 으로 만들지 않는다.
          const bonus = cfg.damage.critMultiplier - 1 + c.traits.critDamagePct / 100
          const taken = Math.max(0, 1 + victim.traits.critTakenPct / 100)
          dmg = Math.floor(dmg * (1 + bonus * taken))
        }
        dmg = Math.floor((dmg * scalePct) / 100)
        dmg = Math.max(1, Math.floor(dmg * damageTakenMultiplier(victim)))
        const hit = applyDamage(victim, dmg)
        log.push({
          tick,
          type: 'attack',
          casterId: c.id,
          targetIds: [victim.id],
          amount: hit.dealt,
          toShield: hit.toShield,
          toHp: hit.toHp,
          crit: isCrit,
        })
        // 흡혈의 낫: 실제로 들어간 양만큼 회복한다. 요청 피해가 아니다 —
        // HP 50 남은 적을 1000 으로 마무리하고 200 을 회복하는 일이 없다.
        if (c.traits.lifestealPct > 0 && hit.dealt > 0 && c.alive) {
          const healed = Math.min(
            c.maxHp - c.hp,
            Math.floor((hit.dealt * c.traits.lifestealPct) / 100),
          )
          if (healed > 0) {
            c.hp += healed
            log.push({ tick, type: 'heal', casterId: c.id, targetIds: [c.id], amount: healed })
          }
        }

        // 가시 갑옷: 근접 평타만 되돌린다. 원거리·스킬·지속피해는 반사되지 않는다.
        // 반사 피해는 다시 반사를 부르지 않는다 — 마주 선 두 가시 갑옷이
        // 같은 틱에 무한 왕복한다.
        if (victim.traits.thornsPct > 0 && hit.dealt > 0 && effectiveStat(c, 'range') === 1) {
          const back = Math.floor((hit.dealt * victim.traits.thornsPct) / 100)
          if (back > 0) {
            const r = applyDamage(c, back)
            log.push({
              tick,
              type: 'thorns',
              casterId: victim.id,
              targetIds: [c.id],
              amount: r.dealt,
              toShield: r.toShield,
              toHp: r.toHp,
            })
          }
        }

        if (victim.alive) {
          victim.mana = Math.min(
            cfg.mana.full,
            victim.mana +
              Math.min(cfg.mana.onHitMax, Math.floor((hit.dealt * cfg.mana.onHitPercent) / 100)),
          )
        } else if (c.traits.manaOnKill > 0) {
          // 암살자 4: 처치하면 마나를 받는다.
          c.mana = Math.min(cfg.mana.full, c.mana + c.traits.manaOnKill)
        }
        return hit
      }

      strike(target, 100)
      // 반사로 내가 먼저 죽었을 수 있다. 시체가 연타·관통을 하면 안 된다.
      // 전사 3·4: 확률로 한 번 더 때린다.
      if (c.alive && target.alive && c.traits.doubleStrikeChance > 0) {
        if (rng.int(100) < c.traits.doubleStrikeChance) strike(target, 100)
      }
      // 사수 3: 대상보다 **뒤에 선** 적을 관통한다. 가까운 순, 같으면 id 순.
      if (c.alive && c.traits.pierceCount > 0) {
        const behind = all
          .filter(
            (v) =>
              v.alive &&
              v.team !== c.team &&
              v.id !== target.id &&
              board.dist[c.tile][v.tile] > board.dist[c.tile][target.tile],
          )
          .sort((x, y) => board.dist[c.tile][x.tile] - board.dist[c.tile][y.tile] || x.id - y.id)
          .slice(0, c.traits.pierceCount)
        for (const v of behind) strike(v, c.traits.piercePct || 100)
      }

      // 쿨다운을 interval 로 두면 1→0 으로 내리는 틱이 공격을 못 해
      // 실제 주기가 interval+1 이 된다. 1 을 빼서 데이터값과 일치시킨다.
      c.attackCooldown = Math.max(0, effectiveStat(c, 'attackInterval') - 1)
      c.mana = Math.min(cfg.mana.full, c.mana + cfg.mana.perAttack)

      sweepDeaths(tick, occupied)
    }

    // 바뀐 것만 싣는다. 매 틱 전원을 실으면 로그가 스무 배로 불어난다.
    for (const c of all) {
      if (c.mana !== c.manaAtTickStart) {
        log.push({ tick, type: 'mana', casterId: c.id, value: c.mana })
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
