// 육각 보드 3D 씬. 배치 화면과 전투 리플레이가 **같은 판**을 쓴다.
//
// 여기에는 게임 규칙이 없다. 보드를 세우고, 모델을 얹고, 화면에 맞추는 일만 한다.
// 무엇을 얹을지는 부르는 쪽이 정한다.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { createRng } from '@sim/rng.js'
import { hexSpacing, buildBoard3D } from './board3d.js'

// 육각 한 칸 폭 대비 유닛 바닥 넓이. 1 을 살짝 넘겨야 오토체스처럼
// 말이 판을 채워 보인다 — 작게 잡으면 큰 판에 점이 흩어진 그림이 된다.
const UNIT_FIT = 1.1

// 판 가로 늘이기. **1 = 정육각**.
//
// 화면이 3.2:1 이라 정육각판(화면상 거의 1:1)을 세로에 맞추면 좌우가 남는다.
// 늘리면 폭은 차지만 칸이 눈에 띄게 찌그러진다 — 재 보고 정육각이 낫다고
// 판단했다. 좌우 여백은 물가가 메운다.
// 늘릴 때 말 크기는 딸려가지 않는다 (아래 unitStep) — 칸만 넓어진다.
const STRETCH_X = 1

// 정규화 강도. 1 이면 모든 모델이 **정확히 같은 폭**이 되는데, 그러면 원본이
// 작은 모델일수록 더 크게 늘어나 마법사가 예티만 해진다 (젤리 마법사 원본 1.97 →
// 1.32배 확대, 예티 4.65 → 0.56배 축소). 0 이면 원본 비율 그대로라 편차가 너무 크다.
// 중간값으로 "생물마다 크기가 다르되 판을 벗어나지는 않는" 상태를 만든다.
// 0.55 로 두면 원본이 넓은 탱커가 칸의 1.9배까지 커진다. 0.78 이 균형점 —
// 탱커 평균 2.81, 마법사 2.05 (칸 폭 2.0 기준).
const NORMALIZE = 0.78
// 바닥만 맞추면 용처럼 키 큰 모델이 화면을 뚫는다. 높이 상한을 같이 건다.
// 육각 폭 대비 최대 키. 크게 잡을수록 말이 잘 보이지만, 뒷줄 머리 자리를
// 그만큼 위에 비워야 해서 판이 작아진다. 이 둘의 균형점이다.
const UNIT_MAX_H = 1.75

// 성급별 크기. 모든 모델을 같은 칸 크기로 정규화하므로, 이걸 안 걸면
// 1성 용과 3성 고양이가 똑같이 크다. 성급이 곧 강함이니 크기로 보여야 한다.
// 아바타는 판 위 말보다 조금 작다. 같은 크기면 어느 게 싸우는 말인지 흐려진다.
const AVATAR_SCALE = 0.82

const STAR_SCALE = [0.84, 1, 1.16]

// 성급 색. 오토체스·TFT 관례대로 동 → 은 → 금.
const STAR_COLOR = ['#d99154', '#e6edf5', '#ffd166']

// 화면 어디까지 채울지. 1.0 이면 판이 가장자리에 딱 닿는다.
const FILL = 1.12

// 안개 색. 배경 그라디언트(CSS)의 지평선 색과 맞춰야 먼 타일이 배경에 녹는다.
const FOG = 0x1b2440

// 판 바깥 구성. 판 → 해자(물) → 물가(풀·나무) 순으로 두른다.
// 경계를 물로 끊어야 "여기까지가 전장"이 한눈에 읽힌다.
//
// 띠는 **바깥으로 몇 칸인지**로 센다. 정규화 비율로 나누면 가로세로 칸 크기가
// 달라 한쪽 띠가 통째로 경계 밖으로 밀린다 (해자가 좌우에만 생긴다).
const MOAT_RINGS = 1
const SHORE_RINGS = 3
// 물가를 판보다 낮춰 전장을 고원으로 만든다. 같은 높이면 어디까지가 판인지 흐려진다.
const SHORE_Y = -0.34

export class UnitView {
  constructor(gltf, team, spacing, star = 1, classScale = 1) {
    this.root = new THREE.Group()
    const model = cloneSkinned(gltf.scene)

    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    // 부분 정규화: 기준 크기로 맞추는 배율을 그대로 쓰지 않고 지수로 눌러
    // 원본의 크기 차이를 얼마쯤 남긴다.
    const uniform = (spacing.unitStep * UNIT_FIT) / Math.max(size.x, size.z)
    const shaped = Math.pow(uniform, NORMALIZE)
    const k =
      Math.min(shaped, (spacing.unitStep * UNIT_MAX_H) / size.y) *
      (STAR_SCALE[star - 1] ?? 1) *
      classScale
    model.scale.setScalar(k)
    // 발이 타일 윗면에 닿게 내린다
    model.position.y = -box.min.y * k

    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    this.root.add(model)
    this.model = model
    this.height = size.y * k
    this.team = team

    // B 팀은 반대편을 본다 (보드가 180도 회전 대응이라 방향도 반대)
    this.root.rotation.y = team === 'A' ? 0 : Math.PI

    this.mixer = new THREE.AnimationMixer(model)
    this.actions = new Map()
    for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip))
    this.current = null
  }

  play(name, { loop = true, fade = 0.15 } = {}) {
    const next = this.actions.get(name)
    if (!next || next === this.current) return
    next.reset()
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
    next.clampWhenFinished = !loop
    if (this.current) next.crossFadeFrom(this.current, fade, false)
    next.play()
    this.current = next
  }

  /** 대상 쪽을 본다. 3D 라 좌우 뒤집기가 아니라 실제 회전이다. */
  faceTo(x, z) {
    const dx = x - this.root.position.x
    const dz = z - this.root.position.z
    if (dx * dx + dz * dz < 1e-4) return
    this.root.rotation.y = Math.atan2(dx, dz)
  }

  dispose() {
    this.mixer.stopAllAction()
    // 배지는 유닛마다 캔버스 텍스처를 새로 만든다(makeBadge). 여기서 안 지우면
    // 유닛이 죽거나 판을 새로 그릴 때마다(매 라운드) GPU 텍스처가 쌓인다 —
    // 아이템을 낀 1성도 이제 배지를 갖게 되어 이 누수가 더 자주 일어난다.
    if (this.badge) {
      this.badge.sprite.material.map?.dispose()
      this.badge.sprite.material.dispose()
      this.badge = null
    }
    this.root.removeFromParent()
  }
}

/**
 * 씬을 세운다.
 *
 * pitch 는 카메라가 내려다보는 각도다. 전투는 낮게 눕혀 말이 크게 보이게 하고,
 * 배치는 세워 판 전체가 한눈에 들어오게 한다 — 오토체스·TFT 가 쓰는 구분이다.
 */
