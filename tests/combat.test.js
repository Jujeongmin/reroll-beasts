import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadData } from '../sim/data.js'
import { simulate, toFieldTile, resolveTimeout } from '../sim/combat.js'
import { buildBoard } from '../sim/hex.js'

const data = await loadData()

function team(entries) {
  return entries.map(([unitId, star, tile]) => ({ unitId, star, tile }))
}

const weakSide = team([['pink_blob', 1, 0]])
const strongSide = team([['dino', 3, 0], ['dragon', 3, 1], ['blue_demon', 3, 2]])

const HERE = dirname(fileURLToPath(import.meta.url))
const GOLDEN_PATH = join(HERE, 'fixtures', 'combat-golden.json')

// 골든 로그 시나리오. 이동·평타·스킬·치명타·사망을 전부 지나간다.
// 재생성: REGEN_GOLDEN=1 npx vitest run tests/combat.test.js
const GOLDEN_A = team([['pigeon', 2, 0], ['frog', 2, 8]])
const GOLDEN_B = team([['cat', 2, 0], ['mushnub', 2, 8]])
const GOLDEN_SEED = 20260831

const BUFF_GOLDEN_PATH = join(HERE, 'fixtures', 'combat-golden-buffs.json')

// 두 번째 골든. 첫 골든의 로스터는 스탯 버프를 하나도 주지 않아
// combat.js 의 effectiveStat·damageTakenMultiplier 호출부가 전부 무방비였다.
// 여기 A팀은 네 유닛이 모두 버프를 시전한다 — 공격력·방어력·피해감소.
const BUFF_A = team([
  ['yeti', 2, 0],
  ['goleling', 2, 1],
  ['dino', 2, 2],
  ['pink_blob', 2, 3],
])
// B 의 로컬 타일은 3~6 이다. 두 진영은 **180도 회전** 대응이라
// A 의 로컬 0 은 (4,0) 인데 B 의 로컬 0 은 (3,6) — 반대편 구석이다.
// 양쪽 다 0~3 을 쓰면 대각으로 어긋나 yeti·goleling 이 교전을 못 하고
// 버프를 한 번도 안 쓴다. 그러면 이 골든이 지키려던 것이 사라진다.
const BUFF_B = team([
  ['ghost', 2, 3],
  ['cactoro_blob', 2, 4],
  ['cat', 2, 5],
  ['pigeon', 2, 6],
])
const BUFF_SEED = 20260901

