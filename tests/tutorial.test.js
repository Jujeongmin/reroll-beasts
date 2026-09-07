// 튜토리얼 단계 판정. 화면 없이 상태만으로 결정돼야 여기서 검사된다 —
// 단계가 안 넘어가면 사람이 갇히고, 너무 빨리 넘어가면 안 배운 채 지나간다.
import { describe, it, expect, beforeAll } from 'vitest'
import { loadData } from '../sim/data.js'
import { startRun, buy, moveTo, buyXp, refreshShop } from '../sim/roster.js'
import { createRng } from '../sim/rng.js'
import { setupTutorial, tutorialStep, TUTORIAL_STEPS, TUTORIAL_UNIT } from '../sim/tutorial.js'

let data
beforeAll(async () => {
  data = await loadData()
})

/** 대본이 깔아 둔 판. 실제 진입과 같은 순서로 만든다. */
function fresh() {
  const { state, pool } = startRun(data, createRng(7))
  setupTutorial(state, data)
  // 코치가 박아 두는 것과 같은 값. 새로고침 단계가 "처음에 없던 말이 왔나"로 판정한다.
  const startShop = state.shop.filter(Boolean)
  return { state, pool, ctx: { startLevel: state.level, startShop } }
}

describe('setupTutorial', () => {
  it('같은 말 둘을 벤치에 미리 준다 — 하나만 더 사면 합성이 보인다', () => {
    const { state } = fresh()
    const bench = state.bench.filter(Boolean)
    expect(bench).toHaveLength(2)
    expect(bench.every((c) => c.unitId === TUTORIAL_UNIT)).toBe(true)
    expect(bench[0].uid).not.toBe(bench[1].uid)
  })

  it('상점 첫 칸을 고정한다 — 리롤을 시키면 골드가 먼저 마른다', () => {
    const { state } = fresh()
    expect(state.shop[0]).toBe(TUTORIAL_UNIT)
  })

  it('판은 비워 둔다. 놓는 것부터 가르쳐야 한다', () => {
    const { state } = fresh()
    expect(state.board.filter(Boolean)).toHaveLength(0)
  })
})

describe('tutorialStep', () => {
  it('아무것도 안 했으면 첫 단계다', () => {
    const { state, ctx } = fresh()
    expect(TUTORIAL_STEPS[tutorialStep(state, ctx)].id).toBe('buy')
  })

  it('셋째를 사면 합성이 일어나고 다음 단계로 넘어간다', () => {
    const { state, pool, ctx } = fresh()
    const r = buy(state, pool, 0, data)
    expect(r.ok).toBe(true)
    expect(TUTORIAL_STEPS[tutorialStep(state, ctx)].id).toBe('place')
  })

  it('판에 올리면 경험치 단계로 간다', () => {
    const { state, pool, ctx } = fresh()
    buy(state, pool, 0, data)
    const merged = state.bench.filter(Boolean).find((c) => c.star >= 2)
    expect(moveTo(state, merged.uid, { where: 'board', index: 0 }, data).ok).toBe(true)
    expect(TUTORIAL_STEPS[tutorialStep(state, ctx)].id).toBe('xp')
  })

  it('레벨이 오르면 새로고침 단계다', () => {
    const { state, pool, ctx } = fresh()
    buy(state, pool, 0, data)
    const merged = state.bench.filter(Boolean).find((c) => c.star >= 2)
    moveTo(state, merged.uid, { where: 'board', index: 0 }, data)
    // 레벨 하나 오를 때까지 산다. 한 번에 안 오르는 구간이 있다.
    for (let i = 0; i < 10 && state.level === ctx.startLevel; i++) buyXp(state, data)
    expect(state.level).toBeGreaterThan(ctx.startLevel)
    expect(TUTORIAL_STEPS[tutorialStep(state, ctx)].id).toBe('reroll')
  })

  it('새로고침해서 처음에 없던 말이 오면 마지막 단계다', () => {
    const { state, pool, ctx } = fresh()
    buy(state, pool, 0, data)
    const merged = state.bench.filter(Boolean).find((c) => c.star >= 2)
    moveTo(state, merged.uid, { where: 'board', index: 0 }, data)
    for (let i = 0; i < 10 && state.level === ctx.startLevel; i++) buyXp(state, data)
    // 산 것만으로는 안 넘어간다 — 사는 것은 칸을 비우지 새 말을 들이지 않는다.
    buy(state, pool, 1, data)
    expect(TUTORIAL_STEPS[tutorialStep(state, ctx)].id).toBe('reroll')
    // 새 말이 하나라도 올 때까지 돌린다. 26종 중 다섯을 뽑아 전부 처음 것과
    // 겹칠 확률은 사실상 0 이지만, 시드 하나에 매달리지 않게 몇 번 돌린다.
    const rng = createRng(11)
    for (let i = 0; i < 10 && TUTORIAL_STEPS[tutorialStep(state, ctx)].id === 'reroll'; i++) {
      state.gold += 2
      refreshShop(state, pool, rng, data)
    }
    expect(TUTORIAL_STEPS[tutorialStep(state, ctx)].id).toBe('fight')
  })

  it('시작 상점을 모르면 새로고침 단계는 안 넘어간다 — 빈 목록이면 아무 말이나 새 말이 된다', () => {
    const { state, pool } = fresh()
    const ctx = { startLevel: state.level }
    buy(state, pool, 0, data)
    const merged = state.bench.filter(Boolean).find((c) => c.star >= 2)
    moveTo(state, merged.uid, { where: 'board', index: 0 }, data)
    for (let i = 0; i < 10 && state.level === ctx.startLevel; i++) buyXp(state, data)
    expect(TUTORIAL_STEPS[tutorialStep(state, ctx)].id).toBe('reroll')
  })

  it('판에서 말을 도로 빼면 이전 단계로 돌아간다 — 세어 두지 않는다', () => {
    const { state, pool, ctx } = fresh()
    buy(state, pool, 0, data)
    const merged = state.bench.filter(Boolean).find((c) => c.star >= 2)
    moveTo(state, merged.uid, { where: 'board', index: 0 }, data)
    expect(TUTORIAL_STEPS[tutorialStep(state, ctx)].id).toBe('xp')
    const free = state.bench.findIndex((c) => !c)
    moveTo(state, merged.uid, { where: 'bench', index: free }, data)
    expect(TUTORIAL_STEPS[tutorialStep(state, ctx)].id).toBe('place')
  })
})
