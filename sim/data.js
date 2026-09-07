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

async function readBrowser(name) {
  const res = await fetch(`/data/${name}.json`)
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
