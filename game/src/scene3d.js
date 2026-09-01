// 육각 보드 3D 씬. 배치 화면과 전투 리플레이가 **같은 판**을 쓴다.
//
// 여기에는 게임 규칙이 없다. 보드를 세우고, 모델을 얹고, 화면에 맞추는 일만 한다.
// 무엇을 얹을지는 부르는 쪽이 정한다.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { createRng } from '@sim/rng.js'
import { hexSpacing, buildBoard3D } from './board3d.js'

// 육각 한 칸 폭 대비 유닛 바닥 넓이. 1 을 살짝 넘겨야 오토체스처럼
// 말이 판을 채워 보인다 — 작게 잡으면 큰 판에 점이 흩어진 그림이 된다.
const UNIT_FIT = 1.1

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
const STAR_SCALE = [0.84, 1, 1.16]

// 성급 색. 오토체스·TFT 관례대로 동 → 은 → 금.
const STAR_COLOR = ['#d99154', '#e6edf5', '#ffd166']

// 화면 어디까지 채울지. 1.0 이면 판이 가장자리에 딱 닿는다.
const FILL = 1.0

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
    const uniform = (spacing.stepX * UNIT_FIT) / Math.max(size.x, size.z)
    const shaped = Math.pow(uniform, NORMALIZE)
    const k =
      Math.min(shaped, (spacing.stepX * UNIT_MAX_H) / size.y) *
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
  phase = 'battle',
  benchSlots = 0,
  // 직업별 크기 배율. 마법사는 작고 탱커는 크다 — 규칙은 combat.json 이 갖고
  // 여기는 값만 받는다. scene3d 가 유닛 데이터를 알 필요는 없다.
  scaleOf = () => 1,
}) {
  // 배치(prep)와 전투(battle)는 **같은 판 전체**를 그린다. 배치 때 상대 절반을
  // 숨기면 판이 커지는 대신 "어느 쪽이 내 자리인가"가 색으로 안 읽힌다.
  // 대신 배치에서는 상대 절반을 어둡게 눌러 두고 내 칸에만 테두리를 켠다.
  const isPrep = phase === 'prep'
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

  const loader = new GLTFLoader()

  // ── 육각 보드 ──────────────────────────────────────────────
  const hexProto = (await loader.loadAsync('/assets/hex/hex_grass.gltf')).scene

  // **타일 간격을 상수로 박지 않는다.** 모델의 실제 크기를 재서 유도한다.
  const hexBox = new THREE.Box3().setFromObject(hexProto)
  const spacing = hexSpacing(hexBox.getSize(new THREE.Vector3()))
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

  const slabMat = (hex) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85 })
  const matAllySlab = slabMat(0x6f7a4e)
  const matEnemySlabDim = slabMat(0x2f3428)
  const matEnemySlabLit = slabMat(0x7a5340)

  const boardGroup = new THREE.Group()
  const SLAB_H = 0.55
  const half = (z0, z1, mat) => {
    const d = z1 - z0
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(arena.w, SLAB_H, d), mat)
    mesh.position.set(arena.cx, -SLAB_H / 2, (z0 + z1) / 2)
    mesh.receiveShadow = true
    boardGroup.add(mesh)
    return mesh
  }
  half(frontZ, arena.maxZ, matAllySlab)
  const enemySlab = half(arena.minZ, frontZ, isPrep ? matEnemySlabDim : matEnemySlabLit)

  // 교전선을 얇은 띠로 긋는다. 없으면 두 진영 색만으로는 경계가 흐리다.
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(arena.w, 0.02, spacing.stepZ * 0.06),
    new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.35, toneMapped: false, fog: false }),
  )
  line.position.set(arena.cx, 0.012, frontZ)
  boardGroup.add(line)

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
  // 상대 절반용. 흐릿한 회백색이라 "칸이 있다" 만 알려주고 시선을 안 끈다.
  const ringFaint = ringMat(0.16, 0xdfe7f0)

  const ringNodes = []
  for (const t of board.tiles) {
    const ally = allyRows.has(t.row)
    const ring = new THREE.Mesh(ringGeom, ally ? ringIdle : ringFaint)
    ring.position.set(t.x, 0.02, t.z)
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

  // 단상이 덮는 자리에는 아무것도 놓지 않는다
  const decorRng = createRng(0x5eed)
  const surroundGroup = new THREE.Group()

  const rMin = Math.floor((cz - rz) / spacing.stepZ + midRow) - SHORE_RINGS - 1
  const rMax = Math.ceil((cz + rz) / spacing.stepZ + midRow) + SHORE_RINGS + 1
  const cMin = Math.floor((cx - rx) / spacing.stepX + midCol) - SHORE_RINGS - 1
  const cMax = Math.ceil((cx + rx) / spacing.stepX + midCol) + SHORE_RINGS + 1

  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const x = latticeX(r, c)
      const z = latticeZ(r)
      // 판이 직사각이므로 최대노름을 쓴다. 원형 거리로 재면 모서리에서만
      // 물이 좁아져 테두리가 찌그러진다.
      const ring = ringOf(x, z)
      // 판이 직사각이므로 최대노름을 쓴다. 원형 거리로 재면 모서리에서만
      // 물이 좁아져 테두리가 찌그러진다.
      if (ring <= 0 || ring > SHORE_RINGS + 0.01) continue

      const isMoat = ring <= MOAT_RINGS + 0.01
      const y = isMoat ? 0 : SHORE_Y
      const tile = (isMoat ? waterProto : hexProto).clone(true)
      tile.position.set(x, y, z)
      tile.traverse((o) => {
        if (!o.isMesh) return
        o.receiveShadow = true
        // 물가 풀은 어둡게 눌러 전장 타일이 도드라지게 한다.
        // 같은 색이면 어디부터가 판인지 안 보인다.
        if (!isMoat) o.material = matShore
      })
      surroundGroup.add(tile)

      // 물가는 촘촘히, 물 위는 드물게 장식한다. 다 채우면 시야가 막힌다.
      const pool = isMoat ? decorBy.water : decorBy.land
      const chancePct = isMoat ? 18 : 45
      if (pool.length > 0 && decorRng.int(100) < chancePct) {
        const d = pool[decorRng.int(pool.length)].clone(true)
        // 물 타일 윗면은 풀 타일보다 0.2 낮다
        d.position.set(x, isMoat ? -0.2 : SHORE_Y, z)
        d.rotation.y = (decorRng.int(6) * Math.PI) / 3
        d.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true
            o.receiveShadow = true
          }
        })
        surroundGroup.add(d)
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
    // 받침은 어둡게, 칸은 밝게. 대비가 없으면 널빤지 한 장으로 보여
    // 어디가 한 칸인지 안 읽힌다.
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x3d2a17, roughness: 0.95 })
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(totalW + gap * 2, 0.55, pad + gap * 2.4),
      deckMat,
    )
    deck.position.set(cx, deckY - 0.28, deckZ)
    deck.receiveShadow = true
    benchGroup.add(deck)

    // 정사각형 칸. 육각은 전장, 네모는 대기석 — 모양만으로 둘이 갈린다.
    // 정사각형 칸. 육각은 전장, 네모는 대기석 — 모양만으로 둘이 갈린다.
    const padGeom = new THREE.BoxGeometry(pad, 0.16, pad)
    for (let i = 0; i < benchSlots; i++) {
      const m = new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 0.85 })
      const tile = new THREE.Mesh(padGeom, m)
      tile.position.set(cx - totalW / 2 + pad / 2 + i * pitchStep, deckY, deckZ)
      tile.receiveShadow = true
      tile.userData.benchIndex = i
      benchGroup.add(tile)
      benchPads.push(tile)
    }

    // 상대 대기석. 판 건너편에 같은 모양으로 놓아 무대가 대칭이 된다.
    // 어둡게 눌러 내 것과 헷갈리지 않게 한다 — 여긴 집을 수 없는 자리다.
    const farZ = bz[0] - pad / 2 - gap * 1.5
    const farDeck = new THREE.Mesh(
      new THREE.BoxGeometry(totalW + gap * 2, 0.55, pad + gap * 2.4),
      new THREE.MeshStandardMaterial({ color: 0x2c1f13, roughness: 0.95 }),
    )
    farDeck.position.set(cx, deckY - 0.28, farZ)
    benchGroup.add(farDeck)
    for (let i = 0; i < benchSlots; i++) {
      const tile = new THREE.Mesh(
        padGeom,
        new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.9 }),
      )
      // 180도 회전 대응이라 상대 벤치도 좌우가 뒤집힌다
      tile.position.set(cx + totalW / 2 - pad / 2 - i * pitchStep, deckY, farZ)
      tile.receiveShadow = true
      benchGroup.add(tile)
      enemyBenchPads.push(tile)
    }
    scene.add(benchGroup)
    benchExtent = {
      minX: cx - totalW / 2 - gap,
      maxX: cx + totalW / 2 + gap,
      minZ: farZ - pad / 2 - gap,
      maxZ: deckZ + pad / 2 + gap,
    }
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
  const headRoom = spacing.stepX * (UNIT_MAX_H + 0.12)

  // 화면에 담을 범위를 **실제로 그린 타일**에서 잡는다.
  // 행 수·오프셋으로 역산하면 그리지 않는 절반까지 세게 되어 보드가 쪼그라든다.
  // **판과 벤치만** 담는다. 해자·물가까지 담으려고 뒤로 물러나면 말이 점만 해져
  // 판이 재미없어진다. 물가는 화면 밖으로 흘러나가도 된다 — 배경이지 정보가 아니다.
  const frameOut = 0.15
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
  const benchHead = spacing.stepX * 0.85

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
        over = Math.max(over, Math.abs(p.x), Math.abs(p.y))
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
    enemySlab.material = on ? matEnemySlabLit : matEnemySlabDim
    if (benchGroup) benchGroup.visible = true
    resize()
  }

  function resize() {
    const w = mount.clientWidth
    const h = mount.clientHeight
    if (w === 0 || h === 0) return
    // updateStyle 을 끄면 캔버스 CSS 크기가 안 잡혀, devicePixelRatio 2 에서
    // 그리기 버퍼 크기(=2배)로 표시되고 좌상단 1/4 만 보인다.
    renderer.setSize(w, h)
    camera.aspect = w / h
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
      const d = (t.x - hit.x) ** 2 + (t.z - hit.z) ** 2
      if (d < bestD) {
        bestD = d
        best = t.index
      }
    }
    // 칸 반지름 밖이면 보드를 벗어난 것으로 본다
    return bestD <= (spacing.stepX * 0.62) ** 2 ? best : null
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
        ring.material = allyRows.has(board.tiles[i].row) ? ringIdle : ringFaint
      }
    }
  }

  /**
   * 말 위에 뜨는 배지. 성급 별과 (전투에서는) 체력 바를 같이 그린다.
   *
   * 캔버스로 그리는 이유: 별 개수와 색이 성급마다 달라 스프라이트 몇 장으로는
   * 안 되고, 체력은 매 프레임 바뀐다.
   */
  function makeBadge({ team, star, withHp }) {
    const W = 128
    const H = withHp ? 42 : 20
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
    const w = spacing.stepX * 0.92
    sprite.scale.set(w, (w * H) / W, 1)

    const g = cv.getContext('2d')
    const starColor = STAR_COLOR[star - 1] ?? STAR_COLOR[0]
    const hpColor = team === 'A' ? '#63d68a' : '#e8654f'

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

    /** hp 가 null 이면 별만 그린다 (배치 단계). */
    function draw({ hp = null, maxHp = 1, shield = 0 } = {}) {
      g.clearRect(0, 0, W, H)
      drawStars()
      if (withHp && hp !== null) {
        const y = 24
        const h = 15
        // 테두리도 성급 색이다. 별을 못 볼 만큼 작게 보일 때도 색은 읽힌다.
        g.fillStyle = starColor
        g.fillRect(0, y, W, h)
        g.fillStyle = '#0d0b12'
        g.fillRect(2, y + 2, W - 4, h - 4)
        const frac = Math.max(0, Math.min(1, hp / maxHp))
        g.fillStyle = hpColor
        g.fillRect(2, y + 2, (W - 4) * frac, h - 4)
        if (shield > 0) {
          g.fillStyle = '#d8d2ff'
          g.fillRect(2, y + 2, (W - 4) * Math.min(1, shield / maxHp), 4)
        }
      }
      tex.needsUpdate = true
    }

    draw()
    return { sprite, draw, height: (w * H) / W }
  }

  // ── 투사체 ──────────────────────────────────────────────
  //
  // 원거리 공격이 아무것도 안 날아가면 "저 멀리 있는 말이 왜 죽는가"가 안 보인다.
  // 피해 판정은 이미 로그가 끝냈으므로 이건 순수하게 눈에 보이라고 있는 것이다.
  const boltGeom = new THREE.SphereGeometry(spacing.stepX * 0.075, 8, 8)
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
      dur: Math.max(0.08, dist / (spacing.stepX * 14)),
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
      b.mesh.position.y += Math.sin(k * Math.PI) * spacing.stepX * 0.28
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
      const hits = raycaster.intersectObjects(benchPads, false)
      if (hits.length > 0) return { where: 'bench', index: hits[0].object.userData.benchIndex }
    }
    const tile = tileAt(clientX, clientY)
    return tile === null ? null : { where: 'board', index: tile }
  }

  /** 벤치 칸의 월드 좌표. 유닛을 여기 세운다. */
  function benchSpot(i, side = 'ally') {
    const pad = (side === 'enemy' ? enemyBenchPads : benchPads)[i]
    return pad ? { x: pad.position.x, y: benchTopY + 0.08, z: pad.position.z } : null
  }

  return {
    THREE,
    scene,
    camera,
    renderer,
    board,
    spacing,
    topY,
    boardGroup,
    makeUnit,
    protoFor,
    pickAt,
    pickObjects,
    makeBadge,
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
