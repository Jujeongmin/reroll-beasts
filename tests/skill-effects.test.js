// 스킬에 붙는 효과들 — 기절 · 관통 · 끌어당김 · 처치 보상 · 사망 시 소환.
//
// 이 여섯은 units.json 에 **적혀 있었는데 아무 일도 안 했다.** 실행기가 그
// 이름들을 안 읽었기 때문이다. 카드에는 "뒤쪽 2명에게 60% 관통" 이 뜨는데
// 판에서는 한 명만 맞았다. 눈으로는 안 잡히는 종류의 어긋남이라 — 화면은
// 어느 쪽이든 똑같이 그려진다 — 테스트가 대신 본다.
//
// tools/validate.mjs 의 SKILL_PARAMS 가 "데이터에 적힌 키"를 지키고,
// 이 파일이 "그 키가 실제로 무슨 일을 하는지"를 지킨다.
import { describe, it, expect } from 'vitest'
import { buildBoard } from '../sim/hex.js'
import { createRng } from '../sim/rng.js'
import { castSkill } from '../sim/skills.js'
import { simulate } from '../sim/combat.js'
import { effectiveStat, damageTakenMultiplier } from '../sim/modifiers.js'
import { loadData } from '../sim/data.js'
import combat from '../game/public/data/combat.json' with { type: 'json' }

const board = buildBoard(combat.board)
const data = await loadData()

function mk(id, team, row, col, over = {}) {
  return {
    id,
    team,
    tile: board.indexOf(row, col),
    hp: 1000,
    maxHp: 1000,
    shield: 0,
    alive: true,
    mana: 0,
    stats: { atk: 100, def: 20, mr: 20, power: 100, range: 1, critChance: 0 },
    buffs: [],
    skill: { id: 'x', type: 'single', params: { dmgPct: 200, hits: 1 } },
    unitId: 'test_unit',
    moveCooldown: 0,
    ...over,
  }
}

function ctx(all, tick = 10) {
  const occupied = new Map(all.filter((u) => u.alive).map((u) => [u.tile, u.id]))
  return {
    board,
    all,
    occupied,
    rng: createRng(1),
    combatCfg: combat,
    tick,
    effectiveStat,
    damageTakenMultiplier,
  }
}

const params = (p) => ({ skill: { id: 'x', type: 'single', params: p } })

describe('기절', () => {
  it('맞은 쪽에 만료 틱이 박힌 stun 버프가 붙는다', () => {
    const caster = mk(0, 'A', 3, 3, params({ dmgPct: 10, stunTicks: 30 }))
    const foe = mk(1, 'B', 2, 3)
    caster.targetId = foe.id

    castSkill(ctx([caster, foe], 100), caster)

    const stun = foe.buffs.find((b) => b.stat === 'stun')
    expect(stun?.expiresAt).toBe(130)
  })

  it('죽은 대상에게는 안 붙인다 — 시체를 기절시킬 이유가 없다', () => {
    const caster = mk(0, 'A', 3, 3, params({ dmgPct: 5000, stunTicks: 30 }))
    const foe = mk(1, 'B', 2, 3, { hp: 10 })
    caster.targetId = foe.id

    castSkill(ctx([caster, foe]), caster)

    expect(foe.alive).toBe(false)
    expect(foe.buffs.some((b) => b.stat === 'stun')).toBe(false)
  })

  it('기절한 말은 전투에서 아무 행동도 안 한다', () => {
    // 판 전체로 본다 — 버프만 붙고 combat.js 가 안 보면 아무 뜻도 없다.
    const one = (id, star, tile) => [{ unitId: id, star, tile, items: [] }]
    const r = simulate({
      boardA: one('blue_demon', 3, 24),
      boardB: [
        { unitId: 'pink_blob', star: 3, tile: 24, items: [] },
        { unitId: 'pink_blob', star: 3, tile: 25, items: [] },
      ],
      seed: 3,
      data,
    })
    const stun = r.log.find((e) => e.type === 'stun')
    expect(stun).toBeTruthy()
    const victim = stun.targetIds[0]
    // 기절이 **풀린 뒤에야** 다음 행동이 나온다. 창 안에 아무 사건도
    // 없는지만 보면 안 된다 — 평타 간격이 창보다 길면 기절을 지워도 통과한다.
    const acts = r.log.filter(
      (e) =>
        e.casterId === victim &&
        (e.type === 'attack' || e.type === 'move' || e.type.startsWith('skill_')),
    )
    const next = acts.find((e) => e.tick > stun.tick)
    expect(next).toBeTruthy()
    expect(next.tick).toBeGreaterThan(stun.tick + stun.durationTicks - 1)
  })
})

describe('스킬 관통', () => {
  it('대상보다 뒤에 선 적을 pierceCount 만큼 맞힌다', () => {
    const caster = mk(0, 'A', 3, 3, params({ dmgPct: 100, pierceCount: 2, piercePct: 50 }))
    const front = mk(1, 'B', 2, 3)
    const mid = mk(2, 'B', 1, 3)
    const back = mk(3, 'B', 0, 3)
    caster.targetId = front.id

    const events = castSkill(ctx([caster, front, mid, back]), caster)

    const pierce = events.find((e) => e.type === 'skill_pierce')
    expect(pierce.targetIds).toEqual([mid.id, back.id])
    expect(mid.hp).toBeLessThan(1000)
    expect(back.hp).toBeLessThan(1000)
    // 뒤쪽은 절반만 아프다. 원래 대상보다 덜 맞아야 관통이다.
    expect(1000 - mid.hp).toBeLessThan(1000 - front.hp)
  })

  it('앞에 선 적은 안 맞는다 — 관통은 뒤로만 간다', () => {
    const caster = mk(0, 'A', 3, 3, params({ dmgPct: 100, pierceCount: 2, piercePct: 50 }))
    const far = mk(1, 'B', 0, 3)
    const near = mk(2, 'B', 2, 3)
    caster.targetId = far.id

    castSkill(ctx([caster, far, near]), caster)

    expect(near.hp).toBe(1000)
  })
})

