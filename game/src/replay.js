// 전투 리플레이 뷰어 (2-A).
//
// 새 게임 로직이 없다 — 1단계 시뮬레이터가 낸 **로그를 재생만** 한다.
// 그게 이 단계의 요점이다. 스펙 §10 의 서버 검증과 같은 로그를 쓰므로,
// 여기서 보이는 것이 곧 서버가 검증하는 것이다.
//
// 조합은 URL 로 바꾼다:
//   ?a=hero_knight_1:2:0,huntress_1:2:1&b=martial_hero_1:2:0&seed=7

import { Application, Container, Graphics } from 'pixi.js'
import { loadData } from '@sim/data.js'
import { simulate } from '@sim/combat.js'
import { buildGeometry } from './board-geometry.js'
import { UnitView, preloadUnits } from './unit-view.js'

const TICK_RATE = 30

// 기본 대진 — 골든 픽스처의 버프 로스터. 버프·평타·사망이 다 나온다.
const DEFAULT_A = 'medieval_king_1:2:0,skeleton:2:1,medieval_king_2:2:2,medieval_warrior_1:2:3'
const DEFAULT_B = 'martial_hero_1:2:0,huntress_1:2:1,rat:2:2,bat:2:3'

function parseComp(text) {
  if (!text || !text.trim()) return []
  return text.split(',').map((chunk) => {
    const [unitId, star, tile] = chunk.split(':')
    return { unitId: unitId.trim(), star: star ? Number(star) : 1, tile: Number(tile) }
  })
}

const qs = new URLSearchParams(location.search)
const boardA = parseComp(qs.get('a') ?? DEFAULT_A)
const boardB = parseComp(qs.get('b') ?? DEFAULT_B)
const seed = Number(qs.get('seed') ?? 20260901)

const el = {
  stage: document.getElementById('stage'),
  boot: document.getElementById('boot'),
  matchup: document.getElementById('matchup'),
  alive: document.getElementById('alive'),
  play: document.getElementById('play'),
  restart: document.getElementById('restart'),
  scrub: document.getElementById('scrub'),
  tick: document.getElementById('tick'),
  speed: document.getElementById('speed'),
}

const data = await loadData()
const manifest = await (await fetch('/assets/units/manifest.json')).json()

let result
try {
  result = simulate({ boardA, boardB, seed, data })
} catch (err) {
  el.boot.textContent = `전투를 만들 수 없다: ${err.message}`
  throw err
}

const spawns = result.log.filter((e) => e.type === 'spawn')
await preloadUnits(manifest, [...new Set(spawns.map((s) => s.unitId))])

// ── PixiJS ──────────────────────────────────────────────────
const app = new Application()
await app.init({
  resizeTo: el.stage,
  background: 0x14121a,
  antialias: false, // 도트라 보간하면 뭉갠다
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
})
el.boot.remove()
el.stage.appendChild(app.canvas)

const boardLayer = new Container()
const unitLayer = new Container()
app.stage.addChild(boardLayer, unitLayer)

let geom = buildGeometry(data.combat.board, { width: app.screen.width, height: app.screen.height })

/** 유닛 id → UnitView */
const views = new Map()
for (const s of spawns) {
  const v = new UnitView(s.unitId, manifest, s.team)
  await v.slice()
  views.set(s.casterId, v)
  unitLayer.addChild(v)
}

function drawBoard() {
  boardLayer.removeChildren()
  const g = new Graphics()
  const allyRows = new Set(data.combat.board.allyRows)

  for (const t of geom.tiles) {
    const mine = allyRows.has(t.row)
    // 진영별로 색을 아주 옅게 갈라둔다 — 어디까지가 내 자리인지 한눈에 보이게
    const fill = mine ? 0x232a3e : 0x2e2431
    g.poly(t.hex.flat()).fill({ color: fill, alpha: 0.92 })
    g.poly(t.hex.flat()).stroke({
      color: mine ? 0x3c4a6b : 0x53384a,
      width: 1,
      alpha: 0.85,
    })
  }

  g.moveTo(0, geom.battleLineY)
    .lineTo(app.screen.width, geom.battleLineY)
    .stroke({ color: 0x4a4160, width: 1, alpha: 0.45 })
  boardLayer.addChild(g)
}
drawBoard()

// ── 재생 상태 ────────────────────────────────────────────────
// 로그를 앞으로만 훑으며 상태를 갱신한다. 뒤로 감으면 처음부터 다시 만든다 —
// 로그가 수천 이벤트뿐이라 재구축이 순간이다.

const unitState = new Map()
let cursor = 0 // 다음에 적용할 로그 인덱스
let tick = 0
let playing = true
let speed = 1

