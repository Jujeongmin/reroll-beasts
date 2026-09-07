// 튜토리얼 대본.
//
// **연습 모드를 없앤 자리를 대신한다.** 규칙은 실제 게임과 같은 sim/ 함수를
// 그대로 타고, 여기서 정하는 건 "무엇을 시켜서 무엇을 보여줄 것인가" 뿐이다.
// 가르치는 규칙과 실제 규칙이 갈리면 배운 사람이 첫 판에서 틀린다.
//
// 대본이 순수 함수인 이유: 단계 판정("샀나", "놓았나", "레벨이 올랐나")은
// 화면을 안 봐도 상태만으로 결정된다. 그래야 테스트가 브라우저를 안 탄다.

import { allUnits, boardCount } from './roster.js'

/** 대본이 쓰는 말. 1티어라 상점에서 늘 나오고, 셋을 모으기도 쉽다. */
export const TUTORIAL_UNIT = 'frog'

/** 튜토리얼에 주는 골드. 사고(2~3) 경험치를 사도(4) 남을 만큼. */
const TUTORIAL_GOLD = 20

/**
 * 런 상태를 대본에 맞게 고쳐 놓는다.
 *
 * 벤치에 **같은 말 둘을 미리** 넣어 둔다. 하나만 더 사면 그 자리에서
 * 합성이 일어나므로, "같은 말 셋이면 합쳐진다"를 설명이 아니라 손으로
 * 겪게 된다. 운에 맡기면 튜토리얼이 사람마다 다른 이야기가 된다.
 */
export function setupTutorial(state, data) {
  state.gold = TUTORIAL_GOLD
  state.bench = state.bench.map(() => null)
  state.board = state.board.map(() => null)
  for (let i = 0; i < 2; i++) {
    state.bench[i] = { uid: state.nextUid++, unitId: TUTORIAL_UNIT, star: 1, items: [] }
  }
  // 상점 첫 칸을 고정한다 — 리롤을 시키면 골드가 먼저 마른다.
  state.shop = state.shop.map((_, i) => (i === 0 ? TUTORIAL_UNIT : null))
  return state
}

/**
 * 단계 넷. 각자 "무엇을 시키나 · 어디를 짚나 · 언제 끝났나" 를 안다.
 *
 * 마지막 단계만 조건이 상태가 아니라 사람의 결정이다(싸울 준비가 됐다).
 * 그래서 done 이 없고 화면이 버튼을 준다.
 */
export const TUTORIAL_STEPS = [
  {
    id: 'buy',
    text: {
      ko: '상점에서 같은 말을 하나 사 보자. 셋이 모이면 저절로 합쳐진다.',
      en: 'Buy the same unit from the shop. Three of them merge on their own.',
    },
    target: '#shop',
    done: (state) => allUnits(state).some((u) => u.star >= 2),
  },
  {
    id: 'place',
    text: {
      ko: '합쳐진 말을 판 위로 끌어다 놓자. 판에 올린 말만 싸운다.',
      en: 'Drag the merged unit onto the board. Only units on the board fight.',
    },
    target: '#stage',
    done: (state) => boardCount(state) >= 1,
  },
  {
    id: 'xp',
    text: {
      ko: '경험치를 사면 레벨이 오른다. 판에 놓을 수 있는 수가 늘고, 상점에 높은 티어가 더 자주 나온다.',
      en: 'Buying XP raises your level: you can place more units, and higher tiers show up in the shop more often.',
    },
    target: '#buyxp',
    done: (state, { startLevel }) => state.level > startLevel,
  },
  {
    id: 'reroll',
    // 방금 오른 레벨이 무엇을 줬는지 **실제 수**로 말한다. "더 자주" 라고만
    // 하면 얼마나인지 모르고, 숫자를 글자에 박아 두면 표를 고칠 때 거짓말이
    // 된다 — 그래서 데이터에서 그때그때 읽는다.
    text: (state, ctx, data) => {
      const lv = state.level
      const before = data.shop.tierOdds[String(ctx.startLevel)] ?? []
      const after = data.shop.tierOdds[String(lv)] ?? []
      // 제일 많이 오른 티어 하나만 짚는다. 다섯 개를 다 읊으면 못 읽는다.
      let tier = 1
      let gain = -Infinity
      for (let i = 1; i < after.length; i++) {
        const g = (after[i] ?? 0) - (before[i] ?? 0)
        if (g > gain) {
          gain = g
          tier = i
        }
      }
      const a = before[tier] ?? 0
      const b = after[tier] ?? 0
      return {
        ko: `레벨 ${lv}! 판에 ${lv}마리까지 놓고, ${tier + 1}티어가 ${a}% → ${b}% 로 더 자주 나온다. 원하는 말이 없으면 새로고침하자 — 골드 2.`,
        en: `Level ${lv}! You can place ${lv} units, and tier ${tier + 1} shows up ${a}% → ${b}%. No unit you want? Reroll — 2 gold.`,
      }
    },
    target: '#reroll',
    // 처음 상점에 없던 말이 하나라도 있으면 새로고침한 것이다. 사는 것은
    // 칸을 비우기만 하지 새 말을 들이지 않는다 — 그래서 "상점이 달라졌나"가
    // 아니라 "새 말이 왔나"를 본다.
    done: (state, { startShop }) =>
      // 상점 칸은 유닛 id 문자열이다(객체가 아니다).
      Array.isArray(startShop) && state.shop.some((id) => id && !startShop.includes(id)),
  },
  {
    id: 'fight',
    text: { ko: '준비됐다. 싸워 보자.', en: "You're set. Time to fight." },
    target: null,
    done: null,
  },
]

/**
 * 지금 어느 단계인가. 앞에서부터 아직 안 끝난 첫 단계다.
 *
 * 단계를 따로 세어 두지 않고 매번 상태에서 다시 구한다 — 세어 두면 되돌리기
 * (판 말을 도로 벤치로)에서 화면과 어긋난다.
 */
/**
 * 단계 문구. 고정 문구면 그대로, 함수면 지금 상태로 만든다 — 방금 오른
 * 레벨이 준 것을 숫자로 말하는 단계가 있다.
 */
export function stepText(step, state, ctx, data) {
  return typeof step.text === 'function' ? step.text(state, ctx, data) : step.text
}

export function tutorialStep(state, ctx) {
  for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
    const s = TUTORIAL_STEPS[i]
    if (!s.done || !s.done(state, ctx)) return i
  }
  return TUTORIAL_STEPS.length - 1
}
