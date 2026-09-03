// 젬 아이콘 (32×32). 프리미엄 재화의 얼굴이다.
//
// Kenney 팩의 16px 젬을 안 쓰는 이유: 그건 코인과 같은 계열의 노란 보석이라
// 화면에서 골드와 안 갈린다. 이 게임의 재화는 둘(골드=판 안, 젬=판 밖)이고
// 둘을 색으로 못 가르면 매번 글자를 읽어야 한다. 그래서 밤하늘 보라로 찍고
// 크기도 키웠다 — 상점에서 24px 로 쓰는데 16px 원본을 늘리면 뭉갠다.
//
// 그림 자체는 gem-sprite.mjs 에 있다. 상점 상품 이미지가 같은 돌을 쓴다.
//
// 실행: node tools/gem-icon.mjs
import { writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { gemSprite, GEM_S } from './gem-sprite.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'game', 'public', 'assets', 'ui')

const png = new PNG({ width: GEM_S, height: GEM_S })
png.data = Buffer.from(gemSprite())
await writeFile(join(OUT, 'gem.png'), PNG.sync.write(png))
console.log('젬 아이콘 1 장 (32×32)')
