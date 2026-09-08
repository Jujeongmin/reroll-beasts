// 데이터 로더. Node(테스트·시뮬)와 브라우저(게임) 양쪽에서 같은 코드를 쓴다.
// 규칙 수치는 전량 game/public/data/*.json 이 단일소스다.
// 브라우저에서 import 로 바꾸면 번들에 박혀 JSON 만 고쳐 배포하는 길이 막힌다.

const FILES = [
  'combat',
  'units',
  'traits',
  'shop',
  'economy',
  'levels',
  'rounds',
  'lobby',
  'items',
  'cosmetics',
  'season',
  'pass',
  'store',
  'missions',
]

const isNode =
  typeof process !== 'undefined' && process.versions != null && process.versions.node != null

// 번들러가 이 import 들을 **정적으로 분석하지 못하게** 지정자를 변수로 넘긴다.
// 그대로 두면 Vite 가 node:fs/promises 를 브라우저 번들에 externalize 하면서
// 경고를 내고, 그 자리에 던지는 스텁이 박힌다. 이 분기는 Node 에서만 도는데도.
const nodeImport = (specifier) => import(/* @vite-ignore */ specifier)

async function readNode(name) {
  const { readFile } = await nodeImport('node:fs/promises')
  const { fileURLToPath } = await nodeImport('node:url')
  const { dirname, join } = await nodeImport('node:path')
  const here = dirname(fileURLToPath(import.meta.url))
  const path = join(here, '..', 'game', 'public', 'data', `${name}.json`)
  return JSON.parse(await readFile(path, 'utf8'))
}

/**
 * 이 빌드의 표식. 플랫폼이 iframe 주소로 넘겨주는 커밋 해시를 그대로 쓴다.
 *
 * **없으면 데이터가 영영 안 바뀐다.** JS 번들은 파일 이름에 해시가 붙어 새
 * 빌드마다 새 주소가 되지만, /data/*.json 은 주소가 늘 같다 — 브라우저와
 * CDN 이 한 번 받은 것을 계속 준다. 실제로 시작 골드를 5 → 10 → 14 로 두 번
 * 바꾸는 동안, 돌아온 사람 화면에는 계속 5 가 떠 있었다. 코드는 새것인데
 * 수치만 옛것이라 "왜 안 바뀌지"가 배포 로그에서는 안 보인다.
 *
 * 로컬 개발에는 sha 가 없다. 그때는 아무것도 안 붙인다 — dev 서버는 어차피
 * 캐시를 안 태운다.
 */
function buildTag() {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('sha') ?? ''
  } catch {
    return ''
  }
}

async function readBrowser(name) {
  const tag = buildTag()
  const res = await fetch(`/data/${name}.json` + (tag ? `?v=${tag}` : ''))
  if (!res.ok) throw new Error(`데이터 로드 실패: ${name}.json (${res.status})`)
  return res.json()
}

export async function loadData() {
  const read = isNode ? readNode : readBrowser
  const loaded = await Promise.all(FILES.map((n) => read(n)))
  const out = {}
  FILES.forEach((name, i) => {
    out[name] = loaded[i]
  })
  return out
}

// unitById 는 units.js 에 있다. 화면이 여기서 들여오던 것을 그대로 두려고 다시
// 내보낸다 — 규칙(sim)은 units.js 를 직접 문다(서버 번들이 이 파일을 안 물게).
export { unitById } from './units.js'
