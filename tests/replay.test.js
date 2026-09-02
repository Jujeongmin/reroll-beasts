import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { simulate } from '../sim/combat.js'
import { createUnitState, applyReplayEvent } from '../game/src/replay.js'

const data = await loadData()

function team(entries) {
  return entries.map(([unitId, star, tile]) => ({ unitId, star, tile }))
}

// spawn 이벤트를 손으로 만든다. maxHp 300, shield 30 을 들고 시작한다.
function spawnState(overrides = {}) {
  const spawn = { casterId: 0, tile: 0, maxHp: 300, mana: 0, manaFull: 100, ...overrides }
  const st = createUnitState(spawn)
  return st
}

describe('replay: 단일 대상 피해 (attack, skill_single)', () => {
  it('attack — 보호막과 HP 를 따로 깎는다 (합산 이중 차감 금지)', () => {
    const unitState = new Map()
    const st = spawnState()
    st.shield = 30
    unitState.set(0, st)

    // 보호막 30 을 먼저 흡수하고 HP 는 10 만 깎이는, dealt=40 인 한 방.
    applyReplayEvent(unitState, {
      type: 'attack', casterId: 1, targetIds: [0], amount: 40, toShield: 30, toHp: 10, crit: false,
    })

    expect(st.shield).toBe(0)
    expect(st.hp).toBe(300 - 10)
  })

  it('skill_single — 보호막과 HP 를 따로 깎는다', () => {
    const unitState = new Map()
    const st = spawnState()
    st.shield = 20
    unitState.set(0, st)

    applyReplayEvent(unitState, {
      type: 'skill_single', casterId: 1, targetIds: [0], amount: 50, toShield: 20, toHp: 30,
    })

    expect(st.shield).toBe(0)
    expect(st.hp).toBe(300 - 30)
  })
})

describe('replay: skill_aoe — hits[] 로 대상별 보호막/HP 를 따로 깎는다', () => {
  it('두 대상 각각 보호막·HP 를 hits 값대로 깎는다', () => {
    const unitState = new Map()
    const a = spawnState({ casterId: 0 })
    a.shield = 15
    const b = spawnState({ casterId: 1, maxHp: 200 })
    unitState.set(0, a)
    unitState.set(1, b)

    applyReplayEvent(unitState, {
      type: 'skill_aoe',
      casterId: 9,
      targetIds: [0, 1],
      amount: 15 + 5 + 40, // 합계는 대표값일 뿐, 재생기는 hits 를 써야 한다
      hits: [
        { id: 0, toShield: 15, toHp: 5 },
        { id: 1, toShield: 0, toHp: 40 },
      ],
    })

    expect(a.shield).toBe(0)
    expect(a.hp).toBe(300 - 5)
    expect(b.shield).toBe(0)
    expect(b.hp).toBe(200 - 40)
  })
})

describe('replay: dot — toShield/toHp 를 나눠 깎는다', () => {
  it('보호막이 있으면 보호막부터, 넘친 만큼만 HP 에서 깎는다', () => {
    const unitState = new Map()
    const st = spawnState()
    st.shield = 10
    unitState.set(0, st)

    applyReplayEvent(unitState, {
      type: 'dot', casterId: 5, targetIds: [0], amount: 18, toShield: 10, toHp: 8,
    })

    expect(st.shield).toBe(0)
    expect(st.hp).toBe(300 - 8)
  })
})

describe('replay: death_blast — hits[] 로 폭발 피해를 반영한다', () => {
  it('폭발 대상들의 보호막·HP 가 hits 값대로 줄어든다', () => {
    const unitState = new Map()
    const v1 = spawnState({ casterId: 1 })
    v1.shield = 5
    const v2 = spawnState({ casterId: 2, maxHp: 400 })
    unitState.set(1, v1)
    unitState.set(2, v2)

    applyReplayEvent(unitState, {
      type: 'death_blast',
      casterId: 0,
      targetIds: [1, 2],
      amount: 5 + 3 + 60,
      hits: [
        { id: 1, toShield: 5, toHp: 3 },
        { id: 2, toShield: 0, toHp: 60 },
      ],
    })

    expect(v1.shield).toBe(0)
    expect(v1.hp).toBe(300 - 3)
    expect(v2.hp).toBe(400 - 60)
  })
})

