// 유닛 초상화. 상점 카드와 벤치에 3D 모델을 그대로 쓸 수는 없으니,
// 모델을 한 번씩 오프스크린으로 찍어 이미지로 캐시한다.
//
// 2D 아이콘을 따로 만들지 않는 이유: 유닛이 26종이고 진화 모델까지 32개다.
// 손으로 그리면 모델을 바꿀 때마다 아이콘이 어긋난다. 찍으면 항상 일치한다.

import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

export function createThumbnailer({ size = 128 } = {}) {
  // 카드 배경 위에 얹어야 하므로 투명 배경으로 찍는다.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(1)
  renderer.setSize(size, size)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xcddcff, 0x30283f, 2.0))
  const key = new THREE.DirectionalLight(0xfff4e0, 2.2)
  key.position.set(-2, 3, 4)
  scene.add(key)

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100)
  const cache = new Map()

  /**
   * 모델 하나를 찍어 data URL 로 돌려준다.
   *
   * 카메라를 모델 크기에 맞춰 옮긴다 — 거리를 고정하면 예티는 잘리고
   * 고양이는 점이 된다. 살짝 위에서 비스듬히 봐야 실루엣이 산다.
   */
  function shoot(gltf, cacheKey) {
    if (cache.has(cacheKey)) return cache.get(cacheKey)

    const model = cloneSkinned(gltf.scene)
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    const radius = box.getSize(new THREE.Vector3()).length() / 2

    // 정면에서 살짝 오른쪽 위. 정면 정중앙은 날개·꼬리가 겹쳐 뭉개진다.
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)
    camera.position.set(center.x + dist * 0.34, center.y + dist * 0.3, center.z + dist * 0.9)
    camera.lookAt(center)
    camera.updateProjectionMatrix()

    scene.add(model)
    renderer.render(scene, camera)
    const url = renderer.domElement.toDataURL('image/png')
    scene.remove(model)

    cache.set(cacheKey, url)
    return url
  }

  return {
    shoot,
    dispose() {
      renderer.dispose()
      cache.clear()
    },
  }
}
