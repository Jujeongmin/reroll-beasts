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
      ko: '경험치를 사면 레벨이 오르고, 판에 놓을 수 있는 수가 는다.',
      en: 'Buying XP raises your level, and you can place more units.',
    },
    target: '#buyxp',
    done: (state, { startLevel }) => state.level > startLevel,
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
export function tutorialStep(state, ctx) {
  for (let i = 0; i < TUTORIAL_STEPS.length; i++) {
    const s = TUTORIAL_STEPS[i]
    if (!s.done || !s.done(state, ctx)) return i
  }
  return TUTORIAL_STEPS.length - 1
}
