// 무대 위를 걸어다니는 아바타.
//
// 규칙(어디까지 갈 수 있나·얼마나 빠른가)은 sim/avatar.js 에 있고 여기는
// **입력을 규칙에 넣고 결과를 모델에 옮기는** 일만 한다. 같은 이유로 위치를
// 서버에 보내는 것도 여기가 아니라 부르는 쪽(main)이 정한다 — 이 파일이
// 네트워크를 알면 아바타를 확인할 때마다 서버가 필요해진다.

import { stepAvatar, moveToward, facingOf, clampToBounds } from '@sim/avatar.js'

/** 초당 이동 거리(타일 폭 기준으로 잡은 값). 걷는 느낌이 나되 답답하지 않다. */
const SPEED = 3.4

/**
 * @param {object} o
 * @param {object} o.scene   scene3d
 * @param {string} o.unitId  아바타로 쓸 모델. 나중에 코스메틱이 이걸 바꾼다
 */
export async function createAvatar({ scene, unitId = 'frog', star = 1 }) {
  const view = await scene.makeUnit(unitId, star, 'A')
  scene.scene.add(view.root)
  view.play(view.anims.idle)

  const bounds = scene.stageBounds()
  // 시작 자리는 판 뒤쪽 가운데. 말이 서는 칸 위가 아니라 그 아래 여백이다 —
  // 처음부터 말과 겹쳐 서 있으면 무엇이 내 아바타인지 안 보인다.
  // 앞 가장자리에 딱 붙이면 대기석·상점 띠 뒤로 들어가 안 보인다. 한 칸 안쪽.
  let pos = clampToBounds(
    { x: (bounds.minX + bounds.maxX) / 2, z: bounds.maxZ - (bounds.maxZ - bounds.minZ) * 0.18 },
    bounds,
  )
  let facing = 0
  let target = null
  let walking = false

  const keys = new Set()
  const onKeyDown = (ev) => {
    // 배치 단축키(W/E/D/F)와 겹친다. **아바타는 WASD 만** 먹고, 나머지는
    // 손대지 않는다 — W 가 둘 다에 걸리는 건 감수한다: 판에 올릴 말을
    // 가리키고 있을 때만 그쪽이 반응하기 때문이다.
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(ev.code)) keys.add(ev.code)
  }
  const onKeyUp = (ev) => keys.delete(ev.code)
  addEventListener('keydown', onKeyDown)
  addEventListener('keyup', onKeyUp)

  function place() {
    view.root.position.set(pos.x, scene.topY, pos.z)
    view.root.rotation.y = facing
  }
  place()

  return {
    get position() {
      return { ...pos }
    },

    /** 남이 보내온 위치로 맞춘다(관전). 내 아바타에는 안 쓴다. */
    setPosition(p) {
      pos = clampToBounds(p, bounds)
      place()
    },

    /** 땅을 짚었다. 그리로 걸어간다. */
    goTo(clientX, clientY) {
      const g = scene.groundAt(clientX, clientY)
      if (g) target = clampToBounds(g, bounds)
    },

    /**
     * 한 프레임. 키가 눌려 있으면 키가 이긴다 — 걸어가는 중에 키를 잡으면
     * 목적지를 버리고 손이 시키는 대로 간다.
     */
    tick(dt) {
      const before = { ...pos }
      const dx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)
      const dz = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0)

      if (dx || dz) {
        target = null
        pos = stepAvatar(pos, { dx, dz, dt, speed: SPEED, bounds })
      } else if (target) {
        const r = moveToward(pos, target, { dt, speed: SPEED, bounds })
        pos = r.pos
        if (r.arrived) target = null
      }

      facing = facingOf(before, pos, facing)
      const moved = before.x !== pos.x || before.z !== pos.z
      // 걷기/대기 전환은 **바뀔 때만** 부른다. 매 프레임 play 를 부르면
      // 크로스페이드가 계속 다시 시작돼 애니메이션이 굳는다.
      if (moved !== walking) {
        walking = moved
        view.play(moved ? view.anims.run : view.anims.idle)
      }
      view.mixer.update(dt)
      place()
      return moved
    },

    dispose() {
      removeEventListener('keydown', onKeyDown)
      removeEventListener('keyup', onKeyUp)
      view.dispose()
    },
  }
}