function resetState() {
  unitState.clear()
  for (const s of spawns) {
    const meta = manifest.units[s.unitId]
    unitState.set(s.casterId, {
      tile: s.tile,
      prevTile: s.tile,
      moveTick: -99,
      hp: 1,
      maxHp: 1,
      shield: 0,
      alive: true,
      facing: s.team === 'A' ? 1 : -1,
      anim: 'idle',
      animUntil: 0,
    })
    views.get(s.casterId).setAnim('idle', 0)
  }
  // 최대 HP 는 로그에 없다 — 시뮬 결과에서 가져온다
  for (const [id, st] of unitState) {
    const v = views.get(id)
    st.maxHp = maxHpOf(id)
    st.hp = st.maxHp
    void v
  }
  cursor = 0
}

// 로그만으로는 최대 HP 를 모른다. 첫 재생 때 시뮬을 한 번 더 돌려 스탯을 얻는
// 대신, 받은 피해 총합으로 역산한다 — 사망 시점 hp 가 0 이므로
// (총 피해 + 총 회복) 이 곧 최대 HP 다. 살아남은 유닛은 최소 하한만 얻으므로
// 바가 가득 찬 것으로 보이지 않게 별도 보정한다.
const damageTaken = new Map()
const healed = new Map()
for (const e of result.log) {
  if (e.type === 'attack' || e.type === 'dot' || e.type === 'skill_single') {
    for (const id of e.targetIds) damageTaken.set(id, (damageTaken.get(id) ?? 0) + (e.amount ?? 0))
  } else if (e.type === 'skill_aoe') {
    for (const h of e.hits ?? []) {
      damageTaken.set(h.id, (damageTaken.get(h.id) ?? 0) + h.toShield + h.toHp)
    }
  } else if (e.type === 'heal') {
    for (const id of e.targetIds) healed.set(id, (healed.get(id) ?? 0) + (e.amount ?? 0))
  }
}
const died = new Set(result.log.filter((e) => e.type === 'death').map((e) => e.casterId))
function maxHpOf(id) {
  const dmg = damageTaken.get(id) ?? 0
  const heal = healed.get(id) ?? 0
  // 죽은 유닛은 정확하다. 산 유닛은 하한이라 여유를 준다
  return died.has(id) ? Math.max(1, dmg - heal) : Math.max(1, Math.round((dmg - heal) * 1.6) + 1)
}

function applyEvent(e) {
  const v = views.get(e.casterId)
  const st = unitState.get(e.casterId)

  switch (e.type) {
    case 'move': {
      if (!st) break
      st.prevTile = st.tile
      st.tile = e.tile
      st.moveTick = e.tick
      const from = geom.tiles[st.prevTile]
      const to = geom.tiles[st.tile]
      if (from && to && Math.abs(to.x - from.x) > 0.5) st.facing = to.x > from.x ? 1 : -1
      st.anim = 'run'
      st.animUntil = e.tick + 3
      v?.setAnim('run', e.tick)
      break
    }
    case 'attack':
    case 'skill_single':
    case 'skill_aoe':
    case 'skill_buff': {
      if (st && v) {
        const want = e.type === 'skill_buff' ? 'attack1' : 'attack1'
        st.anim = want
        st.animUntil = e.tick + v.animTicks(want)
        v.setAnim(want, e.tick)
        // 대상 쪽을 본다
        const target = unitState.get(e.targetIds?.[0])
        if (target) {
          const a = geom.tiles[st.tile]
          const b = geom.tiles[target.tile]
          if (a && b && Math.abs(b.x - a.x) > 0.5) st.facing = b.x > a.x ? 1 : -1
        }
      }
      // 피격 반응
      const hits =
        e.type === 'skill_aoe' ? (e.hits ?? []).map((h) => h.id) : (e.targetIds ?? [])
      for (const id of hits) {
        const ts = unitState.get(id)
        const tv = views.get(id)
        if (!ts || !ts.alive) continue
        const dealt =
          e.type === 'skill_aoe'
            ? (e.hits.find((h) => h.id === id)?.toHp ?? 0) +
              (e.hits.find((h) => h.id === id)?.toShield ?? 0)
            : (e.amount ?? 0)
        ts.shield = Math.max(0, ts.shield - (e.toShield ?? 0))
        ts.hp = Math.max(0, ts.hp - dealt)
        if (tv && ts.anim !== 'death') {
          ts.anim = 'hit'
          ts.animUntil = e.tick + tv.animTicks('hit')
          tv.setAnim('hit', e.tick)
        }
      }
      if (e.type === 'skill_buff') {
        for (const g of e.grants ?? []) {
          const ts = unitState.get(g.id)
          if (ts) ts.shield += g.shieldGranted ?? 0
        }
      }
      break
    }
    case 'dot': {
      for (const id of e.targetIds ?? []) {
        const ts = unitState.get(id)
        if (ts) ts.hp = Math.max(0, ts.hp - (e.amount ?? 0))
      }
      break
    }
    case 'heal': {
      const ts = unitState.get(e.casterId)
      if (ts) ts.hp = Math.min(ts.maxHp, ts.hp + (e.amount ?? 0))
      break
    }
    case 'death': {
      if (st && v) {
        st.alive = false
        st.hp = 0
        st.anim = 'death'
        st.animUntil = Infinity
        v.setAnim('death', e.tick)
      }
      break
    }
  }
}

