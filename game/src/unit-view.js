// 유닛 하나의 화면 표현. 스프라이트 + HP/마나 바 + 발밑 링.
//
// 스프라이트시트는 가로 스트립이고 프레임 크기·수는 manifest.json 에 있다.
// **앵커는 매니페스트가 준다** — 프레임 캔버스 안 캐릭터 위치가 팩마다 달라서
// 캔버스 중앙을 기준으로 삼으면 발이 뜨거나 묻힌다 (tools/build-assets.mjs 참조).

import { Assets, Container, Sprite, Texture, Rectangle, Graphics } from 'pixi.js'

// 스프라이트 애니메이션 속도. 시뮬은 30틱/초로 돌지만 도트 애니는
// 그보다 느려야 자연스럽다. 프레임당 2틱 = 15fps.
const TICKS_PER_FRAME = 2

const BAR_W = 34
const BAR_H = 3

const textureCache = new Map()

async function sheetTexture(unitId, anim) {
  const key = `${unitId}/${anim}`
  if (!textureCache.has(key)) {
    textureCache.set(key, await Assets.load(`/assets/units/${unitId}/${anim}.png`))
  }
  return textureCache.get(key)
}

/** 유닛 26종 × 애니 167장을 미리 받아둔다. 전투 중 로딩 끊김을 없앤다. */
export async function preloadUnits(manifest, unitIds) {
  const jobs = []
  for (const id of unitIds) {
    const entry = manifest.units[id]
    if (!entry) throw new Error(`매니페스트에 ${id} 가 없다`)
    for (const anim of Object.keys(entry.anims)) jobs.push(sheetTexture(id, anim))
  }
  await Promise.all(jobs)
}

export class UnitView extends Container {
  constructor(unitId, manifest, team) {
    super()
    this.unitId = unitId
    this.meta = manifest.units[unitId]
    this.team = team
    this.anim = 'idle'
    this.animStartTick = 0
    this.frames = new Map() // anim → Texture[]

    this.body = new Sprite()
    // 앵커를 매니페스트 값으로 잡는다 — 이 지점이 타일 바닥 중앙에 온다
    this.body.anchor.set(this.meta.anchor.x, this.meta.anchor.y)
    this.addChild(this.body)

    this.ring = new Graphics()
    this.addChildAt(this.ring, 0)

    this.bars = new Graphics()
    this.addChild(this.bars)
  }

  /** 프레임 텍스처를 잘라 캐시한다. preloadUnits 이후에 부른다. */
  async slice() {
    for (const [anim, info] of Object.entries(this.meta.anims)) {
      const sheet = await sheetTexture(this.unitId, anim)
      const list = []
      for (let i = 0; i < info.frames; i++) {
        list.push(
          new Texture({
            source: sheet.source,
            frame: new Rectangle(i * this.meta.frame.w, 0, this.meta.frame.w, this.meta.frame.h),
          }),
        )
      }
      this.frames.set(anim, list)
    }
    this.setAnim('idle', 0)
  }

  /** 있으면 그 애니, 없으면 대체. 팩마다 보유 애니가 달라서 필요하다. */
  resolveAnim(want) {
    if (this.frames.has(want)) return want
    if (want.startsWith('attack')) return this.frames.has('attack1') ? 'attack1' : 'idle'
    if (want === 'run') return 'idle'
    return 'idle'
  }

  setAnim(want, tick) {
    const anim = this.resolveAnim(want)
    if (anim === this.anim) return
    this.anim = anim
    this.animStartTick = tick
  }

  /** 이 애니가 한 바퀴 도는 데 걸리는 틱 */
  animTicks(want) {
    const anim = this.resolveAnim(want)
    return (this.frames.get(anim)?.length ?? 1) * TICKS_PER_FRAME
  }

  draw(tick, state, geom) {
    const list = this.frames.get(this.anim)
    if (!list) return

    const elapsed = Math.max(0, tick - this.animStartTick)
    let idx = Math.floor(elapsed / TICKS_PER_FRAME)
    // 사망은 마지막 프레임에서 멈춘다. 나머지는 반복
    if (this.anim === 'death') idx = Math.min(idx, list.length - 1)
    else idx %= list.length
    this.body.texture = list[idx]

    // 좌우 방향 — 타겟이 왼쪽이면 뒤집는다 (스펙 §3.4)
    const face = state.facing ?? (this.team === 'A' ? 1 : -1)
    this.body.scale.x = Math.abs(this.body.scale.x) * face

    this.alpha = state.alive ? 1 : 0.55

    // 발밑 링 — 팀 색. 죽으면 지운다
    this.ring.clear()
    if (state.alive) {
      const rw = 13
      this.ring
        .ellipse(0, 0, rw, rw * 0.32)
        .fill({ color: this.team === 'A' ? 0x6fa8ff : 0xff7a6f, alpha: 0.22 })
    }

    // HP / 보호막 바
    this.bars.clear()
    if (state.alive) {
      const y = -this.meta.idleBox.h * 0.92
      const hpFrac = Math.max(0, Math.min(1, state.hp / state.maxHp))
      this.bars.rect(-BAR_W / 2, y, BAR_W, BAR_H).fill({ color: 0x000000, alpha: 0.55 })
      this.bars
        .rect(-BAR_W / 2, y, BAR_W * hpFrac, BAR_H)
        .fill(this.team === 'A' ? 0x63d68a : 0xe8654f)
      if (state.shield > 0) {
        const sFrac = Math.min(1, state.shield / state.maxHp)
        this.bars.rect(-BAR_W / 2, y - BAR_H - 1, BAR_W * sFrac, BAR_H - 1).fill(0xd8d2ff)
      }
    }
  }
}