describe('simulate', () => {
  it('결과 객체 형태를 지킨다', () => {
    const r = simulate({ boardA: weakSide, boardB: weakSide, seed: 1, data })
    expect(['A', 'B', 'draw']).toContain(r.winner)
    expect(Number.isInteger(r.ticks)).toBe(true)
    expect(Array.isArray(r.log)).toBe(true)
  })

  it('한쪽이 비면 다른 쪽이 즉시 이긴다', () => {
    expect(simulate({ boardA: weakSide, boardB: [], seed: 1, data }).winner).toBe('A')
    expect(simulate({ boardA: [], boardB: weakSide, seed: 1, data }).winner).toBe('B')
  })

  it('양쪽이 다 비면 무승부다', () => {
    expect(simulate({ boardA: [], boardB: [], seed: 1, data }).winner).toBe('draw')
  })

  it('압도적으로 강한 쪽이 이긴다', () => {
    const r = simulate({ boardA: weakSide, boardB: strongSide, seed: 7, data })
    expect(r.winner).toBe('B')
    expect(r.survivorsB).toBeGreaterThan(0)
    expect(r.survivorsA).toBe(0)
  })

  it('같은 시드와 같은 보드는 완전히 같은 로그를 낸다', () => {
    const a = simulate({ boardA: weakSide, boardB: strongSide, seed: 42, data })
    const b = simulate({ boardA: weakSide, boardB: strongSide, seed: 42, data })
    expect(a.log).toEqual(b.log)
    expect(a.ticks).toBe(b.ticks)
    expect(a.winner).toBe(b.winner)
  })

  it('보드 배열 순서를 바꿔도 로그가 완전히 같다', () => {
    const forward = team([['cactoro_blob', 1, 5], ['frog', 1, 0], ['cat', 2, 12]])
    const reversed = [...forward].reverse()
    const a = simulate({ boardA: forward, boardB: GOLDEN_B, seed: 3, data })
    const b = simulate({ boardA: reversed, boardB: GOLDEN_B, seed: 3, data })
    expect(a.log).toEqual(b.log)
  })

  it('maxTicks 를 넘지 않는다', () => {
    const r = simulate({ boardA: strongSide, boardB: strongSide, seed: 9, data })
    expect(r.ticks).toBeLessThanOrEqual(data.combat.maxTicks)
  })

  it('로그가 spawn 으로 시작해 end 로 끝난다', () => {
    const r = simulate({ boardA: weakSide, boardB: strongSide, seed: 5, data })
    expect(r.log[0].type).toBe('spawn')
    expect(r.log[r.log.length - 1].type).toBe('end')
  })

  it('로그의 tick 이 단조 증가한다', () => {
    const r = simulate({ boardA: weakSide, boardB: strongSide, seed: 5, data })
    for (let i = 1; i < r.log.length; i++) {
      expect(r.log[i].tick).toBeGreaterThanOrEqual(r.log[i - 1].tick)
    }
  })

  it('시너지가 결과를 바꾼다 (거인 2 활성 vs 미활성)', () => {
    const noSynergy = team([['pink_blob', 2, 0], ['cat', 2, 1]])
    const withSynergy = team([['pink_blob', 2, 0], ['frog', 2, 1]])
    const foe = team([['ghost', 2, 0], ['cactoro_blob', 2, 1]])
    const a = simulate({ boardA: noSynergy, boardB: foe, seed: 11, data })
    const b = simulate({ boardA: withSynergy, boardB: foe, seed: 11, data })
    expect(a.log).not.toEqual(b.log)
  })

  it('3성이 1성보다 강하다', () => {
    const foe = team([['ghost', 2, 0], ['cactoro_blob', 2, 1], ['armabee', 2, 2]])
    const one = simulate({ boardA: team([['orc', 1, 0]]), boardB: foe, seed: 4, data })
    const three = simulate({ boardA: team([['orc', 3, 0]]), boardB: foe, seed: 4, data })
    // 3성은 더 오래 버티고, 적을 더 많이 죽인다.
    expect(three.ticks).toBeGreaterThan(one.ticks)
    expect(three.survivorsB).toBeLessThan(one.survivorsB)
  })

  it('다른 시드는 다른 로그를 낸다 (RNG 가 실제로 쓰인다)', () => {
    const a = simulate({ boardA: GOLDEN_A, boardB: GOLDEN_B, seed: 1, data })
    const b = simulate({ boardA: GOLDEN_A, boardB: GOLDEN_B, seed: 2, data })
    expect(a.log).not.toEqual(b.log)
  })

  it('maxTicks 에 도달하면 그 값으로 끝난다', () => {
    // 3성 탱커 거울전은 서로 못 죽여 제한 틱까지 간다.
    const wall = team([['dino', 3, 0]])
    const r = simulate({ boardA: wall, boardB: wall, seed: 11, data })
    expect(r.ticks).toBe(data.combat.maxTicks)
    expect(r.winner).toBe('draw')
    expect(r.log[r.log.length - 1]).toEqual({ tick: data.combat.maxTicks, type: 'end', winner: 'draw' })
  })

  it('maxTicks 에 도달하면 그 틱으로 끝나고 생존자 수 규칙을 따른다', () => {
    const wall = team([['dino', 3, 0], ['dino', 3, 1]])
    const r = simulate({ boardA: wall, boardB: wall, seed: 11, data })

    // 전제 — 제한 틱에 실제로 도달해야 이 테스트가 타임아웃 분기를 지난다.
    expect(r.ticks).toBe(data.combat.maxTicks)

    // 결과는 생존자 수 규칙과 일치해야 한다. 대진이 바뀌어 생존자 수가
    // 달라지더라도 규칙과의 일치는 유지된다.
    expect(r.winner).toBe(resolveTimeout(r.survivorsA, r.survivorsB))
    expect(r.log[r.log.length - 1]).toEqual({
      tick: data.combat.maxTicks, type: 'end', winner: r.winner,
    })
  })

  it('진영 범위를 벗어난 타일은 조용히 무시하지 않고 터진다', () => {
    const perSide = data.combat.board.rows.reduce((a, n) => a + n, 0) / 2
    expect(() =>
      simulate({ boardA: team([['cat', 1, perSide]]), boardB: weakSide, seed: 1, data }),
    ).toThrow(/범위/)
  })

  it('같은 진영에 타일이 겹치면 터진다', () => {
    const clash = team([['cat', 1, 0], ['pigeon', 1, 0]])
    expect(() => simulate({ boardA: clash, boardB: weakSide, seed: 1, data })).toThrow(/겹친/)
  })

  it('성급이 범위를 벗어나면 조용히 무적이 되지 않고 터진다', () => {
    for (const star of [0, -1, 4]) {
      expect(() => simulate({ boardA: team([['cat', star, 0]]), boardB: weakSide, seed: 1, data })).toThrow(/성급/)
    }
  })

  it('성급이 정수가 아니면 터진다', () => {
    expect(() => simulate({ boardA: team([['cat', 1.5, 0]]), boardB: weakSide, seed: 1, data })).toThrow(/성급/)
  })

  it('없는 유닛 id 는 명확한 메시지로 터진다', () => {
    expect(() => simulate({ boardA: team([['nope', 1, 0]]), boardB: weakSide, seed: 1, data })).toThrow(/없는 유닛 id/)
  })

  it('로컬 타일 인덱스는 양 팀에서 180도 회전 대응이다 (스냅샷 계약)', () => {
    const board = buildBoard(data.combat.board)
    const cfg = data.combat.board
    const perSide = cfg.rows.reduce((a, n) => a + n, 0) / 2
    const lastRow = cfg.rows.length - 1

    for (let local = 0; local < perSide; local++) {
      const a = toFieldTile(board, local, 'A', cfg)
      const b = toFieldTile(board, local, 'B', cfg)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(b).toBeGreaterThanOrEqual(0)
      const ta = board.tiles[a]
      const tb = board.tiles[b]
      // 회전이므로 행과 열이 **둘 다** 뒤집힌다. 행만 뒤집는 반사로 하면
      // 오프셋이 교대하는 보드에서 좌우가 어긋난다.
      expect(tb.row).toBe(lastRow - ta.row)
      expect(tb.col).toBe(cfg.rows[tb.row] - 1 - ta.col)
    }
  })

  it('진영당 칸 수만큼 로컬 인덱스가 유효하고 그 다음은 무효다', () => {
    const board = buildBoard(data.combat.board)
    const cfg = data.combat.board
    const perSide = cfg.rows.reduce((a, n) => a + n, 0) / 2
    expect(toFieldTile(board, perSide - 1, 'A', cfg)).toBeGreaterThanOrEqual(0)
    expect(toFieldTile(board, perSide, 'A', cfg)).toBe(-1)
    expect(toFieldTile(board, perSide, 'B', cfg)).toBe(-1)
  })
})

