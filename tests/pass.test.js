// 시즌 패스 진행 규칙. 서버가 쓰는 값과 화면이 그리는 값이 같은 함수를
// 타야 하므로, 그 함수가 여기서 못박힌다.
import { describe, it, expect, beforeAll } from 'vitest'
import { loadData } from '../sim/data.js'
import {
  EMPTY_PASS,
  xpForRank,
  xpCap,
  passLevelOf,
  passProgress,
  gemsAt,
  gemsBetween,
  addPassXp,
  advancePass,
  passTrack,
} from '../sim/pass.js'

let data
beforeAll(async () => {
  data = await loadData()
})

describe('xpForRank', () => {
  it('높은 순위가 더 준다', () => {
    for (let r = 1; r < 8; r++) {
      expect(xpForRank(r, data)).toBeGreaterThan(xpForRank(r + 1, data))
    }
  })

  it('꼴찌도 0 은 아니다 — 진 판이 아무것도 아니면 끝까지 둘 이유가 없다', () => {
    expect(xpForRank(8, data)).toBeGreaterThan(0)
  })

  it('일반 판은 랭크의 절반', () => {
    expect(xpForRank(1, data, { ranked: false })).toBe(
      Math.round(xpForRank(1, data) * data.pass.casualScale),
    )
  })

  it('순위가 아니면 0 — 없는 칸을 읽어 NaN 이 새면 경험치가 통째로 망가진다', () => {
    expect(xpForRank(99, data)).toBe(0)
    expect(xpForRank(0, data)).toBe(0)
  })
})

describe('passLevelOf', () => {
  it('0 경험치는 1단계다', () => {
    expect(passLevelOf(0, data)).toBe(1)
  })

  it('한 단계치를 채우면 2단계', () => {
    expect(passLevelOf(data.pass.xpPerLevel - 1, data)).toBe(1)
    expect(passLevelOf(data.pass.xpPerLevel, data)).toBe(2)
  })

  it('최고 단계를 넘지 않는다', () => {
    expect(passLevelOf(999999, data)).toBe(data.pass.maxLevel)
  })
})

describe('passProgress', () => {
  it('막 단계가 오른 직후 게이지는 비어 있다', () => {
    const p = passProgress(data.pass.xpPerLevel, data)
    expect(p.level).toBe(2)
    expect(p.into).toBe(0)
    expect(p.ratio).toBe(0)
  })

  it('최고 단계는 꽉 찬 것으로 준다 — 0 으로 주면 방금 초기화된 것처럼 보인다', () => {
    const p = passProgress(xpCap(data), data)
    expect(p.done).toBe(true)
    expect(p.ratio).toBe(1)
  })
})

describe('gemsAt / gemsBetween', () => {
  // 무료도 이제 **매 단계** 준다(빈칸을 없애려고). 대신 다섯 칸마다 조금 더
  // 얹는다 — 다음 다섯 번째 칸이 곧 다음 목표가 된다.
  it('무료는 매 단계 주고, 다섯 칸마다 더 준다', () => {
    const rule = data.pass.gems.free
    expect(gemsAt(1, 'free', data)).toBe(rule.amount)
    expect(gemsAt(4, 'free', data)).toBe(rule.amount)
    expect(gemsAt(5, 'free', data)).toBe(rule.amount + rule.bonusAmount)
  })

  it('이미 지난 단계는 다시 안 준다', () => {
    const every = data.pass.gems.free.everyLevels
    // from 이 곧 지급 단계여도 그건 저번에 받은 것이다
    expect(gemsBetween(every, every, false, data)).toBe(0)
  })

  it('프리미엄이면 무료 몫도 같이 받는다 — 더 적게 받는 일은 없어야 한다', () => {
    const max = data.pass.maxLevel
    const free = gemsBetween(1, max, false, data)
    const both = gemsBetween(1, max, true, data)
    expect(both).toBeGreaterThan(free)
  })
})

describe('advancePass', () => {
  it('저장된 값이 없어도 돈다', () => {
    const next = advancePass(null, 1, data)
    expect(next.xp).toBe(xpForRank(1, data))
    expect(next.level).toBe(passLevelOf(next.xp, data))
  })

  it('원본을 안 고친다 — 쓰기 실패와 성공을 구분할 수 없게 된다', () => {
    const prev = { xp: 50, level: 1, premium: false }
    const copy = { ...prev }
    advancePass(prev, 1, data)
    expect(prev).toEqual(copy)
  })

  it('단계를 넘을 때만 젬이 붙는다', () => {
    const per = data.pass.xpPerLevel
    const every = data.pass.gems.free.everyLevels
    // 지급 단계 직전까지 채워 두고 한 판 더
    const before = { xp: per * (every - 1) - 1, level: every - 1, premium: false }
    expect(advancePass(before, 1, data).earned).toBe(data.pass.gems.free.amount)
    // 지급 단계가 없는 구간이면 0
    const flat = { xp: 0, level: 1, premium: false }
    expect(advancePass(flat, 8, data).earned).toBe(0)
  })

  it('최고 단계에 닿으면 경험치가 더 안 쌓인다', () => {
    const maxed = { xp: xpCap(data), level: data.pass.maxLevel, premium: false }
    const next = advancePass(maxed, 1, data)
    expect(next.xp).toBe(xpCap(data))
    expect(next.earned).toBe(0)
  })

  it('프리미엄 여부는 판을 돈다고 바뀌지 않는다', () => {
    expect(advancePass({ ...EMPTY_PASS, premium: true }, 4, data).premium).toBe(true)
    expect(advancePass(null, 4, data).premium).toBe(false)
  })
})

