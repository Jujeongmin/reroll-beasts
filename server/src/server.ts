/**
 * Agent8 GameServer.
 *
 * 이 파일이 존재하는 이유는 하나다: **서버가 클라와 같은 코드로 전투를
 * 다시 돌려 검산할 수 있어야 한다.** sim/ 을 처음부터 순수 함수로 격리해 온
 * 까닭이 그것이고, 아래 import 가 그게 실제로 되는지를 증명한다
 * (server/test/server.test.ts 가 결과값까지 클라와 대조한다).
 *
 * 구조형(server/src/server.ts)을 쓴다. 루트 단일 server.js 는 import 를
 * 못 쓰므로 규칙을 복사해야 하고, 그러면 규칙이 두 군데 살게 된다.
 *
 * 데이터는 **JSON 을 직접 import** 한다. sim/data.js 의 loadData 는 못 쓴다 —
 * Node 분기가 import.meta.url 로 파일 경로를 잡는데, 플랫폼 번들러가 IIFE 로
 * 묶으면서 그 값이 빈다. 번들에 박아 두면 그 문제가 없고, 규칙 수치의
 * 단일소스도 game/public/data/ 그대로 유지된다.
 */
import { simulate } from '../../sim/combat.js'
import { totalRounds } from '../../sim/rounds.js'
import combat from '../../game/public/data/combat.json'
import units from '../../game/public/data/units.json'
import traits from '../../game/public/data/traits.json'
import shop from '../../game/public/data/shop.json'
import economy from '../../game/public/data/economy.json'
import levels from '../../game/public/data/levels.json'
import rounds from '../../game/public/data/rounds.json'
import lobby from '../../game/public/data/lobby.json'
import items from '../../game/public/data/items.json'

const DATA = { combat, units, traits, shop, economy, levels, rounds, lobby, items } as any

export class Server {
  async ping(): Promise<string> {
    return 'pong'
  }

  /**
   * 서버가 클라와 같은 전투 결과를 내는지 확인한다.
   *
   * 비동기 PvP 의 전제다 — 스냅샷을 받아 다시 돌렸을 때 답이 다르면
   * 검산이 성립하지 않는다. 테스트가 이 반환값을 클라 실행 결과와 대조한다.
   */
  async simProbe(): Promise<string> {
    const board = [{ unitId: 'frog', star: 1, tile: 0, items: [] }]
    const foe = [{ unitId: 'orc', star: 1, tile: 0, items: [] }]
    const r = simulate({ boardA: board, boardB: foe, seed: 7, data: DATA })
    return `winner=${r.winner} ticks=${r.ticks} log=${r.log.length} rounds=${totalRounds(DATA.rounds)} units=${DATA.units.units.length}`
  }
}