describe('끌어당김', () => {
  it('맞은 말이 시전자 옆으로 온다', () => {
    const caster = mk(0, 'A', 3, 3, params({ dmgPct: 10, pull: true }))
    const foe = mk(1, 'B', 0, 3)
    caster.targetId = foe.id
    const c = ctx([caster, foe])
    const before = board.dist[caster.tile][foe.tile]

    const events = castSkill(c, caster)

    expect(board.dist[caster.tile][foe.tile]).toBe(1)
    expect(before).toBeGreaterThan(1)
    // 재생기가 따라올 수 있게 move 로 남는다. 안 남기면 화면에서만 제자리다.
    expect(events.some((e) => e.type === 'move' && e.casterId === foe.id)).toBe(true)
    // 점유 표도 같이 옮겨야 한다 — 안 옮기면 남이 그 칸으로 걸어 들어온다.
    expect(c.occupied.get(foe.tile)).toBe(foe.id)
  })
})

describe('처치 보상', () => {
  it('manaRefillOnKill — 죽이면 마나가 가득 찬다', () => {
    const caster = mk(0, 'A', 3, 3, params({ dmgPct: 5000, manaRefillOnKill: true }))
    const foe = mk(1, 'B', 2, 3, { hp: 10 })
    caster.targetId = foe.id

    castSkill(ctx([caster, foe]), caster)

    expect(foe.alive).toBe(false)
    expect(caster.mana).toBe(combat.mana.full)
  })

  it('manaRefillOnKill — 못 죽이면 안 준다', () => {
    const caster = mk(0, 'A', 3, 3, params({ dmgPct: 10, manaRefillOnKill: true }))
    const foe = mk(1, 'B', 2, 3)
    caster.targetId = foe.id

    castSkill(ctx([caster, foe]), caster)

    expect(foe.alive).toBe(true)
    expect(caster.mana).toBe(0)
  })

  it('releapOnKill — 죽이면 적 뒷줄로 뛴다', () => {
    const caster = mk(0, 'A', 3, 3, params({ dmgPct: 5000, releapOnKill: true }))
    const dying = mk(1, 'B', 2, 3, { hp: 10 })
    const far = mk(2, 'B', 0, 0)
    caster.targetId = dying.id
    const c = ctx([caster, dying, far])
    const from = caster.tile

    const events = castSkill(c, caster)

    expect(caster.tile).not.toBe(from)
    // 남은 적 옆으로 간다 — 아무 빈 칸이나 가면 도약이 아니다.
    expect(board.dist[caster.tile][far.tile]).toBeLessThanOrEqual(1)
    expect(events.some((e) => e.type === 'leap' && e.casterId === caster.id)).toBe(true)
    expect(c.occupied.get(caster.tile)).toBe(caster.id)
  })
})

describe('사망 시 소환', () => {
  const one = (id, star, tile) => [{ unitId: id, star, tile, items: [] }]

  it('죽을 때 새 말이 로그에 등장한다', () => {
    const r = simulate({ boardA: one('green_blob', 2, 24), boardB: one('orc', 3, 24), seed: 5, data })
    const late = r.log.filter((e) => e.type === 'spawn' && e.tick > 0)
    const params = data.units.units.find((u) => u.id === 'green_blob').skill.params

    expect(late.length).toBe(params.count)
    // 부모가 죽는 그 틱에 나온다.
    const death = r.log.find((e) => e.type === 'death' && e.casterId === 0)
    expect(late[0].tick).toBe(death.tick)
    // 최대 체력의 일부로 나온다. hp 를 안 실으면 화면이 만렙 체력으로 그린다.
    expect(late[0].hp).toBe(Math.floor((late[0].maxHp * params.hpPct) / 100))
    expect(late[0].team).toBe('A')
  })

  it('소환수는 다시 소환하지 않는다 — 안 막으면 영원히 쪼개진다', () => {
    const r = simulate({ boardA: one('green_blob', 3, 24), boardB: one('orc_skull', 3, 24), seed: 5, data })
    const params = data.units.units.find((u) => u.id === 'green_blob').skill.params
    const late = r.log.filter((e) => e.type === 'spawn' && e.tick > 0)

    expect(late.length).toBe(params.count)
    // 판이 끝난다. 무한 분열이면 maxTicks 까지 가서 시간 초과로 끝난다.
    expect(r.ticks).toBeLessThan(combat.maxTicks)
  })

  it('소환수 id 가 기존 말과 안 겹친다 — 재생기가 id 로 말을 찾는다', () => {
    const r = simulate({
      boardA: [
        { unitId: 'green_blob', star: 2, tile: 24, items: [] },
        { unitId: 'green_blob', star: 2, tile: 17, items: [] },
      ],
      boardB: one('orc_skull', 3, 24),
      seed: 11,
      data,
    })
    const ids = r.log.filter((e) => e.type === 'spawn').map((e) => e.casterId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
