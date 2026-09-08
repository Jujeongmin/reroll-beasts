/**
 * Agent8 GameServer — 실시간 8인 로비.
 *
 * 이 파일이 있는 이유: **대진·체력·전투를 서버가 쥔다.** 클라가 짜면 상대를
 * 고르거나 체력을 고칠 수 있다. 라운드당 계산이 3.5ms 라 서버가 다 해도 싸다.
 *
 * 규칙은 여기 없다 — 전부 sim/lobbyRound.js 에 있고 이 파일은 배선만 한다:
 * 룸 읽고, 규칙 부르고, 룸에 쓰고, 알린다. 규칙을 sim/ 에 두는 이유는
 * 클라 쪽과 같다(순수 함수라 테스트가 시계를 기다리지 않는다). 마감 30초를
 * 기다려야 검사되는 규칙이면 테스트가 못 덮는다.
 *
 * 데이터는 **JSON 을 직접 import** 한다. sim/data.js 의 loadData 는 못 쓴다 —
 * Node 분기가 fs 와 import.meta.url 을 쓰는데 서버는 isolated-vm 이라 fs 가
 * 없고, 번들러가 IIFE 로 묶으며 import.meta 도 빈다. 번들에 박아도 규칙
 * 수치의 단일소스는 game/public/data/ 그대로다.
 *
 * ── 타이머가 없다 ────────────────────────────────────────
 * 이 런타임엔 cron 도 setInterval 도 없다. 서버는 스스로 못 깨어난다.
 * 그래서 마감도 매칭도 **클라 호출이 트리거**다: 서버는 시각·조건만 쥐고,
 * 클라가 찾아올 때 판정한다. 동시 호출은 $lock 으로 한 번만 처리된다.
 */
import { createLobbyState, resolveRound, assignRanks, concede } from '../../sim/lobbyRound.js'
import { applyMatchResult, countedMatch } from '../../sim/profile.js'
import { advanceMissions, claimMission, dayKeyOf } from '../../sim/missions.js'
import { addPassXp } from '../../sim/pass.js'
import { adReward, PLACEMENTS } from '../../sim/ads.js'
import { sortLeaderboard, rankOf } from '../../sim/rank.js'
import { sanitizeBoard } from '../../sim/submit.js'
import {
  canBuyCosmetic,
  cosmeticById,
  resolveBoard,
  resolveAvatar,
  resolveBoom,
} from '../../sim/cosmetics.js'
import { purchaseGrant, applyGrant, paidAlready } from '../../sim/store.js'
import { checkName, displayName, accountTag } from '../../sim/name.js'
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
import cosmetics from '../../game/public/data/cosmetics.json'
import passData from '../../game/public/data/pass.json'
import store from '../../game/public/data/store.json'
import missions from '../../game/public/data/missions.json'

// 코스메틱·패스도 여기 들어온다. 패스 트랙이 아바타 해금 단계를 cosmetics
// 에서 읽으므로, 둘 중 하나만 있으면 트랙을 만들 수 없다.
const DATA: any = {
  combat,
  units,
  traits,
  shop,
  economy,
  levels,
  rounds,
  lobby,
  items,
  cosmetics,
  pass: passData,
  store,
  missions,
}

interface Entry {
  unitId: string
  star: number
  tile: number
  items?: string[]
}

/**
 * 좌석에 그 사람의 프로필(이름·겉모습)을 입힌다.
 *
 * 방을 만들 때 한 번만 읽는다. 클라가 들어와서 보내 주기를 기다리면 그 사이
 * 남의 화면에는 기본 이름·기본 무대로 보이고, 안 들어온 사람은 영영 기본이다.
 * 계정 수만큼 읽지만 방 하나에 한 번이라 싸다.
 */
async function dressSeats(state: any): Promise<void> {
  for (const seat of state.seats) {
    if (!seat.account) continue
    const st: any = await $global.getUserState(seat.account)
    const profile = st?.profile
    seat.name = displayName(profile?.name, seat.account)
    const look = profile?.look
    if (!look) continue
    const owned = {
      gems: profile.gems ?? 0,
      avatars: profile.owned ?? [],
      passLevel: profile.pass?.level ?? 1,
      premium: !!profile.pass?.premium,
      lp: profile.lp ?? 0,
    }
    // 저장해 둔 것도 다시 검산한다 — 시즌이 끝나 패스 단계가 내려가면
    // 그때 잠긴 것이 저장된 채로 남아 있다.
    seat.skin = resolveBoard(look.board, DATA, owned)
    seat.avatar = resolveAvatar(look.avatar, DATA, owned)
    seat.boom = resolveBoom(look.boom, DATA, owned)
  }
}

/**
 * 광고 검증 서버에 묻는다. verified | unverified | unavailable.
 *
 * pending(202) 은 몇 번 더 물어본다. 그래도 답이 없으면 unavailable — 본 사람을
 * 거절하는 것보다 검증 못 한 채 주는 쪽이 낫다(지급물이 낮은 값일 때만).
 */