describe('replay: skill_splash — hits[] 로 튄 피해를 반영한다', () => {
  it('튄 대상들의 보호막·HP 가 hits 값대로 줄어든다', () => {
    const unitState = new Map()
    const v1 = spawnState({ casterId: 1 })
    unitState.set(1, v1)

    applyReplayEvent(unitState, {
      type: 'skill_splash',
      casterId: 0,
      targetIds: [1],
      amount: 12,
      hits: [{ id: 1, toShield: 0, toHp: 12 }],
    })

    expect(v1.hp).toBe(300 - 12)
  })
})

describe('replay: skill_buff — HP 를 건드리지 않는다', () => {
  it('자기 자신에게 방어력 버프 (pink_blob 류) — HP 불변', () => {
    const unitState = new Map()
    const st = spawnState()
    unitState.set(0, st)

    // pb_harden: { stat: 'def', amount: 45 } — amount 는 방어력 크기지 피해가 아니다.
    applyReplayEvent(unitState, {
      type: 'skill_buff', casterId: 0, targetIds: [0], stat: 'def', amount: 45, durationTicks: 90,
      grants: [{ id: 0, shieldGranted: 0 }],
    })

    expect(st.hp).toBe(300)
  })

  it('음수 amount (goleling 류 damageTakenPct) 도 HP 를 건드리지 않는다', () => {
    const unitState = new Map()
    const st = spawnState()
    unitState.set(0, st)

    applyReplayEvent(unitState, {
      type: 'skill_buff', casterId: 0, targetIds: [0], stat: 'damageTakenPct', amount: -45, durationTicks: 90,
      grants: [{ id: 0, shieldGranted: 0 }],
    })

    expect(st.hp).toBe(300)
  })

  it('grants 의 shieldGranted 는 그대로 보호막에 더해진다', () => {
    const unitState = new Map()
    const a = spawnState({ casterId: 0 })
    const b = spawnState({ casterId: 1 })
    unitState.set(0, a)
    unitState.set(1, b)

    // dino: shieldAndDef, amountPctMaxHp 14 → 아군 전원에게 보호막
    applyReplayEvent(unitState, {
      type: 'skill_buff', casterId: 0, targetIds: [0, 1], stat: 'shieldAndDef', amount: 60, durationTicks: 240,
      grants: [{ id: 0, shieldGranted: 42 }, { id: 1, shieldGranted: 42 }],
    })

    expect(a.hp).toBe(300)
    expect(b.hp).toBe(300)
    expect(a.shield).toBe(42)
    expect(b.shield).toBe(42)
  })
})

describe('replay: thorns — 되돌린 쪽(casterId) 말고 되돌려받는 쪽(targetIds)이 깎인다', () => {
  it('targetIds 의 보호막·HP 가 깎이고, casterId(반사한 쪽)는 그대로다', () => {
    const unitState = new Map()
    const attacker = spawnState({ casterId: 0 }) // 반사 피해를 되돌려받는 쪽
    attacker.shield = 5
    const reflector = spawnState({ casterId: 1 }) // 가시 갑옷으로 반사한 쪽
    unitState.set(0, attacker)
    unitState.set(1, reflector)

    // sim/combat.js: casterId 는 victim(반사한 쪽), targetIds 는 [반사 맞는 쪽].
    applyReplayEvent(unitState, {
      type: 'thorns', casterId: 1, targetIds: [0], amount: 12, toShield: 5, toHp: 7,
    })

    expect(attacker.shield).toBe(0)
    expect(attacker.hp).toBe(300 - 7)
    expect(reflector.hp).toBe(300)
    expect(reflector.shield).toBe(0)
  })
})

describe('replay: heal — casterId 의 HP 를 올리고 maxHp 에서 잘린다', () => {
  it('회복량만큼 HP 가 오른다', () => {
    const unitState = new Map()
    const st = spawnState()
    st.hp = 250
    unitState.set(0, st)

    applyReplayEvent(unitState, { type: 'heal', casterId: 0, targetIds: [0], amount: 30 })

    expect(st.hp).toBe(280)
  })

  it('maxHp 를 넘겨 회복하지 않는다', () => {
    const unitState = new Map()
    const st = spawnState()
    st.hp = 290
    unitState.set(0, st)

    applyReplayEvent(unitState, { type: 'heal', casterId: 0, targetIds: [0], amount: 50 })

    expect(st.hp).toBe(300)
  })
})