describe('passTrack', () => {
  it('모든 단계를 준다 — 잠긴 것도 보여야 계속할 이유가 생긴다', () => {
    const t = passTrack(data, EMPTY_PASS)
    expect(t.length).toBe(data.pass.maxLevel)
    expect(t[0].reached).toBe(true)
    expect(t.at(-1).reached).toBe(false)
  })

  it('보상 단계는 cosmetics 가 정한 그대로다 — 두 표가 어긋나면 안 된다', () => {
    const t = passTrack(data, EMPTY_PASS)
    const all = [
      ...data.cosmetics.avatars,
      ...data.cosmetics.boards,
      ...data.cosmetics.booms,
    ].filter((x) => x.unlock === 'pass')
    for (const x of all) {
      const row = t[x.passLevel - 1]
      const slot = (x.passTrack ?? 'free') === 'premium' ? row.premium : row.free
      expect(slot.item?.id, `${x.id}`).toBe(x.id)
    }
  })

  it('패스에 적힌 아바타 단계가 트랙 범위를 넘지 않는다', () => {
    for (const a of data.cosmetics.avatars.filter((x) => x.unlock === 'pass')) {
      expect(a.passLevel).toBeLessThanOrEqual(data.pass.maxLevel)
      expect(a.passLevel).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('addPassXp — 경험치를 직접 더한다', () => {
  // 미션 보상은 순위가 아니라 정해진 경험치다. advancePass 는 순위를 받으므로
  // 그대로는 못 쓴다. 단계가 오를 때 젬을 주는 셈을 두 곳에 적으면, 미션으로
  // 오른 단계만 젬을 안 주는 일이 생긴다 — 그래서 한 함수로 모은다.
  it('경험치가 오르고 단계가 따라 오른다', () => {
    const r = addPassXp({ xp: 90, level: 1, premium: false }, 30, data)
    expect(r.xp).toBe(120)
    expect(r.level).toBe(2)
  })

  it('단계가 오르면 젬도 같이 나온다', () => {
    const r = addPassXp({ xp: 0, level: 1, premium: true }, data.pass.xpPerLevel * 5, data)
    expect(r.earned).toBeGreaterThan(0)
  })

  it('최고 단계를 넘겨 쌓이지 않는다', () => {
    const r = addPassXp({ xp: 0, level: 1, premium: false }, 999999, data)
    expect(r.level).toBe(data.pass.maxLevel)
    expect(r.xp).toBe(xpCap(data))
  })

  it('프리미엄은 그대로 넘어간다', () => {
    expect(addPassXp({ xp: 0, level: 1, premium: true }, 10, data).premium).toBe(true)
  })

  it('없는 패스에도 얹힌다 — 한 판도 안 한 사람이 미션부터 받을 수 있다', () => {
    const r = addPassXp(null, 50, data)
    expect(r.xp).toBe(50)
    expect(r.level).toBe(1)
  })

  it('음수는 안 깎는다 — 미션이 경험치를 빼앗는 길은 없다', () => {
    expect(addPassXp({ xp: 100, level: 2, premium: false }, -50, data).xp).toBe(100)
  })
})

describe('트랙을 채운다', () => {
  const track = () => passTrack(data, { xp: 0, level: 1, premium: false })

  it('빈 줄이 없다 — 젬이든 물건이든 매 단계 뭔가 있다', () => {
    for (const t of track()) {
      const something = t.free.gems > 0 || t.free.item || t.premium.gems > 0 || t.premium.item
      expect(something, `${t.level}단계가 비었다`).toBeTruthy()
    }
  })

  it('무료 젬 총합이 325 다', () => {
    expect(track().reduce((n, t) => n + t.free.gems, 0)).toBe(325)
  })

  it('프리미엄 젬 총합이 1000 이다', () => {
    expect(track().reduce((n, t) => n + t.premium.gems, 0)).toBe(1000)
  })

  it('무대·이펙트 보상도 트랙에 뜬다 — 아바타만 그리면 나머지가 사라진다', () => {
    const kinds = new Set()
    for (const t of track()) {
      if (t.free.item) kinds.add(t.free.item.kind)
      if (t.premium.item) kinds.add(t.premium.item.kind)
    }
    expect([...kinds].sort()).toEqual(['avatar', 'board', 'boom'])
  })

  it('프리미엄 전용은 프리미엄 줄에 뜬다', () => {
    const t = track().find((x) => x.level === 9)
    expect(t.premium.item?.id).toBe('voidstone')
    expect(t.free.item).toBe(null)
  })

  it('무대 보상은 색을, 이펙트 보상은 fx 를 들고 온다 — 화면이 그걸로 그린다', () => {
    expect(track().find((x) => x.level === 4).free.item.colors).toBeTruthy()
    expect(track().find((x) => x.level === 7).free.item.fx).toBeTruthy()
  })

  it('내 단계까지는 지난 칸으로 표시된다', () => {
    const t = passTrack(data, { xp: data.pass.xpPerLevel * 3, level: 4, premium: false })
    expect(t[3].reached).toBe(true)
    expect(t[4].reached).toBe(false)
  })
})