function seekTo(target) {
  if (target < tick) {
    resetState()
    tick = 0
  }
  while (cursor < result.log.length && result.log[cursor].tick <= target) {
    applyEvent(result.log[cursor])
    cursor++
  }
  tick = target
}

resetState()

// ── 화면 갱신 ────────────────────────────────────────────────
// 부드럽게 감속. 칸에서 칸으로 미끄러질 때 도착이 툭 끊기지 않는다.
const easeOut = (t) => 1 - (1 - t) * (1 - t)

function render(frac = 0) {
  // 이벤트는 정수 틱에 적용되지만 **그리기는 소수 틱**으로 한다.
  // 정수 틱으로만 그리면 30Hz 로 계단져서 이동이 뚝뚝 끊긴다.
  const rt = tick + frac

  for (const [id, st] of unitState) {
    const v = views.get(id)
    const to = geom.tiles[st.tile]
    const from = geom.tiles[st.prevTile] ?? to
    if (!to) continue

    // 시뮬은 걷는 동안 1틱에 한 칸씩 옮긴다. 그 한 칸을 한 틱에 걸쳐 미끄러진다.
    const k = easeOut(Math.max(0, Math.min(1, rt - st.moveTick)))
    v.x = from.x + (to.x - from.x) * k
    v.y = from.footY + (to.footY - from.footY) * k
    v.scale.set((from.scale + (to.scale - from.scale) * k) * 0.72)
    // 아래(가까운) 행이 위에 그려진다.
    // 시체는 항상 뒤로 — 시뮬이 사망 시 타일 점유를 풀어서 산 유닛이 그 자리로
    // 올라서는데, 그때 시체가 앞에 있으면 누가 살아있는지 안 보인다.
    v.zIndex = st.alive ? to.y + 1000 : to.y

    // 공격/피격 애니가 끝나면 idle 또는 run 으로 되돌린다
    if (st.anim !== 'death' && rt >= st.animUntil) {
      st.anim = 'idle'
      v.setAnim('idle', tick)
    }
    v.draw(rt, st, geom)
  }
  unitLayer.sortableChildren = true
  unitLayer.sortChildren()

  const aliveA = [...unitState].filter(([id, s]) => s.alive && teamOf(id) === 'A').length
  const aliveB = [...unitState].filter(([id, s]) => s.alive && teamOf(id) === 'B').length
  el.alive.innerHTML = `<b class="teamA">${aliveA}</b> vs <b class="teamB">${aliveB}</b>`
  el.tick.textContent = `${tick} / ${result.ticks}  (${(tick / TICK_RATE).toFixed(1)}s)`
  if (document.activeElement !== el.scrub) {
    el.scrub.value = String(Math.round((tick / result.ticks) * 1000))
  }
}

const teamById = new Map(spawns.map((s) => [s.casterId, s.team]))
const teamOf = (id) => teamById.get(id)

el.matchup.innerHTML =
  `<b class="teamA">A</b> ${boardA.map((u) => u.unitId).join(' · ')}` +
  `　vs　<b class="teamB">B</b> ${boardB.map((u) => u.unitId).join(' · ')}` +
  `　seed ${seed}　승자 <b class="team${result.winner}">${result.winner}</b>`

// ── 루프 ────────────────────────────────────────────────────
let acc = 0
app.ticker.add((t) => {
  if (playing && tick < result.ticks) {
    acc += (t.deltaMS / 1000) * TICK_RATE * speed
    if (acc >= 1) {
      seekTo(Math.min(result.ticks, tick + Math.floor(acc)))
      acc %= 1
    }
  } else {
    acc = 0
  }
  render(acc)
})

// ── 조작 ────────────────────────────────────────────────────
el.play.onclick = () => {
  playing = !playing
  el.play.textContent = playing ? '일시정지' : '재생'
}
el.restart.onclick = () => {
  seekTo(0)
  playing = true
  el.play.textContent = '일시정지'
}
el.scrub.oninput = () => {
  playing = false
  el.play.textContent = '재생'
  seekTo(Math.round((Number(el.scrub.value) / 1000) * result.ticks))
}
const SPEEDS = [1, 2, 4, 0.5]
let speedIdx = 0
el.speed.onclick = () => {
  speedIdx = (speedIdx + 1) % SPEEDS.length
  speed = SPEEDS[speedIdx]
  el.speed.textContent = `${speed}x`
}

// 렌더러가 실제로 크기를 바꾼 뒤에 기하를 다시 만든다.
// window resize 만 듣고 app.screen 을 읽으면 아직 옛 값이라 한 프레임 어긋난다.
app.renderer.on('resize', () => {
  geom = buildGeometry(data.combat.board, { width: app.screen.width, height: app.screen.height })
  drawBoard()
})

// 콘솔 디버깅용
window.__replay = { result, unitState, geom, seekTo }
console.log(`전투 로그 ${result.log.length} 이벤트 · ${result.ticks} 틱 · 승자 ${result.winner}`)
