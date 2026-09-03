// 무대 위를 걸어다니는 아바타.
//
// 규칙(어디까지 갈 수 있나·얼마나 빠른가)은 sim/avatar.js 에 있고 여기는
// **입력을 규칙에 넣고 결과를 모델에 옮기는** 일만 한다. 같은 이유로 위치를
// 서버에 보내는 것도 여기가 아니라 부르는 쪽(main)이 정한다 — 이 파일이
// 네트워크를 알면 아바타를 확인할 때마다 서버가 필요해진다.

import { stepAvatar, moveToward, facingOf, clampToBounds } from '@sim/avatar.js'
import { resolveAvatar, avatarFile, avatarAnims } from '@sim/cosmetics.js'

/** 초당 이동 거리(타일 폭 기준으로 잡은 값). 걷는 느낌이 나되 답답하지 않다. */
const SPEED = 3.4

/**
 * @param {object} o
 * @param {object} o.scene   scene3d
 * @param {string} o.unitId  아바타로 쓸 모델. 나중에 코스메틱이 이걸 바꾼다
 */
export async function createAvatar({ scene, data, avatarId }) {
  // 아바타는 몬스터가 아니다. 판 위 말과 같은 모델을 쓰면 어느 게 싸우는
  // 말인지 흐려지고, 무엇보다 **아바타는 싸우지 않는다**.
  const id = resolveAvatar(avatarId, data)
  const view = await scene.makeAvatarModel(avatarFile(id, data), avatarAnims(id, data))
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
  // 가상 조이스틱이 낸 방향. 없으면 null.
  let stick = null
  let walking = false

  // 이동 키(WASD)는 안 쓴다.
  //
  // 배치 단축키와 정면으로 겹친다 — D 는 리롤(골드 2), W 는 판에 올리기다.
  // 아바타를 걷게 하려고 누른 키가 골드를 쓸어간다. TFT 도 같은 이유로 꼬마
  // 전설이에 이동 키를 안 두고 **바닥을 클릭하면 그쪽으로 걸어가게** 한다:
  // 키보드는 상점 몫이고, 판은 손이 가리키는 대로 움직인다.
  //
  // 그래서 조작은 둘뿐이다 — 빈 땅 클릭(PC) · 조이스틱과 탭(모바일).
  function place() {
    view.root.position.set(pos.x, scene.topY, pos.z)
    view.root.rotation.y = facing
  }
  place()

  return {
    get position() {
      return { ...pos }
    },

    /**
     * 남이 보내온 위치로 맞춘다(정찰). 내 아바타에는 안 쓴다.
     *
     * 곧장 순간이동시키지 않고 걸어가게 한다 — 위치는 250ms 마다 오는데
     * 그때마다 툭툭 옮기면 남의 아바타만 순간이동하는 것처럼 보인다.
     */
    setTarget(p) {
      target = clampToBounds(p, bounds)
    },

    /** 처음 보일 때는 그 자리에 바로 세운다. 걸어오게 하면 무대 밖에서 들어온다. */
    setPosition(p) {
      pos = clampToBounds(p, bounds)
      target = null
      place()
    },

    /** 땅을 짚었다. 그리로 걸어간다. */
    goTo(clientX, clientY) {
      const g = scene.groundAt(clientX, clientY)
      if (g) target = clampToBounds(g, bounds)
    },

    /**
     * 가상 조이스틱이 낸 방향. 화면 기준 (dx, dy) 를 무대 기준으로 옮긴다.
     *
     * 카메라가 위에서 비스듬히 내려다보므로 화면의 위쪽이 무대의 -z 다.
     * 세로 성분을 그대로 z 로 쓰면 손가락을 위로 올렸는데 아래로 걷는다.
     */
    setStick(dx, dy) {
      stick = dx || dy ? { dx, dz: dy } : null
      if (stick) target = null
    },

    /**
     * 한 프레임. 조이스틱을 잡고 있으면 그쪽이 이긴다 — 걸어가는 중에
     * 손가락을 대면 목적지를 버리고 손이 시키는 대로 간다.
     */
    tick(dt) {
      const before = { ...pos }
      // 조이스틱을 잡고 있으면 그 방향, 아니면 찍어 둔 목적지로 걸어간다.
      const dx = stick ? stick.dx : 0
      const dz = stick ? stick.dz : 0

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

    /** 화면에서 감춘다. 남의 판을 보는 동안 내 아바타가 그 위에 서 있으면 안 된다. */
    setVisible(on) {
      view.root.visible = on
    },

    dispose() {
      view.dispose()
    },
  }
}
