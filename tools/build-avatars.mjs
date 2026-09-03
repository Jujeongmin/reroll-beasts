// 아바타 모델을 굽는다.
//
//   node tools/build-avatars.mjs
//
// 몬스터와 **다른 팩**이라 따로 둔다 — 아바타는 판 위의 말이 아니고 싸우지도
// 않는다. 같은 스크립트에 넣으면 언젠가 유닛 목록이 아바타를 집어 든다.
//
// **목록을 여기 안 적는다.** cosmetics.json 이 단일소스다 — 아바타를 늘리거나
// 갈아치울 때(TFT 처럼 시즌마다) 데이터 한 줄만 고치면 되고, 이 파일은 그걸
// 그대로 따른다. 두 곳에 적으면 반드시 어긋난다.
//
// 원본 glTF 는 지오메트리를 base64 로 박아 개당 1~2MB 다. .glb + meshopt 로
// 구우면 그게 한참 준다 (build-assets.mjs 의 bakeModel 과 같은 셈).
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, quantize, reorder } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import { join, resolve } from 'node:path'

const HERE = import.meta.dirname
const ROOT = join(HERE, '..')
const ART = join(ROOT, 'art-src')
const OUT = join(ROOT, 'game', 'public', 'assets', 'avatars')
const DATA = join(ROOT, 'game', 'public', 'data', 'cosmetics.json')

/** 애니메이션·메시가 변환에서 사라지면 던진다. 조용히 넘어가면 화면에서만 드러난다. */
async function bake(io, from, to) {
  const before = await io.read(from)
  const shape = {
    anims: before.getRoot().listAnimations().length,
    meshes: before.getRoot().listMeshes().length,
  }

  const doc = await io.read(from)
  await doc.transform(dedup(), reorder({ encoder: MeshoptEncoder }), quantize())
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })

  const after = {
    anims: doc.getRoot().listAnimations().length,
    meshes: doc.getRoot().listMeshes().length,
  }
  if (after.anims !== shape.anims || after.meshes !== shape.meshes) {
    throw new Error(
      `아바타 변환이 내용을 잃었다: ${from} — 애니 ${shape.anims}→${after.anims}, 메시 ${shape.meshes}→${after.meshes}`,
    )
  }

  await writeFile(to, Buffer.from(await io.writeBinary(doc)))
}

export async function buildAvatars({ quiet = false } = {}) {
  const cos = JSON.parse(await readFile(DATA, 'utf8'))
  await MeshoptEncoder.ready
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  await mkdir(OUT, { recursive: true })

  let total = 0
  for (const a of cos.avatars) {
    const pack = cos.packs[a.pack]
    if (!pack) throw new Error(`모르는 팩: ${a.pack} (${a.id})`)
    // 데이터는 굽고 난 이름(.glb)을 가리킨다. 원본은 .gltf 다.
    const from = resolve(ART, pack.src, a.file.replace(/\.glb$/, '.gltf'))
    const to = resolve(OUT, a.file)

    // 원본이 없어도 이미 구워 둔 것이 있으면 그걸 쓴다. art-src 는 커밋되지
    // 않으므로(용량) 새로 받은 사람 손에는 원본이 없다 — 그때마다 빌드가
    // 통째로 멈추면 아무도 못 돌린다. 둘 다 없으면 그건 진짜 오류다.
    const haveSrc = await readFile(from).then(
      () => true,
      () => false,
    )
    if (haveSrc) await bake(io, from, to)
    else {
      const baked = await readFile(to).catch(() => null)
      if (!baked) throw new Error(`원본도 구운 것도 없다: ${a.id} (${pack.src}/${a.file})`)
      if (!quiet) console.log(`${a.id.padEnd(14)} ${a.file}  (원본 없음 — 구운 것 유지)`)
      total += baked.length
      continue
    }
    const size = (await readFile(to)).length
    total += size
    if (!quiet) console.log(`${a.id.padEnd(14)} ${a.file}  ${(size / 1024).toFixed(0)}KB`)
  }
  if (!quiet) {
    console.log(`아바타 ${cos.avatars.length}종, 합계 ${(total / 1024 / 1024).toFixed(2)}MB`)
  }
}

await buildAvatars()
