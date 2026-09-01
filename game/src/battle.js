// 전투 재생. **새 게임 로직이 없다** — sim/combat 이 낸 로그를 재생만 한다.
// 서버가 검증하는 것과 같은 로그를 쓰므로, 여기서 보이는 것이 곧 판정 결과다.
//
// 무대를 **직접 만들지 않고 받는다.** 배치 화면과 같은 판·카메라·조명을 이어 써야
// 전투가 "다른 화면으로 넘어가는 일"이 아니라 "그 자리에서 시작되는 일"이 된다.

import * as THREE from 'three'
import { unitById } from '@sim/data.js'
import { resolveStats } from '@sim/stats.js'

const TICK_RATE = 30

// 투사체 색. 마법은 보라, 활은 호박. 근접은 아예 안 쏜다.
const BOLT_COLOR = { mage: 0xb98cff, shooter: 0xffc266 }

export async function createBattle({ data, scene }) {
  // 한 판을 화면에서 이만큼 안에 끝낸다. 판이 커질수록 틱이 늘어나는데 배속을
  // 손으로 올리게 두면 매 라운드 같은 버튼을 누르게 된다 — 길이로 정한다.
  const TARGET_SECONDS = 11

  // 전투가 끝나고 결과를 눈으로 확인할 시간. 이만큼 뒤에 스스로 정산으로 넘어간다.
  // 버튼을 누르게 하면 매 라운드 한 번씩 의미 없는 확인 클릭이 쌓인다.
  const END_HOLD_TICKS = 45

  // 한 칸 이동에 시뮬이 쓰는 틱 수. 이 폭에 걸쳐 보간해야 걷는 것으로 보인다.
  // 1틱에 끝내면 나머지는 제자리에 선 채라 칸을 순간이동하는 그림이 된다.
  const MOVE_TICKS = data.combat.moveInterval

  let result = null
  let spawns = []
  let views = new Map()
  let unitState = new Map()
  let teamById = new Map()
  let cursor = 0
  let tick = 0
  let playing = false
  let speed = 1
  let onDone = null
  let active = false
  let endHold = 0
  // casterId → { range, bolt } — 사거리 밖에서 때리는 말만 투사체를 쏜다
  let shooters = new Map()

  // ── 성급 · 체력 배지 ────────────────────────────────────
  // 그리기는 scene3d 의 makeBadge 가 한다 — 배치 화면의 별 표시와 같은 그림이어야
  // 같은 유닛이 단계에 따라 달라 보이지 않는다.
  function drawBar(v, st) {
    v.badge.draw({
      hp: st.hp,
      maxHp: st.maxHp,
      shield: st.shield,
      mana: st.mana,
      manaFull: st.manaFull,
    })
    v.badge.sprite.visible = st.alive
    v.badge.sprite.position.y = v.height + scene.spacing.stepX * 0.16
  }

  // ── 상태 재생 ───────────────────────────────────────────
  const tileOf = (i) => scene.board.tiles[i]

  function resetState() {
    unitState.clear()
    for (const sp of spawns) {
      const v = views.get(sp.casterId)
      unitState.set(sp.casterId, {
        tile: sp.tile,
        prevTile: sp.tile,
        moveTick: -99,
        // 최대 HP 는 spawn 이벤트가 실어 온다. 로그의 피해 총합으로 역산하면
        // 끝까지 살아남은 유닛은 하한밖에 안 나와 HP 바가 틀린 값을 그린다.
        maxHp: sp.maxHp,
        hp: sp.maxHp,
        shield: 0,
        // 마나도 spawn 이 실어 온다. 화면이 다시 계산하면 규칙이 두 군데 산다.
        mana: sp.mana ?? 0,
        manaFull: sp.manaFull ?? 0,
        alive: true,
        anim: 'idle',
        animUntil: 0,
      })
      v.current = null
      v.play(v.anims.idle)
      v.root.rotation.y = sp.team === 'A' ? 0 : Math.PI
    }
    cursor = 0
  }

  /** 그 말이 서 있는 월드 좌표. 이펙트를 몸 높이에 띄운다. */
  function fxAt(id, lift = 0.45) {
    const st = unitState.get(id)
    const v = views.get(id)
    if (!st || !v) return null
    const t = tileOf(st.tile)
    return new THREE.Vector3(t.x, scene.topY + v.height * lift, t.z)
  }

  /**
   * 로그 사건을 눈에 보이게 한다.
   *
   * **재생 중일 때만** 띄운다. seekTo 가 지나간 구간을 한 번에 적용할 때도
   * applyEvent 를 타는데, 거기서 터뜨리면 관전으로 판을 갈아탄 순간
   * 수백 개가 한꺼번에 터진다.
   */
  function fxFor(e) {
    if (!liveEvents) return
    switch (e.type) {
      case 'leap': {
        // 도약은 **떠난 자리**에 잔상을 남긴다. 도착점은 이미 말이 서 있다.
        const at = fxAt(e.casterId, 0.5)
        if (at) scene.spawnFx('trail', at, { color: 0xb98cff, size: 1.1, grow: 2.2, life: 0.4 })
        break
      }
      case 'shield': {
        const at = fxAt(e.casterId, 0.45)
        // amount 0 은 만료다 — 터뜨릴 게 없다.
        if (at && e.amount > 0) {
          scene.spawnFx('ring', at, { color: 0x8fd8ff, size: 1.4, grow: 1.15, life: 0.6, rise: 0 })
        }
        break
      }
      case 'dodge': {
        const at = fxAt(e.casterId, 0.5)
        if (at) scene.spawnFx('wisp', at, { color: 0xdff0ff, size: 0.9, grow: 1.6, life: 0.3 })
        break
      }
      case 'revive': {
        const at = fxAt(e.casterId, 0.3)
        if (at) {
          scene.spawnFx('glow', at, { color: 0xffe08a, size: 1.6, grow: 1.4, life: 0.7, rise: 0.5 })
          scene.spawnFx('ring_thick', at, { color: 0xffd166, size: 0.8, grow: 3, life: 0.6, rise: 0 })
        }
        break
      }
      case 'death_blast': {
        const at = fxAt(e.casterId, 0.35)
        if (at) {
          scene.spawnFx('burst', at, { color: 0xff8a5c, size: 1.5, grow: 2.4, life: 0.5, spin: 1.2 })
        }
        break
      }
      case 'skill_splash': {
        for (const id of e.targetIds ?? []) {
          const at = fxAt(id, 0.55)
          if (at) scene.spawnFx('spark', at, { color: 0xb98cff, size: 0.7, grow: 2, life: 0.35 })
        }
        break
      }
      case 'attack': {
        // 치명타만 표시한다. 매 평타마다 띄우면 난전에서 화면이 하얘진다.
        if (!e.crit) break
        const at = fxAt(e.targetIds?.[0], 0.5)
        if (at) scene.spawnFx('slash', at, { color: 0xffd166, size: 0.9, grow: 1.5, life: 0.25 })
        break
      }
      default:
        break
    }
  }

  function applyEvent(e) {
    fxFor(e)
    if (e.type === 'mana') {
      const st = unitState.get(e.casterId)
      if (st) st.mana = e.value
      return
    }
    const v = views.get(e.casterId)
    const st = unitState.get(e.casterId)

    switch (e.type) {
      case 'leap':
        // 도약은 걷는 게 아니라 순간이동이다 — 보간하면 판을 가로질러 미끄러진다.
        // prevTile 도 도착지로 맞춰 render 가 이동 중으로 보지 않게 한다.
        if (!st) break
        st.tile = e.tile
        st.prevTile = e.tile
        st.moveTick = -99
        break

      case 'move':
        if (!st) break
        st.prevTile = st.tile
        st.tile = e.tile
        st.moveTick = e.tick
        // 달리기 동작은 render 가 도착 여부를 보고 건다. 여기서 고정 길이를
        // 주면 이동 주기와 어긋나 걷다가 중간에 선다.
        st.animUntil = e.tick
        break

      case 'attack':
      case 'skill_single':
      case 'skill_aoe':
      case 'skill_buff': {
        if (st && v && st.alive) {
          st.anim = 'attack'
          st.animUntil = e.tick + 14
          v.play(v.anims.attack, { loop: false, fade: 0.08 })
          const t = unitState.get(e.targetIds?.[0])
          if (t) {
            const tt = tileOf(t.tile)
            if (tt) v.faceTo(tt.x, tt.z)
          }
          fireBolt(e.casterId, e.targetIds?.[0])
        }
        const hits = e.type === 'skill_aoe' ? (e.hits ?? []).map((h) => h.id) : (e.targetIds ?? [])
        for (const id of hits) {
          const ts = unitState.get(id)
          const tv = views.get(id)
          if (!ts || !ts.alive) continue
          const amount =
            e.type === 'skill_aoe'
              ? (() => {
                  const h = e.hits.find((x) => x.id === id)
                  return (h?.toHp ?? 0) + (h?.toShield ?? 0)
                })()
              : (e.amount ?? 0)
          ts.shield = Math.max(0, ts.shield - (e.toShield ?? 0))
          ts.hp = Math.max(0, ts.hp - amount)
          if (tv && ts.anim !== 'death') {
            ts.anim = 'hit'
            ts.animUntil = e.tick + 10
            tv.play(tv.anims.hit, { loop: false, fade: 0.05 })
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

      case 'dot':
        for (const id of e.targetIds ?? []) {
          const ts = unitState.get(id)
          if (ts) ts.hp = Math.max(0, ts.hp - (e.amount ?? 0))
        }
        break

      case 'heal': {
        const ts = unitState.get(e.casterId)
        if (ts) ts.hp = Math.min(ts.maxHp, ts.hp + (e.amount ?? 0))
        break
      }

      case 'death':
        if (st && v) {
          st.alive = false
          st.hp = 0
          st.anim = 'death'
          st.animUntil = Infinity
          v.play(v.anims.death, { loop: false, fade: 0.1 })
        }
        break
    }
  }

  /**
   * 원거리 말이 때릴 때 투사체를 띄운다.
   *
   * 피해는 로그가 이미 정했다 — 이건 눈에 보이라고 있는 것이므로, 도착 시점이
   * 판정 시점과 조금 어긋나도 상관없다. 대신 안 쏘면 멀리서 죽는 이유가 안 보인다.
   */
  function fireBolt(casterId, targetId) {
    const color = shooters.get(casterId)
    if (color === undefined || targetId === undefined) return
    const cv = views.get(casterId)
    const tv = views.get(targetId)
    if (!cv || !tv) return
    const from = cv.root.position.clone()
    from.y += cv.height * 0.62
    const to = tv.root.position.clone()
    to.y += tv.height * 0.5
    scene.spawnBolt(from, to, color)
  }

  // 이펙트를 띄워도 되는 구간인가. 되감기·이어보기는 로그를 한 번에
  // 적용하므로 그때 터뜨리면 수백 개가 동시에 터진다.
  let liveEvents = true

  function seekTo(target) {
    if (target < tick) {
      resetState()
      tick = 0
      scene.clearBolts()
      scene.clearFx()
    }
    while (cursor < result.log.length && result.log[cursor].tick <= target) {
      applyEvent(result.log[cursor])
      cursor++
    }
    tick = target
  }

  // ── 그리기 ──────────────────────────────────────────────
  function render(frac, dt) {
    const rt = tick + frac
    for (const [id, st] of unitState) {
      const v = views.get(id)
      const to = tileOf(st.tile)
      const from = tileOf(st.prevTile) ?? to
      if (!to) continue

      // 이동 보간은 **선형**이다. 칸마다 가감속을 넣으면 여러 칸을 이어 걸을 때
      // 빨라졌다 느려지기를 반복해 끊겨 보인다.
      const k = Math.max(0, Math.min(1, (rt - st.moveTick) / MOVE_TICKS))
      const x = from.x + (to.x - from.x) * k
      const z = from.z + (to.z - from.z) * k
      const walking = k < 1 && st.alive
      if (walking) v.faceTo(to.x, to.z)
      v.root.position.set(x, scene.topY, z)

      if (walking && st.anim !== 'death') {
        st.anim = 'run'
        v.play(v.anims.run)
      } else if (st.anim !== 'death' && rt >= st.animUntil) {
        st.anim = 'idle'
        v.play(v.anims.idle)
      }
      v.mixer.update(dt)
      drawBar(v, st)
    }
    scene.updateBolts(dt)
    scene.updateFx(dt)

    // 남은 수 표시는 뺐다. 말 위에 체력바가 이미 있고 죽으면 사라진다 —
    // 판을 보면 되는 걸 숫자로 다시 말하면 눈이 판에서 떨어진다.
    scene.render()
  }

  /**
   * 이 판의 배속. 길면 빨리 감는다.
   *
   * 1 · 2 · 4 로만 끊는다 — 1.7배 같은 값은 걷는 동작이 어긋나 보이고,
   * 무엇보다 사람이 "지금 몇 배속인지"를 못 센다.
   */
  function speedFor(ticks) {
    const want = ticks / TICK_RATE / TARGET_SECONDS
    return want > 3 ? 4 : want > 1.5 ? 2 : 1
  }

  let acc = 0
  let last = performance.now()
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (result && active) {
      if (playing && tick < result.ticks) {
        acc += dt * TICK_RATE * speed
        if (acc >= 1) {
          seekTo(Math.min(result.ticks, tick + Math.floor(acc)))
          acc %= 1
        }
      } else {
        acc = 0
        // 끝난 판을 잠깐 보여주고 스스로 넘어간다
        endHold += dt * TICK_RATE
        if (endHold >= END_HOLD_TICKS) {
          endHold = -Infinity
          onDone?.()
          // 넘긴 뒤에는 이 프레임을 그리지 않는다. 그리면 이미 비운 생존 수를
          // 다시 써서 상단에 "0 vs 0" 이 남는다.
          requestAnimationFrame(frame)
          return
        }
      }
      render(acc, dt)
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  return {
    /** 전투 하나를 무대에 올린다. 배치 화면의 말은 부르는 쪽이 미리 치운다. */
    /** 지금 재생 위치. 관전에서 판을 갈아탈 때 이어 보려면 필요하다. */
    tick: () => tick,

    /**
     * 화면 좌표가 가리키는 말. 양쪽 진영 다 잡는다.
     *
     * 전투 중 말은 로스터가 아니라 로그에서 나온다 — 배치 화면의 unitAtPointer
     * 가 보는 run.state 에는 없다. 그래서 여기서 따로 집어 준다.
     */
    unitAt(x, y) {
      if (!active) return null
      const roots = [...views.values()].map((v) => v.root)
      let hit = scene.pickObjects(roots, x, y)
      while (hit) {
        for (const [id, v] of views) {
          if (v.root !== hit) continue
          const st = unitState.get(id)
          if (!st || !st.alive) return null
          const sp = spawns.find((e) => e.casterId === id)
          return sp ? { unitId: sp.unitId, star: sp.star, team: sp.team } : null
        }
        hit = hit.parent
      }
      return null
    },

    async load(nextResult, { onBack, atTick = 0 } = {}) {
      for (const v of views.values()) v.dispose()
      views = new Map()

      result = nextResult
      onDone = onBack
      spawns = result.log.filter((e) => e.type === 'spawn')
      teamById = new Map(spawns.map((s) => [s.casterId, s.team]))

      shooters = new Map()
      for (const sp of spawns) {
        const unit = unitById(data.units, sp.unitId)
        const stats = resolveStats(unit, sp.star, data.combat)
        if (stats.range > 1) {
          shooters.set(sp.casterId, BOLT_COLOR[unit.class] ?? 0xffd166)
        }
        const v = await scene.makeUnit(sp.unitId, sp.star, sp.team)
        v.badge = scene.makeBadge({ team: sp.team, star: sp.star, withHp: true })
        v.root.add(v.badge.sprite)
        scene.scene.add(v.root)
        views.set(sp.casterId, v)
      }

      scene.setBattleMode(true)
      active = true
      endHold = 0
      resetState()
      tick = 0
      cursor = 0
      acc = 0
      playing = true
      speed = speedFor(result.ticks)
      // 이어보기. seekTo 가 로그를 그 지점까지 한 번에 적용한다.
      if (atTick > 0) {
        liveEvents = false
        seekTo(Math.min(result.ticks, atTick))
        liveEvents = true
      }
      last = performance.now()
    },
    hide() {
      for (const v of views.values()) v.dispose()
      views = new Map()
      unitState.clear()
      result = null
      active = false
      playing = false
      scene.clearBolts()
      scene.clearFx()
      scene.setBattleMode(false)
    },
  }
}
