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
  itemAt,
  isFreeLevel,
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
  // 트랙이 한 줄이 되면서 칸마다 보상이 하나다 — 물건이 걸린 칸은 젬이 없다.
  it('물건이 걸린 칸은 젬을 안 준다', () => {
    const level = data.cosmetics.boards.find((b) => b.unlock === 'pass').passLevel
    expect(gemsAt(level, data)).toBe(0)
  })

  // 무료 칸이 아홉뿐이라 프리미엄 칸과 같은 값이면 한 시즌을 다 돌아도
  // 젬 상점에서 살 수 있는 것이 없다.
  it('무료 칸이 잠긴 칸보다 많이 준다', () => {
    const free = data.pass.freeLevels.find((lv) => !itemAt(lv, data))
    const locked = [...Array(data.pass.maxLevel)]
      .map((_, i) => i + 1)
      .find((lv) => !data.pass.freeLevels.includes(lv) && !itemAt(lv, data))
    expect(gemsAt(free, data)).toBe(data.pass.gems.freeAmount)
    expect(gemsAt(locked, data)).toBe(data.pass.gems.amount)
    expect(gemsAt(free, data)).toBeGreaterThan(gemsAt(locked, data))
  })

  it('트랙 밖 단계는 0 이다', () => {
    expect(gemsAt(0, data)).toBe(0)
    expect(gemsAt(data.pass.maxLevel + 1, data)).toBe(0)
  })

  it('이미 지난 단계는 다시 안 준다', () => {
    const lv = data.pass.freeLevels[1]
    // from 이 곧 지급 단계여도 그건 저번에 받은 것이다
    expect(gemsBetween(lv, lv, false, data)).toBe(0)
  })

  // 자물쇠를 그려 놓고 젬만 주면 그 자물쇠가 거짓말이 된다.
  it('안 샀으면 잠긴 칸의 젬은 안 들어온다', () => {
    const locked = [...Array(data.pass.maxLevel)]
      .map((_, i) => i + 1)
      .find((lv) => !data.pass.freeLevels.includes(lv) && !itemAt(lv, data))
    expect(gemsBetween(locked - 1, locked, false, data)).toBe(0)
    expect(gemsBetween(locked - 1, locked, true, data)).toBe(gemsAt(locked, data))
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
    // 젬이 걸린 무료 칸 직전까지 채워 두고 한 판 더
    const lv = data.pass.freeLevels.find((x) => x > 1 && !itemAt(x, data))
    const before = { xp: per * (lv - 1) - 1, level: lv - 1, premium: false }
    expect(advancePass(before, 1, data).earned).toBe(gemsAt(lv, data))
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
      expect(t[x.passLevel - 1].item?.id, `${x.id}`).toBe(x.id)
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

  it('한 줄이고 칸마다 보상이 하나다', () => {
    for (const t of track()) {
      const something = t.gems > 0 || t.item
      expect(something, `${t.level}단계가 비었다`).toBeTruthy()
      // 물건과 젬을 같이 주지 않는다 — 칸 하나에 보상 하나다.
      expect(!(t.item && t.gems > 0), `${t.level}단계에 둘 다 있다`).toBe(true)
    }
  })

  it('무료 칸이 아홉이고 나머지는 잠겨 있다', () => {
    const free = track().filter((t) => t.free)
    expect(free.map((t) => t.level)).toEqual(data.pass.freeLevels)
    expect(track().length - free.length).toBe(data.pass.maxLevel - free.length)
  })

  it('무료 칸에도 물건이 여럿 있다 — 안 사면 볼 것이 없으면 트랙이 광고가 된다', () => {
    expect(track().filter((t) => t.free && t.item).length).toBeGreaterThanOrEqual(5)
  })

  it('잠긴 칸에도 물건이 있다 — 살 이유가 물건이어야 한다', () => {
    expect(track().filter((t) => !t.free && t.item).length).toBeGreaterThanOrEqual(3)
  })

  it('세 종류가 다 트랙에 뜬다 — 아바타만 있으면 한 줄짜리로 읽힌다', () => {
    const kinds = new Set(track().filter((t) => t.item).map((t) => t.item.kind))
    expect([...kinds].sort()).toEqual(['avatar', 'board', 'boom'])
  })

  it('잠긴 칸의 물건도 그대로 보여 준다', () => {
    const t = track().find((x) => x.level === 9)
    expect(t.item?.id).toBe('voidstone')
    expect(t.free).toBe(false)
  })

  it('무대 보상은 색을, 이펙트 보상은 fx 를 들고 온다 — 화면이 그걸로 그린다', () => {
    expect(track().find((x) => x.level === 4).item.colors).toBeTruthy()
    expect(track().find((x) => x.level === 7).item.fx).toBeTruthy()
  })

  it('내 단계까지는 지난 칸으로 표시된다', () => {
    const t = passTrack(data, { xp: data.pass.xpPerLevel * 3, level: 4, premium: false })
    expect(t[3].reached).toBe(true)
    expect(t[4].reached).toBe(false)
  })
})
