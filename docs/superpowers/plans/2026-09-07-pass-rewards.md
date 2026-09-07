# 시즌 패스 보상 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 25단계 트랙을 실제 보상으로 채운다 — 매 단계 젬 + 큰 보상 12개(그중 4개는 프리미엄 전용).

**Architecture:** 해금 단계의 단일소스는 계속 `cosmetics.json` 이다. 거기에
`passTrack` 칸 하나를 더해 프리미엄 전용을 가르고, `isUnlocked` 가 그 칸을 본다.
`passTrack()` 은 아바타뿐 아니라 무대·이펙트까지 훑어 트랙 25줄을 만든다.
젬 규칙만 `pass.json` 이 쥔다.

**Tech Stack:** 바닐라 JS(ESM) · vitest · `@agent8/gameserver-node`(TypeScript)
· 데이터는 `game/public/data/*.json` 단일소스

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-09-07-pass-rewards-design.md`
- `sim/` 은 순수해야 한다. `Date.now()`·`Math.random()` 금지
- 판정은 서버가 한다. 화면에서만 막으면 잠금은 장식이다
- **패스 보상은 젬으로 안 판다** — `shop.sellUnlock` 을 건드리지 않는다
- `passTrack` 이 없는 줄은 무료로 친다. 기존 네 줄을 안 고쳐도 지금처럼 동작한다
- 새 3D 에셋을 만들지 않는다. 무대·이펙트는 색·fx 값뿐이고, 아바타 둘은 이미 구워져 있다
- 주석은 한국어, **무엇이 아니라 왜**를 적는다
- 각 Task 끝에서 `npm run check` 초록. 서버를 건드린 Task 는 `npx -y @agent8/gameserver-node test` 도 초록

---

## File Structure

| 파일 | 책임 |
|---|---|
| `game/public/data/cosmetics.json` (수정) | 신규 8줄 + `passTrack` 칸 |
| `game/public/data/pass.json` (수정) | 젬 규칙에 5단계 보너스 |
| `sim/cosmetics.js` (수정) | `isUnlocked` 가 프리미엄 트랙을 가린다 |
| `sim/pass.js` (수정) | `gemsAt` 보너스 · `passTrack()` 이 세 종류를 훑는다 |
| `tools/validate.mjs` (수정) | 패스 보상 불변식 4종 |
| `server/src/server.ts` (수정) | `owned` 에 `premium` (두 자리) |
| `game/src/main.js` (수정) | `ownedNow()` 에 `premium` |
| `game/src/home.js` (수정) | 트랙이 무대·이펙트도 그린다 |
| `game/index.html` (수정) | 무대 띠·이펙트 점 CSS |
| `tests/cosmetics.test.js` (수정) | 프리미엄 전용 해금 |
| `tests/pass.test.js` (수정) | 젬 총합 · 트랙 25줄 |
| `tests/validate.test.js` (수정) | 새 불변식 |
| `server/test/server.test.ts` (수정) | 서버가 프리미엄 전용을 검산한다 |

---

### Task 1: 프리미엄 전용 해금 규칙

**Files:**
- Modify: `sim/cosmetics.js` (`isUnlocked`, `lockReason`)
- Test: `tests/cosmetics.test.js`

**Interfaces:**
- Produces: `isUnlocked(item, { passLevel, premium, lp, avatars })` — `item.passTrack === 'premium'` 이면 `premium` 이 참이어야 열린다. 없으면 지금과 같다

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cosmetics.test.js` 끝에 추가:

