# 홈 로비 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메인화면을 좌측 패널 로비로 바꾸고, 연습 모드를 없애고, 서버가 기록한 최소 전적을 띄운다.

**Architecture:** 홈은 `game/src/home.js`(DOM)와 `game/src/home-state.js`(순수 계산)로 갈린다 — 순수 쪽이 상태→화면 결정을 전부 쥐므로 테스트가 브라우저를 안 탄다. 순위·전적 규칙은 `sim/` 의 순수 함수(`assignRanks`, `mergeProfile`)이고 서버가 그것을 불러 유저 상태에 쓴다. 클라는 전적을 만들지 않고 읽기만 한다.

**Tech Stack:** 바닐라 JS ES 모듈 · vitest · `@agent8/gameserver` · `@agent8/gameserver-node test` · Kenney UI Pack RPG Expansion (CC0)

## Global Constraints

- `sim/` 은 순수 함수만. `document` · `window` · `fetch` · `Math.random` · `Date.now` 금지. 무작위는 `sim/rng.js` 만
- 규칙 수치는 `game/public/data/*.json`. 런타임 `fetch` 로 읽는다 (서버는 예외적으로 JSON 직접 import)
- 주석은 **왜**를 적는다. 무엇은 코드가 말한다
- 커밋 메시지 한국어, `feat:`/`fix:`/`docs:`/`refactor:` 접두, 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- 검증: `npm run check` (불변식 + vitest) 는 매 태스크 끝에 초록. 서버를 만졌으면 `npx -y @agent8/gameserver-node test` 도
- 테스트는 **돌연변이로 검증한다**: 구현을 고의로 망가뜨려 빨간불을 확인하고 되돌린다
- 기준 화면 812×390. 세로 390 은 고정이다
- 설계 문서: `docs/superpowers/specs/2026-09-03-home-lobby-design.md`

---

## File Structure

| 파일 | 책임 |
|---|---|
| `sim/lobbyRound.js` (수정) | `assignRanks(state, opts)` 추가. 탈락 시점 순위 |
| `sim/profile.js` (신설) | `mergeProfile(prev, rank)` — 전적 누적 규칙 하나만 |
| `server/src/server.ts` (수정) | 순위를 유저 상태에 쓴다. `getProfile()` 추가 |
| `game/src/home-state.js` (신설) | 상태 → 화면 결정. DOM 을 모른다 |
| `game/src/home.js` (신설) | 홈 DOM. 그리기와 클릭만 |
| `game/src/main.js` (수정) | 홈 배선. 연습·폴백 삭제 |
| `game/src/matchmaker.js` | **삭제** |
| `game/index.html` (수정) | 홈 마크업·CSS 를 로비 골격으로 |
| `tools/build-ui-rpg.mjs` (신설) | 새 팩에서 홈이 쓰는 조각만 재단 |
| `tests/rank.test.js` (신설) | `assignRanks` |
| `tests/profile.test.js` (신설) | `mergeProfile` |
| `tests/home-state.test.js` (신설) | 홈 3상태 + 대기열 |
| `server/test/server.test.ts` (수정) | 전적 기록·조회 |

---

### Task 1: 탈락 순위 규칙 (`assignRanks`)

**Files:**
- Modify: `sim/lobbyRound.js`
- Test: `tests/rank.test.js` (create)

**Interfaces:**
- Consumes: 없음 (`state` 는 `createLobbyState` 가 만든 모양)
- Produces: `assignRanks(state, { final = false } = {}) → Array<{ account: string, rank: number }>`
  - 좌석에 `seat.rank` (number) 를 박는다. 이미 `rank` 가 있는 좌석은 건드리지 않는다
  - 반환은 **사람 좌석만** (`seat.account` 가 있는 것)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/rank.test.js`:

```js
// 순위는 "언제 죽었나" 로 정해진다. 이 규칙이 흔들리면 전적이 통째로 거짓말이
// 되는데, 화면에서는 몇 판 지나야 드러난다 — 그래서 여기서 잡는다.
import { describe, it, expect } from 'vitest'
import { assignRanks } from '../sim/lobbyRound.js'

/** 좌석 8개. alive/hp/account 만 순위에 쓰인다. */
function seats(spec) {
  return spec.map((s, id) => ({
    id,
    account: s.bot ? null : `0xacc${id}`,
    isBot: !!s.bot,
    hp: s.hp ?? 100,
    alive: s.alive !== false,
  }))
}

