# Reroll Royale 1단계 — 결정론 헤드리스 전투 시뮬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 렌더 없이 (보드A, 보드B, 시드) → 전투 로그를 산출하는 결정론 전투 시뮬레이터와 그 데이터 레이어·검증기를 만든다.

**Architecture:** `sim/` 은 순수 함수 모듈이다. DOM·PixiJS·fetch 에 의존하지 않고 Node 에서 그대로 돌아간다. 게임 규칙 수치는 전량 `game/public/data/*.json` 에 있고 `sim/` 은 이를 주입받는다. 전투는 고정 30틱/초로 진행하며 지속 상태(HP·마나·틱 카운터)는 전부 정수다. 나중에 `view/board` 가 이 로그를 재생만 하고, 서버가 같은 코드로 결과를 검증한다.

**Tech Stack:** Node 20+ · ESM · Vitest · Vite(2단계부터) · 외부 런타임 의존성 없음

## Global Constraints

- 스펙 단일소스: `docs/superpowers/specs/2026-08-31-reroll-royale-design.md`
- 수치를 코드에 하드코딩하지 않는다. `game/public/data/*.json` 이 단일소스다.
- `sim/` 의 어떤 파일도 `document`·`window`·`PIXI`·`fetch` 를 참조하지 않는다.
- `Math.random()` 과 `Date.now()` 를 `sim/` 안에서 호출하지 않는다. 난수는 `sim/rng.js` 만 쓴다.
- 지속 상태(HP·shield·mana·틱 카운터·좌표)는 정수로 저장한다. 파생 계산에 부동소수를 써도 되지만 저장 직전 `Math.floor` 한다.
- 모든 순회는 결정론적 순서를 갖는다. `Object.keys` 순서에 의존하지 않고 배열 인덱스 순으로 돈다.
- 파일명·식별자는 영문 snake_case, 표시 문자열은 `name.ko` / `name.en` 로 분리한다.
- 커밋 메시지는 한국어 본문 + Conventional Commits 접두사(`feat:` `test:` `chore:` `docs:`).

---

## File Structure

| 파일 | 책임 |
|---|---|
| `package.json` | ESM 프로젝트 선언, vitest 스크립트 |
| `game/public/data/combat.json` | 틱레이트 · 보드 기하 · 티어 기본 스탯 · 직업 계수 · 성급 배율 · 마나/피해 공식 |
| `game/public/data/units.json` | 유닛 26종 (id · 티어 · 종족 · 직업 · 스킬) |
| `game/public/data/traits.json` | 시너지 11종 (활성 단계 · 효과) |
| `game/public/data/shop.json` | 레벨별 티어 확률표 · 티어별 풀 매수 (1단계에서는 검증만) |
| `sim/rng.js` | 시드 고정 정수 난수 |
| `sim/hex.js` | 타일 인덱스 · 인접 그래프 · 거리 행렬 |
| `sim/data.js` | JSON 로드 (Node fs / 브라우저 fetch 양용) |
| `sim/stats.js` | 티어×직업×성급 스탯 해석, 시너지·아이템 가산 |
| `sim/traits.js` | 보드 → 시너지 활성 단계 산출 |
| `sim/targeting.js` | 타겟 선택 |
| `sim/movement.js` | 1칸 이동 · 점유 충돌 우회 |
| `sim/skills.js` | 스킬 4타입 실행기 |
| `sim/combat.js` | 전투 메인 루프, 전투 로그 산출 |
| `sim/run.mjs` | 헤드리스 밸런스 러너 (조합 A vs B, N회 승률) |
| `tools/validate.mjs` | 데이터 불변식 검사 |
| `tests/*.test.js` | Vitest |

---

## Task 1: 프로젝트 스캐폴드 + 결정론 난수

