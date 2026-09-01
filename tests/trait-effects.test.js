// 시너지 효과가 **전투에 실제로 반영되는가**.
//
// 이 파일이 없던 동안, traits.json 에 값을 넣고 설명 문장까지 만들어 두면
// 화면에는 "탱커 6: 최대 체력의 20% 보호막" 이 뜨는데 전투에서는 아무 일도
// 안 일어나는 상태로 조용히 굴러갔다 (23개 중 14개가 그랬다).
//
// 그래서 여기서는 스탯 표가 아니라 **로그**를 본다. 로그에 흔적이 없으면
// 서버가 재현해도 없는 것이고, 화면도 그릴 게 없다.
import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { simulate } from '../sim/combat.js'
import { traitSpecials } from '../sim/stats.js'

const data = await loadData()

/** 한 진영을 앞줄부터 채운다. tile 은 로컬 좌표라 진영 변환은 combat 이 한다. */
const team = (ids, star = 2) => ids.map((unitId, i) => ({ unitId, star, tile: i }))

/** 맞아 주는 쪽. 시너지가 안 붙게 서로 다른 계통·직업으로 섞는다. */
const DUMMY = team(['chicken', 'bunny', 'mushnub'], 1)

/** 로그에 그 종류의 사건이 있는가. */
const has = (r, type) => r.log.some((e) => e.type === type)
const count = (r, type) => r.log.filter((e) => e.type === type).length

/** 여러 시드로 돌려 한 번이라도 나오면 참. 확률 효과용. */
function anySeed(boardA, boardB, type, seeds = 12) {
  for (let s = 1; s <= seeds; s++) {
    const r = simulate({ boardA, boardB, seed: s, data })
    if (has(r, type)) return true
  }
  return false
}

describe('시너지 값 합치기', () => {
  it('퍼센트는 더하고 반경·지속은 큰 값을 쓴다', () => {
    // 반경까지 더하면 3단계 하나로 판을 덮는다.
    const merged = traitSpecials([
      { dodgePct: 20, dodgeTicks: 90, aoeRadius: 1 },
      { dodgePct: 35, dodgeTicks: 150, aoeRadius: 1 },
    ])
    expect(merged.dodgePct).toBe(55)
    expect(merged.dodgeTicks).toBe(150)
    expect(merged.aoeRadius).toBe(1)
  })

  it('부활은 객체를 풀어 담는다', () => {
    // { hpPct, perRound } 를 숫자처럼 다루면 NaN 이 되어 아무도 안 살아난다.
    const merged = traitSpecials([{ revive: { hpPct: 40, perRound: 1 } }])
    expect(merged.reviveHpPct).toBe(40)
    expect(merged.revivePerRound).toBe(1)
  })

  it('효과가 없으면 전부 0 이다 — undefined 를 흘리면 NaN 이 번진다', () => {
    const merged = traitSpecials([{ hp: 250, scope: 'trait' }])
    for (const [k, v] of Object.entries(merged)) {
      if (k === 'leapToBackline') expect(v).toBe(false)
      else expect(v, k).toBe(0)
    }
  })
})

describe('전투 시작 효과', () => {
  it('암살자 2 — 상대 뒷줄로 도약한다', () => {
    // cat · pigeon 둘 다 암살자. 2단계면 leapToBackline 이 켜진다.
    const r = simulate({ boardA: team(['cat', 'pigeon']), boardB: DUMMY, seed: 3, data })
    expect(has(r, 'leap')).toBe(true)
  })

  it('암살자가 아니면 도약하지 않는다', () => {
    const r = simulate({ boardA: team(['bunny', 'orc']), boardB: DUMMY, seed: 3, data })
    expect(has(r, 'leap')).toBe(false)
  })

  it('탱커 6 — 최대 체력 비례 보호막을 두르고 시작한다', () => {
    const six = team(['pink_blob', 'spiky_blob', 'cactoro_big', 'frog', 'alpaking', 'yeti'])
    const r = simulate({ boardA: six, boardB: DUMMY, seed: 3, data })
    const shields = r.log.filter((e) => e.type === 'shield' && e.amount > 0)
    expect(shields.length).toBe(6)
  })

  it('탱커 4 는 보호막이 없다 — 3단계에서만 붙는 효과다', () => {
    const four = team(['pink_blob', 'spiky_blob', 'cactoro_big', 'frog'])
    const r = simulate({ boardA: four, boardB: DUMMY, seed: 3, data })
    expect(has(r, 'shield')).toBe(false)
  })
})

