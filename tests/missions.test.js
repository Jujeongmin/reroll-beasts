// 일일 미션. 오늘의 3개는 **저장하지 않고 다시 계산한다** — 저장하면 목록이
// 두 벌(서버가 만든 것과 화면이 그린 것)이 되는 자리가 생긴다. 그 재계산이
// 언제나 같은 답을 낸다는 것이 이 파일이 지키는 전부다.
import { describe, it, expect, beforeAll } from 'vitest'
import { loadData } from '../sim/data.js'
import {
  dayKeyOf,
  missionsFor,
  rollMissions,
  advanceMissions,
  claimMission,
} from '../sim/missions.js'

let data
beforeAll(async () => {
  data = await loadData()
})

const DAY = '2026-09-07'
const ctx = (over = {}) => ({
  account: 'me',
  dayKey: DAY,
  rank: 5,
  ranked: false,
  board: [],
  level: 3,
  roundWins: 0,
  ...over,
})

/** 그 종류 하나만 든 표. 추첨에 기대면 테스트가 흔들린다. */
const only = (id, all) => {
  const m = all.missions.missions.find((x) => x.id === id)
  return { ...all, missions: { perDay: 1, missions: [m] } }
}

const board = (n, star = 1, items = []) =>
  Array.from({ length: n }, (_, i) => ({ unitId: 'green_blob', star, tile: i, items }))

describe('dayKeyOf', () => {
  // UTC 로 읽는 이유는 season.js 와 같다: 로컬 시간대로 읽으면 같은 순간에
  // 한국은 미션이 갈렸고 미국은 안 갈린 상태가 된다.
  it('UTC 날짜를 준다', () => {
    expect(dayKeyOf(Date.parse('2026-09-07T00:00:00Z'))).toBe('2026-09-07')
    expect(dayKeyOf(Date.parse('2026-09-07T23:59:59Z'))).toBe('2026-09-07')
    expect(dayKeyOf(Date.parse('2026-09-08T00:00:00Z'))).toBe('2026-09-08')
  })
})