describe('replay: shield — 절대값으로 설정, 0 은 만료', () => {
  it('shield 이벤트는 보호막을 그 값으로 설정한다', () => {
    const unitState = new Map()
    const st = spawnState()
    unitState.set(0, st)

    applyReplayEvent(unitState, { type: 'shield', casterId: 0, amount: 120 })
    expect(st.shield).toBe(120)
  })

  it('amount 0 은 만료 — 보호막을 지운다', () => {
    const unitState = new Map()
    const st = spawnState()
    st.shield = 120
    unitState.set(0, st)

    applyReplayEvent(unitState, { type: 'shield', casterId: 0, amount: 0 })
    expect(st.shield).toBe(0)
  })
})

describe('replay: revive — 되살리고 HP 를 로그값으로, 보호막은 지운다', () => {
  it('죽은 유닛이 revive 이벤트로 되살아난다', () => {
    const unitState = new Map()
    const st = spawnState()
    st.alive = false
    st.hp = 0
    st.shield = 999 // 죽기 전 남아 있던 값이 실수로 안 남아야 한다
    unitState.set(0, st)

    applyReplayEvent(unitState, { type: 'revive', casterId: 0, hp: 105 })

    expect(st.alive).toBe(true)
    expect(st.hp).toBe(105)
    expect(st.shield).toBe(0)
  })
})

// ── 전체 전투 재생 일관성 ──────────────────────────────────────────
//
// 손으로 만든 사건은 대상별 회계를 잡아내지만, 실제 로그가 사건들을 어떤
// 순서·조합으로 섞어 내는지는 못 잡는다. simulate 의 진짜 로그를 처음부터
// 끝까지 재생해 생존자 수·HP 상한·사망 상태가 시뮬레이션과 일치하는지 본다.

function replayFullLog(result) {
  const unitState = new Map()
  const teamOf = new Map()
  // hp 가 0 이 됐는데 아직 death 로 안 풀린 유닛. death 가 오기 전, 사건이
  // 스스로 hp 를 0 으로 깎아놓지 않으면 이 재생기가 뭘 지어냈다는 뜻이다.
  const zeroHpPending = new Set()
  for (const e of result.log) {
    if (e.type === 'spawn') {
      unitState.set(e.casterId, createUnitState(e))
      teamOf.set(e.casterId, e.team)
      continue
    }

    // death 는 사건이 이미 0 으로 만들어둔 hp 를 확정할 뿐, 재생기가 여기서
    // 처음 0 으로 깎는 게 아니다 — 아니면 사망 직전 몫이 남몰래 안 적용된
    // 채로 사망만 찍히는 버그(과거 skill_splash 가 그랬다)를 못 잡는다.
    if (e.type === 'death') {
      const st = unitState.get(e.casterId)
      expect(st?.hp, `유닛 ${e.casterId} 는 death 이벤트가 오기 전부터 hp 0 이어야 한다`).toBe(0)
    }

    applyReplayEvent(unitState, e)
    // hp 는 절대 음수도, maxHp 초과도 아니어야 한다 — 매 사건마다 검사한다.
    for (const [id, st] of unitState) {
      expect(st.hp).toBeGreaterThanOrEqual(0)
      expect(st.hp).toBeLessThanOrEqual(st.maxHp)
      if (st.hp === 0 && st.alive) zeroHpPending.add(id)
      else zeroHpPending.delete(id)
    }
  }
  // 로그 끝까지 가도록 안 풀린 채 남은 유닛이 있으면 hp 는 0인데 death 로그가
  // 없다는 뜻 — 위 최종 상태 검사보다 먼저, 중간에 이 상태가 그대로 굳었는지를 잡는다.
  expect([...zeroHpPending], 'hp 0 인데 death/revive 로 안 풀린 유닛이 있다').toEqual([])
  return { unitState, teamOf }
}

function countLiveByTeam(unitState, teamOf) {
  const counts = { A: 0, B: 0 }
  for (const [id, st] of unitState) {
    if (st.alive) counts[teamOf.get(id)]++
  }
  return counts
}