describe('골든 로그', () => {
  it('고정 시나리오의 전투 로그가 바뀌지 않는다', () => {
    const result = simulate({ boardA: GOLDEN_A, boardB: GOLDEN_B, seed: GOLDEN_SEED, data })
    const actual = { winner: result.winner, ticks: result.ticks, log: result.log }

    if (process.env.REGEN_GOLDEN) {
      if (process.env.CI) throw new Error('CI 에서는 골든 로그를 재생성할 수 없다')
      writeFileSync(GOLDEN_PATH, JSON.stringify(actual, null, 2) + '\n')
    }

    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'))
    expect(actual).toEqual(golden)
  })
})

describe('골든 로그 — 버프 로스터', () => {
  it('버프가 걸린 전투의 로그가 바뀌지 않는다', () => {
    const result = simulate({ boardA: BUFF_A, boardB: BUFF_B, seed: BUFF_SEED, data })
    const actual = { winner: result.winner, ticks: result.ticks, log: result.log }

    if (process.env.REGEN_GOLDEN) {
      if (process.env.CI) throw new Error('CI 에서는 골든 로그를 재생성할 수 없다')
      writeFileSync(BUFF_GOLDEN_PATH, JSON.stringify(actual, null, 2) + '\n')
    }

    const golden = JSON.parse(readFileSync(BUFF_GOLDEN_PATH, 'utf8'))
    expect(actual).toEqual(golden)
  })
})

describe('resolveTimeout', () => {
  it('생존자가 많은 쪽이 이긴다', () => {
    expect(resolveTimeout(3, 1)).toBe('A')
    expect(resolveTimeout(1, 3)).toBe('B')
    expect(resolveTimeout(1, 0)).toBe('A')
    expect(resolveTimeout(0, 1)).toBe('B')
  })

  it('생존자가 같으면 무승부다', () => {
    expect(resolveTimeout(2, 2)).toBe('draw')
    expect(resolveTimeout(0, 0)).toBe('draw')
  })
})