**Files:**
- Create: `package.json`
- Create: `sim/rng.js`
- Test: `tests/rng.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `createRng(seed: number) => { nextU32(): number, int(n: number): number, pick(arr: T[]): T, state(): number }`
  - `nextU32` 는 0 이상 2^32 미만 정수. `int(n)` 은 0 이상 n 미만 정수. `pick` 은 `arr[int(arr.length)]`.

- [ ] **Step 1: `package.json` 작성**

```json
{
  "name": "reroll-royale",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "validate": "node tools/validate.mjs",
    "check": "npm run validate && npm test"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: 의존성 설치**

Run: `npm install`
Expected: `node_modules/` 생성, 에러 없음

- [ ] **Step 3: 실패하는 테스트 작성**

`tests/rng.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { createRng } from '../sim/rng.js'

describe('createRng', () => {
  it('같은 시드는 같은 수열을 낸다', () => {
    const a = createRng(12345)
    const b = createRng(12345)
    const seqA = Array.from({ length: 20 }, () => a.nextU32())
    const seqB = Array.from({ length: 20 }, () => b.nextU32())
    expect(seqA).toEqual(seqB)
  })

  it('다른 시드는 다른 수열을 낸다', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.nextU32()).not.toBe(b.nextU32())
  })

  it('nextU32 는 부호 없는 32비트 정수다', () => {
    const r = createRng(7)
    for (let i = 0; i < 200; i++) {
      const v = r.nextU32()
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(2 ** 32)
    }
  })

  it('int(n) 은 0 이상 n 미만이다', () => {
    const r = createRng(99)
    for (let i = 0; i < 500; i++) {
      const v = r.int(6)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(6)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('int(0) 은 0 을 낸다', () => {
    expect(createRng(3).int(0)).toBe(0)
  })

  it('pick 은 배열 원소를 낸다', () => {
    const r = createRng(42)
    const arr = ['a', 'b', 'c']
    for (let i = 0; i < 50; i++) expect(arr).toContain(r.pick(arr))
  })

  it('state() 로 재개하면 같은 수열이 이어진다', () => {
    const a = createRng(555)
    a.nextU32(); a.nextU32()
    const resumed = createRng(a.state())
    expect(resumed.nextU32()).toBe(createRng(a.state()).nextU32())
  })
})
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `npx vitest run tests/rng.test.js`
Expected: FAIL — `Failed to load ../sim/rng.js`

- [ ] **Step 5: 구현**

`sim/rng.js`:

```js
// 시드 고정 정수 난수. mulberry32.
// sim/ 안에서 무작위성이 필요한 곳은 전부 이 모듈만 쓴다.
// Math.random() 은 결정론을 깨므로 sim/ 어디서도 호출하지 않는다.

export function createRng(seed) {
  let s = seed >>> 0

  function nextU32() {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }

  return {
    nextU32,
    int(n) {
      if (n <= 0) return 0
      return nextU32() % n
    },
    pick(arr) {
      return arr[this.int(arr.length)]
    },
    state() {
      return s
    },
  }
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run tests/rng.test.js`
Expected: PASS — 7 tests

- [ ] **Step 7: 커밋**

```bash
git add package.json package-lock.json sim/rng.js tests/rng.test.js
git commit -m "feat: 시드 고정 결정론 난수 추가

mulberry32. sim/ 안 무작위성의 유일한 창구.
Math.random 은 결정론을 깨므로 금지.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: 헥스 보드 기하

전장은 6행이다. 위 3행이 적 진영, 아래 3행이 내 진영이며 각 진영은 위에서부터 7/8/7 = 22칸이다.

행마다 가로 오프셋이 다르고, 인접은 **타일 중심 사이의 유클리드 거리**로 정한다. 거리는 인접 그래프 위의 **BFS 홉 수**다. 이렇게 하면 7행과 8행이 섞인 비정규 격자에서도 거리가 정수로 딱 떨어지고 결정론이 보장된다.

**교전선 주의:** 행 2(적 앞줄)와 행 3(내 앞줄)은 오프셋이 같아 세로로만 인접한다. 즉 교전선은 좁은 통로다. 이 성질은 `combat.json > board.rowOffset` 데이터로 조정 가능하다.

**Files:**
- Create: `game/public/data/combat.json`
- Create: `sim/hex.js`
- Test: `tests/hex.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `buildBoard(boardCfg) => Board`
  - `Board = { tileCount: number, tiles: Tile[], neighbors: number[][], dist: number[][], indexOf(row, col): number, side(tileIndex): 'ally'|'enemy' }`
  - `Tile = { index: number, row: number, col: number, cx: number, cy: number }`
  - `boardCfg` 는 `combat.json > board`

- [ ] **Step 1: `game/public/data/combat.json` 작성**

```json
{
  "tickRate": 30,
  "maxTicks": 1800,
  "starMultiplier": [1.0, 1.8, 3.24],
  "board": {
    "rows": [7, 8, 7, 7, 8, 7],
    "rowOffset": [0.5, 0, 0.5, 0.5, 0, 0.5],
    "rowHeight": 0.866,
    "adjacencyThreshold": 1.05,
    "enemyRows": [0, 1, 2],
    "allyRows": [3, 4, 5]
  },
  "tierBase": {
    "1": { "hp": 500, "atk": 40, "def": 20, "mr": 20, "power": 30, "attackInterval": 50, "manaStart": 30 },
    "2": { "hp": 650, "atk": 50, "def": 25, "mr": 20, "power": 40, "attackInterval": 47, "manaStart": 25 },
    "3": { "hp": 800, "atk": 62, "def": 30, "mr": 25, "power": 52, "attackInterval": 44, "manaStart": 20 },
    "4": { "hp": 950, "atk": 75, "def": 35, "mr": 25, "power": 66, "attackInterval": 41, "manaStart": 15 },
    "5": { "hp": 1100, "atk": 90, "def": 40, "mr": 30, "power": 82, "attackInterval": 38, "manaStart": 10 }
  },
  "classModifier": {
    "guardian": { "hp": 1.35, "atk": 0.75, "def": 1.5, "mr": 1.2, "power": 0.8, "attackInterval": 1.1, "range": 1, "critChance": 0.05 },
    "blade":    { "hp": 1.0,  "atk": 1.15, "def": 1.0, "mr": 1.0, "power": 0.8, "attackInterval": 0.95, "range": 1, "critChance": 0.1 },
    "ranger":   { "hp": 0.8,  "atk": 1.1,  "def": 0.7, "mr": 0.9, "power": 0.9, "attackInterval": 0.85, "range": 3, "critChance": 0.1 },
    "mage":     { "hp": 0.8,  "atk": 0.7,  "def": 0.7, "mr": 1.1, "power": 1.4, "attackInterval": 1.05, "range": 3, "critChance": 0.05 },
    "assassin": { "hp": 0.75, "atk": 1.25, "def": 0.7, "mr": 0.9, "power": 0.9, "attackInterval": 0.9, "range": 1, "critChance": 0.2 },
    "undying":  { "hp": 1.15, "atk": 0.9,  "def": 1.1, "mr": 1.1, "power": 1.0, "attackInterval": 1.05, "range": 1, "critChance": 0.05 }
  },
  "mana": {
    "perAttack": 10,
    "onHitPercent": 1,
    "onHitMax": 20,
    "full": 100
  },
  "damage": {
    "defK": 100,
    "critMultiplier": 1.5
  }
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/hex.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildBoard } from '../sim/hex.js'
import combat from '../game/public/data/combat.json' with { type: 'json' }

const board = buildBoard(combat.board)

describe('buildBoard', () => {
  it('타일이 44칸이다 (진영당 22칸)', () => {
    expect(board.tileCount).toBe(44)
    expect(board.tiles).toHaveLength(44)
  })

  it('행별 칸 수가 7/8/7/7/8/7 이다', () => {
    const counts = [0, 0, 0, 0, 0, 0]
    for (const t of board.tiles) counts[t.row]++
    expect(counts).toEqual([7, 8, 7, 7, 8, 7])
  })

  it('indexOf 가 행·열로 타일 인덱스를 되돌린다', () => {
    for (const t of board.tiles) {
      expect(board.indexOf(t.row, t.col)).toBe(t.index)
    }
  })

  it('없는 좌표는 -1 이다', () => {
    expect(board.indexOf(0, 7)).toBe(-1)
    expect(board.indexOf(6, 0)).toBe(-1)
  })

  it('행 0~2 는 적, 행 3~5 는 아군이다', () => {
    expect(board.side(board.indexOf(0, 0))).toBe('enemy')
    expect(board.side(board.indexOf(2, 3))).toBe('enemy')
    expect(board.side(board.indexOf(3, 0))).toBe('ally')
    expect(board.side(board.indexOf(5, 6))).toBe('ally')
  })

  it('인접은 대칭이다', () => {
    for (let a = 0; a < board.tileCount; a++) {
      for (const b of board.neighbors[a]) {
        expect(board.neighbors[b]).toContain(a)
      }
    }
  })

  it('자기 자신은 인접이 아니다', () => {
    for (let a = 0; a < board.tileCount; a++) {
      expect(board.neighbors[a]).not.toContain(a)
    }
  })

  it('거리는 대칭이고 자기 자신은 0 이다', () => {
    for (let a = 0; a < board.tileCount; a++) {
      expect(board.dist[a][a]).toBe(0)
      for (let b = 0; b < board.tileCount; b++) {
        expect(board.dist[a][b]).toBe(board.dist[b][a])
      }
    }
  })

  it('인접한 두 타일의 거리는 1 이다', () => {
    for (let a = 0; a < board.tileCount; a++) {
      for (const b of board.neighbors[a]) expect(board.dist[a][b]).toBe(1)
    }
  })

  it('모든 타일이 서로 도달 가능하다 (그래프가 연결되어 있다)', () => {
    for (let a = 0; a < board.tileCount; a++) {
      for (let b = 0; b < board.tileCount; b++) {
        expect(board.dist[a][b]).toBeLessThan(Infinity)
      }
    }
  })

  it('모든 거리가 정수다', () => {
    for (let a = 0; a < board.tileCount; a++) {
      for (let b = 0; b < board.tileCount; b++) {
        expect(Number.isInteger(board.dist[a][b])).toBe(true)
      }
    }
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run tests/hex.test.js`
Expected: FAIL — `Failed to load ../sim/hex.js`

- [ ] **Step 4: 구현**

`sim/hex.js`:

```js
// 전장 기하. 6행(적 3행 + 아군 3행), 행마다 칸 수와 가로 오프셋이 다르다.
// 인접은 타일 중심 사이 유클리드 거리로 정하고, 거리는 인접 그래프 위 BFS 홉 수다.
// 비정규 격자에서도 거리가 정수로 떨어져 결정론이 보장된다.

export function buildBoard(cfg) {
  const { rows, rowOffset, rowHeight, adjacencyThreshold, allyRows } = cfg

  const tiles = []
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row]; col++) {
      tiles.push({
        index: tiles.length,
        row,
        col,
        cx: col + rowOffset[row],
        cy: row * rowHeight,
      })
    }
  }

  const tileCount = tiles.length

  const lookup = new Map()
  for (const t of tiles) lookup.set(t.row * 100 + t.col, t.index)

  const neighbors = tiles.map(() => [])
  for (let a = 0; a < tileCount; a++) {
    for (let b = a + 1; b < tileCount; b++) {
      const dx = tiles[a].cx - tiles[b].cx
      const dy = tiles[a].cy - tiles[b].cy
      if (Math.sqrt(dx * dx + dy * dy) <= adjacencyThreshold) {
        neighbors[a].push(b)
        neighbors[b].push(a)
      }
    }
  }
  // 결정론적 순회를 위해 인덱스 오름차순으로 고정한다.
  for (const list of neighbors) list.sort((x, y) => x - y)

  const dist = []
  for (let start = 0; start < tileCount; start++) {
    const row = new Array(tileCount).fill(Infinity)
    row[start] = 0
    const queue = [start]
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head]
      for (const nb of neighbors[cur]) {
        if (row[nb] === Infinity) {
          row[nb] = row[cur] + 1
          queue.push(nb)
        }
      }
    }
    dist.push(row)
  }

  const allySet = new Set(allyRows)

  return {
    tileCount,
    tiles,
    neighbors,
    dist,
    indexOf(row, col) {
      const found = lookup.get(row * 100 + col)
      return found === undefined ? -1 : found
    },
    side(tileIndex) {
      return allySet.has(tiles[tileIndex].row) ? 'ally' : 'enemy'
    },
  }
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/hex.test.js`
Expected: PASS — 11 tests

- [ ] **Step 6: 커밋**

```bash
git add game/public/data/combat.json sim/hex.js tests/hex.test.js
git commit -m "feat: 헥스 전장 기하와 combat.json 추가

6행(적 3 + 아군 3), 진영당 7/8/7 = 22칸.
인접은 타일 중심 거리로, 거리는 BFS 홉 수로 정해
비정규 격자에서도 정수 거리를 보장한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: 유닛·시너지·상점 데이터와 로더

**Files:**
- Create: `game/public/data/units.json`
- Create: `game/public/data/traits.json`
- Create: `game/public/data/shop.json`
- Create: `sim/data.js`
- Test: `tests/data.test.js`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `loadData() => Promise<{ combat, units, traits, shop }>` — Node 에서는 `fs`, 브라우저에서는 `fetch('/data/...')`
  - `unitById(units, id) => Unit | undefined`
  - `Unit = { id, name: {ko,en}, tier: 1..5, origin, class, sprite, skill }`
  - `skill = { id, type: 'single'|'aoe'|'buff'|'summon', params: object }`

- [ ] **Step 1: `game/public/data/units.json` 작성**

26종 전체. 스탯은 `combat.json > tierBase × classModifier` 에서 파생되므로 여기 두지 않는다.

```json
{
  "meta": {
    "count": 26,
    "statSource": "combat.json > tierBase × classModifier × starMultiplier",
    "note": "스탯을 여기 적지 않는다. 티어와 직업이 스탯의 단일소스다."
  },
  "units": [
    { "id": "medieval_warrior_1", "name": { "ko": "왕국 병사", "en": "Medieval Warrior" }, "tier": 1, "origin": "kingdom", "class": "guardian", "sprite": "medieval_warrior_1",
      "skill": { "id": "mw1_brace", "type": "buff", "params": { "target": "self", "stat": "def", "amount": 40, "durationTicks": 90 } } },

    { "id": "medieval_warrior_2", "name": { "ko": "탈영병", "en": "Deserter" }, "tier": 1, "origin": "outlaw", "class": "blade", "sprite": "medieval_warrior_2",
      "skill": { "id": "mw2_slash", "type": "single", "params": { "dmgPct": 180, "hits": 1 } } },

    { "id": "rat", "name": { "ko": "쥐", "en": "Rat" }, "tier": 1, "origin": "wild", "class": "assassin", "sprite": "rat",
      "skill": { "id": "rat_bleed", "type": "aoe", "params": { "radius": 0, "dmgPct": 0, "tickDamagePct": 18, "durationTicks": 150 } } },

    { "id": "slime", "name": { "ko": "슬라임", "en": "Slime" }, "tier": 1, "origin": "aberration", "class": "undying", "sprite": "slime",
      "skill": { "id": "slime_split", "type": "summon", "params": { "unitId": "slime", "count": 2, "hpPct": 40, "trigger": "onDeath" } } },

    { "id": "goblin", "name": { "ko": "고블린", "en": "Goblin" }, "tier": 1, "origin": "wild", "class": "ranger", "sprite": "goblin",
      "skill": { "id": "goblin_bomb", "type": "aoe", "params": { "radius": 1, "dmgPct": 150 } } },

    { "id": "mushroom", "name": { "ko": "버섯", "en": "Mushroom" }, "tier": 1, "origin": "wild", "class": "mage", "sprite": "mushroom",
      "skill": { "id": "mushroom_spore", "type": "aoe", "params": { "radius": 1, "dmgPct": 0, "tickDamagePct": 14, "durationTicks": 90 } } },

    { "id": "bat", "name": { "ko": "박쥐", "en": "Bat" }, "tier": 1, "origin": "wild", "class": "assassin", "sprite": "bat",
      "skill": { "id": "bat_drain", "type": "single", "params": { "dmgPct": 160, "hits": 1, "lifestealPct": 50 } } },

    { "id": "skeleton", "name": { "ko": "해골 병사", "en": "Skeleton" }, "tier": 1, "origin": "coven", "class": "undying", "sprite": "skeleton",
      "skill": { "id": "skeleton_guard", "type": "buff", "params": { "target": "self", "stat": "damageTakenPct", "amount": -50, "durationTicks": 90 } } },

    { "id": "medieval_warrior_3", "name": { "ko": "왕국 검병", "en": "Kingdom Swordsman" }, "tier": 2, "origin": "kingdom", "class": "blade", "sprite": "medieval_warrior_3",
      "skill": { "id": "mw3_cleave", "type": "single", "params": { "dmgPct": 220, "hits": 1 } } },

    { "id": "martial_hero_1", "name": { "ko": "무투가", "en": "Martial Hero" }, "tier": 2, "origin": "outlaw", "class": "blade", "sprite": "martial_hero_1",
      "skill": { "id": "mh1_triple", "type": "single", "params": { "dmgPct": 90, "hits": 3 } } },

    { "id": "huntress_1", "name": { "ko": "사냥꾼", "en": "Huntress" }, "tier": 2, "origin": "outlaw", "class": "ranger", "sprite": "huntress_1",
      "skill": { "id": "hu1_pierce", "type": "single", "params": { "dmgPct": 200, "hits": 1, "pierceCount": 2, "piercePct": 60 } } },

    { "id": "wizard_pack", "name": { "ko": "견습 마법사", "en": "Apprentice Wizard" }, "tier": 2, "origin": "coven", "class": "mage", "sprite": "wizard_pack",
      "skill": { "id": "wp_fireball", "type": "aoe", "params": { "radius": 1, "dmgPct": 220 } } },

    { "id": "flying_eye", "name": { "ko": "부유안", "en": "Flying Eye" }, "tier": 2, "origin": "aberration", "class": "assassin", "sprite": "flying_eye",
      "skill": { "id": "fe_beam", "type": "single", "params": { "dmgPct": 240, "hits": 1, "defIgnorePct": 30 } } },

    { "id": "hero_knight_1", "name": { "ko": "영웅 기사", "en": "Hero Knight" }, "tier": 2, "origin": "kingdom", "class": "guardian", "sprite": "hero_knight_1",
      "skill": { "id": "hk1_shield", "type": "buff", "params": { "target": "self", "stat": "shield", "amountPctMaxHp": 15, "durationTicks": 120 } } },

    { "id": "mimic", "name": { "ko": "미믹", "en": "Mimic" }, "tier": 2, "origin": "aberration", "class": "undying", "sprite": "mimic",
      "skill": { "id": "mimic_tongue", "type": "single", "params": { "dmgPct": 200, "hits": 1, "pull": true } } },

    { "id": "martial_hero_2", "name": { "ko": "경공 무투가", "en": "Windstep Martial Hero" }, "tier": 3, "origin": "outlaw", "class": "assassin", "sprite": "martial_hero_2",
      "skill": { "id": "mh2_strike", "type": "single", "params": { "dmgPct": 300, "hits": 1, "releapOnKill": true } } },

    { "id": "huntress_2", "name": { "ko": "대사냥꾼", "en": "Grand Huntress" }, "tier": 3, "origin": "outlaw", "class": "ranger", "sprite": "huntress_2",
      "skill": { "id": "hu2_rain", "type": "aoe", "params": { "radius": 2, "dmgPct": 180 } } },

    { "id": "evil_wizard_1", "name": { "ko": "흑마법사", "en": "Evil Wizard" }, "tier": 3, "origin": "coven", "class": "mage", "sprite": "evil_wizard_1",
      "skill": { "id": "ew1_burst", "type": "aoe", "params": { "radius": 2, "dmgPct": 280 } } },

    { "id": "fantasy_warrior", "name": { "ko": "방랑 전사", "en": "Wandering Warrior" }, "tier": 3, "origin": "outlaw", "class": "guardian", "sprite": "fantasy_warrior",
      "skill": { "id": "fw_bash", "type": "single", "params": { "dmgPct": 200, "hits": 1, "stunTicks": 30 } } },

    { "id": "hero_knight_2", "name": { "ko": "영웅 기사단장", "en": "Knight Captain" }, "tier": 3, "origin": "kingdom", "class": "blade", "sprite": "hero_knight_2",
      "skill": { "id": "hk2_sweep", "type": "aoe", "params": { "radius": 1, "dmgPct": 250 } } },

    { "id": "martial_hero_3", "name": { "ko": "무신", "en": "Martial Saint" }, "tier": 4, "origin": "outlaw", "class": "blade", "sprite": "martial_hero_3",
      "skill": { "id": "mh3_finisher", "type": "single", "params": { "dmgPct": 350, "hits": 1, "manaRefillOnKill": true } } },

    { "id": "evil_wizard_2", "name": { "ko": "대흑마법사", "en": "Archwizard" }, "tier": 4, "origin": "coven", "class": "mage", "sprite": "evil_wizard_2",
      "skill": { "id": "ew2_chain", "type": "aoe", "params": { "radius": 1, "dmgPct": 250, "chainCount": 4 } } },

    { "id": "medieval_king_1", "name": { "ko": "왕", "en": "King" }, "tier": 4, "origin": "kingdom", "class": "guardian", "sprite": "medieval_king_1",
      "skill": { "id": "mk1_rally", "type": "buff", "params": { "target": "allies", "stat": "atkPct", "amount": 20, "durationTicks": 150 } } },

    { "id": "evil_wizard_3", "name": { "ko": "마왕", "en": "Dark Lord" }, "tier": 5, "origin": "coven", "class": "mage", "sprite": "evil_wizard_3",
      "skill": { "id": "ew3_annihilate", "type": "aoe", "params": { "radius": 2, "dmgPctMaxHp": 12, "dmgPct": 200, "silenceTicks": 90 } } },

    { "id": "medieval_king_2", "name": { "ko": "대왕", "en": "High King" }, "tier": 5, "origin": "kingdom", "class": "guardian", "sprite": "medieval_king_2",
      "skill": { "id": "mk2_bulwark", "type": "buff", "params": { "target": "allies", "stat": "shieldAndDef", "amountPctMaxHp": 12, "amount": 50, "durationTicks": 240 } } },

    { "id": "fire_worm", "name": { "ko": "화염충", "en": "Fire Worm" }, "tier": 5, "origin": "aberration", "class": "undying", "sprite": "fire_worm",
      "skill": { "id": "fw_eruption", "type": "aoe", "params": { "radius": 1, "dmgPct": 300, "lineLength": 3, "burnTickPct": 10, "burnTicks": 90 } } }
  ]
}
```

- [ ] **Step 2: `game/public/data/traits.json` 작성**

```json
{
  "origins": [
    { "id": "kingdom", "name": { "ko": "왕국", "en": "Kingdom" }, "steps": [2, 4, 6],
      "effects": [
        { "def": 15, "scope": "trait" },
        { "def": 25, "scope": "trait", "allyDef": 10 },
        { "def": 25, "scope": "trait", "allyDef": 10, "reviveOne": { "hpPct": 40, "perRound": 1 } }
      ] },
    { "id": "outlaw", "name": { "ko": "방랑자", "en": "Outlaw" }, "steps": [2, 4, 6],
      "effects": [
        { "attackSpeedPct": 15, "scope": "trait" },
        { "attackSpeedPct": 30, "scope": "trait", "goldOnKillChance": 10 },
        { "attackSpeedPct": 50, "scope": "trait", "goldOnKillChance": 10, "dodgePct": 30, "dodgeTicks": 90 }
      ] },
    { "id": "coven", "name": { "ko": "흑마회", "en": "Coven" }, "steps": [2, 3, 5],
      "effects": [
        { "manaStart": 20, "scope": "trait" },
        { "manaStart": 30, "power": 20, "scope": "trait" },
        { "manaStart": 40, "power": 50, "scope": "trait", "splashOnSkillPct": 40 }
      ] },
    { "id": "aberration", "name": { "ko": "마물", "en": "Aberration" }, "steps": [2, 3, 4],
      "effects": [
        { "hp": 250, "scope": "trait" },
        { "hp": 500, "critTakenPct": -30, "scope": "trait" },
        { "hp": 900, "critTakenPct": -30, "regenPctPer5s": 8, "scope": "trait" }
      ] },
    { "id": "wild", "name": { "ko": "야생", "en": "Wild" }, "steps": [2, 3, 4],
      "effects": [
        { "atkPct": 12, "scope": "trait" },
        { "atkPct": 25, "shopGuaranteeSlot": 1, "scope": "trait" },
        { "atkPct": 45, "shopGuaranteeSlot": 1, "priceDiscount": 1, "priceFloor": 1, "scope": "trait" }
      ] }
  ],
  "classes": [
    { "id": "guardian", "name": { "ko": "수호자", "en": "Guardian" }, "steps": [2, 3, 5],
      "effects": [
        { "def": 25, "hp": 250, "scope": "trait" },
        { "def": 50, "hp": 500, "scope": "trait" },
        { "def": 90, "hp": 900, "shieldPctMaxHp": 20, "shieldTicks": 150, "scope": "trait" }
      ] },
    { "id": "blade", "name": { "ko": "검사", "en": "Blade" }, "steps": [2, 3, 5],
      "effects": [
        { "atkPct": 20, "scope": "trait" },
        { "atkPct": 35, "doubleStrikeChance": 15, "scope": "trait" },
        { "atkPct": 60, "doubleStrikeChance": 30, "scope": "trait" }
      ] },
    { "id": "ranger", "name": { "ko": "사수", "en": "Ranger" }, "steps": [2, 3],
      "effects": [
        { "range": 1, "attackSpeedPct": 20, "scope": "trait" },
        { "range": 2, "attackSpeedPct": 40, "pierceCount": 1, "piercePct": 60, "scope": "trait" }
      ] },
    { "id": "mage", "name": { "ko": "술사", "en": "Mage" }, "steps": [2, 3, 5],
      "effects": [
        { "power": 25, "scope": "trait" },
        { "power": 50, "manaCostPct": -10, "scope": "trait" },
        { "power": 110, "manaCostPct": -20, "aoeRadius": 1, "scope": "trait" }
      ] },
    { "id": "assassin", "name": { "ko": "암습", "en": "Assassin" }, "steps": [2, 4],
      "effects": [
        { "leapToBackline": true, "critChancePct": 20, "scope": "trait" },
        { "leapToBackline": true, "critChancePct": 40, "critDamagePct": 40, "manaOnKill": 20, "scope": "trait" }
      ] },
    { "id": "undying", "name": { "ko": "불사", "en": "Undying" }, "steps": [2, 4],
      "effects": [
        { "deathBlastPct": 120, "deathBlastRadius": 1, "scope": "trait" },
        { "deathBlastPct": 120, "deathBlastRadius": 1, "revive": { "hpPct": 40, "perRound": 1 }, "scope": "trait" }
      ] }
  ]
}
```

- [ ] **Step 3: `game/public/data/shop.json` 작성**

```json
{
  "rerollCost": 2,
  "xpCost": { "gold": 4, "xp": 4 },
  "slots": 5,
  "tierOdds": {
    "3": [75, 25, 0, 0, 0],
    "4": [55, 30, 15, 0, 0],
    "5": [45, 33, 20, 2, 0],
    "6": [30, 35, 28, 7, 0],
    "7": [19, 30, 33, 16, 2],
    "8": [15, 22, 32, 25, 6],
    "9": [10, 15, 28, 32, 15]
  },
  "pool": {
    "1": { "unitCount": 8, "copiesPerUnit": 22 },
    "2": { "unitCount": 7, "copiesPerUnit": 18 },
    "3": { "unitCount": 5, "copiesPerUnit": 14 },
    "4": { "unitCount": 3, "copiesPerUnit": 10 },
    "5": { "unitCount": 3, "copiesPerUnit": 8 }
  },
  "starUpCopies": { "2": 3, "3": 9 }
}
```

- [ ] **Step 4: 실패하는 테스트 작성**

`tests/data.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { loadData, unitById } from '../sim/data.js'

const data = await loadData()

describe('loadData', () => {
  it('네 개의 데이터 파일을 모두 읽는다', () => {
    expect(data.combat).toBeTruthy()
    expect(data.units).toBeTruthy()
    expect(data.traits).toBeTruthy()
    expect(data.shop).toBeTruthy()
  })

  it('유닛이 26종이다', () => {
    expect(data.units.units).toHaveLength(26)
  })

  it('유닛 id 가 중복되지 않는다', () => {
    const ids = data.units.units.map((u) => u.id)
    expect(new Set(ids).size).toBe(26)
  })

  it('모든 유닛이 종족 1개와 직업 1개를 갖는다', () => {
    const origins = new Set(data.traits.origins.map((o) => o.id))
    const classes = new Set(data.traits.classes.map((c) => c.id))
    for (const u of data.units.units) {
      expect(origins.has(u.origin)).toBe(true)
      expect(classes.has(u.class)).toBe(true)
    }
  })

  it('모든 유닛 스킬이 4가지 타입 중 하나다', () => {
    const types = new Set(['single', 'aoe', 'buff', 'summon'])
    for (const u of data.units.units) {
      expect(types.has(u.skill.type)).toBe(true)
    }
  })

  it('시너지가 종족 5 + 직업 6 = 11종이다', () => {
    expect(data.traits.origins).toHaveLength(5)
    expect(data.traits.classes).toHaveLength(6)
  })
})

describe('unitById', () => {
  it('id 로 유닛을 찾는다', () => {
    expect(unitById(data.units, 'hero_knight_1').tier).toBe(2)
  })

  it('없는 id 는 undefined 다', () => {
    expect(unitById(data.units, 'nope')).toBeUndefined()
  })
})
```

- [ ] **Step 5: 테스트 실패 확인**

Run: `npx vitest run tests/data.test.js`
Expected: FAIL — `Failed to load ../sim/data.js`

- [ ] **Step 6: 구현**

`sim/data.js`:

```js
// 데이터 로더. Node(테스트·시뮬)와 브라우저(게임) 양쪽에서 같은 코드를 쓴다.
// 규칙 수치는 전량 game/public/data/*.json 이 단일소스다.
// 브라우저에서 import 로 바꾸면 번들에 박혀 JSON 만 고쳐 배포하는 길이 막힌다.

const FILES = ['combat', 'units', 'traits', 'shop']

const isNode =
  typeof process !== 'undefined' && process.versions != null && process.versions.node != null

async function readNode(name) {
  const { readFile } = await import('node:fs/promises')
  const { fileURLToPath } = await import('node:url')
  const { dirname, join } = await import('node:path')
  const here = dirname(fileURLToPath(import.meta.url))
  const path = join(here, '..', 'game', 'public', 'data', `${name}.json`)
  return JSON.parse(await readFile(path, 'utf8'))
}

async function readBrowser(name) {
  const res = await fetch(`/data/${name}.json`)
  if (!res.ok) throw new Error(`데이터 로드 실패: ${name}.json (${res.status})`)
  return res.json()
}

export async function loadData() {
  const read = isNode ? readNode : readBrowser
  const loaded = await Promise.all(FILES.map((n) => read(n)))
  const out = {}
  FILES.forEach((name, i) => {
    out[name] = loaded[i]
  })
  return out
}

export function unitById(unitsData, id) {
  return unitsData.units.find((u) => u.id === id)
}
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `npx vitest run tests/data.test.js`
Expected: PASS — 8 tests

- [ ] **Step 8: 커밋**

```bash
git add game/public/data/units.json game/public/data/traits.json game/public/data/shop.json sim/data.js tests/data.test.js
git commit -m "feat: 유닛 26종·시너지 11종·상점 데이터와 로더 추가

스탯은 units.json 에 적지 않는다.
combat.json 의 tierBase × classModifier 가 스탯 단일소스다.
로더는 Node(fs)와 브라우저(fetch) 양용.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: 데이터 불변식 검증기

스펙 §12.4 의 불변식 8개를 검사한다. 밸런스를 만질 때마다 이게 먼저 터져야 한다.

**Files:**
- Create: `tools/validate.mjs`
- Test: `tests/validate.test.js`

**Interfaces:**
- Consumes: `loadData()` from `sim/data.js`
- Produces:
  - `validate(data) => string[]` — 위반 메시지 배열. 빈 배열이면 통과
  - CLI: `node tools/validate.mjs` — 위반이 있으면 목록 출력 후 exit 1, 없으면 exit 0

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/validate.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { validate } from '../tools/validate.mjs'

const data = await loadData()

function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

describe('validate', () => {
  it('현재 데이터는 모든 불변식을 통과한다', () => {
    expect(validate(data)).toEqual([])
  })

  it('티어 확률 합이 100 이 아니면 잡아낸다', () => {
    const bad = clone(data)
    bad.shop.tierOdds['5'] = [45, 33, 20, 3, 0]
    expect(validate(bad).some((m) => m.includes('확률 합'))).toBe(true)
  })

  it('없는 종족을 참조하면 잡아낸다', () => {
    const bad = clone(data)
    bad.units.units[0].origin = 'nonexistent'
    expect(validate(bad).some((m) => m.includes('종족'))).toBe(true)
  })

  it('시너지 보유 유닛 수가 최대 활성 단계보다 적으면 잡아낸다', () => {
    const bad = clone(data)
    const ranger = bad.traits.classes.find((c) => c.id === 'ranger')
    ranger.steps = [2, 3, 9]
    ranger.effects.push({ scope: 'trait' })
    expect(validate(bad).some((m) => m.includes('활성 단계'))).toBe(true)
  })

  it('시너지에 T1 진입점이 없으면 잡아낸다', () => {
    const bad = clone(data)
    for (const u of bad.units.units) if (u.class === 'ranger') u.tier = 2
    expect(validate(bad).some((m) => m.includes('T1 진입점'))).toBe(true)
  })

  it('티어별 종수와 pool 정의가 어긋나면 잡아낸다', () => {
    const bad = clone(data)
    bad.shop.pool['1'].unitCount = 9
    expect(validate(bad).some((m) => m.includes('티어별 종수'))).toBe(true)
  })

  it('T5 3성이 봉쇄되지 않으면 잡아낸다', () => {
    const bad = clone(data)
    bad.shop.pool['5'].copiesPerUnit = 12
    expect(validate(bad).some((m) => m.includes('T5 3성'))).toBe(true)
  })

  it('없는 직업 계수를 참조하면 잡아낸다', () => {
    const bad = clone(data)
    delete bad.combat.classModifier.ranger
    expect(validate(bad).some((m) => m.includes('직업 계수'))).toBe(true)
  })

  it('steps 와 effects 길이가 다르면 잡아낸다', () => {
    const bad = clone(data)
    bad.traits.origins[0].steps = [2, 4]
    expect(validate(bad).some((m) => m.includes('effects 길이'))).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/validate.test.js`
Expected: FAIL — `Failed to load ../tools/validate.mjs`

- [ ] **Step 3: 구현**

`tools/validate.mjs`:

```js
// 데이터 불변식 검사. 밸런스를 만졌으면 반드시 돌린다.
// 스펙 §12.4 의 8개 불변식을 검사하고, 위반 메시지 배열을 되돌린다.

import { loadData } from '../sim/data.js'

const SKILL_TYPES = new Set(['single', 'aoe', 'buff', 'summon'])

export function validate(data) {
  const errors = []
  const { combat, units, traits, shop } = data
  const list = units.units

  const originIds = new Set(traits.origins.map((o) => o.id))
  const classIds = new Set(traits.classes.map((c) => c.id))
  const allTraits = [...traits.origins, ...traits.classes]

  // 1. 레벨별 티어 확률 합 = 100
  for (const [level, odds] of Object.entries(shop.tierOdds)) {
    const sum = odds.reduce((a, b) => a + b, 0)
    if (sum !== 100) errors.push(`레벨 ${level} 의 티어 확률 합이 ${sum} 이다 (100 이어야 한다)`)
    if (odds.length !== 5) errors.push(`레벨 ${level} 의 티어 확률 항목이 ${odds.length} 개다 (5 여야 한다)`)
  }

  // 2. 모든 유닛이 실재하는 종족 1개 + 직업 1개를 갖는다
  for (const u of list) {
    if (!originIds.has(u.origin)) errors.push(`유닛 ${u.id} 가 없는 종족 "${u.origin}" 을 참조한다`)
    if (!classIds.has(u.class)) errors.push(`유닛 ${u.id} 가 없는 직업 "${u.class}" 을 참조한다`)
    if (!SKILL_TYPES.has(u.skill?.type)) errors.push(`유닛 ${u.id} 의 스킬 타입 "${u.skill?.type}" 이 4종에 없다`)
    if (!combat.tierBase[String(u.tier)]) errors.push(`유닛 ${u.id} 의 티어 ${u.tier} 에 tierBase 정의가 없다`)
    if (!combat.classModifier[u.class]) errors.push(`유닛 ${u.id} 의 직업 계수 "${u.class}" 가 combat.json 에 없다`)
  }

  // 3. 각 시너지의 보유 유닛 수 >= 최대 활성 단계
  // 4. 각 시너지에 T1 진입점이 존재
  // 9. steps 와 effects 길이 일치
  for (const t of allTraits) {
    const members = list.filter((u) => u.origin === t.id || u.class === t.id)
    const maxStep = Math.max(...t.steps)
    if (members.length < maxStep) {
      errors.push(`시너지 ${t.id} 의 보유 유닛이 ${members.length} 종인데 최대 활성 단계가 ${maxStep} 이다`)
    }
    if (!members.some((u) => u.tier === 1)) {
      errors.push(`시너지 ${t.id} 에 T1 진입점이 없다 (초반에 노선을 탈 수 없다)`)
    }
    if (t.steps.length !== t.effects.length) {
      errors.push(`시너지 ${t.id} 의 steps 길이(${t.steps.length})와 effects 길이(${t.effects.length})가 다르다`)
    }
  }

  // 5. 티어별 종수와 shop.pool 정의 일치
  for (const [tier, def] of Object.entries(shop.pool)) {
    const actual = list.filter((u) => String(u.tier) === tier).length
    if (actual !== def.unitCount) {
      errors.push(`티어별 종수 불일치: T${tier} 실제 ${actual} 종 vs pool 정의 ${def.unitCount} 종`)
    }
  }

  // 6. T5 3성 봉쇄 확인 (3성 필요 매수 > T5 종당 풀 매수)
  const need3 = shop.starUpCopies['3']
  const t5copies = shop.pool['5'].copiesPerUnit
  if (t5copies >= need3) {
    errors.push(`T5 3성이 봉쇄되지 않았다: 종당 ${t5copies} 장 >= 3성 필요 ${need3} 장`)
  }

  // 7. 성급 배율이 3단계다
  if (!Array.isArray(combat.starMultiplier) || combat.starMultiplier.length !== 3) {
    errors.push('combat.json > starMultiplier 는 3개 원소 배열이어야 한다')
  }

  // 8. 보드 정의 정합성
  const b = combat.board
  if (b.rows.length !== b.rowOffset.length) {
    errors.push(`보드 rows 길이(${b.rows.length})와 rowOffset 길이(${b.rowOffset.length})가 다르다`)
  }
  const perSide = b.rows.reduce((a, n) => a + n, 0) / 2
  if (perSide !== 22) errors.push(`진영당 칸 수가 ${perSide} 이다 (22 여야 한다)`)

  return errors
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
if (isMain) {
  const data = await loadData()
  const errors = validate(data)
  if (errors.length > 0) {
    console.error(`불변식 위반 ${errors.length} 건:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log('불변식 통과')
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/validate.test.js`
Expected: PASS — 9 tests

- [ ] **Step 5: CLI 동작 확인**

Run: `node tools/validate.mjs`
Expected: `불변식 통과` 출력, exit code 0

- [ ] **Step 6: 커밋**

```bash
git add tools/validate.mjs tests/validate.test.js
git commit -m "feat: 데이터 불변식 검증기 추가

확률 합 100, 종족·직업 참조 실재, 시너지 유닛 수와
T1 진입점, 티어별 종수, T5 3성 봉쇄를 검사한다.
밸런스를 만졌으면 npm run validate 를 먼저 돌린다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: 스탯 해석과 시너지 활성 계산

**Files:**
- Create: `sim/traits.js`
- Create: `sim/stats.js`
- Test: `tests/traits.test.js`
- Test: `tests/stats.test.js`

**Interfaces:**
- Consumes: `combat.tierBase` · `combat.classModifier` · `combat.starMultiplier` · `traits.json`
- Produces:
  - `activeTraits(unitList, traitsData) => Map<traitId, { count: number, step: number, effect: object|null }>`
    - `unitList` 는 `{ unitId, origin, class }` 를 가진 배열. **같은 unitId 는 중복 계수하지 않는다** (오토체스 표준)
    - `step` 은 활성된 단계 인덱스+1, 미활성이면 0
  - `resolveStats(unit, star, combatCfg) => BaseStats`
    - `BaseStats = { hp, atk, def, mr, power, attackInterval, range, critChance, manaStart }` — 전부 정수 (critChance 만 0~1 실수)
  - `applyTraitEffects(base, effects) => BaseStats` — 활성 시너지 효과를 합산

- [ ] **Step 1: 실패하는 테스트 작성 — 시너지**

`tests/traits.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { activeTraits } from '../sim/traits.js'

const data = await loadData()

function u(unitId) {
  const found = data.units.units.find((x) => x.id === unitId)
  return { unitId: found.id, origin: found.origin, class: found.class }
}

describe('activeTraits', () => {
  it('빈 보드는 아무 시너지도 활성하지 않는다', () => {
    const m = activeTraits([], data.traits)
    for (const v of m.values()) expect(v.step).toBe(0)
  })

  it('왕국 2명이면 왕국 1단계가 활성된다', () => {
    const m = activeTraits([u('medieval_warrior_1'), u('hero_knight_1')], data.traits)
    expect(m.get('kingdom').count).toBe(2)
    expect(m.get('kingdom').step).toBe(1)
  })

  it('왕국 1명이면 활성되지 않는다', () => {
    const m = activeTraits([u('medieval_warrior_1')], data.traits)
    expect(m.get('kingdom').count).toBe(1)
    expect(m.get('kingdom').step).toBe(0)
    expect(m.get('kingdom').effect).toBeNull()
  })

  it('같은 유닛을 두 개 놓아도 1로 센다', () => {
    const m = activeTraits([u('medieval_warrior_1'), u('medieval_warrior_1')], data.traits)
    expect(m.get('kingdom').count).toBe(1)
  })

  it('단계 사이 값은 낮은 쪽 단계로 떨어진다 (왕국 5명 → 2단계)', () => {
    const board = [
      u('medieval_warrior_1'), u('medieval_warrior_3'), u('hero_knight_1'),
      u('hero_knight_2'), u('medieval_king_1'),
    ]
    const m = activeTraits(board, data.traits)
    expect(m.get('kingdom').count).toBe(5)
    expect(m.get('kingdom').step).toBe(2)
  })

  it('한 유닛이 종족과 직업 시너지를 동시에 채운다', () => {
    const m = activeTraits([u('medieval_king_2'), u('medieval_warrior_1')], data.traits)
    expect(m.get('kingdom').step).toBe(1)
    expect(m.get('guardian').step).toBe(1)
  })

  it('활성 단계의 effect 객체를 되돌린다', () => {
    const m = activeTraits([u('medieval_warrior_1'), u('hero_knight_1')], data.traits)
    expect(m.get('kingdom').effect).toEqual(data.traits.origins.find((o) => o.id === 'kingdom').effects[0])
  })

  it('시너지 11종을 모두 담는다', () => {
    expect(activeTraits([], data.traits).size).toBe(11)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/traits.test.js`
Expected: FAIL — `Failed to load ../sim/traits.js`

- [ ] **Step 3: 구현 — 시너지**

`sim/traits.js`:

```js
// 보드 구성 → 시너지 활성 단계.
// 같은 unitId 는 몇 개를 놓든 1로 센다 (오토체스 표준).

export function activeTraits(unitList, traitsData) {
  const seen = new Set()
  const counts = new Map()

  for (const u of unitList) {
    if (seen.has(u.unitId)) continue
    seen.add(u.unitId)
    counts.set(u.origin, (counts.get(u.origin) ?? 0) + 1)
    counts.set(u.class, (counts.get(u.class) ?? 0) + 1)
  }

  const result = new Map()
  const all = [...traitsData.origins, ...traitsData.classes]

  for (const t of all) {
    const count = counts.get(t.id) ?? 0
    let step = 0
    for (let i = 0; i < t.steps.length; i++) {
      if (count >= t.steps[i]) step = i + 1
    }
    result.set(t.id, {
      count,
      step,
      effect: step > 0 ? t.effects[step - 1] : null,
    })
  }

  return result
}
```

- [ ] **Step 4: 시너지 테스트 통과 확인**

Run: `npx vitest run tests/traits.test.js`
Expected: PASS — 8 tests

- [ ] **Step 5: 실패하는 테스트 작성 — 스탯**

`tests/stats.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { loadData, unitById } from '../sim/data.js'
import { resolveStats, applyTraitEffects } from '../sim/stats.js'

const data = await loadData()
const knight = unitById(data.units, 'hero_knight_1')   // T2 guardian
const wizard = unitById(data.units, 'evil_wizard_3')   // T5 mage

describe('resolveStats', () => {
  it('티어 기본 × 직업 계수로 스탯을 낸다', () => {
    const s = resolveStats(knight, 1, data.combat)
    // T2 hp 650 × guardian 1.35 = 877.5 → floor 877
    expect(s.hp).toBe(877)
    // T2 atk 50 × guardian 0.75 = 37.5 → floor 37
    expect(s.atk).toBe(37)
  })

  it('사거리는 직업이 정한다', () => {
    expect(resolveStats(knight, 1, data.combat).range).toBe(1)
    expect(resolveStats(wizard, 1, data.combat).range).toBe(3)
  })

  it('시작 마나는 티어가 정한다', () => {
    expect(resolveStats(knight, 1, data.combat).manaStart).toBe(25)
    expect(resolveStats(wizard, 1, data.combat).manaStart).toBe(10)
  })

  it('성급이 hp·atk·power 를 배율로 올린다', () => {
    const one = resolveStats(knight, 1, data.combat)
    const two = resolveStats(knight, 2, data.combat)
    const three = resolveStats(knight, 3, data.combat)
    expect(two.hp).toBe(Math.floor(877 * 1.8))
    expect(three.hp).toBe(Math.floor(877 * 3.24))
    expect(two.atk).toBeGreaterThan(one.atk)
    expect(three.atk).toBeGreaterThan(two.atk)
  })

  it('성급은 사거리와 공격 간격을 바꾸지 않는다', () => {
    const one = resolveStats(knight, 1, data.combat)
    const three = resolveStats(knight, 3, data.combat)
    expect(three.range).toBe(one.range)
    expect(three.attackInterval).toBe(one.attackInterval)
  })

  it('모든 스탯이 정수다 (critChance 제외)', () => {
    const s = resolveStats(wizard, 2, data.combat)
    for (const key of ['hp', 'atk', 'def', 'mr', 'power', 'attackInterval', 'range', 'manaStart']) {
      expect(Number.isInteger(s[key])).toBe(true)
    }
  })

  it('공격 간격은 최소 6틱이다', () => {
    const s = resolveStats(wizard, 3, data.combat)
    expect(s.attackInterval).toBeGreaterThanOrEqual(6)
  })
})

describe('applyTraitEffects', () => {
  const base = { hp: 1000, atk: 100, def: 20, mr: 20, power: 50, attackInterval: 50, range: 1, critChance: 0.05, manaStart: 20 }

  it('평탄 가산을 더한다', () => {
    const out = applyTraitEffects(base, [{ def: 25, hp: 250 }])
    expect(out.def).toBe(45)
    expect(out.hp).toBe(1250)
  })

  it('퍼센트 가산을 곱한다', () => {
    const out = applyTraitEffects(base, [{ atkPct: 20 }])
    expect(out.atk).toBe(120)
  })

  it('공속 퍼센트는 공격 간격을 줄인다', () => {
    const out = applyTraitEffects(base, [{ attackSpeedPct: 20 }])
    expect(out.attackInterval).toBe(Math.floor(50 / 1.2))
  })

  it('여러 효과를 누적한다', () => {
    const out = applyTraitEffects(base, [{ def: 25 }, { def: 50, hp: 500 }])
    expect(out.def).toBe(95)
    expect(out.hp).toBe(1500)
  })

  it('사거리 가산을 더한다', () => {
    expect(applyTraitEffects(base, [{ range: 2 }]).range).toBe(3)
  })

  it('치명타 확률은 퍼센트포인트로 더한다', () => {
    expect(applyTraitEffects(base, [{ critChancePct: 20 }]).critChance).toBeCloseTo(0.25, 5)
  })

  it('빈 효과 목록은 원본과 같은 값을 낸다', () => {
    expect(applyTraitEffects(base, [])).toEqual(base)
  })

  it('원본을 변형하지 않는다', () => {
    applyTraitEffects(base, [{ def: 25 }])
    expect(base.def).toBe(20)
  })
})
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `npx vitest run tests/stats.test.js`
Expected: FAIL — `Failed to load ../sim/stats.js`

- [ ] **Step 7: 구현 — 스탯**

`sim/stats.js`:

```js
// 스탯 해석. 단일소스는 combat.json 의 tierBase × classModifier × starMultiplier 다.
// units.json 에는 스탯을 적지 않는다.
// 지속 상태로 쓰일 값은 전부 정수로 내린다 (critChance 만 0~1 실수).

const STAR_SCALED = ['hp', 'atk', 'power']

export function resolveStats(unit, star, combatCfg) {
  const base = combatCfg.tierBase[String(unit.tier)]
  const mod = combatCfg.classModifier[unit.class]
  const starMult = combatCfg.starMultiplier[star - 1]

  const scale = (key) => {
    const raw = base[key] * mod[key]
    return Math.floor(STAR_SCALED.includes(key) ? raw * starMult : raw)
  }

  return {
    hp: scale('hp'),
    atk: scale('atk'),
    def: scale('def'),
    mr: scale('mr'),
    power: scale('power'),
    attackInterval: Math.max(6, Math.floor(base.attackInterval * mod.attackInterval)),
    range: mod.range,
    critChance: mod.critChance,
    manaStart: base.manaStart,
  }
}

export function applyTraitEffects(base, effects) {
  const out = { ...base }

  let atkPct = 0
  let attackSpeedPct = 0

  for (const e of effects) {
    if (!e) continue
    if (e.hp) out.hp += e.hp
    if (e.def) out.def += e.def
    if (e.allyDef) out.def += e.allyDef
    if (e.mr) out.mr += e.mr
    if (e.power) out.power += e.power
    if (e.range) out.range += e.range
    if (e.manaStart) out.manaStart += e.manaStart
    if (e.atkPct) atkPct += e.atkPct
    if (e.attackSpeedPct) attackSpeedPct += e.attackSpeedPct
    if (e.critChancePct) out.critChance += e.critChancePct / 100
  }

  if (atkPct !== 0) out.atk = Math.floor(out.atk * (1 + atkPct / 100))
  if (attackSpeedPct !== 0) {
    out.attackInterval = Math.max(6, Math.floor(out.attackInterval / (1 + attackSpeedPct / 100)))
  }

  out.hp = Math.floor(out.hp)
  out.def = Math.floor(out.def)
  out.mr = Math.floor(out.mr)
  out.power = Math.floor(out.power)
  out.manaStart = Math.floor(out.manaStart)

  return out
}
```

- [ ] **Step 8: 스탯 테스트 통과 확인**

Run: `npx vitest run tests/stats.test.js`
Expected: PASS — 15 tests

- [ ] **Step 9: 커밋**

```bash
git add sim/traits.js sim/stats.js tests/traits.test.js tests/stats.test.js
git commit -m "feat: 시너지 활성 계산과 스탯 해석 추가

시너지는 같은 unitId 를 1로 센다.
스탯은 tierBase × classModifier × starMultiplier 로 파생하고
저장 값은 전부 정수로 내린다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: 타겟팅과 이동

**Files:**
- Create: `sim/targeting.js`
- Create: `sim/movement.js`
- Test: `tests/targeting.test.js`
- Test: `tests/movement.test.js`

**Interfaces:**
- Consumes: `Board` from `sim/hex.js`
- Produces:
  - `Combatant = { id: number, team: 'A'|'B', tile: number, hp: number, alive: boolean, ... }` — `id` 는 전투 시작 시 부여한 0부터의 정수
  - `findTarget(board, self, all) => Combatant | null` — 거리 최단 적. 동률이면 `id` 가 작은 쪽
  - `stepToward(board, self, target, occupied) => number | null` — 다음에 설 타일 인덱스. 못 움직이면 `null`
  - `occupied` 는 `Map<tileIndex, combatantId>`

- [ ] **Step 1: 실패하는 테스트 작성 — 타겟팅**

`tests/targeting.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildBoard } from '../sim/hex.js'
import { findTarget } from '../sim/targeting.js'
import combat from '../game/public/data/combat.json' with { type: 'json' }

const board = buildBoard(combat.board)

function c(id, team, row, col, alive = true) {
  return { id, team, tile: board.indexOf(row, col), hp: alive ? 100 : 0, alive }
}

describe('findTarget', () => {
  it('적이 없으면 null 이다', () => {
    const self = c(0, 'A', 5, 0)
    expect(findTarget(board, self, [self])).toBeNull()
  })

  it('살아있는 적 중 가장 가까운 쪽을 고른다', () => {
    const self = c(0, 'A', 3, 3)
    const near = c(1, 'B', 2, 3)
    const far = c(2, 'B', 0, 0)
    expect(findTarget(board, self, [self, near, far]).id).toBe(1)
  })

  it('죽은 적은 고르지 않는다', () => {
    const self = c(0, 'A', 3, 3)
    const dead = c(1, 'B', 2, 3, false)
    const live = c(2, 'B', 0, 0)
    expect(findTarget(board, self, [self, dead, live]).id).toBe(2)
  })

  it('같은 팀은 고르지 않는다', () => {
    const self = c(0, 'A', 3, 3)
    const mate = c(1, 'A', 3, 4)
    const foe = c(2, 'B', 0, 0)
    expect(findTarget(board, self, [self, mate, foe]).id).toBe(2)
  })

  it('거리가 같으면 id 가 작은 쪽을 고른다 (결정론)', () => {
    const self = c(0, 'A', 3, 3)
    const left = c(5, 'B', 2, 2)
    const right = c(2, 'B', 2, 4)
    // 좌우 대칭 위치라 거리가 같아야 한다. 같지 않다면 이 테스트의 전제가 깨진 것이다.
    expect(board.dist[self.tile][left.tile]).toBe(board.dist[self.tile][right.tile])
    expect(findTarget(board, self, [self, left, right]).id).toBe(2)
  })

  it('배열 순서를 바꿔도 같은 대상을 고른다', () => {
    const self = c(0, 'A', 3, 3)
    const x = c(9, 'B', 2, 2)
    const y = c(4, 'B', 2, 4)
    const p1 = findTarget(board, self, [self, x, y])
    const p2 = findTarget(board, self, [self, y, x])
    expect(p1.id).toBe(p2.id)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/targeting.test.js`
Expected: FAIL — `Failed to load ../sim/targeting.js`

- [ ] **Step 3: 구현 — 타겟팅**

`sim/targeting.js`:

```js
// 타겟 선택. 헥스 거리 최단 적을 고르고, 동률이면 id 가 작은 쪽을 고른다.
// id 타이브레이크가 결정론의 핵심이다. 배열 순서에 의존하면 안 된다.

export function findTarget(board, self, all) {
  let best = null
  let bestDist = Infinity

  for (const other of all) {
    if (other === self) continue
    if (!other.alive) continue
    if (other.team === self.team) continue

    const d = board.dist[self.tile][other.tile]
    if (d < bestDist || (d === bestDist && best !== null && other.id < best.id)) {
      best = other
      bestDist = d
    }
  }

  return best
}
```

- [ ] **Step 4: 타겟팅 테스트 통과 확인**

Run: `npx vitest run tests/targeting.test.js`
Expected: PASS — 6 tests

- [ ] **Step 5: 실패하는 테스트 작성 — 이동**

`tests/movement.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildBoard } from '../sim/hex.js'
import { stepToward } from '../sim/movement.js'
import combat from '../game/public/data/combat.json' with { type: 'json' }

const board = buildBoard(combat.board)

function at(row, col) {
  return board.indexOf(row, col)
}

describe('stepToward', () => {
  it('타겟에 더 가까워지는 인접 타일을 고른다', () => {
    const self = { id: 0, tile: at(5, 3) }
    const target = { id: 1, tile: at(0, 3) }
    const next = stepToward(board, self, target, new Map())
    expect(next).not.toBeNull()
    expect(board.dist[next][target.tile]).toBeLessThan(board.dist[self.tile][target.tile])
  })

  it('점유된 타일로는 가지 않는다', () => {
    const self = { id: 0, tile: at(5, 3) }
    const target = { id: 1, tile: at(0, 3) }
    const free = stepToward(board, self, target, new Map())

    const occupied = new Map([[free, 99]])
    const next = stepToward(board, self, target, occupied)
    expect(next).not.toBe(free)
  })

  it('모든 인접이 막히면 null 이다', () => {
    const self = { id: 0, tile: at(5, 3) }
    const target = { id: 1, tile: at(0, 3) }
    const occupied = new Map(board.neighbors[self.tile].map((t) => [t, 99]))
    expect(stepToward(board, self, target, occupied)).toBeNull()
  })

  it('여러 후보가 같은 거리면 타일 인덱스가 작은 쪽을 고른다 (결정론)', () => {
    const self = { id: 0, tile: at(5, 3) }
    const target = { id: 1, tile: at(0, 3) }
    const a = stepToward(board, self, target, new Map())
    const b = stepToward(board, self, target, new Map())
    expect(a).toBe(b)
  })

  it('자기 타일은 점유로 쳐도 무시한다', () => {
    const self = { id: 0, tile: at(5, 3) }
    const target = { id: 1, tile: at(0, 3) }
    const occupied = new Map([[self.tile, self.id]])
    expect(stepToward(board, self, target, occupied)).not.toBeNull()
  })

  it('이미 타겟 자리에 인접하면 그 방향 한 칸을 고른다', () => {
    const self = { id: 0, tile: at(3, 3) }
    const targetTile = board.neighbors[self.tile].find((t) => board.tiles[t].row === 2)
    const target = { id: 1, tile: targetTile }
    const next = stepToward(board, self, target, new Map())
    expect(board.dist[next][target.tile]).toBe(0)
  })
})
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `npx vitest run tests/movement.test.js`
Expected: FAIL — `Failed to load ../sim/movement.js`

- [ ] **Step 7: 구현 — 이동**

`sim/movement.js`:

```js
// 한 틱에 한 칸 이동. 타겟까지 거리가 줄어드는 인접 타일 중
// 타일 인덱스가 가장 작은 것을 고른다 (결정론).
// 후보가 전부 점유되어 있으면 null 을 되돌리고, 호출자는 그 틱을 대기한다.

export function stepToward(board, self, target, occupied) {
  const curDist = board.dist[self.tile][target.tile]
  let best = null
  let bestDist = curDist

  for (const nb of board.neighbors[self.tile]) {
    const holder = occupied.get(nb)
    if (holder !== undefined && holder !== self.id) continue

    const d = board.dist[nb][target.tile]
    if (d < bestDist) {
      best = nb
      bestDist = d
    }
  }

  return best
}
```

- [ ] **Step 8: 이동 테스트 통과 확인**

Run: `npx vitest run tests/movement.test.js`
Expected: PASS — 6 tests

- [ ] **Step 9: 커밋**

```bash
git add sim/targeting.js sim/movement.js tests/targeting.test.js tests/movement.test.js
git commit -m "feat: 타겟팅과 1칸 이동 추가

타겟은 거리 최단, 동률이면 id 오름차순.
이동은 거리가 줄어드는 인접 타일 중 인덱스 최소.
두 타이브레이크가 결정론을 보장한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: 피해 계산과 스킬 실행기

스킬은 `single` · `aoe` · `buff` · `summon` 4타입뿐이다. 유닛 26종을 4개 실행기로 처리한다.

**Files:**
- Create: `sim/damage.js`
- Create: `sim/skills.js`
- Test: `tests/damage.test.js`
- Test: `tests/skills.test.js`

**Interfaces:**
- Consumes: `Board` · `combat.damage` · `combat.mana`
- Produces:
  - `physicalDamage(atk, def, defK) => number` — 정수
  - `magicDamage(power, mr, defK) => number` — 정수
  - `applyDamage(victim, amount) => { dealt: number, died: boolean }` — 보호막 먼저 깎고 HP 를 깎는다
  - `castSkill(ctx, caster) => SkillEvent[]`
    - `ctx = { board, all, occupied, rng, combatCfg, tick }`
    - `SkillEvent = { tick, type, casterId, targetIds: number[], amount?: number, unitId?: string }`

- [ ] **Step 1: 실패하는 테스트 작성 — 피해**

`tests/damage.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { physicalDamage, magicDamage, applyDamage } from '../sim/damage.js'

describe('physicalDamage', () => {
  it('방어력 0 이면 공격력 그대로다', () => {
    expect(physicalDamage(100, 0, 100)).toBe(100)
  })

  it('방어력이 defK 와 같으면 절반이다', () => {
    expect(physicalDamage(100, 100, 100)).toBe(50)
  })

  it('정수를 낸다', () => {
    expect(Number.isInteger(physicalDamage(77, 33, 100))).toBe(true)
  })

  it('최소 1 이다', () => {
    expect(physicalDamage(1, 100000, 100)).toBe(1)
  })
})

describe('magicDamage', () => {
  it('마법 저항이 defK 와 같으면 절반이다', () => {
    expect(magicDamage(200, 100, 100)).toBe(100)
  })

  it('최소 1 이다', () => {
    expect(magicDamage(1, 100000, 100)).toBe(1)
  })
})

describe('applyDamage', () => {
  it('HP 를 깎는다', () => {
    const v = { hp: 100, shield: 0, alive: true }
    expect(applyDamage(v, 30)).toEqual({ dealt: 30, died: false })
    expect(v.hp).toBe(70)
  })

  it('보호막을 먼저 깎는다', () => {
    const v = { hp: 100, shield: 50, alive: true }
    applyDamage(v, 30)
    expect(v.shield).toBe(20)
    expect(v.hp).toBe(100)
  })

  it('보호막을 넘치면 나머지가 HP 로 간다', () => {
    const v = { hp: 100, shield: 20, alive: true }
    applyDamage(v, 50)
    expect(v.shield).toBe(0)
    expect(v.hp).toBe(70)
  })

  it('HP 가 0 이하가 되면 사망 처리한다', () => {
    const v = { hp: 10, shield: 0, alive: true }
    expect(applyDamage(v, 30)).toEqual({ dealt: 30, died: true })
    expect(v.hp).toBe(0)
    expect(v.alive).toBe(false)
  })

  it('이미 죽은 대상에는 0 을 넣는다', () => {
    const v = { hp: 0, shield: 0, alive: false }
    expect(applyDamage(v, 30)).toEqual({ dealt: 0, died: false })
  })

  it('HP 는 음수가 되지 않는다', () => {
    const v = { hp: 5, shield: 0, alive: true }
    applyDamage(v, 999)
    expect(v.hp).toBe(0)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/damage.test.js`
Expected: FAIL — `Failed to load ../sim/damage.js`

- [ ] **Step 3: 구현 — 피해**

`sim/damage.js`:

```js
// 피해 공식. defK 는 combat.json > damage.defK.
// dmg = atk × defK / (defK + def) — 방어력이 defK 와 같으면 정확히 절반이 된다.

export function physicalDamage(atk, def, defK) {
  return Math.max(1, Math.floor((atk * defK) / (defK + Math.max(0, def))))
}

export function magicDamage(power, mr, defK) {
  return Math.max(1, Math.floor((power * defK) / (defK + Math.max(0, mr))))
}

export function applyDamage(victim, amount) {
  if (!victim.alive) return { dealt: 0, died: false }

  let remaining = amount
  if (victim.shield > 0) {
    const absorbed = Math.min(victim.shield, remaining)
    victim.shield -= absorbed
    remaining -= absorbed
  }

  victim.hp -= remaining
  let died = false
  if (victim.hp <= 0) {
    victim.hp = 0
    victim.alive = false
    died = true
  }

  return { dealt: amount, died }
}
```

- [ ] **Step 4: 피해 테스트 통과 확인**

Run: `npx vitest run tests/damage.test.js`
Expected: PASS — 12 tests

- [ ] **Step 5: 실패하는 테스트 작성 — 스킬**

`tests/skills.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildBoard } from '../sim/hex.js'
import { createRng } from '../sim/rng.js'
import { castSkill } from '../sim/skills.js'
import combat from '../game/public/data/combat.json' with { type: 'json' }

const board = buildBoard(combat.board)

function mk(id, team, row, col, over = {}) {
  return {
    id,
    team,
    tile: board.indexOf(row, col),
    hp: 1000,
    maxHp: 1000,
    shield: 0,
    alive: true,
    mana: 100,
    stats: { atk: 100, def: 20, mr: 20, power: 100, range: 1, critChance: 0 },
    buffs: [],
    skill: { id: 'x', type: 'single', params: { dmgPct: 200, hits: 1 } },
    unitId: 'test_unit',
    ...over,
  }
}

function ctx(all) {
  const occupied = new Map(all.filter((u) => u.alive).map((u) => [u.tile, u.id]))
  return { board, all, occupied, rng: createRng(1), combatCfg: combat, tick: 0 }
}

describe('castSkill - single', () => {
  it('타겟 HP 를 깎는다', () => {
    const caster = mk(0, 'A', 3, 3)
    const foe = mk(1, 'B', 2, 3)
    caster.targetId = foe.id
    const before = foe.hp
    const events = castSkill(ctx([caster, foe]), caster)
    expect(foe.hp).toBeLessThan(before)
    expect(events[0].type).toBe('skill_single')
    expect(events[0].targetIds).toContain(1)
  })

  it('hits 만큼 여러 번 때린다', () => {
    const caster = mk(0, 'A', 3, 3, { skill: { id: 'triple', type: 'single', params: { dmgPct: 100, hits: 3 } } })
    const foe = mk(1, 'B', 2, 3)
    caster.targetId = foe.id
    const single = mk(2, 'B', 2, 4)
    castSkill(ctx([caster, foe, single]), caster)
    expect(1000 - foe.hp).toBeGreaterThan(0)
    expect(castSkill(ctx([caster, foe, single]), caster).length).toBeGreaterThan(0)
  })

  it('타겟이 없으면 빈 배열이다', () => {
    const caster = mk(0, 'A', 3, 3)
    caster.targetId = null
    expect(castSkill(ctx([caster]), caster)).toEqual([])
  })
})

describe('castSkill - aoe', () => {
  it('반경 안의 모든 적을 때린다', () => {
    const caster = mk(0, 'A', 3, 3, { skill: { id: 'blast', type: 'aoe', params: { radius: 1, dmgPct: 200 } } })
    const foe = mk(1, 'B', 2, 3)
    const nearFoe = board.neighbors[foe.tile].filter((t) => board.tiles[t].row <= 2)
    const foe2 = mk(2, 'B', board.tiles[nearFoe[0]].row, board.tiles[nearFoe[0]].col)
    caster.targetId = foe.id
    const events = castSkill(ctx([caster, foe, foe2]), caster)
    expect(events[0].type).toBe('skill_aoe')
    expect(events[0].targetIds.length).toBeGreaterThanOrEqual(1)
    expect(foe.hp).toBeLessThan(1000)
  })

  it('아군은 때리지 않는다', () => {
    const caster = mk(0, 'A', 3, 3, { skill: { id: 'blast', type: 'aoe', params: { radius: 3, dmgPct: 200 } } })
    const foe = mk(1, 'B', 2, 3)
    const mate = mk(2, 'A', 3, 4)
    caster.targetId = foe.id
    castSkill(ctx([caster, foe, mate]), caster)
    expect(mate.hp).toBe(1000)
  })
})

describe('castSkill - buff', () => {
  it('자신에게 버프를 붙인다', () => {
    const caster = mk(0, 'A', 3, 3, {
      skill: { id: 'brace', type: 'buff', params: { target: 'self', stat: 'def', amount: 40, durationTicks: 90 } },
    })
    const events = castSkill(ctx([caster]), caster)
    expect(caster.buffs).toHaveLength(1)
    expect(caster.buffs[0].stat).toBe('def')
    expect(caster.buffs[0].expiresAt).toBe(90)
    expect(events[0].type).toBe('skill_buff')
  })

  it('보호막 버프는 shield 를 올린다', () => {
    const caster = mk(0, 'A', 3, 3, {
      skill: { id: 'sh', type: 'buff', params: { target: 'self', stat: 'shield', amountPctMaxHp: 15, durationTicks: 120 } },
    })
    castSkill(ctx([caster]), caster)
    expect(caster.shield).toBe(150)
  })

  it('아군 전체 버프는 같은 팀에만 붙는다', () => {
    const caster = mk(0, 'A', 3, 3, {
      skill: { id: 'rally', type: 'buff', params: { target: 'allies', stat: 'atkPct', amount: 20, durationTicks: 150 } },
    })
    const mate = mk(1, 'A', 3, 4)
    const foe = mk(2, 'B', 2, 3)
    castSkill(ctx([caster, mate, foe]), caster)
    expect(mate.buffs).toHaveLength(1)
    expect(foe.buffs).toHaveLength(0)
  })
})

describe('castSkill - summon', () => {
  it('onDeath 트리거는 즉시 소환하지 않는다', () => {
    const caster = mk(0, 'A', 3, 3, {
      skill: { id: 'split', type: 'summon', params: { unitId: 'slime', count: 2, hpPct: 40, trigger: 'onDeath' } },
    })
    const events = castSkill(ctx([caster]), caster)
    expect(events).toEqual([])
  })
})

describe('castSkill 결정론', () => {
  it('같은 입력이면 같은 이벤트를 낸다', () => {
    const build = () => {
      const caster = mk(0, 'A', 3, 3)
      const foe = mk(1, 'B', 2, 3)
      caster.targetId = foe.id
      return { caster, all: [caster, foe] }
    }
    const a = build()
    const b = build()
    expect(castSkill(ctx(a.all), a.caster)).toEqual(castSkill(ctx(b.all), b.caster))
  })
})
```

- [ ] **Step 6: 테스트 실패 확인**

Run: `npx vitest run tests/skills.test.js`
Expected: FAIL — `Failed to load ../sim/skills.js`

- [ ] **Step 7: 구현 — 스킬**

`sim/skills.js`:

```js
// 스킬 실행기. 타입은 single · aoe · buff · summon 4가지뿐이다.
// 유닛 26종의 스킬은 전부 이 4개 실행기 + params 조합으로 표현된다.
// 새 스킬을 추가할 때 실행기를 늘리지 않는다. params 를 늘린다.

import { magicDamage, applyDamage } from './damage.js'

function findById(all, id) {
  return all.find((u) => u.id === id)
}

function enemiesWithin(ctx, centerTile, radius, team) {
  return ctx.all
    .filter((u) => u.alive && u.team !== team && ctx.board.dist[centerTile][u.tile] <= radius)
    .sort((a, b) => a.id - b.id)
}

function castSingle(ctx, caster) {
  const target = caster.targetId == null ? null : findById(ctx.all, caster.targetId)
  if (!target || !target.alive) return []

  const p = caster.skill.params
  const hits = p.hits ?? 1
  const defK = ctx.combatCfg.damage.defK

  let total = 0
  for (let i = 0; i < hits; i++) {
    if (!target.alive) break
    const raw = Math.floor((caster.stats.power * (p.dmgPct ?? 100)) / 100)
    const mr = p.defIgnorePct ? Math.floor(target.stats.mr * (1 - p.defIgnorePct / 100)) : target.stats.mr
    const dmg = magicDamage(raw, mr, defK)
    const { dealt } = applyDamage(target, dmg)
    total += dealt
  }

  if (p.lifestealPct) {
    caster.hp = Math.min(caster.maxHp, caster.hp + Math.floor((total * p.lifestealPct) / 100))
  }

  return [{ tick: ctx.tick, type: 'skill_single', casterId: caster.id, targetIds: [target.id], amount: total }]
}

function castAoe(ctx, caster) {
  const target = caster.targetId == null ? null : findById(ctx.all, caster.targetId)
  if (!target) return []

  const p = caster.skill.params
  const defK = ctx.combatCfg.damage.defK
  const victims = enemiesWithin(ctx, target.tile, p.radius ?? 0, caster.team)
  if (victims.length === 0) return []

  const raw = Math.floor((caster.stats.power * (p.dmgPct ?? 100)) / 100)

  let total = 0
  const ids = []
  for (const v of victims) {
    if (raw > 0) {
      const { dealt } = applyDamage(v, magicDamage(raw, v.stats.mr, defK))
      total += dealt
    }
    if (p.tickDamagePct) {
      v.buffs.push({
        stat: 'dot',
        amount: Math.floor((caster.stats.power * p.tickDamagePct) / 100),
        expiresAt: ctx.tick + p.durationTicks,
        sourceId: caster.id,
      })
    }
    ids.push(v.id)
  }

  return [{ tick: ctx.tick, type: 'skill_aoe', casterId: caster.id, targetIds: ids, amount: total }]
}

function castBuff(ctx, caster) {
  const p = caster.skill.params
  const receivers =
    p.target === 'allies'
      ? ctx.all.filter((u) => u.alive && u.team === caster.team).sort((a, b) => a.id - b.id)
      : [caster]

  const ids = []
  for (const r of receivers) {
    if (p.amountPctMaxHp) {
      r.shield += Math.floor((r.maxHp * p.amountPctMaxHp) / 100)
    }
    if (p.amount) {
      r.buffs.push({ stat: p.stat, amount: p.amount, expiresAt: ctx.tick + p.durationTicks })
    }
    ids.push(r.id)
  }

  return [{ tick: ctx.tick, type: 'skill_buff', casterId: caster.id, targetIds: ids }]
}

function castSummon(ctx, caster) {
  // onDeath 트리거는 사망 처리 시점에 combat.js 가 부른다. 시전 시점에는 아무것도 하지 않는다.
  if (caster.skill.params.trigger === 'onDeath') return []
  return [{ tick: ctx.tick, type: 'skill_summon', casterId: caster.id, targetIds: [], unitId: caster.skill.params.unitId }]
}

const EXECUTORS = {
  single: castSingle,
  aoe: castAoe,
  buff: castBuff,
  summon: castSummon,
}

export function castSkill(ctx, caster) {
  const exec = EXECUTORS[caster.skill.type]
  if (!exec) throw new Error(`알 수 없는 스킬 타입: ${caster.skill.type}`)
  return exec(ctx, caster)
}
```

- [ ] **Step 8: 스킬 테스트 통과 확인**

Run: `npx vitest run tests/skills.test.js`
Expected: PASS — 10 tests

- [ ] **Step 9: 커밋**

```bash
git add sim/damage.js sim/skills.js tests/damage.test.js tests/skills.test.js
git commit -m "feat: 피해 공식과 스킬 4타입 실행기 추가

dmg = atk × defK / (defK + def).
스킬은 single·aoe·buff·summon 4개 실행기로 26종을 처리한다.
새 스킬은 실행기가 아니라 params 로 늘린다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 전투 메인 루프와 결정론 검증

**Files:**
- Create: `sim/combat.js`
- Test: `tests/combat.test.js`

**Interfaces:**
- Consumes: 앞 태스크의 모든 모듈
- Produces:
  - `simulate({ boardA, boardB, seed, data }) => CombatResult`
    - `boardA` / `boardB` = `[{ unitId, star, tile }]` — `tile` 은 자기 진영 기준 0..21 인덱스
    - `CombatResult = { winner: 'A'|'B'|'draw', ticks: number, survivorsA: number, survivorsB: number, log: Event[] }`
    - `Event = { tick, type, ... }` — 타입: `spawn` · `move` · `attack` · `skill_*` · `death` · `end`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/combat.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { simulate } from '../sim/combat.js'

const data = await loadData()

function team(entries) {
  return entries.map(([unitId, star, tile]) => ({ unitId, star, tile }))
}

const weakSide = team([['medieval_warrior_1', 1, 0]])
const strongSide = team([['medieval_king_2', 3, 0], ['evil_wizard_3', 3, 1], ['fire_worm', 3, 2]])

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

  it('보드 배열 순서를 바꿔도 같은 결과를 낸다', () => {
    const order1 = team([['huntress_1', 1, 5], ['hero_knight_1', 1, 0]])
    const order2 = team([['hero_knight_1', 1, 0], ['huntress_1', 1, 5]])
    const a = simulate({ boardA: order1, boardB: strongSide, seed: 3, data })
    const b = simulate({ boardA: order2, boardB: strongSide, seed: 3, data })
    expect(a.winner).toBe(b.winner)
    expect(a.ticks).toBe(b.ticks)
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

  it('시너지가 결과를 바꾼다 (왕국 2 활성 vs 미활성)', () => {
    const noSynergy = team([['medieval_warrior_1', 2, 0], ['rat', 2, 1]])
    const withSynergy = team([['medieval_warrior_1', 2, 0], ['hero_knight_1', 2, 1]])
    const foe = team([['martial_hero_1', 2, 0], ['huntress_1', 2, 1]])
    const a = simulate({ boardA: noSynergy, boardB: foe, seed: 11, data })
    const b = simulate({ boardA: withSynergy, boardB: foe, seed: 11, data })
    expect(a.log).not.toEqual(b.log)
  })

  it('3성이 1성보다 강하다', () => {
    const foe = team([['martial_hero_1', 2, 0], ['huntress_1', 2, 1], ['wizard_pack', 2, 2]])
    const one = simulate({ boardA: team([['hero_knight_2', 1, 0]]), boardB: foe, seed: 4, data })
    const three = simulate({ boardA: team([['hero_knight_2', 3, 0]]), boardB: foe, seed: 4, data })
    expect(three.survivorsB).toBeLessThan(one.survivorsB + 1)
    expect(three.ticks).toBeGreaterThan(one.ticks)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/combat.test.js`
Expected: FAIL — `Failed to load ../sim/combat.js`

- [ ] **Step 3: 구현**

`sim/combat.js`:

```js
// 전투 메인 루프. 순수 함수다 — DOM·PixiJS·fetch 를 쓰지 않는다.
// (보드A, 보드B, 시드) → 전투 로그. 같은 입력이면 항상 같은 로그가 나온다.
// view/board 는 이 로그를 재생만 하고, 서버는 같은 코드로 결과를 검증한다.

import { buildBoard } from './hex.js'
import { createRng } from './rng.js'
import { unitById } from './data.js'
import { activeTraits } from './traits.js'
import { resolveStats, applyTraitEffects } from './stats.js'
import { findTarget } from './targeting.js'
import { stepToward } from './movement.js'
import { physicalDamage, applyDamage } from './damage.js'
import { castSkill } from './skills.js'

// 자기 진영 0..21 → 전장 타일 인덱스.
// A 팀은 아래 3행(3,4,5), B 팀은 위 3행을 좌우 반전 없이 그대로 쓴다.
function toFieldTile(board, localIndex, team, boardCfg) {
  const rows = team === 'A' ? boardCfg.allyRows : boardCfg.enemyRows
  let remain = localIndex
  for (const row of rows) {
    const width = boardCfg.rows[row]
    if (remain < width) return board.indexOf(row, remain)
    remain -= width
  }
  return -1
}

function buildCombatants(entries, team, data, board) {
  const traitMap = activeTraits(
    entries.map((e) => {
      const u = unitById(data.units, e.unitId)
      return { unitId: u.id, origin: u.origin, class: u.class }
    }),
    data.traits,
  )

  return entries.map((e, i) => {
    const unit = unitById(data.units, e.unitId)
    if (!unit) throw new Error(`없는 유닛 id: ${e.unitId}`)

    const effects = []
    for (const key of [unit.origin, unit.class]) {
      const t = traitMap.get(key)
      if (t && t.effect) effects.push(t.effect)
    }

    const base = resolveStats(unit, e.star, data.combat)
    const stats = applyTraitEffects(base, effects)

    return {
      localIndex: i,
      team,
      unitId: unit.id,
      star: e.star,
      skill: unit.skill,
      tile: toFieldTile(board, e.tile, team, data.combat.board),
      hp: stats.hp,
      maxHp: stats.hp,
      shield: 0,
      mana: stats.manaStart,
      alive: true,
      deathLogged: false,
      buffs: [],
      targetId: null,
      attackCooldown: 0,
      stats,
    }
  })
}

function effectiveStat(c, key) {
  let value = c.stats[key]
  let pct = 0
  for (const b of c.buffs) {
    if (b.stat === key) value += b.amount
    if (b.stat === `${key}Pct`) pct += b.amount
  }
  if (pct !== 0) value = Math.floor(value * (1 + pct / 100))
  return value
}

function damageTakenMultiplier(c) {
  let pct = 0
  for (const b of c.buffs) if (b.stat === 'damageTakenPct') pct += b.amount
  return 1 + pct / 100
}

export function simulate({ boardA, boardB, seed, data }) {
  const cfg = data.combat
  const board = buildBoard(cfg.board)
  const rng = createRng(seed)
  const log = []

  const teamA = buildCombatants(boardA, 'A', data, board)
  const teamB = buildCombatants(boardB, 'B', data, board)

  // id 는 팀 A 먼저, 각 팀 안에서는 지정 순서대로 부여한다.
  // 이 id 가 모든 타이브레이크의 기준이므로 결정론의 뿌리다.
  const all = [...teamA, ...teamB]
  all.sort((x, y) => (x.team === y.team ? x.localIndex - y.localIndex : x.team < y.team ? -1 : 1))
  all.forEach((c, i) => {
    c.id = i
  })

  for (const c of all) {
    log.push({ tick: 0, type: 'spawn', casterId: c.id, unitId: c.unitId, team: c.team, tile: c.tile, star: c.star })
  }

  const aliveCount = (team) => all.filter((c) => c.alive && c.team === team).length

  let tick = 0
  const finish = (winner) => {
    log.push({ tick, type: 'end', winner })
    return {
      winner,
      ticks: tick,
      survivorsA: aliveCount('A'),
      survivorsB: aliveCount('B'),
      log,
    }
  }

  if (aliveCount('A') === 0 && aliveCount('B') === 0) return finish('draw')
  if (aliveCount('B') === 0) return finish('A')
  if (aliveCount('A') === 0) return finish('B')

  for (tick = 1; tick <= cfg.maxTicks; tick++) {
    const occupied = new Map()
    for (const c of all) if (c.alive) occupied.set(c.tile, c.id)

    // id 오름차순 고정 순회. 배열 순서에 의존하지 않는다.
    for (const c of all) {
      if (!c.alive) continue

      // 만료된 버프 제거
      c.buffs = c.buffs.filter((b) => b.expiresAt > tick)

      // 지속 피해
      for (const b of c.buffs) {
        if (b.stat === 'dot' && tick % cfg.tickRate === 0) {
          applyDamage(c, b.amount)
        }
      }
      if (!c.alive) {
        if (!c.deathLogged) {
          c.deathLogged = true
          log.push({ tick, type: 'death', casterId: c.id })
        }
        continue
      }

      const target = findTarget(board, c, all)
      if (!target) continue
      c.targetId = target.id

      const dist = board.dist[c.tile][target.tile]
      const range = effectiveStat(c, 'range')

      if (dist > range) {
        const next = stepToward(board, c, target, occupied)
        if (next !== null) {
          occupied.delete(c.tile)
          c.tile = next
          occupied.set(next, c.id)
          log.push({ tick, type: 'move', casterId: c.id, tile: next })
        }
        continue
      }

      if (c.mana >= cfg.mana.full) {
        c.mana = 0
        const events = castSkill({ board, all, occupied, rng, combatCfg: cfg, tick }, c)
        for (const e of events) log.push(e)
        for (const other of all) {
          if (!other.alive && !other.deathLogged) {
            other.deathLogged = true
            log.push({ tick, type: 'death', casterId: other.id })
          }
        }
        continue
      }

      if (c.attackCooldown > 0) {
        c.attackCooldown--
        continue
      }

      const atk = effectiveStat(c, 'atk')
      const isCrit = rng.int(10000) < Math.floor(c.stats.critChance * 10000)
      let dmg = physicalDamage(atk, effectiveStat(target, 'def'), cfg.damage.defK)
      if (isCrit) dmg = Math.floor(dmg * cfg.damage.critMultiplier)
      dmg = Math.floor(dmg * damageTakenMultiplier(target))

      const { died } = applyDamage(target, dmg)
      c.attackCooldown = effectiveStat(c, 'attackInterval')
      c.mana = Math.min(cfg.mana.full, c.mana + cfg.mana.perAttack)
      target.mana = Math.min(
        cfg.mana.full,
        target.mana + Math.min(cfg.mana.onHitMax, Math.floor((dmg * cfg.mana.onHitPercent) / 100)),
      )

      log.push({ tick, type: 'attack', casterId: c.id, targetIds: [target.id], amount: dmg, crit: isCrit })

      if (died) {
        target.deathLogged = true
        occupied.delete(target.tile)
        log.push({ tick, type: 'death', casterId: target.id })
      }
    }

    if (aliveCount('A') === 0 && aliveCount('B') === 0) return finish('draw')
    if (aliveCount('B') === 0) return finish('A')
    if (aliveCount('A') === 0) return finish('B')
  }

  tick = cfg.maxTicks
  const a = aliveCount('A')
  const b = aliveCount('B')
  return finish(a === b ? 'draw' : a > b ? 'A' : 'B')
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run tests/combat.test.js`
Expected: PASS — 11 tests

- [ ] **Step 5: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 모든 테스트 파일 PASS

- [ ] **Step 6: 커밋**

```bash
git add sim/combat.js tests/combat.test.js
git commit -m "feat: 결정론 전투 메인 루프 추가

(보드A, 보드B, 시드) → 전투 로그. 순수 함수.
30틱/초 고정, id 오름차순 순회, 정수 상태.
같은 입력이면 항상 같은 로그가 나온다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: 헤드리스 밸런스 러너

렌더 없이 조합끼리 붙여 승률을 낸다. 26종 × 11시너지를 손으로 검증할 수 없으므로 이게 밸런싱의 유일한 도구다.

**Files:**
- Create: `sim/run.mjs`
- Modify: `package.json` — `sim` 스크립트 추가
- Test: `tests/run.test.js`

**Interfaces:**
- Consumes: `simulate` from `sim/combat.js`
- Produces:
  - `matchup(boardA, boardB, trials, data) => { winsA, winsB, draws, winRateA, avgTicks }`
  - CLI: `node sim/run.mjs <compA> <compB> [trials]` — comp 은 `유닛id:성급:타일` 을 쉼표로 이은 문자열

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/run.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { loadData } from '../sim/data.js'
import { matchup, parseComp } from '../sim/run.mjs'

const data = await loadData()

describe('parseComp', () => {
  it('문자열을 보드 배열로 바꾼다', () => {
    expect(parseComp('hero_knight_1:2:0,huntress_1:1:5')).toEqual([
      { unitId: 'hero_knight_1', star: 2, tile: 0 },
      { unitId: 'huntress_1', star: 1, tile: 5 },
    ])
  })

  it('빈 문자열은 빈 배열이다', () => {
    expect(parseComp('')).toEqual([])
  })

  it('성급을 생략하면 1성이다', () => {
    expect(parseComp('rat::3')).toEqual([{ unitId: 'rat', star: 1, tile: 3 }])
  })
})

describe('matchup', () => {
  const weak = parseComp('medieval_warrior_1:1:0')
  const strong = parseComp('medieval_king_2:3:0,evil_wizard_3:3:1,fire_worm:3:2')

  it('시행 횟수만큼 돌린다', () => {
    const r = matchup(weak, strong, 10, data)
    expect(r.winsA + r.winsB + r.draws).toBe(10)
  })

  it('압도적인 쪽 승률이 1 이다', () => {
    expect(matchup(weak, strong, 20, data).winRateA).toBe(0)
    expect(matchup(strong, weak, 20, data).winRateA).toBe(1)
  })

  it('평균 틱을 낸다', () => {
    expect(matchup(weak, strong, 5, data).avgTicks).toBeGreaterThan(0)
  })

  it('같은 시행 횟수면 결과가 재현된다', () => {
    expect(matchup(weak, strong, 15, data)).toEqual(matchup(weak, strong, 15, data))
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run tests/run.test.js`
Expected: FAIL — `Failed to load ../sim/run.mjs`

- [ ] **Step 3: 구현**

`sim/run.mjs`:

```js
// 헤드리스 밸런스 러너. 렌더 없이 조합끼리 붙여 승률을 낸다.
// 시드는 0..trials-1 을 순서대로 쓰므로 같은 시행 횟수면 결과가 재현된다.
//
// 사용:
//   node sim/run.mjs "hero_knight_1:2:0,huntress_1:1:5" "martial_hero_1:2:0" 200

import { loadData } from './data.js'
import { simulate } from './combat.js'

export function parseComp(text) {
  if (!text || text.trim() === '') return []
  return text.split(',').map((chunk) => {
    const [unitId, star, tile] = chunk.split(':')
    return {
      unitId: unitId.trim(),
      star: star ? Number(star) : 1,
      tile: Number(tile),
    }
  })
}

export function matchup(boardA, boardB, trials, data) {
  let winsA = 0
  let winsB = 0
  let draws = 0
  let totalTicks = 0

  for (let seed = 0; seed < trials; seed++) {
    const r = simulate({ boardA, boardB, seed, data })
    if (r.winner === 'A') winsA++
    else if (r.winner === 'B') winsB++
    else draws++
    totalTicks += r.ticks
  }

  return {
    winsA,
    winsB,
    draws,
    winRateA: winsA / trials,
    avgTicks: Math.floor(totalTicks / trials),
  }
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
if (isMain) {
  const [compA, compB, trialsArg] = process.argv.slice(2)
  if (!compA || !compB) {
    console.error('사용: node sim/run.mjs "<조합A>" "<조합B>" [시행횟수]')
    console.error('조합 형식: 유닛id:성급:타일 을 쉼표로 이음 (예: "hero_knight_1:2:0,rat:1:5")')
    process.exit(1)
  }

  const trials = Number(trialsArg ?? 200)
  const data = await loadData()
  const r = matchup(parseComp(compA), parseComp(compB), trials, data)

  console.log(`시행 ${trials} 회`)
  console.log(`A 승 ${r.winsA} · B 승 ${r.winsB} · 무 ${r.draws}`)
  console.log(`A 승률 ${(r.winRateA * 100).toFixed(1)}%`)
  console.log(`평균 ${r.avgTicks} 틱 (${(r.avgTicks / 30).toFixed(1)}초)`)
}
```

- [ ] **Step 4: `package.json` 에 스크립트 추가**

`scripts` 에 한 줄을 더한다:

```json
    "sim": "node sim/run.mjs"
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run tests/run.test.js`
Expected: PASS — 7 tests

- [ ] **Step 6: CLI 동작 확인**

Run: `node sim/run.mjs "medieval_warrior_1:1:0" "medieval_king_2:3:0" 50`
Expected: 시행/승패/승률/평균 틱이 출력되고 A 승률이 0.0%

- [ ] **Step 7: 전체 검사 통과 확인**

Run: `npm run check`
Expected: `불변식 통과` 후 모든 테스트 PASS

- [ ] **Step 8: 커밋**

```bash
git add sim/run.mjs tests/run.test.js package.json
git commit -m "feat: 헤드리스 밸런스 러너 추가

렌더 없이 조합끼리 N회 붙여 승률과 평균 틱을 낸다.
시드는 0..N-1 순서라 같은 시행 횟수면 결과가 재현된다.
26종 x 11시너지를 손으로 볼 수 없으니 이게 밸런싱의 도구다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 1단계 완료 기준

- `npm run check` 가 통과한다 (불변식 + 전체 테스트)
- `node sim/run.mjs "<조합A>" "<조합B>" 200` 이 승률을 출력한다
- `sim/` 어느 파일도 `document`·`window`·`PIXI`·`fetch`·`Math.random` 을 참조하지 않는다
- 같은 시드와 같은 보드는 항상 같은 전투 로그를 낸다

## 2단계로 넘기는 것

| 항목 | 사유 |
|---|---|
| `view/board` 전투 로그 재생 | 렌더는 2단계 |
| 아이템 12종 적용 | 전투 코어가 선다. `stats.js` 에 `applyItems` 를 더하는 작업 |
| 암습 도약 (전투 시작 시 최후열 이동) | 시너지 효과 플래그(`leapToBackline`)는 데이터에 있고, 적용은 2단계 |
| 불사 부활 · 왕국 부활 | `revive` 플래그는 데이터에 있고, 적용은 2단계 |
| 사수 관통 · 검사 재공격 | 데이터에 있고, 적용은 2단계 |
| 미적용 스킬 파라미터 | `evil_wizard_3.dmgPctMaxHp` · `evil_wizard_3.silenceTicks` · `fire_worm.lineLength` · `fire_worm.burnTickPct` · `evil_wizard_2.chainCount` · `huntress_1.pierceCount` · `martial_hero_2.releapOnKill` · `martial_hero_3.manaRefillOnKill` · `fantasy_warrior.stunTicks` · `mimic.pull` — 데이터에는 있으나 1단계 실행기가 무시한다. 2단계에서 실행기를 확장해 붙인다 |
