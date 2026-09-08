import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { validate } from '../tools/validate.mjs'

const data = await loadData()

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

describe('validate', () => {
  it('현재 데이터는 모든 불변식을 통과한다', async () => {
    expect(await validate(data)).toEqual([])
  })

  it('티어 확률 합이 100 이 아니면 잡아낸다', async () => {
    const bad = clone(data)
    bad.shop.tierOdds['5'] = [45, 33, 20, 3, 0]
    expect((await validate(bad)).some((m) => m.includes('확률 합'))).toBe(true)
  })

  it('없는 종족을 참조하면 잡아낸다', async () => {
    const bad = clone(data)
    bad.units.units[0].origin = 'nonexistent'
    expect((await validate(bad)).some((m) => m.includes('종족'))).toBe(true)
  })

  it('시너지 보유 유닛 수가 최대 활성 단계보다 적으면 잡아낸다', async () => {
    const bad = clone(data)
    const ranger = bad.traits.classes.find((c) => c.id === 'shooter')
    ranger.steps = [2, 3, 9]
    ranger.effects.push({ scope: 'trait' })
    expect((await validate(bad)).some((m) => m.includes('활성 단계'))).toBe(true)
  })

  it('시너지에 T1 진입점이 없으면 잡아낸다', async () => {
    const bad = clone(data)
    for (const u of bad.units.units) if (u.class === 'shooter') u.tier = 2
    expect((await validate(bad)).some((m) => m.includes('T1 진입점'))).toBe(true)
  })

  it('티어별 종수와 pool 정의가 어긋나면 잡아낸다', async () => {
    const bad = clone(data)
    bad.shop.pool['1'].unitCount = 9
    expect((await validate(bad)).some((m) => m.includes('티어별 종수'))).toBe(true)
  })

  it('T5 3성이 봉쇄되지 않으면 잡아낸다', async () => {
    const bad = clone(data)
    bad.shop.pool['5'].copiesPerUnit = 12
    expect((await validate(bad)).some((m) => m.includes('T5 3성'))).toBe(true)
  })

  it('없는 직업 계수를 참조하면 잡아낸다', async () => {
    const bad = clone(data)
    delete bad.combat.classModifier.shooter
    expect((await validate(bad)).some((m) => m.includes('직업 계수'))).toBe(true)
  })

  it('steps 와 effects 길이가 다르면 잡아낸다', async () => {
    const bad = clone(data)
    bad.traits.origins[0].steps = [2, 4]
    expect((await validate(bad)).some((m) => m.includes('effects 길이'))).toBe(true)
  })

  it('아이템 효과 키에 오타가 나면 잡아낸다', async () => {
    const bad = clone(data)
    bad.items.items[0].effect = { atkPercent: 20 }
    expect((await validate(bad)).some((m) => m.includes('아무도 읽지 않는다'))).toBe(true)
  })

  it('없는 라운드에 아이템을 지급하면 잡아낸다', async () => {
    const bad = clone(data)
    bad.items.grantRounds = ['9-9']
    expect((await validate(bad)).some((m) => m.includes('실재하지 않는다'))).toBe(true)
  })
})