describe('replay: 전체 로그 재생 일관성', () => {
  it('탱커 시너지(보호막) + 부활/폭사(망자) 대진 — 생존자 수·사망 상태가 시뮬과 일치', () => {
    // A: 탱커 직업 6종 전부 — 탱커 시너지 6단(shieldPctMaxHp 20%) 을 켜고,
    // 그 유닛들의 버프 스킬(자가/아군 방어력·보호막·공격력)도 모두 지나간다.
    const tankA = team([
      ['pink_blob', 3, 0],
      ['spiky_blob', 3, 1],
      ['cactoro_big', 3, 2],
      ['alpaking', 3, 3],
      ['yeti', 3, 4],
      ['dino', 3, 5],
    ])
    // B: 망자 종족 4종 전부 — 망자 4단(부활 1회 + 폭사)을 켠다.
    const undeadB = team([
      ['goleling', 3, 0],
      ['ghost', 3, 1],
      ['ghost_skull', 3, 2],
      ['orc_skull', 3, 3],
    ])

    const result = simulate({ boardA: tankA, boardB: undeadB, seed: 1, data })

    // 이 대진·시드가 실제로 우리가 노리는 사건들을 지나가는지 확인한다.
    // 아니면 이 테스트는 아무것도 검증하지 못하는 채로 통과해버린다.
    const kinds = new Set(result.log.map((e) => e.type))
    for (const must of ['shield', 'skill_buff', 'skill_aoe', 'dot', 'revive', 'death_blast', 'death']) {
      expect(kinds.has(must), `이 대진이 ${must} 이벤트를 안 남겼다`).toBe(true)
    }

    const { unitState, teamOf } = replayFullLog(result)

    const deathLogged = new Set(result.log.filter((e) => e.type === 'death').map((e) => e.casterId))
    for (const [id, st] of unitState) {
      if (deathLogged.has(id)) {
        expect(st.alive, `유닛 ${id} 는 death 로그가 있는데 살아 있다`).toBe(false)
        expect(st.hp, `유닛 ${id} 는 death 로그가 있는데 hp 가 0 이 아니다`).toBe(0)
      } else {
        expect(st.alive, `유닛 ${id} 는 death 로그가 없는데 죽어 있다`).toBe(true)
        expect(st.hp, `유닛 ${id} 는 death 로그가 없는데 hp 가 0 이하다`).toBeGreaterThan(0)
      }
    }

    const live = countLiveByTeam(unitState, teamOf)
    expect(live.A).toBe(result.survivorsA)
    expect(live.B).toBe(result.survivorsB)
  })

  it('버섯 시너지(튄 피해) 대진 — skill_splash 를 포함해 생존자 수가 일치', () => {
    // A: 버섯 종족 4종 전부 — 버섯 4단(splashOnSkillPct 40%) 을 켠다.
    const mushA = team([
      ['mushnub', 3, 0],
      ['cactoro_blob', 3, 1],
      ['cactoro_big', 3, 2],
      ['mushroom_king', 3, 3],
    ])
    // B: 뭉쳐 서서 튄 피해가 실제로 여럿을 맞힌다.
    const clusterB = team([
      ['cat', 2, 0],
      ['cat', 2, 1],
      ['cat', 2, 2],
      ['frog', 2, 3],
    ])

    const result = simulate({ boardA: mushA, boardB: clusterB, seed: 1, data })

    const kinds = new Set(result.log.map((e) => e.type))
    expect(kinds.has('skill_splash'), '이 대진이 skill_splash 이벤트를 안 남겼다').toBe(true)

    const { unitState, teamOf } = replayFullLog(result)

    const deathLogged = new Set(result.log.filter((e) => e.type === 'death').map((e) => e.casterId))
    for (const [id, st] of unitState) {
      if (deathLogged.has(id)) {
        expect(st.alive).toBe(false)
        expect(st.hp).toBe(0)
      } else {
        expect(st.alive).toBe(true)
        expect(st.hp).toBeGreaterThan(0)
      }
    }

    const live = countLiveByTeam(unitState, teamOf)
    expect(live.A).toBe(result.survivorsA)
    expect(live.B).toBe(result.survivorsB)
  })
})