describe('assignRanks', () => {
  it('한 명 탈락하면 꼴찌 순위가 박힌다', () => {
    const state = { seats: seats([{ alive: false, hp: 0 }, {}, {}, {}, {}, {}, {}, {}]) }
    const out = assignRanks(state)
    expect(state.seats[0].rank).toBe(8)
    expect(out).toEqual([{ account: '0xacc0', rank: 8 }])
  })

  it('같은 라운드에 둘이 죽으면 같은 순위다', () => {
    const state = { seats: seats([
      { alive: false, hp: 0 }, { alive: false, hp: 0 }, {}, {}, {}, {}, {}, {},
    ]) }
    assignRanks(state)
    expect(state.seats[0].rank).toBe(7)
    expect(state.seats[1].rank).toBe(7)
  })

  it('봇은 반환에 안 들어간다 — 계정이 없다', () => {
    const state = { seats: seats([
      { alive: false, hp: 0, bot: true }, {}, {}, {}, {}, {}, {}, {},
    ]) }
    const out = assignRanks(state)
    expect(state.seats[0].rank).toBe(8)
    expect(out).toEqual([])
  })

  it('이미 순위가 박힌 좌석은 다시 안 매긴다', () => {
    const state = { seats: seats([{ alive: false, hp: 0 }, {}, {}, {}, {}, {}, {}, {}]) }
    assignRanks(state)
    const out = assignRanks(state)
    expect(out).toEqual([])
    expect(state.seats[0].rank).toBe(8)
  })

  it('마지막 하나가 남으면 1위가 박힌다', () => {
    const dead = { alive: false, hp: 0 }
    const state = { seats: seats([{}, dead, dead, dead, dead, dead, dead, dead]) }
    const out = assignRanks(state)
    expect(state.seats[0].rank).toBe(1)
    expect(out.find((x) => x.rank === 1).account).toBe('0xacc0')
  })

  it('완주로 끝나면 남은 생존자는 체력 순, 동체력은 동순위', () => {
    const dead = { alive: false, hp: 0 }
    const state = { seats: seats([
      { hp: 30 }, { hp: 50 }, { hp: 30 }, dead, dead, dead, dead, dead,
    ]) }
    assignRanks(state, { final: true })
    expect(state.seats[1].rank).toBe(1)
    expect(state.seats[0].rank).toBe(2)
    expect(state.seats[2].rank).toBe(2)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/rank.test.js`
Expected: FAIL — `assignRanks is not a function`

- [ ] **Step 3: 구현한다**

`sim/lobbyRound.js` 끝에 추가:

```js
/**
 * 탈락한 좌석에 순위를 박는다.
 *
 * 순위를 **죽는 그 자리에서** 정하는 이유: 나중에 되짚으려면 누가 언제
 * 죽었는지를 따로 적어 둬야 하는데, 그 기록이 상태와 어긋나는 순간 전적이
 * 조용히 거짓말을 시작한다. 같은 라운드에 죽은 좌석은 가를 근거가 없으므로
 * 같은 순위를 준다.
 *
 * final 은 23라운드를 다 채워 끝난 경우다. 살아남은 사람들 사이는 체력으로
 * 가른다 — 그때까지 덜 맞은 쪽이 더 잘한 것이다.
 */
export function assignRanks(state, { final = false } = {}) {
  const out = []
  const take = (seat, rank) => {
    if (seat.rank != null) return
    seat.rank = rank
    if (seat.account) out.push({ account: seat.account, rank })
  }

  const alive = state.seats.filter((s) => s.alive)
  for (const seat of state.seats) {
    if (!seat.alive) take(seat, alive.length + 1)
  }

  if (alive.length === 1) take(alive[0], 1)
  else if (final && alive.length > 1) {
    // 체력 내림차순. 같은 체력이면 같은 순위이고, 그다음은 인원수만큼 건너뛴다
    // (공동 2위가 둘이면 다음은 4위) — 스포츠 순위와 같은 셈법이다.
    const sorted = [...alive].sort((a, b) => b.hp - a.hp)
    let rank = 1
    let seen = 0
    let prevHp = null
    for (const seat of sorted) {
      seen += 1
      if (seat.hp !== prevHp) {
        rank = seen
        prevHp = seat.hp
      }
      take(seat, rank)
    }
  }

  return out
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/rank.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: 돌연변이로 검증한다**

`assignRanks` 의 `alive.length + 1` 을 `alive.length` 로 바꾸고 `npx vitest run tests/rank.test.js` — 빨간불이 나야 한다. 확인 후 되돌린다.

- [ ] **Step 6: 전체 검사 + 커밋**

```bash
npm run check
git add sim/lobbyRound.js tests/rank.test.js
git commit -m "feat: 탈락 순위 규칙 — 죽는 자리에서 매긴다"
```

---

### Task 2: 전적 누적 규칙 (`mergeProfile`)

**Files:**
- Create: `sim/profile.js`
- Test: `tests/profile.test.js` (create)

**Interfaces:**
- Consumes: 없음
- Produces: `mergeProfile(prev, rank) → { games, wins, best, recent }`
  - `prev` 가 `null`/`undefined` 면 첫 판으로 친다
  - `recent` 는 최근 5개, 새 것이 앞

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/profile.test.js`:

```js
// 전적은 한 번 틀리면 되돌릴 근거가 없다 — 원본 기록을 안 남기고 누적만 하기
// 때문이다. 그래서 누적 규칙을 순수 함수로 떼어 여기서 못박는다.
import { describe, it, expect } from 'vitest'
import { mergeProfile } from '../sim/profile.js'

describe('mergeProfile', () => {
  it('첫 판이면 없던 전적을 만든다', () => {
    expect(mergeProfile(null, 3)).toEqual({
      games: 1, wins: 0, best: 3, recent: [3],
    })
  })

  it('1위면 wins 가 오른다', () => {
    expect(mergeProfile(null, 1).wins).toBe(1)
  })

  it('최고 순위는 더 낮은 숫자로만 갱신된다', () => {
    const p = { games: 1, wins: 0, best: 2, recent: [2] }
    expect(mergeProfile(p, 5).best).toBe(2)
    expect(mergeProfile(p, 1).best).toBe(1)
  })

  it('최근 기록은 새 것이 앞이고 다섯 개까지만 남는다', () => {
    let p = null
    for (const r of [8, 7, 6, 5, 4, 3]) p = mergeProfile(p, r)
    expect(p.recent).toEqual([3, 4, 5, 6, 7])
    expect(p.games).toBe(6)
  })

  it('원본을 안 고친다 — 서버가 같은 값을 두 번 쓰면 안 된다', () => {
    const p = { games: 1, wins: 0, best: 4, recent: [4] }
    mergeProfile(p, 2)
    expect(p).toEqual({ games: 1, wins: 0, best: 4, recent: [4] })
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/profile.test.js`
Expected: FAIL — `Failed to load ../sim/profile.js`

- [ ] **Step 3: 구현한다**

`sim/profile.js` (신설):

```js
// 전적 누적. 규칙이 이 파일 하나에만 있어야 서버가 쓰는 값과 화면이 읽는
// 값이 같은 셈을 탄다.

/** 홈에 보이는 최근 판 수. 화면에 다섯 칸이라 여섯 번째는 남길 이유가 없다. */
const KEEP = 5

/**
 * 한 판이 끝난 전적을 누적한다.
 *
 * 새 객체를 낸다 — 서버가 유저 상태를 읽어 고쳐 쓰는 흐름이라, 원본을
 * 제자리에서 고치면 실패한 쓰기와 성공한 쓰기를 구분할 수 없게 된다.
 */
export function mergeProfile(prev, rank) {
  const p = prev ?? { games: 0, wins: 0, best: null, recent: [] }
  return {
    games: p.games + 1,
    wins: p.wins + (rank === 1 ? 1 : 0),
    best: p.best == null ? rank : Math.min(p.best, rank),
    recent: [rank, ...p.recent].slice(0, KEEP),
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/profile.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 돌연변이로 검증한다**

`slice(0, KEEP)` 을 지우고 돌린다 — "다섯 개까지만" 테스트가 빨개져야 한다. 되돌린다.

- [ ] **Step 6: 전체 검사 + 커밋**

```bash
npm run check
git add sim/profile.js tests/profile.test.js
git commit -m "feat: 전적 누적 규칙 — 판수·1위·최고·최근 5판"
```

---

### Task 3: 서버가 전적을 쓴다

**Files:**
- Modify: `server/src/server.ts`
- Test: `server/test/server.test.ts`

**Interfaces:**
- Consumes: `assignRanks(state, { final })` (Task 1), `mergeProfile(prev, rank)` (Task 2)
- Produces: 원격 함수 `getProfile() → { games, wins, best, recent } | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`server/test/server.test.ts` 끝에 추가:

```ts
describe('전적', () => {
  test('판을 안 끝냈으면 전적이 없다 — 0 으로 채우지 않는다', async (server) => {
    expect(await server.getProfile()).toBe(null);
  });

  // 혼자 있는 연습 방은 사람이 하나뿐이라 early 로 즉시 마감된다. 라운드를
  // 끝까지 밀면 23라운드 완주로 게임이 끝나고, 그때 순위가 박힌다.
  test('판이 끝나면 전적이 쌓인다', async (server) => {
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    const p = await server.getProfile();
    expect(p).toBeTruthy();
    expect(p.games).toBe(1);
    expect(p.recent.length).toBe(1);
    expect(p.best).toBe(p.recent[0]);
    expect(p.recent[0]).toBeGreaterThanOrEqual(1);
    expect(p.recent[0]).toBeLessThanOrEqual(8);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx -y @agent8/gameserver-node test`
Expected: FAIL — `getProfile` 없음

- [ ] **Step 3: 구현한다**

`server/src/server.ts` 의 import 에 추가:

```ts
import { createLobbyState, resolveRound, assignRanks } from '../../sim/lobbyRound.js'
import { mergeProfile } from '../../sim/profile.js'
```

`resolveRound()` 메서드 안, `resolveRound(state, ...)` 호출 결과를 처리하는 자리(`if (!changed) return state` 다음, `updateRoomState` 앞)에 넣는다:

```ts
      // 순위는 서버가 박는다. 클라가 "나 1등"이라고 올리면 그대로 믿게 된다.
      const ranked = assignRanks(state, { final: state.phase === 'done' })
      for (const r of ranked) {
        const prev = await $global.getUserState(r.account)
        await $global.updateUserState(r.account, {
          profile: mergeProfile(prev?.profile ?? null, r.rank),
        })
      }
```

클래스에 원격 함수를 추가한다:

```ts
  /**
   * 내 전적. 없으면 null 을 준다 — 0 으로 채운 표는 "0판 · 최고 0위" 라는
   * 거짓 정보가 되고, 화면이 그걸 그대로 그린다.
   */
  async getProfile(): Promise<any | null> {
    const st = await $global.getMyState()
    return st?.profile ?? null
  }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx -y @agent8/gameserver-node test`
Expected: PASS (17 tests — 기존 15 + 새 2)

- [ ] **Step 5: 돌연변이로 검증한다**

`assignRanks(state, { final: state.phase === 'done' })` 의 `final` 을 `false` 로 고정하고 돌린다 — 완주로 끝나는 판에서 순위가 안 박혀 "판이 끝나면 전적이 쌓인다" 가 빨개져야 한다. 되돌린다.

- [ ] **Step 6: 전체 검사 + 커밋**

```bash
npm run check
npx -y @agent8/gameserver-node test
git add server/src/server.ts server/test/server.test.ts
git commit -m "feat: 서버가 전적을 기록한다 — 순위는 서버가 박는다"
```

---

### Task 4: 홈 화면 상태 계산 (`home-state.js`)

**Files:**
- Create: `game/src/home-state.js`
- Test: `tests/home-state.test.js` (create)

**Interfaces:**
- Consumes: 없음
- Produces: `homeView({ status, hasAuth, profile, queue, data }) → { menu, notice, profile, queue }`
  - `status`: `'connecting' | 'failed' | 'ready'`
  - `hasAuth`: boolean — URL 에 플랫폼이 넣어 준 `auth` 가 있었나
  - `profile`: Task 2 모양 또는 `null`
  - `queue`: `null | { mode: 'normal'|'ranked', queued: number, waitedMs: number }`
  - `data`: 로드된 규칙 데이터 (`data.lobby.size` 를 쓴다)
  - 반환 `menu`: `'enabled' | 'disabled' | 'hidden'`
  - 반환 `profile`: `null | { head: string, recent: number[] }`
  - 반환 `queue`: `null | { text: string }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/home-state.test.js`:

```js
// 홈은 상태가 셋(접속 중·실패·접속됨)이고 각각이 화면으로 성립해야 한다.
// 하나라도 비면 그 상태에 빠진 사람은 멈춘 화면을 본다. DOM 없이 검사할 수
// 있도록 결정을 순수 함수로 떼어 놨다.
import { describe, it, expect } from 'vitest'
import { homeView } from '../game/src/home-state.js'

const data = { lobby: { size: 8 } }
const base = { status: 'ready', hasAuth: true, profile: null, queue: null, data }

describe('homeView', () => {
  it('접속 중이면 메뉴가 눌리지 않는다', () => {
    const v = homeView({ ...base, status: 'connecting' })
    expect(v.menu).toBe('disabled')
    expect(v.notice).toContain('붙는 중')
  })

  it('인증이 없으면 로컬 실행이라고 정확히 말한다', () => {
    const v = homeView({ ...base, status: 'failed', hasAuth: false })
    expect(v.menu).toBe('disabled')
    expect(v.notice).toContain('로컬')
    expect(v.notice).not.toContain('서버 오류')
  })

  it('인증이 있는데 실패면 서버 쪽 문제로 말한다', () => {
    const v = homeView({ ...base, status: 'failed', hasAuth: true })
    expect(v.notice).toContain('서버')
    expect(v.notice).not.toContain('로컬')
  })

  it('접속되면 메뉴가 열린다', () => {
    expect(homeView(base).menu).toBe('enabled')
  })

  it('기록이 없으면 첫 판을 기다린다고 쓴다 — 0 으로 채우지 않는다', () => {
    const v = homeView(base)
    expect(v.profile).toBe(null)
    expect(v.notice).toBe(null)
  })

  it('전적이 있으면 머리줄과 최근 기록을 만든다', () => {
    const profile = { games: 12, wins: 2, best: 1, recent: [3, 5, 1, 8, 2] }
    const v = homeView({ ...base, profile })
    expect(v.profile.head).toBe('전적 12판 · 최고 1위')
    expect(v.profile.recent).toEqual([3, 5, 1, 8, 2])
  })

  it('대기 중에는 메뉴가 사라지고 대기줄이 그 자리를 쓴다', () => {
    const v = homeView({
      ...base,
      queue: { mode: 'normal', queued: 3, waitedMs: 12400 },
    })
    expect(v.menu).toBe('hidden')
    expect(v.queue.text).toBe('일반 대기 3/8 · 12초')
  })

  it('랭크 대기는 랭크라고 쓴다', () => {
    const v = homeView({
      ...base,
      queue: { mode: 'ranked', queued: 8, waitedMs: 0 },
    })
    expect(v.queue.text).toBe('랭크 대기 8/8 · 0초')
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/home-state.test.js`
Expected: FAIL — `Failed to load ../game/src/home-state.js`

- [ ] **Step 3: 구현한다**

`game/src/home-state.js` (신설):

```js
// 홈이 무엇을 그릴지 정한다. DOM 을 모른다 — 그래야 상태 전이가 브라우저
// 없이 검사된다. 그리는 일은 home.js 가 한다.

/**
 * 상태에서 화면을 계산한다.
 *
 * 실패 사유를 뭉뚱그리지 않는 이유: 인증 없는 로컬 실행(플랫폼이 iframe URL
 * 로 넣어 주는 auth 가 없다)은 서버 장애와 다른 일이다. "서버 오류"로만
 * 적으면 개발 중에 매번 엉뚱한 곳을 뒤진다.
 */
export function homeView({ status, hasAuth, profile, queue, data }) {
  if (queue) {
    const label = queue.mode === 'ranked' ? '랭크' : '일반'
    const sec = Math.floor((queue.waitedMs ?? 0) / 1000)
    return {
      menu: 'hidden',
      notice: null,
      profile: viewProfile(profile),
      queue: { text: `${label} 대기 ${queue.queued}/${data.lobby.size} · ${sec}초` },
    }
  }

  if (status === 'connecting') {
    return { menu: 'disabled', notice: '서버에 붙는 중…', profile: null, queue: null }
  }
  if (status === 'failed') {
    return {
      menu: 'disabled',
      notice: hasAuth
        ? '서버에 못 붙었다 — 다시 시도'
        : '로컬 실행 — 인증이 없어 서버에 못 붙는다',
      profile: null,
      queue: null,
    }
  }
  return { menu: 'enabled', notice: null, profile: viewProfile(profile), queue: null }
}

/** 기록이 없으면 null. 홈이 "첫 판을 기다린다" 를 대신 그린다. */
function viewProfile(profile) {
  if (!profile || !profile.games) return null
  return {
    head: `전적 ${profile.games}판 · 최고 ${profile.best}위`,
    recent: profile.recent ?? [],
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run tests/home-state.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: 돌연변이로 검증한다**

`homeView` 의 대기열 분기(`if (queue)`)를 맨 아래로 옮긴다 — "대기 중에는 메뉴가 사라진다" 가 빨개져야 한다. 되돌린다.

- [ ] **Step 6: 전체 검사 + 커밋**

```bash
npm run check
git add game/src/home-state.js tests/home-state.test.js
git commit -m "feat: 홈 화면 상태 계산 — 접속 중·실패·접속됨 세 상태"
```

---

### Task 5: 로비 마크업과 `home.js`, 연습 제거

**Files:**
- Create: `game/src/home.js`
- Modify: `game/index.html` (`#home` 블록 마크업 + CSS)
- Modify: `game/src/main.js`
- Delete: `game/src/matchmaker.js`

**Interfaces:**
- Consumes: `homeView(...)` (Task 4), 서버 원격 함수 `getProfile()` (Task 3)
- Produces: `createHome({ data, onPick, onCancelQueue, onRetry }) → { setStatus, setProfile, setQueue, show, hide }`
  - `onPick(mode)` — `'normal' | 'ranked'`
  - `setStatus('connecting'|'failed'|'ready')`, `setProfile(profile|null)`, `setQueue(queue|null)`

- [ ] **Step 1: 마크업을 로비 골격으로 바꾼다**

`game/index.html` 의 `<div id="home" hidden>` 블록 전체를 이것으로 교체한다:

```html
  <div id="home" hidden>
    <div class="lobby-panel">
      <div class="title">REROLL<br>BEASTS</div>
      <div class="menu" id="home-menu">
        <button class="btn-home" data-mode="normal">일반 매치</button>
        <button class="btn-home" data-mode="ranked">랭크 매치</button>
      </div>
      <div class="queue" id="queue-status" hidden>
        <span id="queue-text"></span>
        <button id="queue-cancel">취소</button>
      </div>
      <div class="record" id="home-record">
        <div class="head" id="record-head">첫 판을 기다린다</div>
        <div class="recent" id="record-recent"></div>
      </div>
    </div>
    <div class="conn" id="home-conn"><span id="home-note"></span><button id="home-retry" hidden>다시 시도</button></div>
  </div>
```

`#home` CSS 를 교체한다 (기존 `#home .title` · `.btn-home` · `.queue` · `.note` 규칙 자리):

```css
  /* 홈은 로비다 — 왼쪽 패널이 메뉴와 전적을 쥐고, 오른쪽은 무대를 보여 준다.
     무대(3D)는 이미 그려져 있으므로 배경 그림을 따로 만들지 않는다. */
  #home {
    position: fixed; inset: 0; z-index: 70;
    background: radial-gradient(120% 100% at 60% 5%, #4a3a2666 0%, #17110bcc 70%);
  }
  #home[hidden] { display: none; }
  #home .lobby-panel {
    position: absolute; left: 0; top: 0; bottom: 0; width: 152px;
    display: flex; flex-direction: column; gap: 8px; padding: 12px 10px;
    background: #2a1f14f5; box-shadow: inset -1px 0 0 #d8b98455, 4px 0 12px #0009;
  }
  #home .title {
    font-size: 22px; font-weight: 900; line-height: 1.05; color: #ffd98a;
    text-shadow: 0 2px 0 #6b4a2a, 0 5px 14px #000c;
  }
  #home .menu { display: flex; flex-direction: column; gap: 6px; }
  #home .menu[hidden] { display: none; }
  #home .btn-home {
    height: 34px; font-size: 14px; font-weight: 800; text-align: left; padding: 0 10px;
    border-style: solid; border-width: 6px; border-image-slice: 6;
    border-image-repeat: repeat; border-image-source: url('/assets/ui/panel_wood.png');
    background: #c58747; color: #fff2d8; text-shadow: 0 1px 2px #0009;
    image-rendering: pixelated;
  }
  #home .btn-home:active { filter: brightness(1.12); }
  #home .btn-home[disabled] { filter: grayscale(.7) brightness(.7); cursor: default; }
  #home .queue {
    display: flex; align-items: center; gap: 6px; font-size: 12px; color: #e6cfa2;
  }
  #home .queue[hidden] { display: none; }
  #home .queue button {
    font-size: 11px; padding: 2px 8px; border-radius: 4px;
    background: #00000055; box-shadow: inset 0 0 0 1px #ffffff2a; color: #ffb3a6;
  }
  #home .record { margin-top: auto; font-size: 11px; color: #e6cfa2; }
  #home .record .recent { font-size: 10px; color: #a9a08f; letter-spacing: 1px; }
  #home .conn {
    position: absolute; right: 8px; top: 8px; display: flex; align-items: center; gap: 6px;
    font-size: 10px; color: #e6cfa2;
    background: #2a1f14e8; box-shadow: inset 0 0 0 1px #d8b98455; padding: 3px 8px;
  }
  #home .conn button { font-size: 10px; color: #ffd98a; text-decoration: underline; }
  #home .conn button[hidden] { display: none; }
```

- [ ] **Step 2: `home.js` 를 쓴다**

`game/src/home.js` (신설):

```js
// 홈 화면. 그리기와 클릭만 한다.
//
// **매치메이커를 모른다.** 서버 접속·큐는 main.js 가 쥐고 여기에는 상태만
// 밀어 넣는다. 홈이 SDK 를 알면 홈을 확인하려면 네트워크가 필요해진다.

import { homeView } from './home-state.js'

/**
 * @param {object} o
 * @param {object} o.data           로드된 규칙 데이터
 * @param {(mode: string) => void} o.onPick        모드를 골랐다
 * @param {() => void} o.onCancelQueue             대기를 취소했다
 * @param {() => void} o.onRetry                   다시 붙어 보라
 */
export function createHome({ data, onPick, onCancelQueue, onRetry }) {
  const el = {
    root: document.getElementById('home'),
    menu: document.getElementById('home-menu'),
    queue: document.getElementById('queue-status'),
    queueText: document.getElementById('queue-text'),
    queueCancel: document.getElementById('queue-cancel'),
    head: document.getElementById('record-head'),
    recent: document.getElementById('record-recent'),
    note: document.getElementById('home-note'),
    retry: document.getElementById('home-retry'),
  }

  // 플랫폼이 iframe URL 로 넣어 주는 값. 없으면 로컬 실행이다.
  const hasAuth = new URLSearchParams(location.search).has('auth')

  let state = { status: 'connecting', profile: null, queue: null }

  el.menu.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-mode]')
    if (!btn || btn.disabled) return
    onPick(btn.dataset.mode)
  })
  el.queueCancel.addEventListener('click', () => onCancelQueue())
  el.retry.addEventListener('click', () => onRetry())

  function render() {
    const v = homeView({ ...state, hasAuth, data })

    el.menu.hidden = v.menu === 'hidden'
    for (const btn of el.menu.querySelectorAll('[data-mode]')) {
      btn.disabled = v.menu !== 'enabled'
    }

    el.queue.hidden = !v.queue
    if (v.queue) el.queueText.textContent = v.queue.text

    el.head.textContent = v.profile ? v.profile.head : '첫 판을 기다린다'
    el.recent.textContent = v.profile ? v.profile.recent.join(' · ') : ''

    el.note.textContent = v.notice ?? ''
    el.retry.hidden = state.status !== 'failed'
  }

  render()

  return {
    setStatus(status) {
      state = { ...state, status }
      render()
    },
    setProfile(profile) {
      state = { ...state, profile }
      render()
    },
    setQueue(queue) {
      state = { ...state, queue }
      render()
    },
    show() {
      el.root.hidden = false
    },
    hide() {
      el.root.hidden = true
    },
  }
}
```

- [ ] **Step 3: `main.js` 를 배선하고 연습을 걷어낸다**

`main.js` 에서:

1. `import { createLocalMatchmaker } from './matchmaker.js'` 삭제
2. `import { createHome } from './home.js'` 추가
3. 기존 홈 블록(`const home = document.getElementById('home')` 부터 `queue-cancel` 핸들러까지) 전체를 아래로 교체:

```js
  // ── 메인화면 ────────────────────────────────────────────
  //
  // 서버가 필수다. 못 붙으면 못 논다 — 봇과 붙으면서 사람과 붙는 줄 아는
  // 것보다 못 붙었다고 듣는 편이 낫다.
  let queue = null
  let server = null

  const home = createHome({
    data,
    onPick: (mode) => startMatch(mode),
    onCancelQueue: () => {
      queue?.cancel()
      queue = null
      home.setQueue(null)
    },
    onRetry: () => connect(),
  })
  home.show()

  /** 서버에 붙고 전적을 받아 온다. 실패는 홈의 실패 상태로 끝난다. */
  async function connect() {
    home.setStatus('connecting')
    try {
      server = await connectServer()
    } catch (err) {
      console.warn('서버 접속 실패:', err?.message)
      home.setStatus('failed')
      return
    }
    home.setStatus('ready')
    // 전적은 홈에 머무는 동안 바뀌지 않는다 — 내 판이 끝나야 바뀌는데
    // 그때는 홈에 없다. 그래서 한 번만 받는다.
    try {
      home.setProfile(await server.remoteFunction('getProfile', []))
    } catch {
      home.setProfile(null)
    }
  }
  connect()

  /** 로비가 정해졌다. 판을 세우고 홈을 닫는다. */
  function enterGame(matchmaker) {
    mm = matchmaker
    run.lobby = mm.seats
    drawRound()
    home.hide()
    document.getElementById('prep').hidden = false
    // 1라운드도 지급 라운드일 수 있다 — settle() 은 라운드 2부터 도니 여기서
    // 한 번은 짚어야 한다.
    grantIfDue(run.index)
    prep.show()
  }

  function startMatch(mode) {
    if (!server) return
    queue = startQueue({
      server,
      mode,
      data,
      onUpdate(r) {
        if (r.status === 'error') return
        home.setQueue({ mode, queued: r.queued, waitedMs: r.waitedMs ?? 0 })
      },
      async onMatched(roomId) {
        queue = null
        home.setQueue(null)
        try {
          enterGame(await createServerMatchmaker({ data, server, roomId }))
        } catch (err) {
          console.warn('방 입장 실패:', err?.message)
          home.setStatus('failed')
        }
      },
    })
    home.setQueue({ mode, queued: 1, waitedMs: 0 })
  }
```

4. `game/src/matchmaker.js` 를 지운다

- [ ] **Step 4: 검사한다**

```bash
npm run check
grep -rn "createLocalMatchmaker" game/ && echo "남아 있다 — 지워라" || echo "깨끗하다"
```
Expected: `npm run check` 초록, grep 은 "깨끗하다"

- [ ] **Step 5: 브라우저로 세 상태를 눈으로 확인한다**

`preview_start` 로 dev 서버를 띄우고 `http://localhost:5180/?seed=20260901` 을 연다.

- 부팅 직후: 왼쪽 패널에 타이틀·메뉴가 보이고 메뉴가 회색(눌리지 않음), 우상단에 `서버에 붙는 중…`
- 3.5초 뒤: 우상단이 `로컬 실행 — 인증이 없어 서버에 못 붙는다` + `다시 시도`
- 전적 자리에 `첫 판을 기다린다`
- 콘솔 에러 0

스크린샷을 남긴다.

- [ ] **Step 6: 커밋**

```bash
git add game/src/home.js game/src/main.js game/index.html
git rm game/src/matchmaker.js
git commit -m "feat: 홈을 로비로 — 연습 제거, 서버 필수"
```

---

### Task 6: 새 UI 팩 재단

**Files:**
- Create: `art-src/kenney-ui-pack-rpg-expansion/` (팩 원본)
- Create: `tools/build-ui-rpg.mjs`
- Create: `licenses/kenney-ui-pack-rpg-expansion.txt`
- Modify: `CREDITS.md`
- Modify: `package.json` (`art` 스크립트에 한 줄)

**Interfaces:**
- Consumes: 없음
- Produces: `game/public/assets/ui/lobby_panel.png`, `lobby_btn.png`, `lobby_btn_down.png`, `lobby_divider.png`

- [ ] **Step 1: 팩을 확보한다**

`https://kenney.nl/assets/ui-pack-rpg-expansion` 에서 zip 을 받아 `art-src/kenney-ui-pack-rpg-expansion/` 에 푼다. CC0 다.

확인:
```bash
ls art-src/kenney-ui-pack-rpg-expansion/PNG | head
```
Expected: `panel_brown.png`, `buttonLong_brown.png`, `buttonLong_brown_pressed.png` 류의 파일이 보인다.

받을 수 없으면 **여기서 멈추고 사람에게 말한다.** 없는 파일을 가정하고 스크립트를 쓰면 돌지 않는 코드가 커밋된다.

- [ ] **Step 2: 재단 스크립트를 쓴다**

`tools/build-ui-rpg.mjs`:

```js
// 새 UI 팩에서 **홈이 실제로 쓰는 것만** 뽑는다.
//
// 팩을 통째로 복사하지 않는 이유: 안 쓰는 파일이 저장소에 쌓이면 나중에
// 어느 것이 살아 있는지 아무도 모른다. 쓰는 순간 여기에 줄을 추가한다.
import { mkdir, copyFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const SRC = resolve(import.meta.dirname, '../art-src/kenney-ui-pack-rpg-expansion/PNG')
const OUT = resolve(import.meta.dirname, '../game/public/assets/ui')

const JOBS = [
  ['panel_brown.png', 'lobby_panel.png'],
  ['buttonLong_brown.png', 'lobby_btn.png'],
  ['buttonLong_brown_pressed.png', 'lobby_btn_down.png'],
  ['divider.png', 'lobby_divider.png'],
]

await mkdir(OUT, { recursive: true })
for (const [from, to] of JOBS) {
  try {
    await copyFile(resolve(SRC, from), resolve(OUT, to))
  } catch {
    // 팩마다 파일명이 다르다. 조용히 넘어가면 홈이 프레임 없이 떠서
    // "CSS 가 틀렸나" 를 한참 뒤진다 — 여기서 있는 이름을 보여 주고 멈춘다.
    const { readdir } = await import('node:fs/promises')
    const have = await readdir(SRC).catch(() => [])
    console.error(`없는 파일: ${from}\n있는 것: ${have.slice(0, 40).join(', ')}`)
    process.exit(1)
  }
  console.log(`${from} → ${to}`)
}
```

원본 파일명이 다르면 스크립트가 있는 이름을 찍고 멈춘다. 그 목록을 보고 `JOBS` 를 고친다.

- [ ] **Step 3: 돌리고 확인한다**

```bash
node tools/build-ui-rpg.mjs
ls -la game/public/assets/ui/lobby_*.png
```
Expected: 4개 파일이 생긴다

- [ ] **Step 4: 출처를 적는다**

`CREDITS.md` 표에 줄 추가:

```
| 로비 패널·버튼 | [UI Pack: RPG Expansion](https://kenney.nl/assets/ui-pack-rpg-expansion) | Kenney | CC0 1.0 |
```

라이선스 전문을 `licenses/kenney-ui-pack-rpg-expansion.txt` 에 넣는다(팩 zip 안의 `License.txt`).

`package.json` 의 `art` 스크립트 끝에 `&& node tools/build-ui-rpg.mjs` 를 붙인다.

- [ ] **Step 5: 커밋**

```bash
npm run check
git add tools/build-ui-rpg.mjs game/public/assets/ui/lobby_*.png CREDITS.md licenses/ package.json art-src/kenney-ui-pack-rpg-expansion
git commit -m "feat: 로비 UI 팩 재단 — Kenney RPG Expansion 에서 4장"
```

---

### Task 7: 로비에 새 에셋 입히고 무대를 비껴 세운다

**Files:**
- Modify: `game/index.html` (`#home` CSS)
- Modify: `game/src/scene3d.js` (카메라 오프셋)

**Interfaces:**
- Consumes: Task 6 의 `lobby_panel.png` · `lobby_btn.png` · `lobby_btn_down.png`
- Produces: 없음 (화면만 바뀐다)

- [ ] **Step 1: 패널과 버튼에 새 프레임을 입힌다**

`game/index.html` 의 `#home .lobby-panel` 과 `#home .btn-home` 을 고친다:

```css
  #home .lobby-panel {
    position: absolute; left: 0; top: 0; bottom: 0; width: 152px;
    display: flex; flex-direction: column; gap: 8px; padding: 14px 12px;
    border-style: solid; border-width: 12px; border-image-slice: 12;
    border-image-repeat: repeat; border-image-source: url('/assets/ui/lobby_panel.png');
    background: #2a1f14f2; image-rendering: pixelated;
  }
  #home .btn-home {
    height: 34px; font-size: 14px; font-weight: 800; text-align: left; padding: 0 10px;
    border-style: solid; border-width: 8px; border-image-slice: 8;
    border-image-repeat: repeat; border-image-source: url('/assets/ui/lobby_btn.png');
    background: transparent; color: #3a2a17; text-shadow: 0 1px 0 #ffffff55;
    image-rendering: pixelated;
  }
  #home .btn-home:active { border-image-source: url('/assets/ui/lobby_btn_down.png'); }
```

`border-image-slice` 값은 실제 팩 이미지의 모서리 두께에 맞춘다 — 모서리가 늘어나 보이면 값이 틀린 것이다.

- [ ] **Step 2: 홈에서 무대를 오른쪽으로 민다**

`scene3d.js` 는 이미 세로 프레이밍을 `camera.setViewOffset` 으로 한다(위아래 띠를 비우려고 프러스텀을 민다). 가로도 같은 손잡이를 쓴다 — 카메라 위치를 옮기면 `fitCamera` 가 다시 재면서 판 크기까지 달라진다.

`scene3d.js` 의 `let usableY = 1` (약 1200줄) 옆에 추가:

```js
  // 홈 로비가 왼쪽 패널로 가리는 폭. 그만큼 그림을 오른쪽으로 민다 —
  // 카메라를 옮기면 fitCamera 가 판 크기까지 다시 재서 홈과 배치의 판이
  // 서로 다른 크기로 보인다.
  let leftInset = 0
```

`resize()` 안의 뷰오프셋 부분을 고친다:

```js
    const shift = (bottomInset - topInset) / 2
    // x 를 음수로 주면 뷰 창이 왼쪽으로 가고 그림은 오른쪽으로 밀린다.
    const shiftX = -leftInset / 2
    if (shift !== 0 || shiftX !== 0) camera.setViewOffset(w, h, shiftX, shift, w, h)
    else camera.clearViewOffset()
```

반환 객체(약 1745줄)에 추가:

```js
    /** 홈이 열려 있는 동안만 판을 오른쪽으로 비껴 세운다. */
    setLobbyFraming(on) {
      leftInset = on ? 152 : 0
      resize()
    },
```

`main.js` 의 홈 배선에서 부른다 — `prep.scene` 을 이미 쥐고 있다:

```js
  const home = createHome({
    data,
    onPick: (mode) => startMatch(mode),
    onCancelQueue: () => {
      queue?.cancel()
      queue = null
      home.setQueue(null)
    },
    onRetry: () => connect(),
  })
  home.show()
  prep.scene.setLobbyFraming(true)
```

`enterGame` 안의 `home.hide()` 바로 뒤에:

```js
    prep.scene.setLobbyFraming(false)
```

- [ ] **Step 3: 브라우저로 확인한다**

`preview_start` → `http://localhost:5180/?seed=20260901`

- 왼쪽 패널이 새 프레임으로 보이고 모서리가 안 늘어난다
- 무대가 패널에 안 가린다
- 메뉴 버튼 눌림 상태가 바뀐다
- 세로 390 에서 전적 줄까지 다 들어간다 (잘리면 `gap`·`padding` 을 줄인다)
- 콘솔 에러 0

스크린샷을 남긴다.

- [ ] **Step 4: 커밋**

```bash
npm run check
git add game/index.html game/src/scene3d.js game/src/main.js
git commit -m "feat: 로비에 새 UI 팩 입히고 무대를 비껴 세운다"
```

---

### Task 8: 문서 갱신

**Files:**
- Modify: `PROJECT/Status.md`

- [ ] **Step 1: 상태를 고친다**

`Implemented` 에 추가:

```
- **홈 로비** — 좌측 패널(메뉴·전적·접속 상태). 서버가 필수다. 연습·로컬 봇 로비 삭제
- **최소 전적** — 판수·1위·최고·최근 5판. 순위는 서버가 좌석 사망 시점에 박는다
- **실시간 정찰 송신** — 배치 중 250ms 쓰로틀, 전투 직전 확정 송신
```

`Not Implemented` 에서 "실시간 정찰 송신" 줄을 지우고 추가:

```
- 튜토리얼 · 코스메틱 · 패스 · 결제 (`docs/superpowers/specs/2026-09-03-home-lobby-design.md` §9 에 순서)
```

테스트 수를 실제 값으로 고친다 (`npm run check` 출력에서 확인).

- [ ] **Step 2: 커밋**

```bash
npm run check
git add PROJECT/Status.md
git commit -m "docs: 홈 로비·전적 반영"
```