describe('missionsFor — 오늘의 3개', () => {
  it('같은 날 같은 계정이면 언제 물어도 같다', () => {
    const a = missionsFor(DAY, 'me', data)
    const b = missionsFor(DAY, 'me', data)
    expect(a).toEqual(b)
    expect(a).toHaveLength(data.missions.perDay)
  })

  it('같은 미션이 두 번 안 뽑힌다 — 한 줄이 값 없이 자리만 차지한다', () => {
    const ids = missionsFor(DAY, 'me', data).map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  // 전원이 같은 3개를 받으면 "오늘은 할 게 없다"가 모두에게 동시에 일어난다.
  it('계정이 다르면 목록이 갈린다', () => {
    const mine = missionsFor(DAY, 'me', data)
      .map((m) => m.id)
      .join()
    const others = ['a', 'b', 'c', 'd', 'e'].map((x) =>
      missionsFor(DAY, x, data)
        .map((m) => m.id)
        .join(),
    )
    expect(others.some((t) => t !== mine)).toBe(true)
  })

  it('날짜가 다르면 목록이 갈린다', () => {
    const key = (d) =>
      missionsFor(d, 'me', data)
        .map((m) => m.id)
        .join()
    const days = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10']
    expect(new Set(days.map(key)).size).toBeGreaterThan(1)
  })

  it('표보다 많이 뽑지 않는다', () => {
    const small = { ...data, missions: { perDay: 9, missions: data.missions.missions.slice(0, 2) } }
    expect(missionsFor(DAY, 'me', small)).toHaveLength(2)
  })
})

describe('rollMissions — 날짜가 갈리면', () => {
  it('없던 사람에게 판을 깔아 준다', () => {
    const s = rollMissions(null, DAY)
    expect(s.day).toBe(DAY)
    expect(s.progress).toEqual([0, 0, 0])
    expect(s.claimed).toEqual([false, false, false])
  })

  it('같은 날이면 그대로 둔다', () => {
    const prev = { day: DAY, progress: [1, 0, 2], claimed: [false, false, true] }
    expect(rollMissions(prev, DAY)).toEqual(prev)
  })

  // 다 찬 미션도 함께 지워진다. 밀린 보상이 쌓이면 매일 들어올 이유가 없어진다.
  it('날짜가 갈리면 진행도 수령도 지운다', () => {
    const prev = { day: '2026-09-06', progress: [9, 9, 9], claimed: [true, false, false] }
    const s = rollMissions(prev, DAY)
    expect(s.progress).toEqual([0, 0, 0])
    expect(s.claimed).toEqual([false, false, false])
  })
})

describe('advanceMissions — 판 하나가 남기는 것', () => {
  it('판을 끝내면 games 가 오른다', () => {
    const d = only('play_2', data)
    const s = advanceMissions(null, ctx(), d)
    expect(s.progress[0]).toBe(1)
    expect(advanceMissions(s, ctx(), d).progress[0]).toBe(2)
  })

  it('목표를 넘겨 쌓지 않는다 — 3/2 는 아무 뜻도 없다', () => {
    const d = only('play_2', data)
    let s = null
    for (let i = 0; i < 5; i++) s = advanceMissions(s, ctx(), d)
    expect(s.progress[0]).toBe(2)
  })

  it('일반 판은 rankedGames 를 안 올린다', () => {
    const d = only('ranked_1', data)
    expect(advanceMissions(null, ctx({ ranked: false }), d).progress[0]).toBe(0)
    expect(advanceMissions(null, ctx({ ranked: true }), d).progress[0]).toBe(1)
  })

  it('4위 안이면 top4 가 오른다', () => {
    const d = only('top4', data)
    expect(advanceMissions(null, ctx({ rank: 4 }), d).progress[0]).toBe(1)
    expect(advanceMissions(null, ctx({ rank: 5 }), d).progress[0]).toBe(0)
  })

  it('1위면 firstPlace 가 오른다', () => {
    const d = only('win_1', data)
    expect(advanceMissions(null, ctx({ rank: 1 }), d).progress[0]).toBe(1)
    expect(advanceMissions(null, ctx({ rank: 2 }), d).progress[0]).toBe(0)
  })

  it('3성이 판에 있으면 threeStar 가 오른다', () => {
    const d = only('three_star', data)
    expect(advanceMissions(null, ctx({ board: board(1, 3) }), d).progress[0]).toBe(1)
    expect(advanceMissions(null, ctx({ board: board(1, 2) }), d).progress[0]).toBe(0)
  })

  // 시너지가 **실제로 켜지는** 판이어야 한다. 한 마리만 세우면 어느 시너지도
  // 0 단계라, 최댓값이든 더하기든 결과가 같아 아무것도 못 가린다.
  const traitBoard = () => {
    const t = [...data.traits.origins, ...data.traits.classes].find((x) => x.steps[0] <= 3)
    const members = data.units.units
      .filter((u) => u.origin === t.id || u.class === t.id)
      .slice(0, t.steps[0])
    return members.map((u, i) => ({ unitId: u.id, star: 1, tile: i, items: [] }))
  }

  it('시너지가 켜지면 그 단계만큼 오른다 — 보드 칸을 유닛으로 옮겨 세야 한다', () => {
    const d = only('trait_3', data)
    const s = advanceMissions(null, ctx({ board: traitBoard() }), d)
    expect(s.progress[0]).toBeGreaterThan(0)
  })

  // 최댓값으로 세는 이유: 더하기로 세면 "시너지 3단계"가 1단계 세 판으로
  // 채워진다. 그건 다른 과제다.
  it('시너지는 한 판의 최고 단계이고 더해지지 않는다', () => {
    const d = only('trait_3', data)
    const b = traitBoard()
    const s1 = advanceMissions(null, ctx({ board: b }), d)
    const s2 = advanceMissions(s1, ctx({ board: b }), d)
    expect(s2.progress[0]).toBe(s1.progress[0])
  })

  it('아이템 수도 최댓값이다 — 적게 낀 판이 뒤에 와도 안 깎인다', () => {
    const d = only('items_3', data)
    const two = ctx({ board: board(1, 1, ['steel_sword', 'swift_gloves']) })
    const one = ctx({ board: board(1, 1, ['steel_sword']) })
    const s1 = advanceMissions(null, two, d)
    expect(s1.progress[0]).toBe(2)
    expect(advanceMissions(s1, one, d).progress[0]).toBe(2)
  })

  it('레벨만큼 세우면 boardFull 이 오른다', () => {
    const d = only('board_full', data)
    expect(advanceMissions(null, ctx({ board: board(3), level: 3 }), d).progress[0]).toBe(1)
    expect(advanceMissions(null, ctx({ board: board(2), level: 3 }), d).progress[0]).toBe(0)
  })

  it('빈 판은 꽉 찬 것이 아니다 — 죽어서 판이 비었을 수도 있다', () => {
    const d = only('board_full', data)
    expect(advanceMissions(null, ctx({ board: [], level: 0 }), d).progress[0]).toBe(0)
  })

  it('라운드 승수도 최댓값이다', () => {
    const d = only('round_wins', data)
    const s1 = advanceMissions(null, ctx({ roundWins: 4 }), d)
    expect(s1.progress[0]).toBe(3) // target 3 을 넘겨 쌓지 않는다
    expect(advanceMissions(s1, ctx({ roundWins: 2 }), d).progress[0]).toBe(3)
  })

  it('날짜가 갈렸으면 새 판으로 센다', () => {
    const d = only('play_2', data)
    const old = { day: '2026-09-01', progress: [2], claimed: [true] }
    const s = advanceMissions(old, ctx(), d)
    expect(s.day).toBe(DAY)
    expect(s.progress[0]).toBe(1)
    expect(s.claimed[0]).toBe(false)
  })

  it('원본을 안 고친다 — 서버가 읽어 고쳐 쓰는 흐름이다', () => {
    const d = only('play_2', data)
    const prev = { day: DAY, progress: [0], claimed: [false] }
    advanceMissions(prev, ctx(), d)
    expect(prev.progress).toEqual([0])
  })
})

describe('claimMission — 수령', () => {
  const d = () => only('play_2', data)
  const who = { dayKey: DAY, account: 'me' }

  it('다 찼으면 그 미션의 경험치를 준다', () => {
    const full = { day: DAY, progress: [2], claimed: [false] }
    const r = claimMission(full, 0, who, d())
    expect(r.xp).toBe(30)
    expect(r.state.claimed[0]).toBe(true)
  })

  // 화면에서만 막으면 잠금은 장식이다 — 조작된 호출 하나로 안 한 미션의
  // 경험치가 들어온다.
  it('안 찼으면 안 준다', () => {
    const half = { day: DAY, progress: [1], claimed: [false] }
    expect(claimMission(half, 0, who, d()).xp).toBe(0)
  })

  it('이미 받았으면 또 안 준다', () => {
    const done = { day: DAY, progress: [2], claimed: [true] }
    expect(claimMission(done, 0, who, d()).xp).toBe(0)
  })

  it('없는 자리는 안 준다', () => {
    const full = { day: DAY, progress: [2], claimed: [false] }
    expect(claimMission(full, 5, who, d()).xp).toBe(0)
    expect(claimMission(full, -1, who, d()).xp).toBe(0)
  })

  it('지난 날짜의 진행도로는 못 받는다 — 오늘 것만 오늘 받는다', () => {
    const stale = { day: '2026-09-01', progress: [2], claimed: [false] }
    expect(claimMission(stale, 0, who, d()).xp).toBe(0)
  })

  it('원본을 안 고친다', () => {
    const full = { day: DAY, progress: [2], claimed: [false] }
    claimMission(full, 0, who, d())
    expect(full.claimed).toEqual([false])
  })
})
