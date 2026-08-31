// 데이터 로더. Node(테스트·시뮬)와 브라우저(게임) 양쪽에서 같은 코드를 쓴다.
// 규칙 수치는 전량 game/public/data/*.json 이 단일소스다.
// 브라우저에서 import 로 바꾸면 번들에 박혀 JSON 만 고쳐 배포하는 길이 막힌다.

const FILES = ['combat', 'units', 'traits', 'shop']

const isNode =
  typeof process !== 'undefined' && process.versions != null && process.versions.node != null

async function readNode(name) {
  const { readFile } = await import('node:fs/promises')
  const { fileURLToPath } = await import('node:url')
  const { dirname, join } = await import('node:path')
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

export function unitById(unitsData, id) {
  return unitsData.units.find((u) => u.id === id)
}