async function verifyAd(requestId: string): Promise<'verified' | 'unverified' | 'unavailable'> {
  const f: any = (globalThis as any).fetch
  if (typeof f !== 'function') return 'unavailable'
  try {
    for (let i = 0; i < 3; i++) {
      const res = await f(`https://ads-verifier.verse8.io/ads/status?requestId=${encodeURIComponent(requestId)}`)
      if (!res.ok && res.status !== 202) return 'unavailable'
      const body: any = await res.json()
      if (body.status === 'verified') return 'verified'
      if (body.status === 'pending') {
        await new Promise((r) => setTimeout(r, 1200))
        continue
      }
      return 'unverified'
    }
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/** 룸 상태에서 로비를 꺼낸다. 없으면 null. */
async function readLobby(): Promise<any | null> {
  const room = await $room.getRoomState()
  return room.lobby ?? null
}

/**
 * 방 상태를 고치는 **모든** 경로가 쓰는 락.
 *
 * 로비는 문서 하나다 — 배치·레벨·겉모습·마감이 전부 그 하나를 읽어서 통째로
 * 다시 쓴다. 마감만 락을 쥐고 나머지가 안 쥐면, 마감이 도는 사이에 들어온
 * 배치 한 번이 **라운드가 넘어간 판을 지난 라운드로 되돌린다**(체력·라운드가
 * 같이 딸려 온다). 읽기-고치기-쓰기를 한 줄로 세우는 것이 유일한 답이다.
 */
function withRoom<T>(fn: () => Promise<T>): Promise<T> {
  return $lock(`room:${$sender.roomId ?? 'none'}`, fn)
}

export class Server {
  async ping(): Promise<string> {
    return 'pong'
  }

  /**
   * 연습 로비. **1인 1룸** — 빈 자리를 전부 봇으로 채운다. 매칭 없이 바로
   * 시작하므로 동시접속이 0명이어도 지금 당장 플레이가 된다.
   */
  async joinLobby(): Promise<any> {
    const account = $sender.account
    await $global.joinRoom(`solo-${account}`)

    const existing = await readLobby()
    if (existing) return existing

    // 룸 시드. sim/ 밖이라 Date.now 를 써도 결정론이 안 깨진다 — 한 번 정해
    // 룸 상태에 박아 두면 이후 대진·봇 편성은 전부 이 값에서 재현된다.
    const seed = (Date.now() ^ hashAccount(account)) >>> 0
    const state: any = createLobbyState({ seed, account, now: Date.now(), data: DATA })
    // 1인 방은 랭크가 아니다. 모드를 상태에 박아 두면 마감 때 방 이름을
    // 다시 파싱하지 않아도 된다 — 이름 규칙이 바뀌면 조용히 틀릴 자리다.
    state.mode = 'solo'
    await dressSeats(state)
    await $room.updateRoomState({ lobby: state })
    return state
  }

  async getLobby(): Promise<any | null> {
    return readLobby()
  }

  /**
   * 내 전적. 없으면 null 을 준다 — 0 으로 채운 표는 "0판 · 최고 0위" 라는
   * 거짓 정보가 되고, 화면이 그걸 그대로 그린다.
   */
  async getProfile(): Promise<any | null> {
    const st: any = await $global.getMyState()
    return st?.profile ?? null
  }

  /**
   * 닉네임을 정한다.
   *
   * 검산은 클라와 **같은 순수 함수**(checkName)로 한다. 화면에서만 막으면
   * 조작된 요청 하나로 아무 이름이나 들어가고, 그 이름은 남의 화면에 그대로
   * 뜬다 — 기호·보이지 않는 문자까지 포함해서.
   *
   * 유일성은 안 본다. 그러려면 전체 이름 목록을 따로 세워 두고 매번 훑어야
   * 하는데, 지금 규모에서 그 값이 이득보다 크다 — 순위표는 등수로 구분된다.
   */
  async setName(raw: string): Promise<any> {
    const check: any = checkName(raw)
    if (!check.ok) return { ok: false, why: check.why }
    const account = $sender.account
    // 계정 락. 프로필 문서 하나를 결제·정산·코스메틱 구매가 같이 고친다 —
    // 락 없이 읽고 쓰면 그 사이에 들어온 젬이 이름 저장에 덮여 사라진다.
    const profile = await $lock(`user:${account}`, async () => {
      const st: any = await $global.getUserState(account)
      const next = { ...(st?.profile ?? {}), name: check.name }
      await $global.updateUserState(account, { profile: next })
      return next
    })
    return { ok: true, name: check.name, profile }
  }

  /**
   * 결제가 끝났다. 플랫폼(VXShop)이 부른다.
   *
   * **클라가 부르는 함수가 아니다.** 결제창·영수증은 전부 플랫폼이 쥐고,
   * 여기로는 "누가 무엇을 몇 개 샀다"만 온다. 그래서 이 안에서는 값을 다시
   * 안 따진다 — 값은 대시보드가 정하고 이미 받았다.
   *
   * **같은 결제가 두 번 올 수 있다.** 재시도·중복 전송은 어느 결제 시스템에나
   * 있다. purchaseId 를 컬렉션에 적어 두고, 이미 있으면 조용히 돌아간다 —
   * 없으면 재시도 한 번에 젬이 두 배로 들어간다.
   *
   * $lock 은 계정 단위다(`user:`). 젬 팩 두 개를 연달아 사면 두 훅이 같은
   * 잔액을 읽어 하나가 사라진다. **프로필을 고치는 모든 경로가 같은 키를 쓴다** —
   * 결제·구매·이름·겉모습·판 정산. 키가 갈리면 락이 없는 것과 같다.
   */
  async $onItemPurchased(event: any): Promise<any> {
    const account = event?.account
    const purchaseId = event?.purchaseId
    if (!account || purchaseId == null) return { ok: false, why: 'bad_purchase' }

    return $lock(`user:${account}`, async () => {
      const seenId = String(purchaseId)
      // __id 로 못 찾는다 — addCollectionItem 은 제 id 를 붙이고 우리가 넣은
      // __id 는 그냥 필드가 된다. 그래서 필드로 찾는다.
      const seen = await $global.getCollectionItems('purchases', {
        filters: [{ field: 'purchaseId', operator: '==', value: seenId }],
        limit: 1,
      })
      if (seen.length) return { ok: true, dup: true }

      const grant = purchaseGrant(event.productId, event.quantity, DATA)
      // 대시보드에만 있고 우리 표엔 없는 상품일 수 있다(운영이 먼저 등록한다).
      // 그 결제는 지급을 보류하되 **기록은 남긴다** — 나중에 표를 고치고
      // 손으로 채워 줄 수 있어야 한다.
      //
      // 반대로 **프로필이 없다는 이유로는 미루지 않는다.** 한 판도 안 하고
      // 젬부터 산 사람이 딱 그 경우인데, 전에는 돈만 받고 아무것도 안 줬다.
      // 게다가 결제 id 는 위에서 이미 처리 기록에 남아 재시도까지 중복으로
      // 걸렀다 — 다시 받을 길이 없었다는 뜻이다. 계정은 여기서 서면 된다.
      const prev: any = await $global.getUserState(account)
      // 컬렉션 기록만으로는 안 막힌다. 지급(프로필 쓰기)과 기록(컬렉션 쓰기)은
      // 서로 다른 문서라, 지급 뒤 기록이 실패하면 재시도가 "처음 보는 결제" 로
      // 읽어 또 준다. 그래서 프로필에도 남기고 여기서 먼저 본다.
      const already = paidAlready(prev?.profile, seenId)
      const next = already ? null : applyGrant(prev?.profile ?? null, grant, { purchaseId: seenId })
      if (next) await $global.updateUserState(account, { profile: next })
      await $global.addCollectionItem('purchases', {
        purchaseId: seenId,
        account,
        productId: event.productId ?? null,
        quantity: event.quantity ?? 1,
        gems: grant.gems,
        premium: grant.premium,
        // 우리 표에 없는 상품만 보류로 남는다. 그 사실을 적어 둬야 나중에
        // 표를 고치고 손으로 채워 줄 수 있다.
        applied: !!next || already,
        at: Date.now(),
      })
      return { ok: true, applied: !!next || already, dup: already }
    })
  }

  /**
   * 젬으로 코스메틱(아바타·무대)을 산다.
   *
   * **판정은 여기서 한다.** 화면에서만 막으면 조작된 호출 하나로 젬 없이
   * 아바타가 열린다. 클라와 같은 순수 함수(canBuyCosmetic)를 부르므로 두 쪽이
   * 다른 답을 낼 일이 없다 — 값이 어긋나면 화면에 "살 수 있다"고 뜨고 눌리지는
   * 않는 물건이 생긴다.
   *
   * $lock 으로 묶는 이유: 두 창에서 동시에 누르면 같은 젬으로 둘을 살 수 있다.
   */
  async buyCosmetic(id: string): Promise<any> {
    const account = $sender.account
    return $lock(`user:${account}`, async () => {
      const st: any = await $global.getMyState()
      const profile = st?.profile
      // 한 판도 안 한 사람은 젬이 0 이라 어차피 못 산다. 없는 전적을 여기서
      // 만들지 않는다 — 전적은 판이 끝날 때만 생긴다.
      if (!profile) return { ok: false, why: 'no_profile' }
      const item = cosmeticById(id, DATA)
      const owned = {
        gems: profile.gems ?? 0,
        avatars: profile.owned ?? [],
        passLevel: profile.pass?.level ?? 1,
        premium: !!profile.pass?.premium,
        lp: profile.lp ?? 0,
      }
      const check: any = canBuyCosmetic(item, owned, DATA)
      if (!check.ok) return { ok: false, why: check.why }

      const next = {
        ...profile,
        gems: owned.gems - check.price,
        owned: [...owned.avatars, item.id],
      }
      await $global.updateUserState(account, { profile: next })
      return { ok: true, profile: next }
    })
  }

  /**
   * 다 한 미션을 받는다.
   *
   * **판정은 서버가 한다.** 진행도는 서버가 판 끝에 적은 값이고, 다 찼는지도
   * 클라와 같은 순수 함수(claimMission)로 여기서 다시 본다 — 화면에서만 막으면
   * 조작된 호출 하나로 안 한 미션의 경험치가 들어온다.
   *
   * 계정 락은 프로필을 고치는 다른 경로와 **같은 키**다. 키가 갈리면 락이
   * 없는 것과 같다.
   */
  async claimMission(index: number): Promise<any> {
    const account = $sender.account
    if (!Number.isInteger(index)) return { ok: false, why: 'bad_request' }
    return $lock(`user:${account}`, async () => {
      const st: any = await $global.getUserState(account)
      const profile = st?.profile
      if (!profile) return { ok: false, why: 'no_missions' }
      const dayKey = dayKeyOf(Date.now())
      const r = claimMission(profile.missions ?? null, index, { dayKey, account }, DATA)
      if (r.xp <= 0) return { ok: false, why: 'not_ready', profile }
      // 경험치는 패스에 얹는다. 단계가 오르면 젬도 같이 나온다 — 그 셈은
      // addPassXp 하나가 쥔다(순위로 오르는 길과 같은 함수다).
      const pass = addPassXp(profile.pass ?? null, r.xp, DATA)
      const next = {
        ...profile,
        missions: r.state,
        pass: { xp: pass.xp, level: pass.level, premium: pass.premium },
        gems: (profile.gems ?? 0) + pass.earned,
      }
      await $global.updateUserState(account, { profile: next })
      return { ok: true, profile: next, xp: r.xp }
    })
  }

  /**
   * 튜토리얼을 끝냈다. **계정에** 남긴다.
   *
   * 기기 저장(localStorage)만 쓰면 기기를 바꾸거나 브라우저가 저장소를 비울
   * 때마다 처음 온 사람으로 돌아간다 — 배포본(iframe)에서는 저장소가 칸막이
   * 되는 일도 잦다. 전적이 없는 사람도 부를 수 있어야 하므로(튜토리얼은 판을
   * 안 센다) 프로필이 없으면 이 표시 하나만 든 프로필을 만든다.
   */
  async markTutorialDone(): Promise<{ ok: boolean }> {
    const account = $sender.account
    return $lock(`user:${account}`, async () => {
      const st: any = await $global.getUserState(account)
      const profile = { ...(st?.profile ?? {}), tutorialDone: true }
      await $global.updateUserState(account, { profile })
      return { ok: true }
    })
  }

  // ── 광고 보상 ──────────────────────────────────────────

  /**
   * 광고를 끝까지 봤다. 이번 판 패스 경험치를 한 번 더 준다.
   *
   * **지급은 서버가 판정한다.** 등수·판·하루 상한은 전부 서버가 아는 값이고,
   * 클라는 지면 id 와 SDK 가 준 requestId 만 보낸다. SDK 결과의 reward 는
   * 화면 힌트일 뿐이라 안 받는다.
   *
   * requestId 는 두 겹으로 막는다: (계정, requestId) 를 adGrants 에 적어 같은
   * 광고로 두 번 못 받고, adReward 가 판마다 한 번·하루 상한을 센다.
   *
   * 검증 서버(ads-verifier)에 물어볼 수 있으면 verified 일 때만 준다.
   *
   * **지금 이 런타임에는 fetch 가 없다**(재 봤다: "fetch: none"). 그래서 검증은
   * 늘 unavailable 이고, 광고를 봤다는 클라의 말을 믿고 준다. 그 대신 값을
   * 상한으로 묶는다 — 하루 상자는 하루 한 번, 결과판은 판마다 한 번에 하루
   * 세 번. 조작해도 하루치를 앞당길 뿐 무한히 뽑을 수는 없다.
   *
   * GameServer SDK 에 검증 헬퍼가 들어오면(문서에 "곧 출시") 이 자리를
   * unavailable → 거절로 바꾸고 상한을 풀 수 있다.
   */
  async claimAdReward(placementId: string, requestId: string): Promise<any> {
    if (typeof placementId !== 'string' || !PLACEMENTS[placementId]) return { ok: false, why: 'unknown_placement' }
    if (typeof requestId !== 'string' || !requestId || requestId.length > 128) return { ok: false, why: 'bad_request' }
    const account = $sender.account
    // 판과 무관한 지면(하루 상자)은 홈에서 부른다 — 방을 안 찾는다.
    const place: any = PLACEMENTS[placementId]
    let matchId: string | null = null
    let rank = 0
    let ranked = false
    if (!place.anyTime) {
      const roomId = $sender.roomId
      if (!roomId) return { ok: false, why: 'no_room' }
      const state = await readLobby()
      if (!state) return { ok: false, why: 'no_room' }
      const seat = state.seats.find((s: any) => s.account === account)
      if (!seat || !seat.rank) return { ok: false, why: 'no_match' }
      matchId = `${roomId}#${state.seed}`
      rank = seat.rank
      ranked = state.mode === 'ranked'
    }

    const verdict = await verifyAd(requestId)
    if (verdict === 'unverified') return { ok: false, why: 'not_watched' }

    return $lock(`user:${account}`, async () => {
      const grants: any[] = await $global.getCollectionItems('adGrants')
      if (grants.some((g: any) => g.account === account && g.requestId === requestId)) {
        return { ok: false, why: 'already' }
      }
      const st: any = await $global.getUserState(account)
      const r: any = adReward(
        st?.profile ?? null,
        { placementId, matchId, rank, ranked, dayKey: dayKeyOf(Date.now()) },
        DATA,
      )
      if (!r.ok) return { ok: false, why: r.why }
      await $global.addCollectionItem('adGrants', { account, requestId, placementId, matchId, at: Date.now() })
      await $global.updateUserState(account, { profile: r.profile })
      return { ok: true, xp: r.xp, gems: r.gems ?? 0, profile: r.profile, verified: verdict }
    })
  }

  // ── 순위표 ──────────────────────────────────────────────
  //
  // 유저 상태는 계정 하나씩만 읽을 수 있다 — "전체에서 몇 등인가"를 물으려면
  // 따로 줄을 세워 둬야 한다. 그래서 랭크 판이 끝날 때마다 컬렉션에 적는다.

  /**
   * 순위가 박힌 사람들의 전적·LP·패스·젬·미션을 한 번에 쓴다.
   *
   * **마감과 항복이 같이 쓴다.** 두 벌로 두면 한쪽만 고친 상태가 남고, 그러면
   * "항복으로 끝낸 판만 미션이 안 오르는" 식의 어긋남이 생긴다.
   *
   * 계정 락으로 묶는 이유: 이 쓰기는 결제·코스메틱 구매와 **같은 프로필**을
   * 건드린다 — 판이 끝나는 순간에 젬 팩이 들어오면 둘 중 하나가 통째로
   * 사라진다. 방 락 안에서 계정 락을 잡는 순서는 여기뿐이라 서로 물리지 않는다.
   */
  private async settleRanks(state: any, ranked: any[], matchId: string): Promise<void> {
    // LP 는 **랭크 방에서만** 움직인다. 봇이 섞이는 일반 판이 랭크 점수를
    // 좌우하면 티어가 실력을 안 가리킨다.
    const scored = state.mode === 'ranked'
    for (const r of ranked) {
      const profile = await $lock(`user:${r.account}`, async () => {
        const prev: any = await $global.getUserState(r.account)
        // 이 판을 이미 셌으면 그대로 둔다. 프로필을 쓰고 방 상태를 쓰는 사이가
        // 잘리면 방은 지난 라운드로 남고, 클라가 마감을 다시 부른다 — 그때 같은
        // 판이 또 정산되면 판수·LP·젬이 두 번 오른다.
        if (countedMatch(prev?.profile, matchId)) return prev.profile
        // 전적·LP·패스·젬을 한 함수가 낸다. 전에는 여기서 전적 칸만 든 객체를
        // 프로필로 저장해 **이름·산 아바타·고른 겉모습이 판마다 지워졌다.**
        const next = applyMatchResult(prev?.profile ?? null, r.rank, DATA, {
          ranked: scored,
          matchId,
        })
        // 미션도 **같은 쓰기에** 얹는다. 순위가 박히는 이 자리에 판 결과와
        // 마지막 보드가 다 있다 — 따로 모으면 두 값이 어긋날 자리가 생기고,
        // 프로필을 두 번 쓰면 그 사이가 잘릴 자리도 하나 더 생긴다.
        const seat = state.seats.find((x: any) => x.account === r.account)
        next.missions = advanceMissions(
          prev?.profile?.missions ?? null,
          {
            account: r.account,
            dayKey: dayKeyOf(Date.now()),
            rank: r.rank,
            ranked: scored,
            board: seat?.board ?? [],
            level: seat?.level ?? 1,
            roundWins: seat?.wins ?? 0,
          },
          DATA,
        )
        await $global.updateUserState(r.account, { profile: next })
        return next
      })
      // 순위표는 랭크 판에서만 갱신한다. 일반 판으로도 줄이 생기면 LP 0 인
      // 사람이 목록을 채워 "몇 등인가"가 아무 뜻도 없어진다.
      if (scored) await this.putLeaderboard(r.account, profile)
    }
  }

  /**
   * 항복. 내 좌석을 죽이고 그 자리로 순위를 박는다.
   *
   * **서버가 해야 하는 일이다.** 클라가 화면만 닫으면 방은 그대로 돌고, 남은
   * 사람들은 유령과 대진을 잡는다 — 그 좌석은 마감마다 빈 판으로 진다.
   *
   * 정산까지 같이 하는 이유: 항복도 그 사람의 판이 끝난 것이다. 순위만 박고
   * 전적을 안 남기면 그게 곧 항복으로 기록을 피하는 길이 된다.
   *
   * 라운드는 안 넘긴다. 항복은 마감이 아니다 — 남은 사람들의 라운드는 그들의
   * 시각으로 흘러야 한다.
   */
  async surrender(): Promise<any> {
    const roomId = $sender.roomId
    const account = $sender.account
    if (!roomId) return { ok: false, why: 'no_room' }

    return $lock(`room:${roomId}`, async () => {
      const state = await readLobby()
      if (!state) return { ok: false, why: 'no_room' }

      const { changed, seatId } = concede(state, account)
      // 이미 죽었거나 없는 좌석이면 아무 일도 없다 — 두 번 눌러도 한 번이다.
      if (!changed) return { ok: false, why: 'already_done' }

      // 혼자 남으면 그 판은 거기서 끝난다. 마감과 같은 규칙이다.
      const survivors = state.seats.filter((s: any) => s.alive).length
      if (survivors <= 1) state.phase = 'done'

      const matchId = `${roomId}#${state.seed}`
      const ranked = assignRanks(state, { final: state.phase === 'done' })
      await this.settleRanks(state, ranked, matchId)

      await $room.updateRoomState({ lobby: state })
      // 남은 사람들에게도 알린다. 안 알리면 그들의 순위표에는 항복한 사람이
      // 계속 살아 있는 것으로 남는다.
      $room.broadcastToRoom('ROUND_RESOLVED', {
        round: state.round,
        phase: state.phase,
        deadline: state.deadline,
        fights: [],
        seats: state.seats.map((s: any) => ({
          id: s.id,
          hp: s.hp,
          alive: s.alive,
          streak: s.streak,
          // 등수는 **서버가 박은 것만** 보낸다. 클라가 살아 있는 수를 세어
          // 스스로 매기게 두면 그 셈이 서버와 어긋나는 날이 오고, 결과판에
          // 뜬 등수와 실제로 받은 LP 가 서로 다른 말을 한다.
          rank: s.rank ?? null,
        })),
      })
      return { ok: true, seatId, rank: ranked.find((r: any) => r.account === account)?.rank ?? null }
    })
  }

  /**
   * 계정을 처음으로 되돌린다. **되돌릴 수 없다.**
   *
   * 프로필을 통째로 지운다 — 전적·LP·젬·패스·산 코스메틱·닉네임·미션이 전부
   * 여기 들어 있다. 순위표 줄도 같이 지운다: 안 지우면 전적은 0인데 순위표에는
   * 옛 LP 가 남아, 그 사람이 목록에서만 고수로 남는다.
   *
   * **결제 기록(purchases)은 안 지운다.** 그건 영수증이다 — 지우면 같은 결제가
   * 다시 들어올 때 "처음 보는 결제"로 읽혀 두 번 지급된다. 대신 프로필이
   * 비므로 산 것도 함께 사라진다는 사실을 화면이 미리 말한다.
   */
  async resetAccount(): Promise<{ ok: boolean }> {
    const account = $sender.account
    return $lock(`user:${account}`, async () => {
      await $global.updateUserState(account, { profile: null })
      const rows: any[] = await $global.getCollectionItems('leaderboard')
      const mine = rows.find((x: any) => x.account === account)
      if (mine) await $global.deleteCollectionItem('leaderboard', mine.__id)
      return { ok: true }
    })
  }

  /** 내 줄을 갱신한다. 없으면 만든다. */
  private async putLeaderboard(account: string, profile: any): Promise<void> {
    const rows = await $global.getCollectionItems('leaderboard')
    const mine: any = rows.find((x: any) => x.account === account)
    // 이름도 같이 적는다. 순위표를 그릴 때 계정마다 유저 상태를 다시 읽으면
    // 열 줄에 열 번을 읽는다 — 줄 안에 넣어 두면 한 번에 끝난다.
    const row = {
      account,
      lp: profile.lp,
      games: profile.games,
      best: profile.best,
      name: displayName(profile.name, account),
    }
    if (mine) await $global.updateCollectionItem('leaderboard', { ...mine, ...row })
    else await $global.addCollectionItem('leaderboard', row)
  }

  /**
   * 상위 몇 명과 내 등수.
   *
   * 정렬을 서버가 직접 안 하고 sim/rank 를 부르는 이유: 동점 처리(최고 순위 →
   * 계정 순)가 흔들리면 새로고침할 때마다 등수가 바뀐다. 그 규칙은 테스트가
   * 덮는 자리에 있어야 한다.
   */
  async getLeaderboard(limit: number = 10): Promise<any> {
    const rows: any[] = await $global.getCollectionItems('leaderboard')
    const sorted = sortLeaderboard(rows)
    const me = $sender.account
    return {
      total: sorted.length,
      myRank: rankOf(rows, me),
      top: sorted.slice(0, Math.max(1, Math.min(50, limit))).map((r: any, i: number) => ({
        rank: i + 1,
        // 계정 전체를 넘기지 않는다 — 화면에 쓸 것도 아니고, 남의 지갑
        // 주소를 목록으로 뿌릴 이유가 없다.
        name: r.name ?? displayName(null, r.account),
        // 이름은 겹칠 수 있다(유일성을 안 본다). 같은 이름이 두 줄 이상일 때
        // 화면이 이 꼬리로 가른다 — 겹치지 않으면 쓰이지 않는다.
        tag: accountTag(r.account),
        mine: r.account === me,
        lp: r.lp ?? 0,
        games: r.games ?? 0,
      })),
    }
  }

  // ── 매칭 큐 ─────────────────────────────────────────────
  //
  // 일반: 기다리다 시간이 차면 있는 사람 + 봇으로 시작한다.
  // 랭크: 사람 8명이 찰 때까지 무한 대기한다.
  //
  // 서버가 스스로 못 깨어나므로 큐 진행도 클라 폴링이 트리거다 — 대기자
  // 각자가 pollQueue 를 부르고, 조건을 처음 본 호출이 방을 만든다. $lock 으로
  // 묶어 방이 두 개 생기지 않는다.

  async joinQueue(mode: 'normal' | 'ranked'): Promise<any> {
    if (mode !== 'normal' && mode !== 'ranked') return { status: 'error', why: 'bad_request' }
    const account = $sender.account
    const col = `mmqueue-${mode}`
    await $lock(`queue:${mode}`, async () => {
      const queued = await $global.getCollectionItems(col)
      if (!queued.find((x: any) => x.account === account)) {
        await $global.addCollectionItem(col, { account, at: Date.now() })
      }
    })
    return this.pollQueue(mode)
  }

  async leaveQueue(mode: 'normal' | 'ranked'): Promise<{ ok: boolean }> {
    if (mode !== 'normal' && mode !== 'ranked') return { ok: false }
    const account = $sender.account
    const col = `mmqueue-${mode}`
    await $lock(`queue:${mode}`, async () => {
      const queued = await $global.getCollectionItems(col)
      const me = queued.find((x: any) => x.account === account)
      if (me) await $global.deleteCollectionItem(col, me.__id)
    })
    return { ok: true }
  }

  async pollQueue(mode: 'normal' | 'ranked'): Promise<any> {
    if (mode !== 'normal' && mode !== 'ranked') return { status: 'error', why: 'bad_request' }
    const account = $sender.account
    const col = `mmqueue-${mode}`
    return $lock(`queue:${mode}`, async () => {
      const queued = (await $global.getCollectionItems(col)).sort(
        (a: any, b: any) => a.at - b.at,
      )
      const me = queued.find((x: any) => x.account === account)
      if (!me) {
        // 큐에 없다 = 남의 폴링이 이미 나를 매치에 넣었다. 내 상태의 안내판을 본다.
        const st = await $global.getMyState()
        if (st.pendingRoom) return { status: 'matched', roomId: st.pendingRoom }
        return { status: 'idle' }
      }

      const size = DATA.lobby.size
      const full = queued.length >= size
      const timedOut =
        mode === 'normal' && Date.now() - me.at >= DATA.lobby.matching.normalWaitMs
      if (!full && !timedOut) {
        return { status: 'waiting', queued: queued.length, waitedMs: Date.now() - me.at }
      }

      // 방을 만든다 — 정원이 찼거나, 일반 매치의 대기 시간이 찼거나.
      const picked = queued.slice(0, size)
      // 좌석 순서가 대진 시드에 섞인다. 계정으로 정렬해야 8명 전원이 같은
      // 방을 계산한다 — 큐 도착 순서는 폴링 타이밍에 따라 흔들린다.
      const accounts = picked.map((x: any) => x.account).sort()
      const seed = (Date.now() ^ hashAccount(accounts.join('|'))) >>> 0
      const roomId = `match-${mode}-${seed.toString(36)}`

      await $global.addCollectionItem('matches', { roomId, accounts, seed, mode })
      for (const q of picked) {
        await $global.deleteCollectionItem(col, q.__id)
        await $global.updateUserState(q.account, { pendingRoom: roomId })
        // 폴링을 안 돌리고 있어도 즉시 안다. 폴링은 이 메시지를 놓쳤을 때의 보루다.
        $global.sendMessageToUser('MATCH_FOUND', q.account, { roomId })
      }
      return accounts.includes(account)
        ? { status: 'matched', roomId }
        : { status: 'waiting', queued: queued.length - picked.length, waitedMs: Date.now() - me.at }
    })
  }

  /**
   * 매치 방에 들어간다. 첫 진입자가 로비를 만든다 — matches 에 적힌 명단과
   * 시드로 만들므로 누가 먼저 들어와도 같은 방이 선다.
   */
  async joinMatchRoom(roomId: string): Promise<any> {
    if (typeof roomId !== 'string' || !roomId) return null
    const matches = await $global.getCollectionItems('matches')
    const match: any = matches.find((m: any) => m.roomId === roomId)
    if (!match || !match.accounts.includes($sender.account)) return null
    await $global.joinRoom(roomId)
    // 안내판은 지운다. 남겨 두면 다음 큐에서 이 방으로 또 끌려온다.
    await $global.updateMyState({ pendingRoom: null })

    return $lock(`room:${roomId}`, async () => {
      const existing = await readLobby()
      if (existing) return existing

      const state: any = createLobbyState({
        seed: match.seed,
        accounts: match.accounts,
        now: Date.now(),
        data: DATA,
      })
      // 랭크 판정의 근거다. 큐가 정한 모드를 방 상태에 박아 둔다.
      state.mode = match.mode
      await dressSeats(state)
      await $room.updateRoomState({ lobby: state })
      return state
    })
  }

  /**
   * 내 배치를 알린다. **정찰의 핵심이다** — 이 브로드캐스트가 있어야 상대가
   * 지금 뭘 사고 어디에 두는지가 남들에게 보인다.
   */
  async updateBoard(board: Entry[]): Promise<{ ok: boolean }> {
    return withRoom(async () => {
      const state = await readLobby()
      if (!state) return { ok: false }
      const seat = state.seats.find((s: any) => s.account === $sender.account)
      if (!seat || !seat.alive) return { ok: false }

      // **거른다.** 이건 클라가 만들어 보내는 값이다. 전에는 28개로 자르기만
      // 했다 — 없는 유닛 id 하나면 마감 계산이 예외를 내고 그 방 일곱 명이
      // 같이 멈췄다. 인원 상한은 그 좌석의 레벨이다.
      seat.board = sanitizeBoard(board, DATA, { cap: seat.level })
      await $room.updateRoomState({ lobby: state })
      $room.broadcastToRoom('BOARD_CHANGED', { id: seat.id, board: seat.board })
      return { ok: true }
    })
  }

  /**
   * 아바타 위치. 방 사람들에게 그대로 흘린다.
   *
   * **룸 상태에 안 적는다.** 초당 몇 번씩 바뀌는 값이라 매번 상태를 쓰면
   * 보드·체력이 든 그 문서를 하루 종일 다시 쓰게 된다. 위치는 놓쳐도 다음
   * 것이 곧 오므로 방송만으로 충분하다 — 늦게 들어온 사람은 그 사람이
   * 한 걸음 뗄 때 비로소 보인다.
   */
  async updateAvatar(x: number, z: number, at: number): Promise<{ ok: boolean }> {
    const state = await readLobby()
    if (!state) return { ok: false }
    const seat = state.seats.find((s: any) => s.account === $sender.account)
    if (!seat) return { ok: false }
    // at = 지금 **어느 판에 서 있는가**. 남의 판을 구경 가면 그 좌석 번호다.
    // 이게 아바타의 존재 이유다 — 내 판을 누가 보고 있는지 알려면 보는 쪽이
    // 어디에 있는지가 같이 와야 한다.
    //
    // **거른다.** 클라가 만들어 보내는 값이고 방 전체에 그대로 뿌려진다.
    // NaN 하나가 들어가면 남들 화면에서 그 아바타의 자리가 NaN 이 되고,
    // three.js 는 그걸 조용히 삼키거나 프레임을 던진다 — 한 사람이 일곱 명의
    // 화면을 깨는 길이다. 좌표는 판 범위 안의 유한한 수, at 은 실재하는 좌석.
    const px = Number(x)
    const pz = Number(z)
    const seatAt = Number(at)
    if (!Number.isFinite(px) || !Number.isFinite(pz)) return { ok: false }
    if (!Number.isInteger(seatAt) || seatAt < 0 || seatAt >= state.seats.length) return { ok: false }
    const LIMIT = 64
    $room.broadcastToRoom('AVATAR_MOVED', {
      id: seat.id,
      x: Math.max(-LIMIT, Math.min(LIMIT, px)),
      z: Math.max(-LIMIT, Math.min(LIMIT, pz)),
      at: seatAt,
    })
    return { ok: true }
  }

  /** 레벨도 정찰 대상이다 — 상대 레벨이 다음 판 인원을 말한다. */
  async updateLevel(level: number): Promise<{ ok: boolean }> {
    return withRoom(async () => {
      const state = await readLobby()
      if (!state) return { ok: false }
      const seat = state.seats.find((s: any) => s.account === $sender.account)
      if (!seat) return { ok: false }
      // 클라가 보내는 값이라 숫자가 아닐 수 있다. Math.floor('x') 는 NaN 이고,
      // NaN 은 min/max 를 그대로 통과해 좌석 레벨이 된다 — 그 레벨이 배치
      // 인원 상한으로 쓰이면 제한이 사라진다.
      const want = Number(level)
      if (!Number.isFinite(want)) return { ok: false }
      seat.level = Math.max(1, Math.min(9, Math.floor(want)))
      // 레벨이 내려가면 판에 선 인원이 상한을 넘을 수 있다. 넘친 만큼 뒤에서
      // 자른다 — 안 자르면 레벨 1 로 여덟을 세우는 길이 남는다.
      seat.board = sanitizeBoard(seat.board, DATA, { cap: seat.level })
      await $room.updateRoomState({ lobby: state })
      $room.broadcastToRoom('LEVEL_CHANGED', { id: seat.id, level: seat.level, board: seat.board })
      return { ok: true }
    })
  }

  /**
   * 내 겉모습(무대·아바타·승리 이펙트)을 좌석에 붙인다.
   *
   * 이게 서버를 타는 이유: 남의 판을 구경 가면 **그 사람 무대**가 보이고,
   * 내가 남의 판에 서면 **내 아바타**로 보여야 한다.
   * 각자 화면에만 두면 산 사람만 자기 판에서 보고, 그러면 남에게 보여 줄 수
   * 없는 것을 판 셈이 된다.
   *
   * 가진 것인지 여기서 검산한다 — 클라가 보내는 값이라 안 막으면 아무나
   * 최고 티어 무대를 깔고 앉는다. 못 가진 것이면 조용히 기본값으로 떨어진다.
   */
  async updateLook(boardId: string, avatarId: string, boomId: string): Promise<any> {
    const account = $sender.account
    return withRoom(async () => {
      const state = await readLobby()
      if (!state) return { ok: false }
      const seat = state.seats.find((s: any) => s.account === account)
      if (!seat) return { ok: false }

      const st: any = await $global.getUserState(account)
      const profile = st?.profile
      const owned = {
        gems: profile?.gems ?? 0,
        avatars: profile?.owned ?? [],
        passLevel: profile?.pass?.level ?? 1,
        // 프리미엄 전용 보상은 단계만으로 안 열린다(sim/cosmetics.js).
        premium: !!profile?.pass?.premium,
        lp: profile?.lp ?? 0,
      }
      const skin = resolveBoard(boardId, DATA, owned)
      const avatar = resolveAvatar(avatarId, DATA, owned)
      const boom = resolveBoom(boomId, DATA, owned)
      if (seat.skin === skin && seat.avatar === avatar && seat.boom === boom) {
        return { ok: true, skin, avatar, boom }
      }
      seat.skin = skin
      seat.avatar = avatar
      seat.boom = boom
      // 프로필에도 남긴다. 기기 저장소에만 두면 캐시를 지우거나 다른 기기로
      // 옮기는 순간 산 것이 기본값으로 풀린다 — 산 물건은 계정에 붙어야 한다.
      //
      // 계정 락으로 다시 읽어 쓴다: 여기서 프로필을 읽은 뒤 쓰기까지 사이에
      // 결제나 판 정산이 끼면, 위에서 읽은 옛 프로필이 그것을 덮는다.
      await $lock(`user:${account}`, async () => {
        const cur: any = await $global.getUserState(account)
        await $global.updateUserState(account, {
          profile: { ...(cur?.profile ?? {}), look: { board: skin, avatar, boom } },
        })
      })
      await $room.updateRoomState({ lobby: state })
      $room.broadcastToRoom('LOOK_CHANGED', { id: seat.id, skin, avatar, boom })
      return { ok: true, skin, avatar, boom }
    })
  }

  /**
   * 배치 마감. 클라가 "시간 됐다"고 찾아오면 서버가 시각을 검증하고 돌린다.
   *
   * $lock 으로 묶는 이유: 마감 순간엔 8명이 동시에 이 함수를 부른다. 안 묶으면
   * 같은 라운드가 여러 번 돌아 체력이 중복으로 깎인다. 락 안에서 다시 읽으므로
   * 두 번째 호출은 이미 넘어간 라운드를 보고 changed=false 로 빠진다.
   */
  async resolveRound(): Promise<any | null> {
    const roomId = $sender.roomId
    if (!roomId) return null

    return $lock(`room:${roomId}`, async () => {
      const state = await readLobby()
      if (!state) return null

      // 사람이 하나뿐인 방은 마감 전에도 넘어갈 수 있다. 봇은 정찰을 안 하니
      // 혼자 일찍 넘겨도 손해 보는 사람이 없다. 사람이 둘 이상이면 마감이 법이다.
      const humans = state.seats.filter((s: any) => !s.isBot && s.alive).length
      const { changed, fights } = resolveRound(state, Date.now(), DATA, { early: humans <= 1 })
      if (!changed) return state

      // 이 판의 이름. **방 이름만으로는 모자란다** — 1인 방(solo-계정)은 같은
      // 이름을 계속 쓰므로, 방 이름만 적어 두면 다음 판이 통째로 "이미 센 판"
      // 으로 걸린다. 시드는 판을 만들 때 한 번 정해져 그 판 내내 같다.
      const matchId = `${roomId}#${state.seed}`
      // 순위는 서버가 박는다. 클라가 "나 1등"이라고 올리면 그대로 믿게 된다.
      const ranked = assignRanks(state, { final: state.phase === 'done' })
      // LP 는 **랭크 방에서만** 움직인다. 봇이 섞이는 일반 판이 랭크 점수를
      // 좌우하면 티어가 실력을 안 가리킨다.
      await this.settleRanks(state, ranked, matchId)

      await $room.updateRoomState({ lobby: state })
      $room.broadcastToRoom('ROUND_RESOLVED', {
        round: state.round,
        phase: state.phase,
        deadline: state.deadline,
        fights,
        seats: state.seats.map((s: any) => ({
          id: s.id,
          hp: s.hp,
          alive: s.alive,
          streak: s.streak,
          // 등수는 **서버가 박은 것만** 보낸다. 클라가 살아 있는 수를 세어
          // 스스로 매기게 두면 그 셈이 서버와 어긋나는 날이 오고, 결과판에
          // 뜬 등수와 실제로 받은 LP 가 서로 다른 말을 한다.
          rank: s.rank ?? null,
        })),
      })
      return state
    })
  }

  /**
   * 서버가 클라와 같은 전투 결과를 내는지 확인한다.
   *
   * 이 방식의 전제다 — 서버는 결과만 보내고 클라가 로그를 다시 만든다.
   * 답이 갈리면 화면과 판정이 어긋난다. 테스트가 이 값을 클라 실행 결과와
   * 대조한다.
   */
  async simProbe(): Promise<string> {
    const board = [{ unitId: 'frog', star: 1, tile: 0, items: [] }]
    const foe = [{ unitId: 'orc', star: 1, tile: 0, items: [] }]
    const r = simulate({ boardA: board, boardB: foe, seed: 7, data: DATA })
    return `winner=${r.winner} ticks=${r.ticks} log=${r.log.length} rounds=${totalRounds(DATA.rounds)} units=${DATA.units.units.length}`
  }
}

/** 계정 문자열 → 32비트. 시드를 계정마다 갈라 놓기만 하면 된다. */
function hashAccount(account: string): number {
  let h = 2166136261
  for (let i = 0; i < account.length; i++) {
    h ^= account.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
