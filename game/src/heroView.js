// 홈의 간판 캐릭터를 살려 둔다.
//
// 정지 초상은 배경만 살아 있고 주인공은 멈춰 있어서 "그려 붙인 것"으로
// 읽힌다. 숨쉬는 idle 하나로 그 인상이 사라진다.
//
// 렌더러를 따로 갖는 이유: 게임 무대(scene3d)의 캔버스는 배치 화면 안에
// 있고 홈에서는 숨겨져 있다. 그걸 홈으로 끌어오면 화면 전환 때마다 캔버스를
// 옮겨 다녀야 한다 — 작은 캔버스 하나가 훨씬 싸다.
//
// **모델은 공유한다.** scene.makeUnit 이 protoCache 를 타므로 여기서 새로
// 받는 파일은 없다.

/**
 * @param {object} o
 * @param {object} o.scene     scene3d 인스턴스 (THREE·makeUnit 을 빌린다)
 * @param {Element} o.mount    캔버스를 넣을 자리
 * @param {string} o.unitId
 * @param {number} o.star
 */
export async function createHeroView({ scene, mount, unitId = 'dragon', star = 3 }) {
  const THREE = scene.THREE

  const view = await scene.makeUnit(unitId, star, 'A')

  const s3 = new THREE.Scene()
  s3.add(view.root)

  // 홈 배경과 같은 조명이다(thumbs 의 'lobby' 프리셋과 같은 값) — 뒤에서
  // 노을이 올라오고 앞은 보라로 약하게 채운다. 값이 갈리면 정지 초상과
  // 살아 있는 모델이 서로 다른 시간대에 서 있게 된다.
  s3.add(new THREE.HemisphereLight(0x8f7ad0, 0x3a2740, 1.5))
  const rim = new THREE.DirectionalLight(0xff9a3c, 3.0)
  rim.position.set(-1.5, 2.2, -4)
  s3.add(rim)
  const fill = new THREE.DirectionalLight(0xc9b6ff, 2.0)
  fill.position.set(2, 1.5, 3)
  s3.add(fill)
  const bounce = new THREE.DirectionalLight(0xff7a3c, 0.9)
  bounce.position.set(0, -2, 2)
  s3.add(bounce)

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.domElement.className = 'hero3d'
  mount.appendChild(renderer.domElement)

  // 모델 크기에 맞춰 카메라를 놓는다. 거리를 박아 두면 유닛을 바꿀 때
  // 예티는 잘리고 고양이는 점이 된다 (thumbs 와 같은 셈).
  function frame() {
    const box = new THREE.Box3().setFromObject(view.root)
    const center = box.getCenter(new THREE.Vector3())
    const radius = box.getSize(new THREE.Vector3()).length() / 2
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)
    camera.position.set(center.x + dist * 0.34, center.y + dist * 0.3, center.z + dist * 0.9)
    camera.lookAt(center)
    camera.updateProjectionMatrix()
  }

  function resize() {
    const w = mount.clientWidth
    const h = mount.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h)
    camera.aspect = w / h
    frame()
  }

  view.play(view.anims.idle)

  // ── 쿡 찔러 보기 ────────────────────────────────────────
  //
  // 눌러서 반응이 오면 "그림"이 아니라 "있는 놈"이 된다. 사각 캔버스 전체가
  // 아니라 **몸을 눌러야** 반응한다 — 빈 하늘을 눌렀는데 움찔하면 뭘 눌렀는지
  // 모른 채로 화면이 반응한 셈이 된다.
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let poking = false

  function poke(ev) {
    if (poking) return
    const r = renderer.domElement.getBoundingClientRect()
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1
    raycaster.setFromCamera(ndc, camera)
    if (!raycaster.intersectObject(view.root, true).length) return
    poking = true
    view.play(view.anims.hit, { loop: false })
    // 클립이 끝나면 스스로 대기로 돌아온다. 길이를 재서 기다리는 이유:
    // finished 이벤트는 믹서에 리스너를 계속 달게 되고, 여기선 한 번이면 된다.
    const clip = view.actions.get(view.anims.hit)?.getClip()
    setTimeout(
      () => {
        view.play(view.anims.idle)
        poking = false
      },
      Math.max(300, (clip?.duration ?? 0.6) * 1000),
    )
  }
  renderer.domElement.addEventListener('pointerdown', poke)

  let raf = 0
  let last = 0
  function tick(now) {
    const dt = Math.min(0.1, (now - (last || now)) / 1000)
    last = now
    view.mixer.update(dt)
    renderer.render(s3, camera)
    raf = requestAnimationFrame(tick)
  }

  resize()
  addEventListener('resize', resize)

  return {
    /** 홈이 열려 있는 동안만 돈다. 매치 중에 계속 그리면 그냥 낭비다. */
    start() {
      if (raf) return
      last = 0
      resize()
      raf = requestAnimationFrame(tick)
    },
    stop() {
      cancelAnimationFrame(raf)
      raf = 0
    },
  }
}