```js
describe('프리미엄 전용 패스 보상', () => {
  const prem = { id: 'x', unlock: 'pass', passLevel: 9, passTrack: 'premium' }
  const free = { id: 'y', unlock: 'pass', passLevel: 9, passTrack: 'free' }
  const old = { id: 'z', unlock: 'pass', passLevel: 9 }

  // 단계만 보고 열면 안 산 사람도 프리미엄 보상을 다 갖는다 — 그러면 살
  // 이유가 사라진다.
  it('단계에 닿아도 안 샀으면 안 열린다', () => {
    expect(isUnlocked(prem, { passLevel: 25, premium: false })).toBe(false)
    expect(isUnlocked(prem, { passLevel: 25 })).toBe(false)
  })

  it('샀고 단계도 닿았으면 열린다', () => {
    expect(isUnlocked(prem, { passLevel: 9, premium: true })).toBe(true)
  })

  it('샀어도 단계가 모자라면 안 열린다 — 사면 다 주는 것이 아니다', () => {
    expect(isUnlocked(prem, { passLevel: 8, premium: true })).toBe(false)
  })

  it('무료 트랙은 사든 안 사든 단계만 본다', () => {
    expect(isUnlocked(free, { passLevel: 9 })).toBe(true)
    expect(isUnlocked(old, { passLevel: 9 })).toBe(true)
  })

  it('젬으로 산 것은 그대로 열린다 — 산 것이 제일 먼저다', () => {
    expect(isUnlocked(prem, { passLevel: 1, avatars: ['x'] })).toBe(true)
  })

  it('왜 잠겼는지 프리미엄이라고 말한다', () => {
    expect(lockReason(prem)).toContain('프리미엄')
    expect(lockReason(free)).not.toContain('프리미엄')
  })
})
```

import 줄에 `lockReason` 이 없으면 추가한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cosmetics.test.js`
Expected: FAIL — 프리미엄을 안 봐서 `true` 가 나온다

- [ ] **Step 3: 구현한다**

`sim/cosmetics.js` 의 `isUnlocked` 에서 pass 분기를 바꾼다:

```js
  if (item.unlock === 'pass') {
    const reached = (owned.passLevel ?? 0) >= (item.passLevel ?? 0)
    // 프리미엄 트랙은 단계만으로 안 열린다. 안 그러면 안 산 사람도 다 갖고,
    // 그러면 프리미엄을 살 이유가 남지 않는다. passTrack 이 없는 줄은 무료로
    // 친다 — 기존 보상 네 줄을 안 고쳐도 지금처럼 동작한다.
    return reached && (item.passTrack !== 'premium' || !!owned.premium)
  }