export async function createScene({
  mount,
  boardCfg,
  pitchDeg = 42,
  benchSlots = 0,
  // 화면 아래쪽에 비워 둘 픽셀. 정보 줄(확률·골드·연승)이 판 위에 떠 있으므로,
  // 그만큼을 비워 두지 않으면 대기석이 그 밑에 깔린다.
  bottomInset = 0,
  // 화면 위쪽에 비워 둘 픽셀. 라운드 띠가 판 위에 떠 있으므로, 그만큼을
  // 비워 두지 않으면 상대 대기석이 띠 뒤로 들어간다.
  topInset = 0,
  // 직업별 크기 배율. 마법사는 작고 탱커는 크다 — 규칙은 combat.json 이 갖고
  // 여기는 값만 받는다. scene3d 가 유닛 데이터를 알 필요는 없다.
  scaleOf = () => 1,
}) {
  // 배치와 전투는 **같은 판 전체**를 그린다. 배치 때 상대 절반을 숨기면 판이
  // 커지는 대신 "어느 쪽이 내 자리인가"가 안 읽힌다. 대신 배치에서는 내 칸에만
  // 테두리를 켠다 (setBattleMode).
  const scene = new THREE.Scene()
  // 배경은 CSS 그라디언트가 그린다 — 단색 하늘은 판을 허공에 띄운 것처럼 보인다.
  scene.background = null
  scene.fog = new THREE.Fog(FOG, 26, 52)

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // 톤매핑 없이 밝은 직사광을 때리면 밝은 면이 흰색으로 뭉개져
  // 타일이 전부 같은 노랑 한 덩어리로 보인다.
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15

  // 빛. 그림자가 유닛을 판에 붙여준다 — 없으면 떠 보인다.
  scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x2a2438, 1.1))
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.9)
  sun.position.set(-8, 16, 6)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const s = 16
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 60 })
  scene.add(sun)

  // 몬스터 모델은 meshopt 로 압축된 .glb 다 (tools/build-assets.mjs 의 bakeModel).
  // 디코더를 안 붙이면 로더가 EXT_meshopt_compression 을 모른다고 던진다 —
  // 모델이 하나도 안 뜨는 형태로만 드러난다.
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  // 이미지 텍스처 공용 로더. 지형·이펙트가 같이 쓴다.
  const texLoader = new THREE.TextureLoader()

  // ── 육각 보드 ──────────────────────────────────────────────
  const hexProto = (await loader.loadAsync('/assets/hex/hex_grass.gltf')).scene

  // **타일 간격을 상수로 박지 않는다.** 모델의 실제 크기를 재서 유도한다.
  const hexBox = new THREE.Box3().setFromObject(hexProto)
  const spacing = hexSpacing(hexBox.getSize(new THREE.Vector3()))
  // 말 크기·머리 여유·체력바는 **늘이기 전** 칸을 기준으로 잡는다.
  // 늘어난 stepX 를 쓰면 칸을 넓힌 만큼 말도 같이 커져 아무것도 안 바뀐다.
  spacing.unitStep = spacing.stepX
  spacing.stepX *= STRETCH_X
  const board = buildBoard3D(boardCfg, spacing)
  const topY = hexBox.max.y

  const allyRows = new Set(boardCfg.allyRows)

  // 진영당 머티리얼 **하나씩만** 만들어 56칸이 공유한다.
  // 타일마다 clone 하면 같은 재질이 56벌 생겨 드로우콜이 쪼개진다.
  let srcMat = null
  hexProto.traverse((o) => {
    if (o.isMesh && !srcMat) srcMat = o.material
  })
  const dim = (k) => {
    const m = srcMat.clone()
    m.color.multiplyScalar(k)
    return m
  }
  // 물가는 어둡게 눌러 배경으로 보낸다. 전장은 이제 단상이라 대비가 필요하다.
  const matShore = dim(0.42)

  // ── 전장: 직사각 단상 + 희미한 벌집 ────────────────────
  //
  // 칸마다 육각 모델을 놓으면 판이 자갈밭처럼 잘게 부서져 보이고, 대기석과
  // 경계도 흐리다. 대신 **매끈한 직사각 단상**을 깔고 그 위에 벌집을 옅게
  // 그린다 — 오토체스가 쓰는 방식이다. 칸은 정보지 지형이 아니다.
  const arena = {
    minX: Math.min(...board.tiles.map((t) => t.x)) - spacing.stepX * 0.62,
    maxX: Math.max(...board.tiles.map((t) => t.x)) + spacing.stepX * 0.62,
    minZ: Math.min(...board.tiles.map((t) => t.z)) - spacing.stepZ * 0.62,
    maxZ: Math.max(...board.tiles.map((t) => t.z)) + spacing.stepZ * 0.62,
  }
  arena.w = arena.maxX - arena.minX
  arena.d = arena.maxZ - arena.minZ
  arena.cx = (arena.minX + arena.maxX) / 2
  arena.cz = (arena.minZ + arena.maxZ) / 2
  // 교전선. 내 진영 첫 행과 상대 마지막 행 사이.
  const frontZ =
    (Math.min(...board.tiles.filter((t) => allyRows.has(t.row)).map((t) => t.z)) +
      Math.max(...board.tiles.filter((t) => !allyRows.has(t.row)).map((t) => t.z))) /
    2

  const boardGroup = new THREE.Group()
  const SLAB_H = 0.55

  /** 마을 팩 바닥 한 장을 지오메트리·재질로 풀어 온다. 전부 2×2 정사각이다. */
  async function loadFloor(name) {
    const root = (await loader.loadAsync(`/assets/floor/${name}.gltf`)).scene
    let mat = null
    const geom = []
    root.traverse((o) => {
      if (!o.isMesh) return
      if (!mat) mat = o.material
      geom.push(o.geometry)
    })
    return { mat, geom }
  }

  // 돌바닥. 2×2 정사각이라 육각 간격(stepX)과 크기가 같아 격자로 딱 깔린다.
  const floorProto = (await loader.loadAsync('/assets/floor/Floor_UnevenBrick.gltf')).scene
  let floorMat = null
  floorProto.traverse((o) => {
    if (o.isMesh && !floorMat) floorMat = o.material
  })
  // 텍스처를 타일마다 복제하지 않는다 — 재질 하나를 전 칸이 공유한다.
  const floorGeom = []
  floorProto.traverse((o) => {
    if (o.isMesh) floorGeom.push(o.geometry)
  })

  // 칸 수로 나눠 **정확히** 판만 덮는다. ceil 로 깔면 마지막 줄이 판 밖으로
  // 최대 한 칸 넘쳐 대기석 위에 돌이 얹힌다.
  const nx = Math.max(1, Math.round(arena.w / spacing.stepX))
  const nz = Math.max(1, Math.round(arena.d / spacing.stepX))
  const stepXTile = arena.w / nx
  const stepZTile = arena.d / nz
  // 모델은 2×2 다. 칸 크기에 맞춰 늘린다.
  const floorSrc = 2
  const floorGroup = new THREE.Group()
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      for (const g of floorGeom) {
        const t = new THREE.Mesh(g, floorMat)
        t.scale.set(stepXTile / floorSrc, 1, stepZTile / floorSrc)
        t.position.set(
          arena.minX + stepXTile * (ix + 0.5),
          0,
          arena.minZ + stepZTile * (iz + 0.5),
        )
        // 돌리지 않는다. 벽돌 무늬가 불규칙한 타일이라 90도씩 돌리면 칸마다
        // 무늬가 달라 보여 "다른 타일을 주워다 붙인" 그림이 된다.
        // 같은 방향으로 깔면 이음매는 남아도 하나의 바닥으로 읽힌다.
        t.receiveShadow = true
        floorGroup.add(t)
      }
    }
  }
  boardGroup.add(floorGroup)

  // 바닥 아래 받침. 옆에서 보면 판이 종이처럼 얇아 보이는 걸 막는다.
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x4a4438, roughness: 0.95 })
  const base = new THREE.Mesh(new THREE.BoxGeometry(arena.w, SLAB_H, arena.d), baseMat)
  base.position.set(arena.cx, -SLAB_H / 2 - 0.01, arena.cz)
  base.receiveShadow = true
  boardGroup.add(base)

  // 상대 절반을 붉게 덮던 판을 뺐다. 돌바닥 위에서 그냥 싸우는 그림이
  // 맞다 — 어느 쪽이 누구인지는 말의 방향과 체력바 색이 이미 말한다.
  // 교전선. 판 한가운데를 가로지르는 선은 돌바닥을 두 장으로 갈라 보이게 한다 —
  // 그어 두는 대신 경계를 아주 옅게 눌러 이음매로 만든다.
  const seam = new THREE.Mesh(
    new THREE.PlaneGeometry(arena.w, spacing.stepZ * 0.5),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    }),
  )
  seam.rotation.x = -Math.PI / 2
  seam.position.set(arena.cx, 0.013, frontZ)
  boardGroup.add(seam)

  // ── 벌집 표시 ──────────────────────────────────────────
  //
  // 단상 위에 칸을 옅게 긋는다. 상대 절반은 아주 희미하게(어디에 서는지만),
  // 내 절반은 청록으로 또렷하게(내가 놓는 자리니까).
  //
  // 육각의 외접 반지름은 육각 모델에서 뽑는다 — 간격도 거기서 나오므로
  // 같은 출처를 써야 칸과 그림이 어긋나지 않는다.
  const hexR = hexBox.max.z
  const hexRing = (inner, outer) => {
    const shape = new THREE.Shape()
    const hole = new THREE.Path()
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 3
      const [ox, oy] = [Math.cos(a) * outer, Math.sin(a) * outer]
      const [ix, iy] = [Math.cos(a) * inner, Math.sin(a) * inner]
      if (i === 0) {
        shape.moveTo(ox, oy)
        hole.moveTo(ix, iy)
      } else {
        shape.lineTo(ox, oy)
        hole.lineTo(ix, iy)
      }
    }
    shape.closePath()
    hole.closePath()
    shape.holes.push(hole)
    const g = new THREE.ShapeGeometry(shape)
    // Shape 는 XY 평면에 생긴다. 판 위에 눕힌다.
    g.rotateX(-Math.PI / 2)
    // 칸을 가로로 늘였으니 그림도 같은 배율로 늘인다.
    g.scale(STRETCH_X, 1, 1)
    return g
  }

  const ringGeom = hexRing(hexR * 0.72, hexR * 0.97)
  const ringMat = (opacity, color) =>
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      // HUD 성격이다. 씬 톤매핑·안개에 딸려가면 먼 줄의 테두리가 사라진다.
      toneMapped: false,
      fog: false,
    })
  const ringIdle = ringMat(0.8, 0x4de8d8)
  const ringHot = ringMat(0.95, 0x8ffff0)
  const ringSell = ringMat(0.9, 0xff6a52)
  // 사거리는 호박색. 내 진영(청록)·드롭 목표(밝은 청록)와 겹치지 않는 색이어야
  // "여긴 내 자리" 와 "여기까지 닿는다" 가 안 섞인다.
  const ringRange = ringMat(0.85, 0xffb84d)

  // 테두리는 **모든 칸**에 만든다. 사거리는 상대 진영까지 뻗으므로 내 절반에만
  // 있으면 원거리 유닛의 실제 도달 범위를 보여줄 수 없다.
  // 평소에는 내 칸만 보이고 상대 칸 테두리는 숨어 있다.
  // 칸 표시는 **내가 놓을 수 있는 자리**를 알려주는 도구다.
  //  - 배치: 내 절반만 그린다. 상대 절반은 놓을 수 없으니 그릴 이유가 없다
  //  - 전투: 둘 다 끈다. 이제 놓을 게 없고, 격자가 말과 겹쳐 어지럽다
  // 메시는 전 칸에 만들어 둔다 — 사거리 표시가 상대 진영까지 뻗기 때문이다.
  const ringNodes = []
  for (const t of board.tiles) {
    const ring = new THREE.Mesh(ringGeom, ringIdle)
    ring.position.set(t.x, 0.02, t.z)
    ring.visible = allyRows.has(t.row)
    boardGroup.add(ring)
    ringNodes.push(ring)
  }

  scene.add(boardGroup)

  // ── 판 바깥: 해자와 물가 ────────────────────────────────
  //
  // 판만 덩그러니 놓으면 허공에 뜬 격자로 보인다. 물로 한 바퀴 끊고 그 밖에
  // 풀·나무를 두르면 "물 위의 투기장"이 되고, 어디까지가 전장인지도 분명해진다.
  //
  // 장식 위치는 시드 고정 난수로 정한다 — 새로고침마다 나무가 옮겨 다니면
  // 같은 판이 다른 장소처럼 보인다.
  const manifestJson = await (await fetch('/assets/manifest.json')).json()
  const waterProto = (await loader.loadAsync('/assets/hex/hex_water.gltf')).scene
  const decorBy = { water: [], land: [] }
  await Promise.all(
    ['water', 'land'].map(async (group) => {
      const list = await Promise.all(
        manifestJson.decor[group].map((f) => loader.loadAsync('/assets/decor/' + f)),
      )
      decorBy[group] = list.map((g) => g.scene)
    }),
  )

  // 바깥 타일도 **판과 똑같은 격자** 위에 놓여야 벌집이 맞물린다.
  // 중앙정렬 값을 손으로 다시 계산하면 board3d 와 반 칸 어긋난다 —
  // 실제 타일 하나에서 거꾸로 뽑아 쓴다.
  const offsets = boardCfg.rowOffset
  const offAt = (r) => offsets[((r % offsets.length) + offsets.length) % offsets.length] ?? 0
  const t0 = board.tiles[0]
  const midCol = t0.col + offAt(t0.row) - t0.x / spacing.stepX
  const midRow = t0.row - t0.z / spacing.stepZ
  const latticeX = (r, c) => (c + offAt(r) - midCol) * spacing.stepX
  const latticeZ = (r) => (r - midRow) * spacing.stepZ

  // 정규화 기준은 **그린 타일의 실제 범위**다. 배치 화면처럼 절반만 그릴 때
  // 판 전체로 재면 해자가 내 진영에서 한참 떨어진 곳에 생긴다.
  const bx = [arena.minX, arena.maxX]
  const bz = [arena.minZ, arena.maxZ]
  const cx = arena.cx
  const cz = arena.cz
  // 반지름은 **타일 중심까지**로 잰다. 반 칸을 더해두면 바로 바깥 칸이
  // 0.5링으로 계산되어 띠 경계가 반 칸씩 어긋난다.
  const rx = (bx[1] - bx[0]) / 2
  const rz = (bz[1] - bz[0]) / 2

  /** 판 바깥으로 몇 칸 떨어졌는지. 0 이면 판 안. */
  const ringOf = (x, z) =>
    Math.max(
      Math.max(0, Math.abs(x - cx) - rx) / spacing.stepX,
      Math.max(0, Math.abs(z - cz) - rz) / spacing.stepZ,
    )

  // ── 판 바깥 ────────────────────────────────────────────
  //
  // 전에는 바깥에도 **육각 타일**을 깔았다. 판은 직사각 돌바닥인데 주변만
  // 벌집이라 "왜 여기만 격자지"가 남고, 그 격자가 시선을 끌어 정작 봐야 할
  // 판과 경쟁했다. 격자는 **판만** 갖는다.
  //
  // 대신 세 겹: 넓은 잔디 평면 → 판을 두르는 물띠 → 무리 지은 나무·바위.
  const decorRng = createRng(0x5eed)
  const surroundGroup = new THREE.Group()
  surroundGroup.name = 'surround'

  // 바깥 반경. 카메라가 담는 것보다 넉넉히 잡아 가장자리가 안개에 녹게 둔다.
  const OUT_X = arena.w * 5.5
  const OUT_Z = arena.d * 5.5

  // 잔디 평면 한 장. 타일 수백 개 대신 하나라 드로우콜도 하나다.
  //
  // 단색이면 종이를 깐 것처럼 보인다. 회색 노이즈를 곱해 얼룩을 만든다 —
  // 텍스처는 무채색 한 장이고 색은 여기서 입힌다. 반복을 크게 잡아야
  // 구름 무늬가 뭉치지 않고 잔디처럼 잘게 흩어진다.
  const groundTex = texLoader.load('/assets/terrain/noise.webp')
  groundTex.colorSpace = THREE.SRGBColorSpace
  groundTex.wrapS = THREE.RepeatWrapping
  groundTex.wrapT = THREE.RepeatWrapping
  groundTex.repeat.set(18, 18)
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    // 채도가 높으면 회색 돌마당이 그 위에 붕 뜬다. 한 단계 죽인 풀색.
    color: 0x74884c,
    roughness: 1,
  })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(OUT_X, OUT_Z), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.set(arena.cx, SHORE_Y, arena.cz)
  ground.receiveShadow = true
  surroundGroup.add(ground)

  // 물띠는 걷어냈다. 판이 바닥보다 한 단 높아(SLAB_H) 옆면이 그림자와 함께
  // 경계를 만든다 — 물까지 두르면 테두리가 두 겹이라 판이 액자에 갇힌다.
  const MOAT_W = spacing.stepX * 0.9

  // 울타리가 두르는 **마당**. 이 안은 전부 돌이고 나무는 안 자란다 —
  // 울타리 안에 숲이 있으면 마당이 아니라 그냥 들판이다.
  // 울타리를 세우는 쪽(랜드마크)도 같은 값을 써야 돌 경계와 울타리가 맞물린다.
  // 좌우는 **판** 끝을 기준으로, 앞뒤는 **대기석** 끝을 기준으로 잰다.
  // 둘 다 판 기준으로 재면 대기석이 앞뒤 여백을 2칸쯤 먹어, 옆은 2칸 여유인데
  // 앞뒤는 0.7칸만 남아 울타리가 대기석에 붙어 보인다 (실측 화면 16px).
  //
  // 대기석 깊이는 벤치 블록이 정하지만 여기서 먼저 필요하므로 같은 식으로 잰다:
  //   칸(0.74) + 틈(0.1)×1.5 + 반 칸 = 판 끝에서 약 1.3칸.
  const BENCH_OUT = spacing.stepZ * 1.3
  // 랜드마크(집·천막)가 **마당 안**에 서야 하므로 그만큼 자리를 준다.
  // 좁으면 집이 판이나 대기석에 붙어 말을 가린다.
  const PLAZA_X = arena.w / 2 + spacing.stepX * 3.4
  const PLAZA_Z = arena.d / 2 + BENCH_OUT + spacing.stepZ * 2.6
  /** 울타리 안인가. 나무·랜드마크가 여기 들어오면 안 된다. */
  const inPlaza = (x, z, pad = 0) =>
    Math.abs(x - arena.cx) <= PLAZA_X + pad && Math.abs(z - arena.cz) <= PLAZA_Z + pad
  // 돌이 **실제로** 끝나는 선. PLAZA 는 상한일 뿐이다 — 격자가 칸 단위로
  // 떨어지므로 마지막 타일은 PLAZA 보다 한참 안쪽에서 끝날 수 있다 (실측
  // 0.7 차이). 반드시 깔린 타일에서 잰 값만 쓴다.
  // 마당 돌 재질. 무대 스킨이 판만 물들이면 판 안쪽만 색이 바뀌어
  // 반쯤 칠하다 만 그림이 된다 — 마당도 같이 물들어야 한 무대로 읽힌다.
  const apronRefs = []
  let stoneEdgeX = 0
  let stoneEdgeZ = 0

  // 판을 두르는 **돌 앞마당**.
  //
  // 잔디가 돌바닥에 곧장 닿으면 판이 들판에 얹힌 판때기처럼 보인다. 전장과
  // 같은 팩의 벽돌을 둘러 돌이 잔디로 번지게 한다.
  //
  // 다만 **꽉 찬 직사각으로 깔면 안 된다** — 밝은 벽돌 액자가 하나 더 생겨
  // 판이 두 겹 테두리에 갇힌다. 바깥으로 갈수록 확률을 떨어뜨려 돌이 잔디에
  // 녹아 없어지게 한다. 가장자리가 들쭉날쭉해야 "닳은 바깥마당"으로 읽힌다.
  const apronTiles = []
  {
    // 벽돌 한 종류로 깔면 같은 무늬가 격자로 반복돼 인쇄물처럼 보인다.
    // 두 가지를 섞는다 — 하나는 판과 **같은 돌**이라 마당이 판의 연장으로 읽힌다.
    const apronSets = [await loadFloor('Floor_Brick'), await loadFloor('Floor_UnevenBrick')]
    // 판보다 **뚜렷하게** 어둡게. 0.55 로는 판 자체가 이미 어두워서 차이가
    // 안 읽혔다 — 밝은 전장 / 어두운 마당 / 잔디 세 단계가 보여야 한다.
    const apronMats = apronSets.map((set) => {
      const mat = set.mat.clone()
      mat.color.multiplyScalar(0.42)
      apronRefs.push(mat)
      return mat
    })

    // 마당이 판 밖으로 몇 칸까지 가는지. 울타리(PLAZA)를 덮고도 남게 잡는다 —
    // 모자라면 마당 구석이 잔디로 뚫린다.
    const RINGS = Math.ceil(Math.max(PLAZA_X - arena.w / 2, PLAZA_Z - arena.d / 2) / spacing.stepX) + 1
    const step = spacing.stepX
    const inX = arena.w / 2
    const inZ = arena.d / 2
    const w = arena.w + step * RINGS * 2
    const d = arena.d + step * RINGS * 2
    const nxA = Math.max(1, Math.round(w / step))
    const nzA = Math.max(1, Math.round(d / step))
    const sxA = w / nxA
    const szA = d / nzA

    for (let ix = 0; ix < nxA; ix++) {
      for (let iz = 0; iz < nzA; iz++) {
        const x = arena.cx - w / 2 + sxA * (ix + 0.5)
        const z = arena.cz - d / 2 + szA * (iz + 0.5)
        // 판이 덮는 자리는 건너뛴다 — 두 겹이 겹치면 z-파이팅이 난다.
        if (Math.abs(x - arena.cx) < inX && Math.abs(z - arena.cz) < inZ) continue

        // 판에서 몇 칸 떨어졌나.
        const outX = Math.max(0, Math.abs(x - arena.cx) - inX) / step
        const outZ = Math.max(0, Math.abs(z - arena.cz) - inZ) / step
        const out = Math.max(outX, outZ)

        // 돌은 **울타리 안에서 끝난다.** 밖으로 흘려 보면 울타리 너머에 돌이
        // 남아 "울타리가 무엇을 두르는지"가 흐려진다. 경계는 울타리가 긋는다.
        if (!inPlaza(x, z)) continue
        stoneEdgeX = Math.max(stoneEdgeX, Math.abs(x - arena.cx) + sxA / 2)
        stoneEdgeZ = Math.max(stoneEdgeZ, Math.abs(z - arena.cz) + szA / 2)

        // 판에 가까울수록 판과 같은 돌을 많이 섞는다 — 마당이 판에서 번져
        // 나온 것처럼 이어진다.
        const pickIdx = decorRng.int(100) < Math.round(70 - out * 22) ? 1 : 0
        for (const geo of apronSets[pickIdx].geom) {
          const t = new THREE.Mesh(geo, apronMats[pickIdx])
          t.scale.set(sxA / 2, 1, szA / 2)
          // 칸마다 아주 조금 높이를 흔든다. 완전히 평평하면 인쇄물처럼 보인다.
          t.position.set(x, SHORE_Y + 0.02 + (decorRng.int(3) - 1) * 0.008, z)
          // 90도 단위로 돌려 같은 무늬가 줄지어 서는 것만 막는다. 판 위에서는
          // 이게 역효과였지만(무늬가 불규칙해 칸마다 달라 보였다), 마당은
          // 성기게 깔려 줄이 안 보이므로 여기서는 반복을 깨는 쪽이 낫다.
          t.rotation.y = (decorRng.int(4) * Math.PI) / 2
          t.receiveShadow = true
          surroundGroup.add(t)
        }
        apronTiles.push({ x, z, out })
      }
    }
  }

  // 돌과 잔디가 만나는 자리에 풀·자갈을 얹어 이음매를 흐린다.
  // 선이 남아 있으면 아무리 성글게 깔아도 "붙여 놓은 판"으로 보인다.
  {
    const tufts = [...(decorBy.water ?? [])]
    if (tufts.length > 0 && apronTiles.length > 0) {
      for (const tile of apronTiles) {
        // 바깥쪽 칸일수록 풀이 많다 — 돌이 잔디에 먹히는 순서다.
        // 마당 안은 쓸어 놓은 자리라 거의 없다 (돌 틈 잡초 정도).
        const chance = inPlaza(tile.x, tile.z) ? 5 : 22 + tile.out * 34
        if (decorRng.int(100) >= chance) continue
        const o = tufts[decorRng.int(tufts.length)].clone(true)
        o.position.set(
          tile.x + (decorRng.int(1000) / 1000 - 0.5) * spacing.stepX * 0.7,
          SHORE_Y + 0.03,
          tile.z + (decorRng.int(1000) / 1000 - 0.5) * spacing.stepZ * 0.7,
        )
        o.rotation.y = (decorRng.int(360) * Math.PI) / 180
        o.scale.setScalar(0.5 + decorRng.int(40) / 100)
        o.traverse((n) => {
          if (n.isMesh) n.receiveShadow = true
        })
        o.userData.decor = true
        surroundGroup.add(o)
      }
    }
  }

  /**
   * 나무·바위를 무리 지어 심는다.
   *
   * 칸마다 확률로 하나씩 놓으면 균일하게 흩뿌려져 "배경"이 아니라 "격자에
   * 얹은 장식"으로 보인다. 씨앗 몇 개를 두고 그 둘레에 모으면 숲처럼 뭉친다.
   * 판에서 멀수록 크게 — 가까운 것이 작아야 원근이 생기고 판을 안 가린다.
   */
  {
    const pool = decorBy.land
    const near = decorBy.water
    if (pool.length > 0) {
      const CLUMPS = 44
      const halfX = arena.w / 2 + MOAT_W
      const halfZ = arena.d / 2 + MOAT_W
      for (let i = 0; i < CLUMPS; i++) {
        // 씨앗 하나 = 무리 하나. 판 둘레 띠 안에서 고른다.
        const side = decorRng.int(4)
        const along = (decorRng.int(2000) / 1000 - 1) * 1.25
        const out = 0.25 + decorRng.int(1000) / 1000
        const sx = side < 2 ? along * halfX * 1.3 : (side === 2 ? -1 : 1) * (halfX + out * arena.w * 0.5)
        const sz = side < 2 ? (side === 0 ? -1 : 1) * (halfZ + out * arena.d * 0.4) : along * halfZ * 1.3
        const count = 2 + decorRng.int(4)
        for (let k = 0; k < count; k++) {
          const d = pool[decorRng.int(pool.length)].clone(true)
          const jx = (decorRng.int(2000) / 1000 - 1) * spacing.stepX * 1.1
          const jz = (decorRng.int(2000) / 1000 - 1) * spacing.stepZ * 1.1
          const x = arena.cx + sx + jx
          const z = arena.cz + sz + jz
          // 울타리 안에는 안 심는다 — 마당에 숲이 자라면 마당이 아니다.
          // 울타리 **바로 바깥**도 비운다. 딱 붙여 심으면 가지가 울타리를 뚫는다.
          if (inPlaza(x, z, spacing.stepX * 0.9)) continue
          d.position.set(x, SHORE_Y, z)
          d.rotation.y = (decorRng.int(360) * Math.PI) / 180
          // 멀수록 크게. 가까운 것이 작아야 판을 안 가린다.
          const far = Math.max(
            Math.abs(x - arena.cx) / halfX,
            Math.abs(z - arena.cz) / halfZ,
          )
          d.scale.setScalar(0.75 + Math.min(1.4, far) * 0.75)
          d.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true
              o.receiveShadow = true
            }
          })
          d.userData.decor = true
          surroundGroup.add(d)
        }
      }
    }

  }

  scene.add(surroundGroup)

  // ── 벤치 단상 ──────────────────────────────────────────
  //
  // 판 앞에 **네모 칸**으로 깐다. 육각은 전장, 네모는 대기석 — 모양만으로
  // 둘이 갈린다. DOM 아이콘 줄로 두면 3D 말과 2D 칸이 따로 놀아서
  // "같은 말을 판에 올린다"는 느낌이 안 산다.
  const benchPads = []
  const enemyBenchPads = []
  let benchGroup = null
  let benchTopY = 0
  // 벤치가 판보다 넓다 (9칸 > 7칸). 프레이밍이 이 범위를 알아야 양 끝이 안 잘린다.
  let benchExtent = null
  // 아이템 선반이 차지한 자리. 풀·자갈을 뿌릴 때 이 위는 비운다 —
  // 나무 선반 위에 잔디가 자라면 판이 아니라 들판으로 읽힌다.
  let shelfArea = null
  // 가진 아이템(아직 안 낀 것) 선반. 대기석 왼쪽에 세운다 — DOM 아이콘 줄로
  // 두면 3D 말과 2D 줄이 따로 놀아 "같은 세계"로 안 읽힌다. 벤치를 3D로
  // 세운 것과 같은 이유다. 슬롯은 고정 7개(런이 가질 수 있는 최대치)를
  // 미리 세워 두고 setItemShelf 가 채운다 — 개수가 바뀔 때마다 선반 자체를
  // 다시 세우면 그때마다 카메라 프레임이 흔들린다.
  const itemShelfSlots = []
  if (benchSlots > 0) {
    const pad = spacing.stepX * 0.74
    const gap = spacing.stepX * 0.1
    const pitchStep = pad + gap
    const totalW = benchSlots * pitchStep - gap
    // 판 앞 해자 위에 걸치는 선착장. 전장(0)보다 낮고 물가(-0.34)보다 높다.
    const deckY = -0.16
    // 단상 **바깥**에 놓는다. 판 가장자리(bz[1])에서 대기석 반쪽 깊이만큼
    // 더 밀어야 두 판이 안 겹친다 — 겹치면 어디까지가 전장인지 흐려진다.
    const deckZ = bz[1] + pad / 2 + gap * 1.5
    benchTopY = deckY

    benchGroup = new THREE.Group()

    // 대기석도 **마을 팩 널빤지**로 깐다. 전에는 단색 상자를 세워 뒀는데,
    // 판은 텍스처가 있는 돌바닥이라 옆에 놓이면 대기석만 무늬 없는 판때기로
    // 보였다. 칸은 밝은 나무, 받침은 어두운 나무 — 같은 팩이라 결이 맞는다.
    const woodLight = await loadFloor('Floor_WoodLight')
    const woodDark = await loadFloor('Floor_WoodDark')
    const FLOOR_SRC = 2

    /**
     * 널빤지 한 칸. 2×2 원본을 원하는 크기로 눌러 놓는다.
     *
     * 재질은 칸마다 복제한다. 공유하면 한 칸을 밝힐 때 아홉 칸이 같이 밝아진다 —
     * 드롭 목표 표시가 통째로 켜져 어디에 놓이는지가 안 읽힌다.
     */
    function plank({ set, x, z, w, d, y, dim = 1 }) {
      const g = new THREE.Group()
      const mat = set.mat.clone()
      mat.color.multiplyScalar(dim)
      const base = mat.color.clone()
      for (const geo of set.geom) {
        const t = new THREE.Mesh(geo, mat)
        t.scale.set(w / FLOOR_SRC, 1, d / FLOOR_SRC)
        t.receiveShadow = true
        g.add(t)
      }
      g.position.set(x, y, z)
      // 칸을 밝히는 손잡이. null 이면 원래 색으로 돌린다.
      g.userData.tint = (hex) => {
        if (hex === null) mat.color.copy(base)
        else mat.color.setHex(hex)
      }
      return g
    }

    /** 받침 + 칸 아홉. 내 쪽과 상대 쪽이 같은 함수를 쓴다. */
    function buildDeck(z, { dim, pads }) {
      // 받침은 한 장으로 깐다 — 칸마다 받침을 두면 이음매가 아홉 줄이 된다.
      benchGroup.add(
        plank({
          set: woodDark,
          x: cx,
          z,
          w: totalW + gap * 2,
          d: pad + gap * 2.4,
          y: deckY - 0.06,
          dim,
        }),
      )
      for (let i = 0; i < benchSlots; i++) {
        // 180도 회전 대응이라 상대 벤치는 좌우가 뒤집힌다.
        const x =
          pads === benchPads
            ? cx - totalW / 2 + pad / 2 + i * pitchStep
            : cx + totalW / 2 - pad / 2 - i * pitchStep
        const tile = plank({ set: woodLight, x, z, w: pad, d: pad, y: deckY, dim })
        tile.userData.benchIndex = i
        benchGroup.add(tile)
        pads.push(tile)
      }
    }

    const farZ = bz[0] - pad / 2 - gap * 1.5
    buildDeck(deckZ, { dim: 1, pads: benchPads })
    // 상대 대기석은 눌러 둔다 — 여긴 집을 수 없는 자리다.
    buildDeck(farZ, { dim: 0.62, pads: enemyBenchPads })
    scene.add(benchGroup)
    // 물가 장식은 대기석보다 **먼저** 뿌려진다 (자리를 아직 모르므로).
    // 대기석이 앉을 자리에 걸친 것만 여기서 걷어낸다 — 안 그러면 널빤지 위에
    // 꽃이 피어 있다.
    // 널빤지 폭(totalW + gap*2)에 장식 한 칸을 더한 만큼 비운다. 딱 맞춰
    // 자르면 끝자리 장식이 널빤지 모서리에 반쯤 걸쳐 남는다.
    const deckPad = pad
    for (const d of [...surroundGroup.children]) {
      if (!d.userData.decor) continue
      const inX = Math.abs(d.position.x - cx) <= totalW / 2 + deckPad
      const nearNear = Math.abs(d.position.z - deckZ) <= pad / 2 + deckPad
      const nearFar = Math.abs(d.position.z - farZ) <= pad / 2 + deckPad
      if (inX && (nearNear || nearFar)) surroundGroup.remove(d)
    }
    benchExtent = {
      minX: cx - totalW / 2 - gap,
      maxX: cx + totalW / 2 + gap,
      minZ: farZ - pad / 2 - gap,
      maxZ: deckZ + pad / 2 + gap,
    }

    // ── 아이템 선반 ────────────────────────────────────────
    //
    // 대기석 **왼쪽**에 붙인다. 받침은 대기석과 같은 2단(어두운 나무 +
    // 밝은 나무) 구성을 그대로 써서 한 세트로 읽히게 한다.
    //
    // z 는 대기석 줄(deckZ)보다 판 쪽으로 당긴다. 같은 줄에 두면 화면
    // 아래쪽 끝에 붙어 하단 HUD(확률표)와 겹치는 폭이 생긴다 — 폭이
    // 700~1040 사이에서 변하므로 어떤 폭에서는 겹치고 어떤 폭에서는 안
    // 겹치는, 재현이 어려운 종류의 겹침이다. 한 칸 앞으로 당겨 아예 그
    // 띠를 벗어난다.
    {
      const ITEM_COLS = 4
      const ITEM_ROWS = 2
      // 대기석 칸(pad)보다 좁힌다 — 서 있는 말이 아니라 누운 아이콘 하나라
      // 그만큼 자리를 덜 먹는다.
      const iPitch = spacing.stepX * 0.55
      const iconW = spacing.stepX * 0.4
      const gridW = ITEM_COLS * iPitch
      const gridD = ITEM_ROWS * iPitch
      // 대기석과 살짝 띄운다 — 붙이면 대기석 마지막 칸과 선반 첫 칸이
      // 하나의 긴 줄로 읽혀 어디까지가 벤치이고 어디부터가 선반인지 안 갈린다.
      const shelfGap = spacing.stepX * 0.35
      const shelfCx = benchExtent.minX - shelfGap - gridW / 2
      // 대기석 줄에서 판 쪽으로 한 칸 당긴 자리. 하단 HUD 띠를 벗어난다.
      const shelfZ = deckZ - iPitch * 0.9

      benchGroup.add(
        plank({
          set: woodDark,
          x: shelfCx,
          z: shelfZ,
          w: gridW + gap * 2,
          d: gridD + gap * 2,
          y: deckY - 0.06,
        }),
      )
      benchGroup.add(
        plank({ set: woodLight, x: shelfCx, z: shelfZ, w: gridW, d: gridD, y: deckY }),
      )

      // 슬롯 7개 — 런이 가질 수 있는 아이템 최대치와 같다(4×2 칸에서 마지막
      // 한 칸만 비워 둔다). 재질만 만들어 두고 아이콘 이미지는 setItemShelf 가
      // 채운다 — 프리로드된 이미지가 이 시점엔 아직 없을 수 있다.
      for (let i = 0; i < 7; i++) {
        const col = i % ITEM_COLS
        const row = Math.floor(i / ITEM_COLS)
        const x = shelfCx + (col - (ITEM_COLS - 1) / 2) * iPitch
        const z = shelfZ + (row - (ITEM_ROWS - 1) / 2) * iPitch
        const mat = new THREE.SpriteMaterial({
          transparent: true,
          depthWrite: false,
          // 16px 픽셀아트라 씬 톤매핑을 태우면 색이 눌린다 — 배지와 같은 이유.
          toneMapped: false,
          fog: false,
        })
        const sprite = new THREE.Sprite(mat)
        // 바닥 앵커. 기본(중심) 앵커면 스프라이트 절반이 널빤지 아래로
        // 박힌다 — depthTest 가 켜져 있어(z-파이팅 방지용 depthWrite:false와
        // 별개) 널빤지가 그 아랫부분을 가려 아이콘이 위쪽 절반만 남은 채
        // 잘려 보였다. makeBadge 가 같은 이유로 center(0.5,0) 바닥 앵커를
        // 쓴다 — 여기도 같은 규칙을 따른다.
        sprite.center.set(0.5, 0)
        // plank() 는 y 인자를 널빤지 그룹의 원점으로 쓰고, 실제 렌더링
        // 윗면은 거기서 0.08 위다 (benchSpot() 이 유닛 발을 놓을 때 쓰는
        // 값과 같은 상수 — 같은 팩의 같은 두께다). 그 위에 살짝만 더 띄워
        // 널빤지에 박히지도, 눈에 띄게 뜨지도 않게 한다.
        sprite.position.set(x, deckY + 0.08 + 0.02, z)
        sprite.scale.set(iconW, iconW, 1)
        sprite.visible = false
        sprite.userData.invIndex = i
        benchGroup.add(sprite)
        itemShelfSlots.push(sprite)
      }

      // 물가 장식이 이 자리에 걸쳐 있으면 나무 위에 아이템이 얹힌 꼴이 된다 —
      // 대기석 자리를 비울 때와 같은 이유로 여기도 걷어낸다.
      for (const d of [...surroundGroup.children]) {
        if (!d.userData.decor) continue
        const inX = Math.abs(d.position.x - shelfCx) <= gridW / 2 + gap
        const inZ = Math.abs(d.position.z - shelfZ) <= gridD / 2 + gap
        if (inX && inZ) surroundGroup.remove(d)
      }

      // 선반이 대기석보다 왼쪽으로 더 나간 만큼, 프레이밍이 쓰는 범위도
      // 넓혀야 화면 가장자리에서 잘리지 않는다 — benchExtent 가 정확히
      // 그 용도로 있다 (주석: "프레이밍이 이 범위를 알아야 양 끝이 안 잘린다").
      shelfArea = {
        minX: shelfCx - gridW / 2 - gap,
        maxX: shelfCx + gridW / 2 + gap,
        minZ: shelfZ - gridD / 2 - gap,
        maxZ: shelfZ + gridD / 2 + gap,
      }
      benchExtent.minX = Math.min(benchExtent.minX, shelfCx - gridW / 2 - gap)
      benchExtent.minZ = Math.min(benchExtent.minZ, shelfZ - gridD / 2 - gap)
      benchExtent.maxZ = Math.max(benchExtent.maxZ, shelfZ + gridD / 2 + gap)
    }
  }

  // ── 랜드마크 ───────────────────────────────────────────
  //
  // 여기까지는 "들판에 놓인 돌판"이었다. 장소가 없으면 매 라운드 같은 빈
  // 벌판에서 싸우는 그림이라 기억에 안 남는다.
  //
  // 배치 규칙 셋:
  //   - 판과 대기석 위에는 아무것도 안 세운다 (말이 가려진다)
  //   - 진영색을 나눈다 — 내 뒤는 파랑, 상대 뒤는 빨강. 판 색 없이도 읽힌다
  //   - 카메라가 담는 띠에만 세운다. 뒤로 더 가면 안개에 묻혀 값만 버린다
  {
    const mk = manifestJson.landmark ?? {}
    const load = async (group) =>
      Promise.all((mk[group] ?? []).map((f) => loader.loadAsync('/assets/landmark/' + f)))
    const [ally, foe, neutral, side, props] = await Promise.all([
      load('ally'),
      load('foe'),
      load('neutral'),
      load('side'),
      load('props'),
    ])
    const pick = (list, i) => (list.length > 0 ? list[i % list.length].scene : null)

    const markGroup = new THREE.Group()
    // 이름을 붙여 둔다 — 씬을 뒤질 때 어느 묶음인지 바로 찾는다.
    markGroup.name = 'landmarks'
    const rng = createRng(0xb00c)

    /**
     * 하나 세운다. **마당 안**(돌 위)에만 선다.
     *
     * 잔디에 세우면 집이 들판에 홀로 서 있는 그림이고, 울타리 밖이면
     * 마당과 상관없는 배경이 된다. 판·대기석과 겹치는 것만 걸러 낸다.
     */
    function place(proto, x, z, { scale = 1, faceIn = true } = {}) {
      if (!proto) return
      // 마당 밖이면 버린다 — 돌이 거기서 끝나므로 설 자리가 없다.
      if (!inPlaza(x, z, -spacing.stepX * 1.2)) return
      const clear = benchExtent
      if (
        clear &&
        x > clear.minX - spacing.stepX &&
        x < clear.maxX + spacing.stepX &&
        z > clear.minZ - spacing.stepZ * 0.8 &&
        z < clear.maxZ + spacing.stepZ * 0.8
      ) {
        return
      }
      const o = proto.clone(true)
      o.position.set(x, SHORE_Y, z)
      // 판을 바라보게 돌린다. 집이 등을 지고 서 있으면 배경이 아니라 잡동사니다.
      o.rotation.y = faceIn ? Math.atan2(arena.cx - x, arena.cz - z) : (rng.int(360) * Math.PI) / 180
      o.scale.setScalar(scale)
      o.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true
          n.receiveShadow = true
        }
      })
      markGroup.add(o)
    }

    const halfX = arena.w / 2
    const halfZ = arena.d / 2
    // 대기석 바깥 ~ 울타리 안쪽 사이. 정가운데에 놓으면 건물 폭 때문에 울타리에
    // 닿으므로 판 쪽으로 당겨 놓는다 (0.5 → 0.38).
    const mid = (inner, outer) => inner + (outer - inner) * 0.38
    const outZ = mid(halfZ + BENCH_OUT, PLAZA_Z)
    const outX = mid(halfX, PLAZA_X)

    // 이 팩의 모델은 육각 한 칸(약 1)을 기준으로 만들어졌는데 우리 칸은 그
    // 두 배쯤이다. 그대로 두면 집이 통보다 작아 배경으로 안 읽힌다.
    const KIT = spacing.unitStep / 1.0

    // 상대 뒤(먼 쪽)는 대기석 바깥 띠에 그대로 세운다 — 화면 위쪽에 잘 보인다.
    place(pick(foe, 0), arena.cx + halfX * 0.6, arena.cz - outZ, { scale: KIT * 1.2 })
    place(pick(foe, 1), arena.cx - halfX * 0.55, arena.cz - outZ, { scale: KIT * 1.05 })
    // 내 뒤는 사정이 다르다. 같은 자리(z = +outZ)에 세우면 **하단 UI 아래로
    // 완전히 내려가** 한 픽셀도 안 보인다. 화면에 남는 아래 두 모서리로 뺀다.
    const nearZ = arena.cz + halfZ * 0.9
    place(pick(ally, 0), arena.cx - outX - spacing.stepX * 0.5, nearZ, { scale: KIT * 1.2 })
    place(pick(ally, 1), arena.cx + outX + spacing.stepX * 0.5, nearZ, { scale: KIT * 1.05 })

    // 좌우는 화면에 가장 크게 걸리는 자리다. 색이 다른 집을 하나씩 세워
    // 양쪽이 대칭으로 안 보이게 한다.
    place(pick(side, 0), arena.cx - outX, arena.cz - halfZ * 0.35, { scale: KIT * 1.3 })
    place(pick(side, 1), arena.cx + outX, arena.cz + halfZ * 0.3, { scale: KIT * 1.3 })

    // 울타리. **사방을 두른다.**
    //
    // 좌우만 세웠더니 마당이 두 면만 막힌 채 앞뒤로 그냥 잘려 나갔고, 돌 마당의
    // 앞뒤 경계가 자로 그은 직선인데 그걸 설명하는 게 아무것도 없었다.
    // 네 면을 다 두르면 그 선이 전부 울타리 때문이 된다.
    const fence = pick(neutral, 1) ?? pick(neutral, 2)
    if (fence) {
      const fScale = KIT * 1.15
      // 이 모델은 **피벗이 중심에 없다** — 실측하면 메시가 피벗에서 로컬
      // -x 로 약 1 단위 밀려 있다. 그대로 세우면 좌우 울타리가 둘 다 세계
      // 왼쪽으로 2 이상 밀린다(왼쪽은 잔디로, 오른쪽은 마당 안으로).
      // 하드코딩 대신 바운딩박스로 재서 중심 오프셋을 보정한다.
      const fbox = new THREE.Box3().setFromObject(fence)
      const fctr = fbox.getCenter(new THREE.Vector3())
      // 긴 축은 로컬 z. 세그먼트 길이도 실측에서 얻는다.
      const segLen = (fbox.max.z - fbox.min.z) * fScale
      // 돌이 실제로 끝나는 선에 세운다. PLAZA 값으로 세우면 가장 바깥 타일이
      // 반 칸 더 나가 울타리 밖에 돌 띠가 남는다. 살짝(0.12) 안쪽으로 들여
      // 기둥이 온전히 돌 위에 서게 한다.
      const fx = (stoneEdgeX || PLAZA_X) - 0.12
      const fz = (stoneEdgeZ || PLAZA_Z) - 0.12

      const addFence = (x, z, rotY) => {
        const o = fence.clone(true)
        // 피벗 오프셋을 회전에 맞춰 되돌려, 메시 **중심**이 (x, z)에 오게 한다.
        const off = new THREE.Vector3(fctr.x, 0, fctr.z)
          .multiplyScalar(fScale)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY)
        o.position.set(x - off.x, SHORE_Y, z - off.z)
        o.scale.setScalar(fScale)
        o.rotation.y = rotY
        o.traverse((nd) => {
          if (nd.isMesh) {
            nd.castShadow = true
            nd.receiveShadow = true
          }
        })
        markGroup.add(o)
      }

      // 세그먼트 **끝**이 모서리 안에서 끝나야 한다. 중심을 ±끝에 두면
      // 반 세그먼트가 돌 밖으로 튀어나간다 — 열 전체 길이를 세그먼트
      // 정수 개로 깔고 남는 자투리는 모서리 양쪽에 반씩 남긴다.
      const row = (L, at) => {
        const n = Math.max(1, Math.floor((L * 2) / segLen))
        const start = -(n * segLen) / 2 + segLen / 2
        for (let i = 0; i < n; i++) at(start + segLen * i)
      }
      // 좌우 — 원본이 z 방향으로 긴 모델이라 회전 없이 그대로 세운다.
      row(fz, (t) => {
        addFence(arena.cx - fx, arena.cz + t, 0)
        addFence(arena.cx + fx, arena.cz + t, 0)
      })
      // 앞뒤 — 90도 돌려 가로로 눕힌다. 대기석이 이 안에 있으므로 울타리는
      // 대기석 **바깥**을 지난다 (PLAZA_Z 가 이미 대기석을 품는 값이다).
      row(fx, (t) => {
        addFence(arena.cx + t, arena.cz - fz, Math.PI / 2)
        addFence(arena.cx + t, arena.cz + fz, Math.PI / 2)
      })
    }

    // 소품. **마당 네 변을 따라** 흩는다. 좌우에만 두면 앞뒤가 텅 비어
    // "쓰는 마당"이 아니라 "안 쓰는 공터"로 보인다.
    for (let i = 0; i < 22; i++) {
      const proto = pick(props, rng.int(Math.max(1, props.length)))
      // 판과 울타리 사이 띠 안에서만 고른다 — 판 위에는 못 놓는다.
      const onSide = i % 2 === 0
      // 난수로 좌우를 고르면 한쪽에 쏠린다(실제로 5:2 였다). 번갈아 준다.
      // 앞뒤 띠는 뒤쪽만 쓴다 — 앞쪽은 대기석과 하단 UI가 다 덮는다.
      const sgn = onSide ? (i % 4 === 0 ? -1 : 1) : -1
      const gapX = spacing.stepX * (0.55 + rng.int(110) / 100)
      // 뒤쪽 띠는 **대기석 바깥**부터 시작해야 한다. 판 기준으로 재면 전부
      // 대기석 위에 떨어져 통째로 걸러지고, 그래서 뒤 띠가 텅 비어 있었다.
      const gapZ = BENCH_OUT + spacing.stepZ * (0.4 + rng.int(50) / 100)
      const x = onSide
        ? arena.cx + sgn * (halfX + gapX)
        : arena.cx + (rng.int(2000) / 1000 - 1) * halfX * 0.95
      const z = onSide
        ? arena.cz + (rng.int(2000) / 1000 - 1) * halfZ * 1.0
        : arena.cz + sgn * (halfZ + gapZ)
      place(proto, x, z, { scale: KIT * 1.1, faceIn: false })
    }

    scene.add(markGroup)

    // 랜드마크가 앉은 자리의 나무는 걷어낸다 — 집 위에 나무가 자란다.
    for (const d of [...surroundGroup.children]) {
      if (!d.userData.decor) continue
      for (const o of markGroup.children) {
        if (Math.abs(d.position.x - o.position.x) < spacing.stepX * 0.9 &&
            Math.abs(d.position.z - o.position.z) < spacing.stepZ * 0.9) {
          surroundGroup.remove(d)
          break
        }
      }
    }
  }

  // ── 바닥 얼룩 ──────────────────────────────────────────
  //
  // 돌바닥만 깔면 같은 타일이 반복돼 평평해 보인다. 자갈·풀을 흩어 얼룩을 준다.
  // **칸 중앙은 피한다** — 말이 설 자리라 겹치면 발밑이 지저분해진다.
  {

    const groups = await Promise.all(
      ['grass'].map(async (g) => [
        g,
        await Promise.all(
          (manifestJson.scatter?.[g] ?? []).map((f) => loader.loadAsync('/assets/scatter/' + f)),
        ),
      ]),
    )
    const byGroup = Object.fromEntries(groups.map(([g, list]) => [g, list.map((x) => x.scene)]))
    const rng = createRng(0xfa11)
    const scatterGroup = new THREE.Group()

    // 판 위에는 아무것도 놓지 않는다. 돌바닥 자체가 이미 무늬라
    // 자갈까지 얹으면 말 발밑이 지저분해진다.

    // 풀은 판 **좌우 옆면에만** 두른다. 앞뒤는 대기석 자리라 꽃이 그 위에 얹힌다.
    const grass = byGroup.grass
    if (grass.length > 0) {
      for (let i = 0; i < 26; i++) {
        const t = rng.int(2) === 0 ? -1 : 1
        const x = (t < 0 ? arena.minX : arena.maxX) + t * spacing.stepX * (0.25 + rng.int(40) / 100)
        const z = arena.minZ + (rng.int(1000) / 1000) * arena.d
        // 선반 위는 건너뛴다. 나무 판 위에 풀이 얹히면 아이템이 수풀에
        // 묻혀 안 보인다.
        if (
          shelfArea &&
          x >= shelfArea.minX && x <= shelfArea.maxX &&
          z >= shelfArea.minZ && z <= shelfArea.maxZ
        ) {
          continue
        }
        const o = grass[rng.int(grass.length)].clone(true)
        o.position.set(x, -0.02, z)
        o.rotation.y = (rng.int(360) * Math.PI) / 180
        // 원본 풀·꽃이 사람 키만 하다. 판 가장자리 장식이므로 크게 줄인다.
        o.scale.setScalar(0.28 + rng.int(22) / 100)
        scatterGroup.add(o)
      }
    }
    boardGroup.add(scatterGroup)
  }

  // 판 윗면과 같은 높이의 보이지 않는 판. 포인터가 어느 칸 위인지 여기서 잡는다.
  // 육각 메시에 직접 쏘면 칸 사이 틈에서 빗나가 드래그가 끊긴다.
  const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -topY)
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const hit = new THREE.Vector3()

  // ── 유닛 모델 ──────────────────────────────────────────────
  const manifest = await (await fetch('/assets/manifest.json')).json()
  const protoCache = new Map()

  /** 성급 3 이면 진화 모델을 쓴다. 없으면 기본형으로 떨어진다. */
  function fileFor(unitId, star) {
    const entry = manifest.units[unitId]
    if (!entry) throw new Error(`매니페스트에 ${unitId} 가 없다`)
    return star >= 3 && entry.evolved ? entry.evolved : entry.base
  }

  async function loadProto(file) {
    if (!protoCache.has(file)) protoCache.set(file, loader.loadAsync(`/assets/monsters/${file}`))
    return protoCache.get(file)
  }

  /** 유닛의 원본 glTF. 초상화 생성기가 같은 캐시를 쓰도록 밖으로 연다. */
  async function protoFor(unitId, star = 1) {
    return loadProto(fileFor(unitId, star))
  }

  /**
   * 아바타 모델. 몬스터가 아니라 사람 캐릭터라 유닛 매니페스트를 안 탄다.
   *
   * 아바타는 **싸우지 않는다** — 판 위의 말과 같은 길로 만들면 언젠가
   * 전투 코드가 이걸 집어 들게 된다. 길을 갈라 둔다.
   */
  async function makeAvatarModel(file, anims) {
    const key = `avatar/${file}`
    if (!protoCache.has(key)) protoCache.set(key, loader.loadAsync(`/assets/avatars/${file}`))
    const gltf = await protoCache.get(key)
    // anims 없이 부르면 원본 gltf 만 준다 — 초상 생성기가 그걸 찍는다.
    if (!anims) return gltf
    const v = new UnitView(gltf, 'A', spacing, 1, AVATAR_SCALE)
    v.anims = anims
    return v
  }

  async function makeUnit(unitId, star, team) {
    const gltf = await protoFor(unitId, star)
    const v = new UnitView(gltf, team, spacing, star, scaleOf(unitId))
    v.anims = manifest.units[unitId].anims
    v.unitId = unitId
    v.star = star
    return v
  }

  // ── 화면 맞추기 ────────────────────────────────────────────
  const pitch = THREE.MathUtils.degToRad(pitchDeg)

  // 머리 높이를 **뒤쪽 모서리에만** 준다. 카메라가 +Z 에서 내려다보므로
  // 앞줄 유닛이 커지는 방향은 화면 위쪽 — 즉 화면 안쪽이라 잘릴 일이 없다.
  // 네 모서리 전부에 주면 아래쪽 여백만 버려져 보드가 작아진다.
  const headRoom = spacing.unitStep * (UNIT_MAX_H + 0.12)

  // 화면에 담을 범위를 **실제로 그린 타일**에서 잡는다.
  // 행 수·오프셋으로 역산하면 그리지 않는 절반까지 세게 되어 보드가 쪼그라든다.
  // **판과 벤치만** 담는다. 해자·물가까지 담으려고 뒤로 물러나면 말이 점만 해져
  // 판이 재미없어진다. 물가는 화면 밖으로 흘러나가도 된다 — 배경이지 정보가 아니다.
  const frameOut = 0.05
  // 프레임은 **단계와 무관하게 고정**이다. 배치와 전투에서 판 크기가 달라지면
  // 전투가 시작될 때 화면이 튀어, 같은 무대를 쓰는 의미가 사라진다.
  function frameBox() {
    const bench = benchExtent
    return {
      minX: Math.min(bx[0] - spacing.stepX * frameOut, bench?.minX ?? Infinity),
      maxX: Math.max(bx[1] + spacing.stepX * frameOut, bench?.maxX ?? -Infinity),
      minZ: Math.min(bz[0] - spacing.stepZ * frameOut, bench?.minZ ?? Infinity),
      maxZ: Math.max(bz[1] + spacing.stepZ * frameOut, bench?.maxZ ?? -Infinity),
    }
  }
  // 대기석 말은 화면에서 작으므로 머리 여유도 작게
  const benchHead = spacing.unitStep * 0.85

  function frameCorners() {
    const f = frameBox()
    // 머리 높이 여유를 판 맨 뒷줄에 잡으면, 배치에서 아무도 없는 하늘을 비우느라
    // 화면이 한참 멀어진다. **내 뒷줄** 기준으로 준다 — 상대 절반은 더 멀리 있어
    // 화면에서 작으므로 같은 여유로도 머리가 잘리지 않는다.
    const unitBackZ = Math.min(
      ...board.tiles.filter((t) => allyRows.has(t.row)).map((t) => t.z),
    )
    const out = []
    for (const x of [f.minX, f.maxX]) {
      out.push(new THREE.Vector3(x, 0, f.maxZ))
      out.push(new THREE.Vector3(x, 0, f.minZ))
      out.push(new THREE.Vector3(x, benchHead, f.minZ))
      out.push(new THREE.Vector3(x, headRoom, unitBackZ))
    }
    return { corners: out, box: f }
  }

  /**
   * 보드가 화면을 꽉 채우는 카메라 거리를 찾는다.
   *
   * 경계구로 어림하면 기울어진 판에 대해 항상 과하게 크게 잡혀 보드가 작아진다.
   * 대신 실제로 투영해 본다: 원근에서 화면상 크기는 거리에 거의 반비례하므로
   * "지금 넘친 배율"을 그대로 거리에 곱하면 몇 번 만에 수렴한다.
   */
  // 위·아래로 비워 둔 띠를 뺀 **실제로 쓸 수 있는 세로 비율**. 프레이밍은
  // 이 안에만 담아야 UI 뒤로 말이 숨지 않는다.
  let usableY = 1

  function fitCamera() {
    const { corners, box } = frameCorners()
    const focusX = (box.minX + box.maxX) / 2
    const focusZ = (box.minZ + box.maxZ) / 2
    let dist = Math.hypot(box.maxX - box.minX, box.maxZ - box.minZ)
    for (let i = 0; i < 8; i++) {
      camera.position.set(focusX, Math.sin(pitch) * dist, focusZ + Math.cos(pitch) * dist)
      camera.lookAt(focusX, 0, focusZ)
      camera.updateMatrixWorld()

      let over = 0
      for (const c of corners) {
        const p = c.clone().project(camera)
        over = Math.max(over, Math.abs(p.x), Math.abs(p.y) / usableY)
      }
      if (over === 0) break
      const k = over / FILL
      // 이미 충분히 맞았으면 그만 — 미세 진동을 막는다
      if (Math.abs(k - 1) < 0.005) break
      dist *= k
    }
    return dist
  }

  // 배치 ↔ 전투 전환. 화면을 갈아끼우지 않고 **같은 무대**를 고쳐 쓴다.
  //
  // 바뀌는 건 **상대 절반의 밝기뿐**이다 (전투에는 거기에도 말이 선다).
  // 카메라·프레임은 그대로 둔다 — 전투가 시작될 때 화면이 튀면 안 된다.
  // 내 칸 테두리도 계속 켜 둔다: 난전에서는 어느 쪽이 내 진영인지 말만 보고는
  // 안 읽힌다.
  let battleMode = false
  function setBattleMode(on) {
    if (battleMode === on) return
    battleMode = on
    for (let i = 0; i < ringNodes.length; i++) {
      const ring = ringNodes[i]
      if (ring) ring.visible = !on && allyRows.has(board.tiles[i].row)
    }
    if (benchGroup) benchGroup.visible = true
    resize()
  }

  function resize() {
    const w = mount.clientWidth
    const h = mount.clientHeight
    if (w === 0 || h === 0) return
    // 무대는 통째로 확대·축소된다 (#viewport). clientWidth 는 확대 전 값이라
    // 그대로 그리면 확대된 화면에서 흐려진다 — 실제 화면 폭만큼 더 그린다.
    const shown = mount.getBoundingClientRect().width
    renderer.setPixelRatio(Math.min(devicePixelRatio * (shown / w || 1), 2.5))
    // updateStyle 을 끄면 캔버스 CSS 크기가 안 잡혀, devicePixelRatio 2 에서
    // 그리기 버퍼 크기(=2배)로 표시되고 좌상단 1/4 만 보인다.
    renderer.setSize(w, h)
    camera.aspect = w / h
    // 프러스텀을 아래로 민다. 그림이 그만큼 위로 올라가 아래쪽에 빈 띠가 생긴다.
    // 프레이밍은 이 상태로 재므로 (fitCamera 가 지금 카메라로 투영한다)
    // 대기석은 그 띠 위에 정확히 얹힌다.
    // 위아래로 비워 둘 띠. 남은 가운데 밴드에만 그림을 담고, 밴드 중심이
    // 화면 중심과 어긋난 만큼 프러스텀을 밀어 둔다.
    const band = Math.max(1, h - topInset - bottomInset)
    usableY = band / h
    const shift = (bottomInset - topInset) / 2
    if (shift !== 0) camera.setViewOffset(w, h, 0, shift, w, h)
    else camera.clearViewOffset()
    camera.updateProjectionMatrix()

    const dist = fitCamera()
    // 안개도 거리에 맞춰 민다 — 고정값이면 보드가 통째로 안개에 잠긴다
    scene.fog.near = dist * 0.9
    scene.fog.far = dist * 2.2
  }

  mount.appendChild(renderer.domElement)
  const observer = new ResizeObserver(resize)
  observer.observe(mount)
  resize()

  /**
   * 화면 좌표 → 무대 바닥의 월드 좌표.
   *
   * 타일에 안 붙는다 — 아바타는 칸 위가 아니라 **바닥 아무 데나** 선다.
   * tileAt 은 같은 광선을 쓰고 그 뒤에 가장 가까운 칸으로 접는다.
   */
  function groundAt(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect()
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1
    raycaster.setFromCamera(ndc, camera)
    if (!raycaster.ray.intersectPlane(pickPlane, hit)) return null
    return { x: hit.x, z: hit.z }
  }

  /**
   * 아바타가 돌아다닐 수 있는 범위. 판을 기준으로 잡고 한 칸씩 넉넉히 준다 —
   * 판 위에만 가두면 말들 사이에 끼여 어디에 서 있는지 안 보인다.
   */
  function stageBounds() {
    const xs = board.tiles.map((t) => t.x)
    const zs = board.tiles.map((t) => t.z)
    return {
      minX: Math.min(...xs) - spacing.stepX,
      maxX: Math.max(...xs) + spacing.stepX,
      minZ: Math.min(...zs) - spacing.stepZ,
      maxZ: Math.max(...zs) + spacing.stepZ,
    }
  }

  /** 화면 좌표 → 가장 가까운 타일 번호. 보드 밖이면 null. */
  function tileAt(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect()
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1
    raycaster.setFromCamera(ndc, camera)
    if (!raycaster.ray.intersectPlane(pickPlane, hit)) return null

    let best = -1
    let bestD = Infinity
    for (const t of board.tiles) {
      const d = ((t.x - hit.x) / spacing.stepX) ** 2 + ((t.z - hit.z) / spacing.stepZ) ** 2
      if (d < bestD) {
        bestD = d
        best = t.index
      }
    }
    // 칸 반지름 밖이면 보드를 벗어난 것으로 본다
    return bestD <= 0.62 ** 2 ? best : null
  }

  /**
   * 화면 좌표가 가리키는 자리. 벤치 칸이 먼저다 — 판 앞에 겹쳐 있으므로
   * 판 평면부터 재면 벤치를 영영 못 집는다.
   */
  /**
   * 사거리 표시. 전장 타일 번호 Set 을 받는다. null 이면 평소로 되돌린다.
   *
   * 어느 칸이 사거리 안인지는 부르는 쪽이 정한다 — 헥스 거리는 BFS 홉이라
   * 시야 좌표로 잴 수 없고, 그 계산은 sim/hex 의 dist 가 이미 갖고 있다.
   */
  function setRange(tiles) {
    for (let i = 0; i < ringNodes.length; i++) {
      const ring = ringNodes[i]
      if (!ring) continue
      if (tiles?.has(i)) {
        ring.material = ringRange
        ring.visible = true
      } else {
        ring.material = ringIdle
        // 사거리 표시가 끝나면 원래 규칙으로 돌아간다
        ring.visible = !battleMode && allyRows.has(board.tiles[i].row)
      }
    }
  }

  // 아이템 아이콘. 배지가 캔버스로 그리므로 텍스처가 아니라 이미지가 필요하다.
  // 로드가 늦으면 배지가 빈 칸으로 한 프레임 그려지므로 프리로드에 얹는다.
  const itemIcons = new Map()

  function loadItemIcon(id) {
    if (itemIcons.has(id)) return Promise.resolve()
    return new Promise((resolve) => {
      const img = new Image()
      // 못 받아도 게임은 돌아야 한다 — 아이콘만 빠진다.
      img.onload = () => {
        itemIcons.set(id, img)
        resolve()
      }
      img.onerror = () => resolve()
      img.src = `/assets/ui/item_${id}.png`
    })
  }

  async function preloadItemIcons(ids) {
    await Promise.all(ids.map(loadItemIcon))
  }

  /**
   * 전투 이펙트 텍스처를 미리 받는다.
   *
   * 게으르게 두면 **첫 타격이 일어나는 그 프레임에** 디코드가 걸린다 —
   * 하필 화면이 가장 바쁠 때다. 여덟 장뿐이라 부팅에서 치르는 편이 싸다.
   */
  const FX_KINDS = ['burst', 'glow', 'ring', 'ring_thick', 'slash', 'spark', 'trail', 'wisp']
  function preloadFx() {
    return Promise.all(
      FX_KINDS.map(
        (kind) =>
          new Promise((resolve) => {
            const t = fxTexture(kind)
            if (t.image) return resolve()
            // 못 받아도 게임은 굴러가야 한다 — 그 이펙트만 안 뜬다.
            t.addEventListener?.('dispose', resolve)
            const img = new Image()
            img.onload = img.onerror = () => resolve()
            img.src = `/assets/fx/${kind}.webp`
          }),
      ),
    )
  }

  // 선반 스프라이트용 텍스처. 16×16 원본을 그대로 몇 배 키워 붙이므로
  // 기본(Linear) 필터를 쓰면 확대할 때 경계가 뭉개진다 — 나머지 UI가
  // 전부 image-rendering:pixelated 인데 여기만 흐리면 어긋난다. id 별로
  // 한 번만 만들어 재사용한다(런당 최대 종류 12개뿐이라 굳이 안 지운다).
  const itemIconTex = new Map()
  function iconTexture(id) {
    if (itemIconTex.has(id)) return itemIconTex.get(id)
    const img = itemIcons.get(id)
    if (!img) return null
    const tex = new THREE.Texture(img)
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
    itemIconTex.set(id, tex)
    return tex
  }

  /**
   * 가진(아직 안 낀) 아이템을 선반에 채운다.
   *
   * ids 순서 그대로 슬롯에 놓는다 — sim/roster.js 의 equipItem 이 같은
   * 인덱스로 state.items 를 splice 하므로, "슬롯 i = state.items[i]" 를
   * 그대로 유지하면 별도 매핑표 없이 드래그 시작점에서 바로 invIndex 를
   * 읽을 수 있다.
   */
  function setItemShelf(ids) {
    for (let i = 0; i < itemShelfSlots.length; i++) {
      const sprite = itemShelfSlots[i]
      const id = ids[i]
      if (id === undefined) {
        sprite.visible = false
        sprite.userData.itemId = null
        continue
      }
      sprite.material.map = iconTexture(id)
      sprite.material.needsUpdate = true
      sprite.userData.itemId = id
      sprite.visible = true
    }
  }

  /**
   * 말 위에 뜨는 배지. 성급 별과 (전투에서는) 체력 바를 같이 그린다.
   *
   * 캔버스로 그리는 이유: 별 개수와 색이 성급마다 달라 스프라이트 몇 장으로는
   * 안 되고, 체력은 매 프레임 바뀐다.
   */
  function makeBadge({ team, star, withHp, items = [], showStars = true }) {
    const W = 128
    // 아이콘 한 칸 28px — 게임플레이 거리에서 16px는 뭘 꼈는지 안 읽혔다.
    const ITEM_ICON = 28
    const ITEM_GAP = 3
    const ITEM_ROW = ITEM_ICON + 2 // 아이콘 + 어두운 받침판 위아래 1px씩

    // 별·체력 칸 높이는 고정, 아이템 줄만 있을 때만 붙는다 — 항상 비워 두지
    // 않는다. 스프라이트를 (0.5, 0) 로 바닥 앵커해 두면 캔버스 아랫변이 곧
    // sprite.position.y(= 머리 높이)에 고정되므로, 줄이 붙어 캔버스가 키만
    // 자라도 위쪽(별·체력)이 그만큼 위로 밀려 올라간다 — 아이템을 끼면
    // 체력 바가 뜨는 게 지금 원하는 동작이다.
    const baseH = withHp ? 52 : 20
    // 아이템 줄이 있을 때만 그만큼 캔버스가 자란다. 초기 생성과 setItems
    // 둘 다 같은 계산을 쓰므로 한 곳에 모은다 — 흩어 두면 둘 중 하나만 고치기 쉽다.
    const heightFor = (list) => baseH + (list.length > 0 ? ITEM_ROW : 0)
    let worn = items.slice(0, 3)
    let H = heightFor(worn)

    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const tex = new THREE.CanvasTexture(cv)
    // 캔버스는 이미 sRGB 값이다. 기본값(Linear)이면 색이 한 번 더 밝혀져
    // 팀 색이 흰 선으로 뭉개진다.
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.SpriteMaterial({
      map: tex,
      depthTest: false,
      transparent: true,
      // HUD 다. 씬 톤매핑·안개에 딸려가면 채도가 죽고 뒷줄이 흐려진다.
      toneMapped: false,
      fog: false,
    })
    const sprite = new THREE.Sprite(mat)
    sprite.renderOrder = 10
    // 바닥 앵커. 기본값(0.5, 0.5)인 중심 앵커면 캔버스가 커질 때 위아래로
    // 반씩 자라 모델 쪽으로 파고든다 — 배지 전체가 머리 위에 떠 있어야 하므로
    // position.y 를 캔버스의 "아랫변"으로 잡고 위로만 자라게 한다.
    sprite.center.set(0.5, 0)
    const w = spacing.unitStep * 0.92
    sprite.scale.set(w, (w * H) / W, 1)

    const g = cv.getContext('2d')
    const starColor = STAR_COLOR[star - 1] ?? STAR_COLOR[0]
    const hpColor = team === 'A' ? '#63d68a' : '#e8654f'
    // 마나는 양쪽 다 파랑이다. 팀 색으로 나누면 체력과 헷갈린다 —
    // "내 편 초록 / 상대 빨강" 은 체력만 쓰는 약속이다.
    const MANA_COLOR = '#5aa9ff'

    // 마지막으로 그린 인자. setItems 가 같은 값으로 다시 그린다.
    let lastArgs = {}

    function star5(cx, cy, r) {
      g.beginPath()
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 ? r * 0.45 : r
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
      }
      g.closePath()
      g.fill()
    }

    function drawStars() {
      const r = 8
      const gap = 3
      const total = star * (r * 2) + (star - 1) * gap
      let x = (W - total) / 2 + r
      g.strokeStyle = '#00000090'
      g.lineWidth = 2
      for (let i = 0; i < star; i++) {
        g.fillStyle = '#000000'
        star5(x, 10, r + 1.8)
        g.fillStyle = starColor
        star5(x, 10, r)
        x += r * 2 + gap
      }
    }

    /** 값 하나짜리 띠. 테두리는 성급 색 — 별을 못 볼 만큼 작아도 색은 읽힌다. */
    function bar(y, h, frac, color) {
      g.fillStyle = starColor
      g.fillRect(0, y, W, h)
      g.fillStyle = '#0d0b12'
      g.fillRect(2, y + 2, W - 4, h - 4)
      g.fillStyle = color
      g.fillRect(2, y + 2, (W - 4) * Math.max(0, Math.min(1, frac)), h - 4)
    }

    /** 캔버스 맨 아래 줄(= 바닥 앵커라 화면상으로도 맨 아래). 28px 아이콘 최대 3개, 가운데 정렬. */
    function drawItems() {
      if (worn.length === 0) return
      const size = ITEM_ICON
      const gap = ITEM_GAP
      const total = worn.length * size + (worn.length - 1) * gap
      let x = (W - total) / 2
      const y = H - ITEM_ROW + 1
      for (const id of worn) {
        const img = itemIcons.get(id)
        // 어두운 판을 먼저 깐다. 밝은 바닥 위에서는 아이콘만으로 안 읽힌다.
        g.fillStyle = '#0d0b12c0'
        g.fillRect(x - 1, y - 1, size + 2, size + 2)
        if (img) g.drawImage(img, x, y, size, size)
        x += size + gap
      }
    }

    /** hp 가 null 이면 별만 그린다 (배치 단계). */
    function draw(o = {}) {
      lastArgs = o
      const { hp = null, maxHp = 1, shield = 0, mana = 0, manaFull = 0 } = o
      g.clearRect(0, 0, W, H)
      // 1성은 별을 안 그린다 — 아홉 마리 전부에 별이 뜨면 2·3성이 안 보인다.
      // 그런데 1성도 아이템은 끼므로 배지 자체는 있을 수 있다.
      if (showStars) drawStars()
      if (withHp && hp !== null) {
        bar(24, 15, hp / maxHp, hpColor)
        // 보호막은 체력 위에 겹쳐 얹는다 — 칸을 따로 주면 띠가 세 줄이 된다.
        if (shield > 0) {
          g.fillStyle = '#d8d2ff'
          g.fillRect(2, 26, (W - 4) * Math.min(1, shield / maxHp), 4)
        }
        // 마나는 더 얇게. 언제 스킬이 터지는지만 보면 되고, 체력보다 굵으면
        // 눈이 먼저 그쪽으로 간다.
        if (manaFull > 0) bar(41, 10, mana / manaFull, MANA_COLOR)
      }
      drawItems()
      tex.needsUpdate = true
    }

    draw()
    return {
      sprite,
      draw,
      get height() {
        return (w * H) / W
      },
      /**
       * 낀 아이템이 바뀌었을 때 부른다. 아이템 유무로 캔버스 높이 자체가
       * 바뀌므로(있으면 ITEM_ROW 만큼 커진다) 다시 그리기 전에 캔버스 크기와
       * 스프라이트 스케일부터 맞춘다. cv.height 대입은 2D 컨텍스트 상태를
       * 초기화하지만 draw() 가 매번 fillStyle 등을 다시 세팅하며 그리므로
       * 문제없다. 바닥 앵커(0.5, 0) 덕에 position.y 는 그대로 두어도
       * 캔버스가 커진 만큼 위쪽(별·체력)이 위로 밀려 올라간다.
       */
      setItems(ids) {
        worn = (ids ?? []).slice(0, 3)
        H = heightFor(worn)
        cv.height = H
        sprite.scale.set(w, (w * H) / W, 1)
        draw(lastArgs)
      },
    }
  }

  // ── 이펙트 ──────────────────────────────────────────────
  //
  // 시너지 효과(도약 · 보호막 · 부활 · 폭발 …)는 로그에는 남는데 화면에는
  // 아무 일도 안 일어났다. 무슨 일이 왜 벌어졌는지가 안 읽힌다.
  //
  // 스프라이트는 **무채색 한 장**을 색만 바꿔 쓴다. 색깔별 파일을 두면 같은
  // 그림이 여덟 벌 생기고, 티어색처럼 값이 바뀔 때마다 다시 뽑아야 한다.
  const fxTex = new Map()
  function fxTexture(kind) {
    if (!fxTex.has(kind)) {
      const t = texLoader.load(`/assets/fx/${kind}.webp`)
      t.colorSpace = THREE.SRGBColorSpace
      fxTex.set(kind, t)
    }
    return fxTex.get(kind)
  }

  // 살아 있는 이펙트. 매 프레임 나이를 먹이고 다 자란 것은 지운다.
  const fxLive = []
  // 다 쓴 스프라이트는 모아 뒀다 다시 쓴다 — 전투 한 판에 수백 개가 생긴다.
  const fxPool = []

  /**
   * 한 번 터지고 사라지는 이펙트.
   *
   * @param {string} kind   /assets/fx 의 파일 이름
   * @param {THREE.Vector3} at 월드 좌표
   * @param {object} o
   * @param {number} o.color  입힐 색
   * @param {number} o.size   시작 크기 (칸 폭 기준 배수)
   * @param {number} o.grow   끝날 때 크기 배수 (1 이면 안 커진다)
   * @param {number} o.life   지속 초
   * @param {number} o.rise   위로 뜨는 거리
   * @param {number} o.spin   회전 속도 (라디안/초)
   */
  function spawnFx(kind, at, { color = 0xffffff, size = 1, grow = 1.8, life = 0.45, rise = 0.2, spin = 0 } = {}) {
    const sprite = fxPool.pop() ?? new THREE.Sprite()
    sprite.material = new THREE.SpriteMaterial({
      map: fxTexture(kind),
      color,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      // 더하기 합성. 곱하기면 어두운 판 위에서 빛이 안 난다.
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    })
    sprite.renderOrder = 12
    sprite.position.copy(at)
    sprite.scale.setScalar(spacing.unitStep * size)
    scene.add(sprite)
    fxLive.push({
      sprite,
      age: 0,
      life,
      from: spacing.unitStep * size,
      to: spacing.unitStep * size * grow,
      rise,
      spin,
      y0: at.y,
    })
  }

  function updateFx(dt) {
    for (let i = fxLive.length - 1; i >= 0; i--) {
      const f = fxLive[i]
      f.age += dt
      const k = f.age / f.life
      if (k >= 1) {
        scene.remove(f.sprite)
        f.sprite.material.dispose()
        fxPool.push(f.sprite)
        fxLive.splice(i, 1)
        continue
      }
      // 크기는 앞부분에서 빠르게 자라고, 투명도는 뒤에서 빠르게 빠진다.
      const size = f.from + (f.to - f.from) * (1 - (1 - k) * (1 - k))
      f.sprite.scale.setScalar(size)
      f.sprite.material.opacity = 1 - k * k
      f.sprite.position.y = f.y0 + f.rise * k
      if (f.spin) f.sprite.material.rotation += f.spin * dt
    }
  }

  function clearFx() {
    for (const f of fxLive) {
      scene.remove(f.sprite)
      f.sprite.material.dispose()
      fxPool.push(f.sprite)
    }
    fxLive.length = 0
  }

  // ── 투사체 ──────────────────────────────────────────────
  //
  // 원거리 공격이 아무것도 안 날아가면 "저 멀리 있는 말이 왜 죽는가"가 안 보인다.
  // 피해 판정은 이미 로그가 끝냈으므로 이건 순수하게 눈에 보이라고 있는 것이다.
  const boltGeom = new THREE.SphereGeometry(spacing.unitStep * 0.075, 8, 8)
  const boltMats = new Map()
  const bolts = []

  function boltMat(color) {
    if (!boltMats.has(color)) {
      boltMats.set(
        color,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
          toneMapped: false,
          fog: false,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
    }
    return boltMats.get(color)
  }

  /** from·to 는 월드 좌표. 거리에 비례해 날아가므로 멀수록 오래 걸린다. */
  function spawnBolt(from, to, color = 0xffd166) {
    const mesh = new THREE.Mesh(boltGeom, boltMat(color))
    mesh.position.copy(from)
    mesh.renderOrder = 9
    scene.add(mesh)
    const dist = from.distanceTo(to)
    bolts.push({
      mesh,
      from: from.clone(),
      to: to.clone(),
      t: 0,
      // 판을 가로지르는 데 0.5초쯤. 짧으면 안 보이고 길면 맞은 뒤에 도착한다.
      dur: Math.max(0.08, dist / (spacing.unitStep * 14)),
    })
  }

  function updateBolts(dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]
      b.t += dt
      const k = b.t / b.dur
      if (k >= 1) {
        scene.remove(b.mesh)
        bolts.splice(i, 1)
        continue
      }
      b.mesh.position.lerpVectors(b.from, b.to, k)
      // 날아가는 동안 살짝 떠올랐다 떨어진다 — 직선으로만 가면 판에 붙어 보인다
      b.mesh.position.y += Math.sin(k * Math.PI) * spacing.unitStep * 0.28
      b.mesh.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.35)
    }
  }

  function clearBolts() {
    for (const b of bolts) scene.remove(b.mesh)
    bolts.length = 0
  }

  /** 임의의 오브젝트 목록에 레이를 쏜다. 가장 가까운 것 하나. */
  function pickObjects(objects, clientX, clientY) {
    if (objects.length === 0) return null
    const r = renderer.domElement.getBoundingClientRect()
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1
    raycaster.setFromCamera(ndc, camera)
    return raycaster.intersectObjects(objects, true)[0]?.object ?? null
  }

  function pickAt(clientX, clientY) {
    if (benchPads.length > 0) {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.x = ((clientX - r.left) / r.width) * 2 - 1
      ndc.y = -((clientY - r.top) / r.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      // 칸이 Group 이 됐다 — 자식(메시)까지 훑고 부모에서 번호를 읽는다.
      const hits = raycaster.intersectObjects(benchPads, true)
      if (hits.length > 0) {
        let o = hits[0].object
        while (o && o.userData.benchIndex === undefined) o = o.parent
        if (o) return { where: 'bench', index: o.userData.benchIndex }
      }
    }
    const tile = tileAt(clientX, clientY)
    return tile === null ? null : { where: 'board', index: tile }
  }

  /** 벤치 칸의 월드 좌표. 유닛을 여기 세운다. */
  function benchSpot(i, side = 'ally') {
    const pad = (side === 'enemy' ? enemyBenchPads : benchPads)[i]
    return pad ? { x: pad.position.x, y: benchTopY + 0.08, z: pad.position.z } : null
  }

  /**
   * 무대 스킨. 색만 갈아 끼운다.
   *
   * 새 모델·텍스처를 얹지 않는 이유: 판 모양이 바뀌면 그건 코스메틱이 아니라
   * 다른 판이다(칸 위치가 같아 보여도 눈이 헷갈린다). 색은 밸런스에 안 닿는다.
   *
   * 바닥은 텍스처가 있는 재질이라 색을 **곱한다** — 흰색이면 원래 그림 그대로,
   * 다른 색이면 그 색조로 물든다.
   */
  // 지금 입혀 둔 색. 견본을 찍고 나면 여기로 되돌린다 — 안 되돌리면 목록을
  // 한 번 연 것만으로 판 색이 마지막 견본으로 바뀐다.
  let currentSkin = {}

  /**
   * 무대 견본 한 장. **진짜 판을 그대로 찍는다.**
   *
   * 색 스와치로 대신하지 않는 이유: 사는 사람이 알고 싶은 건 "내 판이 어떻게
   * 보이나"지 무슨 색인가가 아니다. 돌 무늬·잔디·칸 테두리가 같이 붙어야
   * 그 답이 된다.
   *
   * setSize 의 세 번째 인자를 false 로 준다 — CSS 크기를 안 건드리므로 화면이
   * 한 번 깜빡이지 않는다. 다음 실제 렌더가 원래 크기로 되돌린다.
   */
  function boardShot(colors, w = 200, h = 240) {
    const prev = new THREE.Vector2()
    renderer.getSize(prev)
    const prevRatio = renderer.getPixelRatio()
    const keep = currentSkin
    setSkin(colors)

    const cam = new THREE.PerspectiveCamera(34, w / h, 0.1, 200)
    // 판만 꽉 채우면 무대가 아니라 바닥 무늬가 된다 — 마당·울타리·잔디까지
    // 들어와야 "어떤 무대인가"가 보인다.
    const dist = Math.max(arena.w, arena.d) * 2.35
    // 판을 비스듬히 내려다본다. 정면 위에서 찍으면 평면도가 되어 무대가
    // 아니라 바닥 무늬 견본처럼 보인다.
    cam.position.set(arena.cx, dist * 0.82, arena.cz + dist * 0.5)
    cam.lookAt(arena.cx, 0, arena.cz)

    renderer.setPixelRatio(1)
    renderer.setSize(w, h, false)
    renderer.render(scene, cam)
    const url = renderer.domElement.toDataURL('image/png')

    renderer.setPixelRatio(prevRatio)
    renderer.setSize(prev.x, prev.y, false)
    setSkin(keep)
    return url
  }

  /**
   * 승리 이펙트. 이긴 사람의 것이 **진 판** 위에 떨어진다 — TFT 의 부머와
   * 같은 자리다. 이긴 판에 터뜨리면 자축이 되고, 진 판에 떨어져야 \"내가
   * 이겼다\"가 상대 화면에서도 읽힌다.
   *
   * 새 에셋을 안 만든다. 이미 있는 무채색 스프라이트를 색만 바꿔 쓰므로
   * 이펙트가 늘어도 파일은 안 는다(전투 이펙트와 같은 규칙).
   */
  function playBoom(fx = {}, { enemyHalf = true } = {}) {
    const color = new THREE.Color(fx.color ?? '#ffd166').getHex()
    // 진 쪽 절반의 한가운데. 교전선(frontZ)을 기준으로 가른다.
    const cz = enemyHalf ? (arena.minZ + frontZ) / 2 : (frontZ + arena.maxZ) / 2
    const y = topY + 0.05

    // 1) 바닥 고리 — 어디에 떨어졌는지를 먼저 말한다.
    spawnFx(fx.ring ?? 'ring_thick', new THREE.Vector3(arena.cx, y, cz), {
      color,
      size: 3.2,
      grow: 2.4,
      life: 0.7,
      rise: 0.05,
    })
    // 2) 가운데 폭발 — 조금 늦게 터져야 고리가 먼저 읽힌다.
    setTimeout(() => {
      spawnFx(fx.burst ?? 'burst', new THREE.Vector3(arena.cx, y + 0.5, cz), {
        color,
        size: 2.6,
        grow: 2.2,
        life: 0.55,
        rise: 0.5,
      })
    }, 90)
    // 3) 불티. 판 위에 흩어 뿌린다 — 한 점에서만 터지면 그 칸만 축하받는
    //    꼴이라 '판이 졌다'로 안 읽힌다.
    const shots = Math.max(1, fx.shots ?? 5)
    for (let i = 0; i < shots; i++) {
      const t = i / shots
      setTimeout(
        () => {
          // 무작위를 안 쓴다 — sim 이 아니라 화면이지만, 같은 판을 두 번
          // 보면 같게 보이는 편이 낫다(관전·리플레이).
          const a = t * Math.PI * 2 * 1.618
          const r = (0.25 + 0.6 * t) * Math.min(arena.w, arena.d) * 0.5
          spawnFx(
            fx.spark ?? 'spark',
            new THREE.Vector3(arena.cx + Math.cos(a) * r, y + 0.3, cz + Math.sin(a) * r * 0.6),
            { color, size: 1.1, grow: 1.9, life: 0.5, rise: 0.35, spin: 3 },
          )
        },
        140 + i * 55,
      )
    }
  }

  function setSkin(colors = {}) {
    currentSkin = colors
    const set = (mat, hex) => {
      if (mat && hex) mat.color.set(hex)
    }
    set(floorMat, colors.floor)
    // 마당은 판보다 어둡게 유지한다. 같은 색을 그대로 주면 판과 마당의
    // 경계가 사라져 어디까지가 싸우는 자리인지 안 읽힌다.
    for (const m of apronRefs) if (colors.floor) m.color.set(colors.floor).multiplyScalar(0.42)
    set(baseMat, colors.base)
    set(groundMat, colors.ground)
    // 내 칸 테두리. 판 색이 바뀌면 청록 하나로는 안 읽히는 무대가 생긴다.
    if (colors.ring) {
      ringIdle.color.set(colors.ring)
      ringHot.color.set(colors.ring).offsetHSL(0, 0, 0.18)
    }
  }

  return {
    THREE,
    scene,
    camera,
    renderer,
    setSkin,
    boardShot,
    playBoom,
    board,
    spacing,
    topY,
    boardGroup,
    makeUnit,
    makeAvatarModel,
    protoFor,
    pickAt,
    pickObjects,
    makeBadge,
    preloadItemIcons,
    preloadFx,
    itemSlots: itemShelfSlots,
    setItemShelf,
    spawnFx,
    updateFx,
    clearFx,
    spawnBolt,
    updateBolts,
    clearBolts,
    benchPads,
    enemyBenchPads,
    benchSpot,
    ringNodes,
    setRange,
    ringStyles: { idle: ringIdle, hot: ringHot, sell: ringSell, range: ringRange },
    tileAt,
    groundAt,
    stageBounds,
    resize,
    setBattleMode,
    render: () => renderer.render(scene, camera),
    dispose: () => {
      observer.disconnect()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