describe('죽을 때', () => {
  it('망자 3 — 죽으면 주변에 폭발한다', () => {
    const three = team(['goleling', 'ghost', 'ghost_skull'], 1)
    // 세 놈이 죽어야 터진다 — 상대를 세게 잡는다.
    const strong = team(['dragon', 'dino', 'blue_demon'], 3)
    const r = simulate({ boardA: three, boardB: strong, seed: 3, data })
    expect(has(r, 'death_blast')).toBe(true)
  })

  it('부활 3 — 한 번 되살아난다', () => {
    const three = team(['green_blob', 'goleling', 'ghost_skull'], 1)
    const strong = team(['dragon', 'dino', 'blue_demon'], 3)
    const r = simulate({ boardA: three, boardB: strong, seed: 3, data })
    expect(has(r, 'revive')).toBe(true)
  })

  it('되살아난 뒤 다시 죽으면 그때는 죽은 채로 남는다', () => {
    const three = team(['green_blob', 'goleling', 'ghost_skull'], 1)
    const strong = team(['dragon', 'dino', 'blue_demon'], 3)
    const r = simulate({ boardA: three, boardB: strong, seed: 3, data })
    const revived = new Set(r.log.filter((e) => e.type === 'revive').map((e) => e.casterId))
    expect(revived.size).toBeGreaterThan(0)
    // 라운드당 1회 — 같은 말이 두 번 살아나면 perRound 를 안 세고 있는 것이다.
    const perUnit = new Map()
    for (const e of r.log) {
      if (e.type !== 'revive') continue
      perUnit.set(e.casterId, (perUnit.get(e.casterId) ?? 0) + 1)
    }
    for (const [id, n] of perUnit) expect(n, `${id} 가 ${n}번 살아났다`).toBe(1)
  })
})

describe('평타에 붙는 효과', () => {
  it('사수 3 — 뒤에 선 적까지 관통한다', () => {
    // 한 번의 공격 틱에 두 명 이상이 맞으면 관통이다.
    const three = team(['chicken', 'cactoro_blob', 'glub'])
    const wall = team(['frog', 'yeti', 'dino', 'orc', 'bunny'], 1)
    const r = simulate({ boardA: three, boardB: wall, seed: 5, data })
    const byTick = new Map()
    for (const e of r.log) {
      if (e.type !== 'attack') continue
      const key = `${e.tick}:${e.casterId}`
      byTick.set(key, (byTick.get(key) ?? 0) + 1)
    }
    expect([...byTick.values()].some((n) => n >= 2)).toBe(true)
  })

  it('날개 4 — 시작 직후 회피가 붙는다', () => {
    const four = team(['chicken', 'pigeon', 'glub', 'armabee'])
    expect(anySeed(DUMMY, four, 'dodge')).toBe(true)
  })

  it('회피는 창이 닫히면 안 뜬다 — dodgeTicks 를 안 보면 끝까지 회피한다', () => {
    const four = team(['chicken', 'pigeon', 'glub', 'armabee'])
    for (let s = 1; s <= 12; s++) {
      const r = simulate({ boardA: DUMMY, boardB: four, seed: s, data })
      const late = r.log.filter((e) => e.type === 'dodge' && e.tick > 150)
      expect(late.length, `시드 ${s} 에서 150틱 뒤에도 회피했다`).toBe(0)
    }
  })
})

describe('스킬에 붙는 효과', () => {
  it('버섯 4 — 단일 스킬이 옆으로 튄다', () => {
    const four = team(['mushnub', 'cactoro_blob', 'cactoro_big', 'mushroom_king'])
    const wall = team(['frog', 'yeti', 'dino', 'orc', 'bunny'], 1)
    expect(anySeed(four, wall, 'skill_splash')).toBe(true)
  })

  it('슬라임 5 — 5초마다 회복한다', () => {
    const five = team(['green_blob', 'pink_blob', 'cat', 'spiky_blob', 'wizard'])
    const tanky = team(['dino', 'yeti'], 1)
    const r = simulate({ boardA: five, boardB: tanky, seed: 4, data })
    const regen = r.log.filter((e) => e.type === 'heal' && e.tick % (data.combat.tickRate * 5) === 0)
    expect(regen.length).toBeGreaterThan(0)
  })
})

describe('결정론', () => {
  it('새 효과가 붙어도 같은 시드는 같은 로그를 낸다', () => {
    // 새 효과 하나라도 Math.random 을 쓰면 여기서 갈린다.
    const comp = team(['cat', 'pigeon', 'ghost', 'ninja'])
    const a = simulate({ boardA: comp, boardB: DUMMY, seed: 11, data })
    const b = simulate({ boardA: comp, boardB: DUMMY, seed: 11, data })
    expect(a.log).toEqual(b.log)
    expect(a.ticks).toBe(b.ticks)
  })
})

describe('전멸 방지', () => {
  it('모든 시너지를 켜도 전투가 끝난다 — 무한 부활·무한 회복이 없다', () => {
    const wide = team(['goleling', 'ghost_skull', 'green_blob', 'pink_blob', 'spiky_blob'], 3)
    const r = simulate({ boardA: wide, boardB: wide, seed: 9, data })
    expect(r.ticks).toBeLessThanOrEqual(data.combat.maxTicks)
    expect(['A', 'B', 'draw']).toContain(r.winner)
  })
})