```

`lockReason` 의 pass 분기도 고친다:

```js
  if (item.unlock === 'pass') {
    const where = item.passTrack === 'premium' ? '프리미엄 ' : ''
    return `시즌 패스 ${where}${item.passLevel ?? 0}단계`
  }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npm run check`
Expected: 전체 초록

- [ ] **Step 5: 커밋**

```bash
git add sim/cosmetics.js tests/cosmetics.test.js
git commit -m "feat: 프리미엄 전용 패스 보상 — 단계만으로는 안 열린다"
```

---

### Task 2: `owned` 를 만드는 세 자리에 `premium`

**Files:**
- Modify: `game/src/main.js` (`ownedNow`, `applyProfile`)
- Modify: `server/src/server.ts` (`updateLook`, `buyCosmetic` 의 `owned`)
- Test: `server/test/server.test.ts`

**Interfaces:**
- Consumes: `isUnlocked`(Task 1)
- Produces: 세 자리 모두 `owned.premium` 을 채운다

- [ ] **Step 1: 실패하는 서버 테스트를 쓴다**

`server/test/server.test.ts` 끝에 추가:

```ts
describe('프리미엄 전용 겉모습', () => {
  test('프리미엄을 안 샀으면 전용 무대가 기본값으로 떨어진다', async (server) => {
    const account = 'prem1';
    server.connect({ account });
    await server.joinLobby();
    const r = await server.updateLook('voidstone', 'knight', 'flare');
    expect(r.skin).not.toBe('voidstone');
  });

  test('프리미엄을 사고 단계가 닿으면 그 무대가 붙는다', async (server) => {
    const account = 'prem2';
    server.connect({ account });
    // 프리미엄 패스를 사고, 단계를 올릴 만큼 판을 돌린다.
    await server.$onItemPurchased({
      account,
      purchaseId: 9401,
      productId: 'pass_premium_s1',
      quantity: 1,
    });
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    const p = await server.getProfile();
    expect(p.pass.premium).toBe(true);
    // 9단계까지 못 갔으면 이 판으로는 확인할 수 없다 — 단계 조건은 vitest 가 덮는다.
    if (p.pass.level < 9) return;
    const r = await server.updateLook('voidstone', 'knight', 'flare');
    expect(r.skin).toBe('voidstone');
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx -y @agent8/gameserver-node test`
Expected: FAIL — `voidstone` 이 아직 데이터에 없다(Task 3 에서 넣는다). 이 Task 는
배선만 하므로, **Task 3 을 끝낸 뒤 다시 돌려** 초록을 확인한다

- [ ] **Step 3: 구현한다**

`game/src/main.js` 의 `ownedNow` 에 한 줄:

```js
  function ownedNow() {
    return {
      lp: profileLp,
      passLevel: profilePassLevel,
      // 프리미엄 전용 보상은 단계만으로 안 열린다 — 이 값이 빠지면 산 사람
      // 화면에서도 잠긴 채로 보인다.
      premium: profilePremium,
      gems: profileGems,
      avatars: profileOwned,
    }
  }
```

같은 파일에 상태 하나를 더한다(`let profilePassLevel = 1` 옆):

```js
  let profilePremium = false
```

`applyProfile` 에 한 줄:

```js
    profilePremium = !!p?.pass?.premium
```

`server/src/server.ts` 의 `updateLook` 과 `buyCosmetic` 안 `owned` 객체 두 곳에
같은 줄을 넣는다:

```ts
        passLevel: profile?.pass?.level ?? 1,
        premium: !!profile?.pass?.premium,
```

(`buyCosmetic` 쪽은 변수명이 `profile` 로 같다.)

- [ ] **Step 4: 확인은 Task 3 뒤에**

이 Task 만으로는 새 데이터가 없어 눈에 보이는 변화가 없다. `npm run check` 가
초록인지만 확인하고 넘어간다.

Run: `npm run check`
Expected: 전체 초록

- [ ] **Step 5: 커밋**

```bash
git add game/src/main.js server/src/server.ts server/test/server.test.ts
git commit -m "feat: 해금 판정에 프리미엄 여부를 넘긴다"
```

---

### Task 3: 신규 코스메틱 8개

**Files:**
- Modify: `game/public/data/cosmetics.json`
- Test: `tests/cosmetics.test.js`, 서버 테스트(Task 2 의 것)

**Interfaces:**
- Produces: `dawnvale`·`voidstone`·`bloomfield`(무대), `leafstorm`·`voidfall`·`sunburst`(이펙트), `pirate`·`zombie`(아바타)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/cosmetics.test.js` 끝에 추가:

```js
describe('시즌 패스 보상 표', () => {
  const passItems = (data) =>
    [...data.cosmetics.avatars, ...data.cosmetics.boards, ...data.cosmetics.booms].filter(
      (x) => x.unlock === 'pass',
    )

  it('무료·프리미엄 양쪽에 큰 보상이 있다', () => {
    const items = passItems(data)
    const free = items.filter((x) => (x.passTrack ?? 'free') === 'free')
    const prem = items.filter((x) => x.passTrack === 'premium')
    expect(free.length).toBeGreaterThanOrEqual(8)
    expect(prem.length).toBeGreaterThanOrEqual(4)
  })

  it('마지막 단계에 보상이 있다 — 끝까지 도는 사람이 가장 많이 보는 칸이다', () => {
    expect(passItems(data).some((x) => x.passLevel === data.pass.maxLevel)).toBe(true)
  })

  it('세 종류가 다 걸려 있다 — 아바타만 있으면 트랙이 한 줄짜리로 읽힌다', () => {
    const kinds = [
      data.cosmetics.avatars.some((x) => x.unlock === 'pass'),
      data.cosmetics.boards.some((x) => x.unlock === 'pass'),
      data.cosmetics.booms.some((x) => x.unlock === 'pass'),
    ]
    expect(kinds).toEqual([true, true, true])
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/cosmetics.test.js`
Expected: FAIL — 무료 8개·프리미엄 4개가 아직 없다

- [ ] **Step 3: 데이터를 넣는다**

`cosmetics.json` 의 `boards` 배열에 세 줄을 더한다(기존 줄 뒤):

```json
    {
      "id": "dawnvale",
      "name": "새벽 골짜기",
      "desc": "해 뜨기 직전의 돌",
      "unlock": "pass",
      "passLevel": 4,
      "passTrack": "free",
      "colors": { "floor": "#c9b6d8", "base": "#3a3350", "ground": "#6b6086", "ring": "#ffd9a0" }
    },
    {
      "id": "voidstone",
      "name": "공허석",
      "desc": "빛이 닿지 않는 돌",
      "unlock": "pass",
      "passLevel": 9,
      "passTrack": "premium",
      "colors": { "floor": "#6b5f8c", "base": "#241b38", "ground": "#3c3154", "ring": "#c07bff" }
    },
    {
      "id": "bloomfield",
      "name": "꽃밭",
      "desc": "밟으면 꽃가루가 인다",
      "unlock": "pass",
      "passLevel": 16,
      "passTrack": "free",
      "colors": { "floor": "#e7b8c8", "base": "#4a3b3f", "ground": "#7f9b6a", "ring": "#ff8fb8" }
    }
```

`booms` 배열에 세 줄:

```json
    {
      "id": "leafstorm",
      "name": "잎보라",
      "desc": "진 판이 잎에 묻힌다",
      "unlock": "pass",
      "passLevel": 7,
      "passTrack": "free",
      "fx": { "color": "#9fe870", "ring": "ring", "burst": "wisp", "spark": "spark", "shots": 7 }
    },
    {
      "id": "voidfall",
      "name": "공허 낙하",
      "desc": "진 판이 어둠에 삼켜진다",
      "unlock": "pass",
      "passLevel": 14,
      "passTrack": "premium",
      "fx": { "color": "#b07bff", "ring": "ring_thick", "burst": "burst", "spark": "wisp", "shots": 9 }
    },
    {
      "id": "sunburst",
      "name": "해돋이",
      "desc": "진 판 위로 해가 뜬다",
      "unlock": "pass",
      "passLevel": 21,
      "passTrack": "premium",
      "fx": { "color": "#ffb04a", "ring": "ring_thick", "burst": "burst", "spark": "spark", "shots": 11 }
    }
```

`avatars` 배열에 두 줄:

```json
    {
      "id": "pirate",
      "name": "해적",
      "pack": "chars",
      "file": "Pirate_Female.glb",
      "unlock": "pass",
      "passLevel": 20,
      "passTrack": "free"
    },
    {
      "id": "zombie",
      "name": "좀비",
      "pack": "chars",
      "file": "Zombie_Male.glb",
      "unlock": "pass",
      "passLevel": 25,
      "passTrack": "premium"
    }
```

기존 패스 보상 네 줄(`ninja`·`skull`·`emberfall`·`champion` 은 랭크이므로 제외)에
`"passTrack": "free"` 를 **명시**한다 — 없어도 무료로 읽히지만, 표를 볼 때 어느
트랙인지가 줄마다 보이는 편이 낫다. 대상: `ninja`(10), `skull`(22),
`emberfall`(15), `starfall`(18).

- [ ] **Step 4: 통과를 확인한다**

Run: `npm run check`
Expected: 전체 초록

Run: `npx -y @agent8/gameserver-node test`
Expected: 전체 초록 — Task 2 에서 쓴 `voidstone` 테스트가 이제 돈다

- [ ] **Step 5: 그림이 실재하는지 확인한다**

```bash
ls game/public/assets/avatars/Pirate_Female.glb game/public/assets/avatars/Zombie_Male.glb
```
Expected: 두 파일 다 있다

- [ ] **Step 6: 커밋**

```bash
git add game/public/data/cosmetics.json tests/cosmetics.test.js
git commit -m "feat: 패스 보상 8개 — 무대 3 · 이펙트 3 · 아바타 2"
```

---

### Task 4: 젬을 매 단계로, 트랙이 세 종류를 훑는다

**Files:**
- Modify: `game/public/data/pass.json`
- Modify: `sim/pass.js` (`gemsAt`, `passTrack`)
- Test: `tests/pass.test.js`

**Interfaces:**
- Produces: `passTrack(data, pass)` 한 줄의 모양이 바뀐다
  ```js
  { level, reached,
    free:    { gems, item },   // item: { kind, id, name, file?, colors?, fx? } | null
    premium: { gems, item } }
  ```
  `kind` 는 `'avatar' | 'board' | 'boom'`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/pass.test.js` 끝에 추가:

```js
describe('트랙을 채운다', () => {
  const track = () => passTrack(data, { xp: 0, level: 1, premium: false })

  it('빈 줄이 없다 — 젬이든 물건이든 매 단계 뭔가 있다', () => {
    for (const t of track()) {
      const something = t.free.gems > 0 || t.free.item || t.premium.gems > 0 || t.premium.item
      expect(something, `${t.level}단계가 비었다`).toBeTruthy()
    }
  })

  it('무료 젬 총합이 325 다', () => {
    const sum = track().reduce((n, t) => n + t.free.gems, 0)
    expect(sum).toBe(325)
  })

  it('프리미엄 젬 총합이 1000 이다', () => {
    const sum = track().reduce((n, t) => n + t.premium.gems, 0)
    expect(sum).toBe(1000)
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
    const board = track().find((x) => x.level === 4).free.item
    const boom = track().find((x) => x.level === 7).free.item
    expect(board.colors).toBeTruthy()
    expect(boom.fx).toBeTruthy()
  })

  it('내 단계까지는 지난 칸으로 표시된다', () => {
    const t = passTrack(data, { xp: data.pass.xpPerLevel * 3, level: 4, premium: false })
    expect(t[3].reached).toBe(true)
    expect(t[4].reached).toBe(false)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/pass.test.js`
Expected: FAIL — 젬 총합이 125, 무대·이펙트가 안 뜬다

- [ ] **Step 3: 젬 규칙을 고친다**

`game/public/data/pass.json` 의 `gems` 를 바꾼다:

```json
  "gems": {
    "free": { "everyLevels": 1, "amount": 10, "bonusEvery": 5, "bonusAmount": 15 },
    "premium": { "everyLevels": 1, "amount": 40 }
  }
```

`sim/pass.js` 의 `gemsAt` 를 고친다:

```js
/**
 * 그 단계에서 주는 젬. 해당 없으면 0.
 *
 * 보너스를 따로 두는 이유: 무료 트랙은 **매 단계 뭔가**가 있어야 빈칸이 안
 * 생기는데, 매 단계를 크게 주면 젬을 파는 이유가 사라진다. 작게 매번 주고
 * 다섯 칸마다 조금 더 얹는다 — 다음 다섯 번째 칸이 다음 목표가 된다.
 */
export function gemsAt(level, track, data) {
  const rule = data.pass.gems[track]
  if (!rule || level < 1) return 0
  const every = rule.everyLevels ?? 1
  const base = level % every === 0 ? (rule.amount ?? 0) : 0
  const bonus =
    rule.bonusEvery && level % rule.bonusEvery === 0 ? (rule.bonusAmount ?? 0) : 0
  return base + bonus
}
```

- [ ] **Step 4: 트랙이 세 종류를 훑게 한다**

`sim/pass.js` 의 `passTrack` 을 바꾼다:

```js
/**
 * 그 단계에 걸린 큰 보상. 없으면 null.
 *
 * 아바타·무대·이펙트를 **한 번에** 훑는다. 종류마다 목록이 갈려 있지만 트랙에
 * 서는 자리는 하나다 — 종류별로 따로 그리면 한 칸에 둘이 겹치는 것을 화면이
 * 못 본다(불변식이 그 겹침을 막는다).
 */
function itemAt(level, track, data) {
  const lists = [
    ['avatar', data.cosmetics.avatars],
    ['board', data.cosmetics.boards],
    ['boom', data.cosmetics.booms],
  ]
  for (const [kind, list] of lists) {
    const found = list.find(
      (x) =>
        x.unlock === 'pass' && x.passLevel === level && (x.passTrack ?? 'free') === track,
    )
    if (found) {
      return {
        kind,
        id: found.id,
        name: found.name,
        file: found.file ?? null,
        colors: found.colors ?? null,
        fx: found.fx ?? null,
      }
    }
  }
  return null
}

/**
 * 트랙 한 줄씩. 화면이 그대로 그린다.
 *
 * 잠긴 단계도 **전부** 준다 — 무엇이 기다리는지 보여야 계속할 이유가 생긴다.
 * 프리미엄 줄도 안 산 사람에게 보여 준다. 무엇을 놓치는지 안 보이면 살 이유가
 * 생기지 않는다.
 */
export function passTrack(data, pass = EMPTY_PASS) {
  const cur = passLevelOf(pass.xp ?? 0, data)
  const out = []
  for (let level = 1; level <= data.pass.maxLevel; level++) {
    out.push({
      level,
      reached: level <= cur,
      free: { gems: gemsAt(level, 'free', data), item: itemAt(level, 'free', data) },
      premium: { gems: gemsAt(level, 'premium', data), item: itemAt(level, 'premium', data) },
    })
  }
  return out
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npm run check`
Expected: 전체 초록. **`home.js` 가 `t.free.avatar` 를 읽고 있어 트랙 화면이
깨진다 — Task 5 에서 고친다.** 테스트는 통과한다(화면은 테스트가 안 덮는다)

- [ ] **Step 6: 돌연변이로 검증한다**

`gemsAt` 의 `bonus` 를 `0` 으로 고정하고 `npx vitest run tests/pass.test.js` 를
돌린다. "무료 젬 총합이 325 다" 가 **빨개져야** 한다. 확인했으면 되돌린다.

- [ ] **Step 7: 커밋**

```bash
git add game/public/data/pass.json sim/pass.js tests/pass.test.js
git commit -m "feat: 매 단계 젬 + 트랙이 무대·이펙트까지 훑는다"
```

---

### Task 5: 트랙 화면이 세 가지를 그린다

**Files:**
- Modify: `game/src/home.js` (`openPass`, `showNextReward`)
- Modify: `game/index.html` (무대 띠·이펙트 점 CSS)
- Test: 브라우저

**Interfaces:**
- Consumes: `passTrack()` 의 새 모양(Task 4)

- [ ] **Step 1: 마크업을 그리는 코드를 고친다**

`game/src/home.js` 의 `openPass` 안, `el.passRows.innerHTML = track.map(...)` 를
다음으로 바꾼다:

```js
    /**
     * 보상 한 칸. 종류마다 다르게 그린다.
     *
     * 무대를 **판 견본으로 안 찍는 이유**: 꾸미기 창은 한 번에 다섯 장이고
     * 캐시가 있지만, 트랙은 스물다섯 칸이 한 번에 열린다 — 여는 순간 프레임이
     * 끊긴다. 색 띠면 "무슨 색 판인가"는 전해진다.
     *
     * 이펙트를 **안 움직이는 이유**: 이펙트는 움직여야 뜻이 사는데 스물다섯
     * 칸이 동시에 움직이면 어디를 봐야 할지 모른다. 색 점만 두고, 자세한
     * 것은 꾸미기 창에서 본다.
     */
    const cell = (slot) => {
      const gem = slot.gems ? `<span class="badge gem">${slot.gems}</span>` : ''
      const it = slot.item
      if (!it) return slot.gems ? `<span class="rw gem">${slot.gems}</span>` : '<span class="rw none"></span>'
      if (it.kind === 'avatar') {
        return `<div class="rw av"><img alt="" data-file="${it.file}" title="${it.name}" />${gem}</div>`
      }
      if (it.kind === 'board') {
        const c = it.colors ?? {}
        return (
          `<div class="rw sk" title="${it.name}">` +
          `<i style="background:${c.floor ?? '#888'}"></i>` +
          `<i style="background:${c.ground ?? '#666'}"></i>` +
          `<i style="background:${c.base ?? '#333'}"></i>` +
          `<i style="background:${c.ring ?? '#fff'}"></i>${gem}</div>`
        )
      }
      return `<div class="rw bm" title="${it.name}" style="--bc:${it.fx?.color ?? '#ffd166'}">${gem}</div>`
    }

    el.passRows.innerHTML = track
      .map(
        (t) =>
          `<div class="step${t.reached ? ' got' : ''}">` +
          `<div class="lv">${t.level}</div>${cell(t.free)}` +
          `<div class="prem">${cell(t.premium)}</div></div>`,
      )
      .join('')
```

- [ ] **Step 2: 홈 카드의 "다음 보상"도 세 종류를 본다**

같은 파일 `showNextReward` 를 고친다:

```js
  let nextShown = null
  function showNextReward(level) {
    // 아바타만 보면 "다음 보상"이 열 단계 뒤를 가리키는데, 그 사이에 무대와
    // 이펙트가 셋이나 있다 — 가까운 것을 가리켜야 다음 목표가 된다.
    const all = [
      ...data.cosmetics.avatars,
      ...data.cosmetics.boards,
      ...data.cosmetics.booms,
    ]
    const next = all
      .filter((x) => x.unlock === 'pass' && x.passLevel > level)
      .sort((a, b) => a.passLevel - b.passLevel)[0]
    el.passNext.parentElement.hidden = !next
    if (!next) return
    el.passNextLv.textContent = `${next.passLevel}단계`
    // 아바타가 아니면 찍을 그림이 없다. 색 한 칸으로 대신한다.
    if (!next.file) {
      nextShown = null
      el.passNext.removeAttribute('src')
      el.passNext.style.background = next.colors?.floor ?? next.fx?.color ?? '#ffd166'
      return
    }
    el.passNext.style.background = ''
    if (next.file === nextShown) return
    nextShown = next.file
    onAvatarPortrait?.(next.file)
      .then((url) => {
        el.passNext.src = url
      })
      .catch(() => {})
  }
```

- [ ] **Step 3: CSS 를 더한다**

`game/index.html` 의 `#passtrack .step` 규칙 뒤에 넣는다:

```css
  /* 무대 보상. 색 네 개를 가로 띠로 — 판 견본을 스물다섯 장 찍으면 여는
     순간 프레임이 끊긴다. */
  #passtrack .rw.sk {
    position: relative; width: 100%; height: 34px; display: flex; overflow: hidden;
    box-shadow: inset 0 0 0 1px #00000066;
  }
  #passtrack .rw.sk i { flex: 1; }
  /* 이펙트 보상. 그 색의 원 하나 — 스물다섯 칸이 동시에 움직이면 어디를
     봐야 할지 모른다. */
  #passtrack .rw.bm {
    position: relative; width: 100%; height: 34px;
    display: flex; align-items: center; justify-content: center;
  }
  #passtrack .rw.bm::before {
    content: ''; width: 20px; height: 20px; border-radius: 50%;
    background: radial-gradient(circle at 50% 45%, #ffffffcc 0%, var(--bc) 45%, #00000000 72%);
    box-shadow: 0 0 8px var(--bc);
  }
```

- [ ] **Step 4: 눈으로 확인한다**

1. Browser pane 으로 홈을 연다(`preview_start`)
2. 시즌 패스 카드를 눌러 트랙을 연다
3. 확인할 것: 4단계에 색 띠(새벽 골짜기) · 7단계에 초록 점(잎보라) ·
   9단계 **프리미엄 줄**에 보라 띠(공허석) · 20단계에 아바타 초상(해적) ·
   25단계 프리미엄에 아바타(좀비) · **빈 칸이 없다**
4. 콘솔에 오류가 없다

- [ ] **Step 5: 커밋**

```bash
git add game/src/home.js game/index.html
git commit -m "feat: 트랙이 무대는 색 띠로, 이펙트는 색 점으로 그린다"
```

---

### Task 6: 불변식

**Files:**
- Modify: `tools/validate.mjs`
- Test: `tests/validate.test.js`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/validate.test.js` 끝에 추가:

```js
describe('패스 보상', () => {
  it('현재 데이터는 통과한다', () => {
    expect(validate(data)).toEqual([])
  })

  it('단계가 범위 밖이면 잡는다', () => {
    const bad = clone(data)
    bad.cosmetics.boards.push({ id: 'x', name: 'x', unlock: 'pass', passLevel: 99, colors: {} })
    expect(validate(bad).some((m) => m.includes('단계'))).toBe(true)
  })

  it('모르는 트랙 이름을 잡는다 — 오타 하나로 보상이 조용히 사라진다', () => {
    const bad = clone(data)
    bad.cosmetics.boards.push({
      id: 'x', name: 'x', unlock: 'pass', passLevel: 2, passTrack: 'premiun', colors: {},
    })
    expect(validate(bad).some((m) => m.includes('트랙'))).toBe(true)
  })

  it('한 칸에 큰 보상이 둘이면 잡는다 — 화면이 하나만 그린다', () => {
    const bad = clone(data)
    bad.cosmetics.boards.push({
      id: 'x', name: 'x', unlock: 'pass', passLevel: 10, passTrack: 'free', colors: {},
    })
    expect(validate(bad).some((m) => m.includes('겹친다'))).toBe(true)
  })

  it('없는 아바타 파일을 잡는다', () => {
    const bad = clone(data)
    bad.cosmetics.avatars.push({
      id: 'x', name: 'x', pack: 'chars', file: '없는파일.glb', unlock: 'pass', passLevel: 3,
    })
    expect(validate(bad).some((m) => m.includes('파일'))).toBe(true)
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run tests/validate.test.js`
Expected: FAIL — 새 불변식이 없다

- [ ] **Step 3: 구현한다**

`tools/validate.mjs` 의 `validate()` 안, 미션 불변식(23) 다음에:

```js
  // 24. 패스 보상. 단계·트랙이 틀리면 그 보상은 **조용히 사라진다** — 예외도
  // 안 나고 화면에서도 안 보인다. 표를 고치는 그 자리에서 걸려야 한다.
  const passSeen = new Map()
  const passLists = [
    ['아바타', data.cosmetics?.avatars ?? []],
    ['무대', data.cosmetics?.boards ?? []],
    ['이펙트', data.cosmetics?.booms ?? []],
  ]
  for (const [what, list] of passLists) {
    for (const item of list) {
      if (item.unlock !== 'pass') continue
      const max = data.pass?.maxLevel ?? 0
      if (!Number.isInteger(item.passLevel) || item.passLevel < 1 || item.passLevel > max) {
        errors.push(`${what} ${item.id} 의 패스 단계가 1..${max} 밖이다`)
      }
      const track = item.passTrack ?? 'free'
      if (track !== 'free' && track !== 'premium') {
        errors.push(`${what} ${item.id} 의 패스 트랙 "${item.passTrack}" 를 모른다`)
      }
      const key = `${track}:${item.passLevel}`
      if (passSeen.has(key)) {
        errors.push(
          `패스 보상이 겹친다: ${track} ${item.passLevel}단계에 ${passSeen.get(key)} 와 ${item.id}`,
        )
      }
      passSeen.set(key, item.id)
      // 아바타 보상은 그림이 있어야 한다. 없으면 트랙에 빈 액자가 뜬다.
      if (item.file && !existsSync(`${AVATAR_DIR}${item.file}`)) {
        errors.push(`${what} ${item.id} 의 파일이 없다 (${item.file})`)
      }
    }
  }
```

파일 위쪽 상수 자리(`ICON_DIR` 옆)에 한 줄을 더한다:

```js
const AVATAR_DIR = 'game/public/assets/avatars/'
```

`ICON_DIR` 이 어떻게 정의돼 있는지 보고 같은 방식(절대/상대)으로 맞춘다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npm run check`
Expected: `불변식 통과` + 전체 초록

- [ ] **Step 5: 커밋**

```bash
git add tools/validate.mjs tests/validate.test.js
git commit -m "feat: 패스 보상 불변식 — 겹치거나 범위를 벗어나면 조용히 사라진다"
```

---

### Task 7: 문서 갱신

**Files:**
- Modify: `PROJECT/Status.md`

- [ ] **Step 1: 상태를 고친다**

시즌 패스 줄을 고친다:

```markdown
- **시즌 패스** — 판마다 경험치, 단계가 오르면 보상이 열린다(`sim/pass.js`).
  25단계가 **매 단계 젬**(무료 10·프리미엄 40, 5의 배수엔 무료 +15)으로 차 있고,
  큰 보상이 12개다 — 그중 4개는 프리미엄 전용(`passTrack`). 해금 단계의
  단일소스는 `cosmetics.json` 하나
```

테스트 수치를 `npm run check` 결과로 갱신한다.

- [ ] **Step 2: 커밋**

```bash
git add PROJECT/Status.md
git commit -m "docs: 패스 보상을 상태에 적는다"
```

---

## Self-Review 결과

- **스펙 §3.1(젬)** → Task 4(`gemsAt` 보너스 · 총합 테스트)
- **스펙 §3.2·3.3(보상표·신규 8개)** → Task 3
- **스펙 §4(프리미엄 잠금)** → Task 1(규칙) · Task 2(`owned` 세 자리)
- **스펙 §5(트랙 화면)** → Task 4(데이터 모양) · Task 5(그리기)
- **스펙 §6(검증)** → 각 Task 의 테스트 · Task 6(불변식) · Task 5 Step 4(브라우저)
- **스펙 §7(다음 조각)** → 계획 밖. 문서만 Task 7

이름 일치 확인: `passTrack`(함수)와 `passTrack`(코스메틱 칸)이 **철자가 같다** —
함수는 `sim/pass.js` 의 export, 칸은 `cosmetics.json` 의 필드다. 헷갈릴 수 있으나
기존 함수 이름을 바꾸면 호출부(`home.js`)까지 번지므로 그대로 둔다.
`itemAt` 은 Task 4 에서 새로 만드는 내부 함수이고 밖으로 안 나간다.
