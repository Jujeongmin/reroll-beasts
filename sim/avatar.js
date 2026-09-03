// 아바타 이동 규칙.
//
// 화면이 아니라 여기 있는 이유: 이동은 **남에게 보내는 값**이다(같은 방
// 사람들이 내 아바타를 본다). 보내는 값이 화면 코드 안에서만 정해지면
// "왜 저 사람이 벽 밖에 서 있나" 같은 걸 재현할 방법이 없다.
//
// 좌표는 무대 평면 (x, z) 다. y 는 바닥에 붙어 있으므로 안 다룬다.

/** 도착으로 치는 거리. 이보다 가까우면 목적지를 지운다 — 안 그러면 제자리에서 떤다. */
const ARRIVE = 0.12

/** 무대 밖으로 못 나간다. 판정을 화면에 두면 남의 아바타만 벽을 넘는다. */
export function clampToBounds(pos, bounds) {
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, pos.x)),
    z: Math.max(bounds.minZ, Math.min(bounds.maxZ, pos.z)),
  }
}

/**
 * 키 입력 한 프레임.
 *
 * 대각선을 정규화한다 — 안 하면 WS 와 AD 를 같이 누른 쪽이 √2 배 빠르다.
 * 그건 조작을 아는 사람만 빨라지는 규칙이라 게임이 그걸 가르치지도 않는다.
 */
export function stepAvatar(pos, { dx = 0, dz = 0, dt, speed, bounds }) {
  const len = Math.hypot(dx, dz)
  if (len === 0) return { ...pos }
  const k = (speed * dt) / len
  return clampToBounds({ x: pos.x + dx * k, z: pos.z + dz * k }, bounds)
}

/**
 * 목적지로 한 프레임 간다. 모바일에서 땅을 탭했을 때 쓴다.
 *
 * 남은 거리보다 한 프레임 이동량이 크면 **목적지에 딱 세운다** — 넘겨 놓고
 * 다음 프레임에 되돌아오면 도착점에서 좌우로 떤다.
 */
export function moveToward(pos, target, { dt, speed, bounds }) {
  if (!target) return { pos: { ...pos }, arrived: true }
  const dx = target.x - pos.x
  const dz = target.z - pos.z
  const dist = Math.hypot(dx, dz)
  if (dist <= ARRIVE) return { pos: { ...pos }, arrived: true }
  const stepLen = speed * dt
  if (stepLen >= dist) return { pos: clampToBounds({ ...target }, bounds), arrived: true }
  const k = stepLen / dist
  return {
    pos: clampToBounds({ x: pos.x + dx * k, z: pos.z + dz * k }, bounds),
    arrived: false,
  }
}

/** 바라보는 방향(라디안). 안 움직였으면 이전 각도를 그대로 준다. */
export function facingOf(from, to, prev = 0) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  if (Math.hypot(dx, dz) < 1e-4) return prev
  return Math.atan2(dx, dz)
}
