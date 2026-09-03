// 아바타 이동. 화면이 아니라 규칙으로 두는 이유는 **남에게 보내는 값**이기
// 때문이다 — 같은 방 사람들이 내 아바타를 본다. 화면 코드 안에서만 정해지면
// "왜 저 사람이 벽 밖에 서 있나"를 재현할 방법이 없다.
import { describe, it, expect } from 'vitest'
import { clampToBounds, stepAvatar, moveToward, facingOf } from '../sim/avatar.js'

const bounds = { minX: -5, maxX: 5, minZ: -3, maxZ: 3 }

describe('clampToBounds', () => {
  it('무대 밖으로 못 나간다', () => {
    expect(clampToBounds({ x: 99, z: -99 }, bounds)).toEqual({ x: 5, z: -3 })
  })

  it('안에 있으면 그대로 둔다', () => {
    expect(clampToBounds({ x: 1, z: 2 }, bounds)).toEqual({ x: 1, z: 2 })
  })
})

describe('stepAvatar', () => {
  const base = { dt: 0.5, speed: 4, bounds }

  it('안 누르면 안 움직인다', () => {
    expect(stepAvatar({ x: 0, z: 0 }, { ...base })).toEqual({ x: 0, z: 0 })
  })

  it('한 방향은 speed × dt 만큼 간다', () => {
    expect(stepAvatar({ x: 0, z: 0 }, { ...base, dx: 1 })).toEqual({ x: 2, z: 0 })
  })

  it('대각선이 더 빠르지 않다 — 조작을 아는 사람만 빨라지면 안 된다', () => {
    const p = stepAvatar({ x: 0, z: 0 }, { ...base, dx: 1, dz: 1 })
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(2, 6)
  })

  it('벽에 닿으면 거기서 멈춘다', () => {
    expect(stepAvatar({ x: 4.5, z: 0 }, { ...base, dx: 1 }).x).toBe(5)
  })
})

describe('moveToward', () => {
  const base = { dt: 0.1, speed: 4, bounds }

  it('목적지가 없으면 도착으로 친다', () => {
    const r = moveToward({ x: 1, z: 1 }, null, base)
    expect(r.arrived).toBe(true)
    expect(r.pos).toEqual({ x: 1, z: 1 })
  })

  it('멀면 한 걸음만 간다', () => {
    const r = moveToward({ x: 0, z: 0 }, { x: 4, z: 0 }, base)
    expect(r.arrived).toBe(false)
    expect(r.pos.x).toBeCloseTo(0.4, 6)
  })

  it('한 프레임에 넘길 거리면 목적지에 딱 세운다 — 넘겨 놓고 되돌아오면 떤다', () => {
    const r = moveToward({ x: 0, z: 0 }, { x: 0.3, z: 0 }, { ...base, speed: 40 })
    expect(r.arrived).toBe(true)
    expect(r.pos).toEqual({ x: 0.3, z: 0 })
  })

  it('가까우면 도착이다', () => {
    const r = moveToward({ x: 0, z: 0 }, { x: 0.05, z: 0 }, base)
    expect(r.arrived).toBe(true)
  })

  it('목적지가 무대 밖이어도 벽에서 멈춘다', () => {
    const r = moveToward({ x: 4.9, z: 0 }, { x: 99, z: 0 }, { ...base, speed: 40 })
    expect(r.pos.x).toBe(5)
  })
})

describe('facingOf', () => {
  it('가는 쪽을 본다', () => {
    expect(facingOf({ x: 0, z: 0 }, { x: 0, z: 1 })).toBeCloseTo(0, 6)
    expect(facingOf({ x: 0, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(Math.PI / 2, 6)
  })

  it('안 움직였으면 보던 쪽을 그대로 본다 — 멈출 때마다 정면으로 홱 돌면 안 된다', () => {
    expect(facingOf({ x: 1, z: 1 }, { x: 1, z: 1 }, 1.23)).toBe(1.23)
  })
})
