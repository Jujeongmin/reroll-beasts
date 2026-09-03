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
  it('무료는 정해진 간격에서만 준다', () => {
    const every = data.pass.gems.free.everyLevels
    expect(gemsAt(every, 'free', data)).toBe(data.pass.gems.free.amount)
    expect(gemsAt(every + 1, 'free', data)).toBe(0)
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

  it('아바타 단계는 cosmetics 가 정한 그대로다 — 두 표가 어긋나면 안 된다', () => {
    const t = passTrack(data, EMPTY_PASS)
    for (const a of data.cosmetics.avatars.filter((x) => x.unlock === 'pass')) {
      expect(t[a.passLevel - 1].free.avatar?.id).toBe(a.id)
    }
  })

  it('패스에 적힌 아바타 단계가 트랙 범위를 넘지 않는다', () => {
    for (const a of data.cosmetics.avatars.filter((x) => x.unlock === 'pass')) {
      expect(a.passLevel).toBeLessThanOrEqual(data.pass.maxLevel)
      expect(a.passLevel).toBeGreaterThanOrEqual(1)
    }
  })
})
