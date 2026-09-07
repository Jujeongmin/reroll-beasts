import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { validate } from '../tools/validate.mjs'

const data = await loadData()

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

describe('validate', () => {
  it('현재 데이터는 모든 불변식을 통과한다', () => {
    expect(validate(data)).toEqual([])
  })

  it('티어 확률 합이 100 이 아니면 잡아낸다', () => {
    const bad = clone(data)
    bad.shop.tierOdds['5'] = [45, 33, 20, 3, 0]
    expect(validate(bad).some((m) => m.includes('확률 합'))).toBe(true)
  })

  it('없는 종족을 참조하면 잡아낸다', () => {
    const bad = clone(data)
    bad.units.units[0].origin = 'nonexistent'
    expect(validate(bad).some((m) => m.includes('종족'))).toBe(true)
  })

  it('시너지 보유 유닛 수가 최대 활성 단계보다 적으면 잡아낸다', () => {
    const bad = clone(data)
    const ranger = bad.traits.classes.find((c) => c.id === 'shooter')
    ranger.steps = [2, 3, 9]
    ranger.effects.push({ scope: 'trait' })
    expect(validate(bad).some((m) => m.includes('활성 단계'))).toBe(true)
  })

  it('시너지에 T1 진입점이 없으면 잡아낸다', () => {
    const bad = clone(data)
    for (const u of bad.units.units) if (u.class === 'shooter') u.tier = 2
    expect(validate(bad).some((m) => m.includes('T1 진입점'))).toBe(true)
  })

  it('티어별 종수와 pool 정의가 어긋나면 잡아낸다', () => {
    const bad = clone(data)
    bad.shop.pool['1'].unitCount = 9
    expect(validate(bad).some((m) => m.includes('티어별 종수'))).toBe(true)
  })

  it('T5 3성이 봉쇄되지 않으면 잡아낸다', () => {
    const bad = clone(data)
    bad.shop.pool['5'].copiesPerUnit = 12
    expect(validate(bad).some((m) => m.includes('T5 3성'))).toBe(true)
  })

  it('없는 직업 계수를 참조하면 잡아낸다', () => {
    const bad = clone(data)
    delete bad.combat.classModifier.shooter
    expect(validate(bad).some((m) => m.includes('직업 계수'))).toBe(true)
  })

  it('steps 와 effects 길이가 다르면 잡아낸다', () => {
    const bad = clone(data)
    bad.traits.origins[0].steps = [2, 4]
    expect(validate(bad).some((m) => m.includes('effects 길이'))).toBe(true)
  })

  it('아이템 효과 키에 오타가 나면 잡아낸다', () => {
    const bad = clone(data)
    bad.items.items[0].effect = { atkPercent: 20 }
    expect(validate(bad).some((m) => m.includes('아무도 읽지 않는다'))).toBe(true)
  })

  it('없는 라운드에 아이템을 지급하면 잡아낸다', () => {
    const bad = clone(data)
    bad.items.grantRounds = ['9-9']
    expect(validate(bad).some((m) => m.includes('실재하지 않는다'))).toBe(true)
  })
})

describe('미션 표', () => {
  it('id 가 겹치지 않는다', () => {
    const ids = data.missions.missions.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // 모르는 kind 는 조용히 0 점이 된다 — 화면에는 뜨는데 영원히 안 차는
  // 미션이 그것이다. 그래서 표를 고치는 그 자리에서 걸려야 한다.
  it('망가진 미션 줄을 잡는다', () => {
    const bad = clone(data)
    bad.missions.missions = [
      { id: 'a', kind: '없는종류', target: 1, xp: 10, text: 'x' },
      { id: 'b', kind: 'games', target: 0, xp: 10, text: 'x' },
      { id: 'c', kind: 'games', target: 1, xp: 0, text: 'x' },
      { id: 'c', kind: 'games', target: 1, xp: 10, text: 'x' },
    ]
    const errs = validate(bad)
    expect(errs.some((e) => e.includes('없는종류'))).toBe(true)
    expect(errs.some((e) => e.includes('target'))).toBe(true)
    expect(errs.some((e) => e.includes('xp'))).toBe(true)
    expect(errs.some((e) => e.includes('겹친다'))).toBe(true)
  })

  it('하루에 뽑을 수가 표보다 많으면 잡는다 — 같은 미션이 두 번 뽑힌다', () => {
    const bad = clone(data)
    bad.missions.perDay = 99
    expect(validate(bad).some((e) => e.includes('perDay'))).toBe(true)
  })
})

describe('패스 보상', () => {
  it('단계가 범위 밖이면 잡는다', () => {
    const bad = clone(data)
    bad.cosmetics.boards.push({ id: 'x', name: 'x', unlock: 'pass', passLevel: 99, colors: {} })
    expect(validate(bad).some((m) => m.includes('단계'))).toBe(true)
  })

  // 무료 칸 목록이 트랙의 유일한 단일소스다. 범위 밖 단계를 적으면 그 칸은
  // 영영 안 열리고 화면에는 자물쇠만 남는다.
  it('범위 밖 무료 칸을 잡는다', () => {
    const bad = clone(data)
    bad.pass.freeLevels = [1, 99]
    expect(validate(bad).some((m) => m.includes('무료 칸'))).toBe(true)
  })

  it('무료 칸이 겹치면 잡는다', () => {
    const bad = clone(data)
    bad.pass.freeLevels = [1, 1, 4]
    expect(validate(bad).some((m) => m.includes('두 번'))).toBe(true)
  })

  it('무료 칸이 없거나 전부이면 잡는다 — 광고판이거나 팔 것이 없다', () => {
    const none = clone(data)
    none.pass.freeLevels = []
    expect(validate(none).some((m) => m.includes('하나도 없다'))).toBe(true)

    const all = clone(data)
    all.pass.freeLevels = [...Array(all.pass.maxLevel)].map((_, i) => i + 1)
    expect(validate(all).some((m) => m.includes('팔 것이 없다'))).toBe(true)
  })

  it('한 칸에 큰 보상이 둘이면 잡는다 — 화면이 하나만 그린다', () => {
    const bad = clone(data)
    bad.cosmetics.boards.push({ id: 'x', name: 'x', unlock: 'pass', passLevel: 10, colors: {} })
    expect(validate(bad).some((m) => m.includes('겹친다'))).toBe(true)
  })

  it('없는 아바타 파일을 잡는다 — 트랙에 빈 액자가 뜬다', () => {
    const bad = clone(data)
    bad.cosmetics.avatars.push({
      id: 'x', name: 'x', pack: 'chars', file: '없는파일.glb', unlock: 'pass', passLevel: 3,
    })
    expect(validate(bad).some((m) => m.includes('파일'))).toBe(true)
  })
})