describe('미션 표', () => {
  it('id 가 겹치지 않는다', async () => {
    const ids = data.missions.missions.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // 모르는 kind 는 조용히 0 점이 된다 — 화면에는 뜨는데 영원히 안 차는
  // 미션이 그것이다. 그래서 표를 고치는 그 자리에서 걸려야 한다.
  it('망가진 미션 줄을 잡는다', async () => {
    const bad = clone(data)
    bad.missions.missions = [
      { id: 'a', kind: '없는종류', target: 1, xp: 10, text: 'x' },
      { id: 'b', kind: 'games', target: 0, xp: 10, text: 'x' },
      { id: 'c', kind: 'games', target: 1, xp: 0, text: 'x' },
      { id: 'c', kind: 'games', target: 1, xp: 10, text: 'x' },
    ]
    const errs = await validate(bad)
    expect(errs.some((e) => e.includes('없는종류'))).toBe(true)
    expect(errs.some((e) => e.includes('target'))).toBe(true)
    expect(errs.some((e) => e.includes('xp'))).toBe(true)
    expect(errs.some((e) => e.includes('겹친다'))).toBe(true)
  })

  it('하루에 뽑을 수가 표보다 많으면 잡는다 — 같은 미션이 두 번 뽑힌다', async () => {
    const bad = clone(data)
    bad.missions.perDay = 99
    expect((await validate(bad)).some((e) => e.includes('perDay'))).toBe(true)
  })
})

describe('패스 보상', () => {
  it('단계가 범위 밖이면 잡는다', async () => {
    const bad = clone(data)
    bad.cosmetics.boards.push({ id: 'x', name: 'x', unlock: 'pass', passLevel: 99, colors: {} })
    expect((await validate(bad)).some((m) => m.includes('단계'))).toBe(true)
  })

  // 무료 칸 목록이 트랙의 유일한 단일소스다. 범위 밖 단계를 적으면 그 칸은
  // 영영 안 열리고 화면에는 자물쇠만 남는다.
  it('범위 밖 무료 칸을 잡는다', async () => {
    const bad = clone(data)
    bad.pass.freeLevels = [1, 99]
    expect((await validate(bad)).some((m) => m.includes('무료 칸'))).toBe(true)
  })

  it('무료 칸이 겹치면 잡는다', async () => {
    const bad = clone(data)
    bad.pass.freeLevels = [1, 1, 4]
    expect((await validate(bad)).some((m) => m.includes('두 번'))).toBe(true)
  })

  it('무료 칸이 없거나 전부이면 잡는다 — 광고판이거나 팔 것이 없다', async () => {
    const none = clone(data)
    none.pass.freeLevels = []
    expect((await validate(none)).some((m) => m.includes('하나도 없다'))).toBe(true)

    const all = clone(data)
    all.pass.freeLevels = [...Array(all.pass.maxLevel)].map((_, i) => i + 1)
    expect((await validate(all)).some((m) => m.includes('팔 것이 없다'))).toBe(true)
  })

  it('한 칸에 큰 보상이 둘이면 잡는다 — 화면이 하나만 그린다', async () => {
    const bad = clone(data)
    bad.cosmetics.boards.push({ id: 'x', name: 'x', unlock: 'pass', passLevel: 10, colors: {} })
    expect((await validate(bad)).some((m) => m.includes('겹친다'))).toBe(true)
  })

  it('없는 아바타 파일을 잡는다 — 트랙에 빈 액자가 뜬다', async () => {
    const bad = clone(data)
    bad.cosmetics.avatars.push({
      id: 'x', name: 'x', pack: 'chars', file: '없는파일.glb', unlock: 'pass', passLevel: 3,
    })
    expect((await validate(bad)).some((m) => m.includes('파일'))).toBe(true)
  })
})

describe('승리 이펙트 형태', () => {
  // style 이 틀리면 예외도 안 나고 그냥 기본 형태로 떨어진다 — 여덟 종이
  // 다시 색만 다른 하나가 된다. 표를 고치는 그 자리에서 걸려야 한다.
  it('모르는 형태를 잡는다', async () => {
    const bad = clone(data)
    bad.cosmetics.booms[0].fx.style = '폭죽'
    expect((await validate(bad)).some((m) => m.includes('형태'))).toBe(true)
  })

  it('형태가 한 가지로 몰려 있지 않다 — 그러면 색만 다른 이펙트가 된다', async () => {
    const styles = new Set(data.cosmetics.booms.map((b) => b.fx.style))
    expect(styles.size).toBeGreaterThanOrEqual(3)
  })
})

describe('모든 언어', () => {
  // 한 언어가 빠지면 그 화면에서만 영어가 섞여 나온다 — 그 언어로 노는
  // 사람에게만 보이는 종류의 흠이라, 여기서 안 잡으면 아무도 못 본다.
  const missing = (m) => m.includes('빠진 언어')

  it('한쪽 언어만 있는 이름을 잡는다', async () => {
    const bad = clone(data)
    bad.items.items[0].name = { ko: '강철검' }
    expect((await validate(bad)).some(missing)).toBe(true)
  })

  it('한쪽 언어만 있는 미션 문구를 잡는다', async () => {
    const bad = clone(data)
    bad.missions.missions[0].text = { en: 'Play 2' }
    expect((await validate(bad)).some(missing)).toBe(true)
  })

  // 한국어·영어만 채우고 새 언어를 잊는 것이 실제로 일어나는 실수다.
  it('나중에 더한 언어가 빠진 것도 잡는다', async () => {
    const bad = clone(data)
    bad.units.units[0].name = { ko: '초록 슬라임', en: 'Green Blob', ja: '緑スライム' }
    expect((await validate(bad)).some(missing)).toBe(true)
  })

  it('멀쩡한 데이터에는 이 흠이 없다', async () => {
    expect((await validate(clone(data))).some(missing)).toBe(false)
  })
})
