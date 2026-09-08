// 데이터 불변식 검사. 밸런스를 만졌으면 반드시 돌린다.
// 스펙 §12.4 의 8개 불변식을 검사하고, 위반 메시지 배열을 되돌린다.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadData } from '../sim/data.js'
import { roundAt } from '../sim/rounds.js'

// tools/ 기준 상대 경로. cwd 가 아니라 이 파일 위치로 잡아야 어디서 실행해도,
// 그리고 tests/validate.test.js 처럼 clone 된 data 로 불러도 항상 같은 자리를 본다.
const ICON_DIR = fileURLToPath(new URL('../game/public/assets/ui/', import.meta.url))
const AVATAR_DIR = fileURLToPath(new URL('../game/public/assets/avatars/', import.meta.url))
const AUDIO_DIR = fileURLToPath(new URL('../game/public/assets/audio/', import.meta.url))
const SRC_DIR = fileURLToPath(new URL('../game/src/', import.meta.url))

const SKILL_TYPES = new Set(['single', 'aoe', 'buff', 'summon'])

export async function validate(data) {
  const errors = []
  const { combat, units, traits, shop, economy, levels, rounds, lobby, items } = data
  const list = units.units

  const originIds = new Set(traits.origins.map((o) => o.id))
  const classIds = new Set(traits.classes.map((c) => c.id))
  const allTraits = [...traits.origins, ...traits.classes]

  // 1. 레벨별 티어 확률 합 = 100
  for (const [level, odds] of Object.entries(shop.tierOdds)) {
    const sum = odds.reduce((a, b) => a + b, 0)
    if (sum !== 100) errors.push(`레벨 ${level} 의 티어 확률 합이 ${sum} 이다 (100 이어야 한다)`)
    if (odds.length !== 5) errors.push(`레벨 ${level} 의 티어 확률 항목이 ${odds.length} 개다 (5 여야 한다)`)
  }

  // 2. 모든 유닛이 실재하는 종족 1개 + 직업 1개를 갖는다
  for (const u of list) {
    if (!originIds.has(u.origin)) errors.push(`유닛 ${u.id} 가 없는 종족 "${u.origin}" 을 참조한다`)
    if (!classIds.has(u.class)) errors.push(`유닛 ${u.id} 가 없는 직업 "${u.class}" 을 참조한다`)
    if (!SKILL_TYPES.has(u.skill?.type)) errors.push(`유닛 ${u.id} 의 스킬 타입 "${u.skill?.type}" 이 4종에 없다`)
    if (!combat.tierBase[String(u.tier)]) errors.push(`유닛 ${u.id} 의 티어 ${u.tier} 에 tierBase 정의가 없다`)
    if (!combat.classModifier[u.class]) errors.push(`유닛 ${u.id} 의 직업 계수 "${u.class}" 가 combat.json 에 없다`)
    // 화면 크기 배율. 빠지면 그 직업만 조용히 1배로 떨어져 "마법사가 탱커만 하다"가 된다
    if (!combat.classScale[u.class]) errors.push(`유닛 ${u.id} 의 직업 크기 배율 "${u.class}" 가 combat.json 에 없다`)
  }

  // 3. 각 시너지의 보유 유닛 수 >= 최대 활성 단계
  // 4. 각 시너지에 T1 진입점이 존재
  // 9. steps 와 effects 길이 일치
  for (const t of allTraits) {
    const members = list.filter((u) => u.origin === t.id || u.class === t.id)
    const maxStep = Math.max(...t.steps)
    if (members.length < maxStep) {
      errors.push(`시너지 ${t.id} 의 보유 유닛이 ${members.length} 종인데 최대 활성 단계가 ${maxStep} 이다`)
    }
    if (!members.some((u) => u.tier === 1)) {
      errors.push(`시너지 ${t.id} 에 T1 진입점이 없다 (초반에 노선을 탈 수 없다)`)
    }
    if (t.steps.length !== t.effects.length) {
      errors.push(`시너지 ${t.id} 의 steps 길이(${t.steps.length})와 effects 길이(${t.effects.length})가 다르다`)
    }
  }

  // 5. 티어별 종수와 shop.pool 정의 일치
  for (const [tier, def] of Object.entries(shop.pool)) {
    const actual = list.filter((u) => String(u.tier) === tier).length
    if (actual !== def.unitCount) {
      errors.push(`티어별 종수 불일치: T${tier} 실제 ${actual} 종 vs pool 정의 ${def.unitCount} 종`)
    }
  }

  // 6. T5 3성 봉쇄 확인 (3성 필요 매수 > T5 종당 풀 매수)
  const need3 = shop.starUpCopies['3']
  const t5copies = shop.pool['5'].copiesPerUnit
  if (t5copies >= need3) {
    errors.push(`T5 3성이 봉쇄되지 않았다: 종당 ${t5copies} 장 >= 3성 필요 ${need3} 장`)
  }

  // 7. 성급 배율이 3단계다
  if (!Array.isArray(combat.starMultiplier) || combat.starMultiplier.length !== 3) {
    errors.push('combat.json > starMultiplier 는 3개 원소 배열이어야 한다')
  }

  // 7-b. 이동 주기가 양의 정수다.
  // 0 이나 누락이면 Math.max(0, moveInterval - 1) 이 0 이 되어 유닛이 틱마다
  // 한 칸씩 — 초당 30칸으로 순간이동한다.
  if (!Number.isInteger(combat.moveInterval) || combat.moveInterval < 1) {
    errors.push(`combat.json > moveInterval 이 ${combat.moveInterval} 이다 (1 이상 정수여야 한다)`)
  }

  // 8. 보드 정의 정합성
  const b = combat.board
  if (b.rows.length !== b.rowOffset.length) {
    errors.push(`보드 rows 길이(${b.rows.length})와 rowOffset 길이(${b.rowOffset.length})가 다르다`)
  }
  const perSide = b.rows.reduce((a, n) => a + n, 0) / 2
  if (perSide !== 28) errors.push(`진영당 칸 수가 ${perSide} 이다 (28 여야 한다)`)

  // 진영 행 수가 같아야 180° 회전 대응이 성립한다 (스냅샷 PvP 의 전제)
  if (b.allyRows.length !== b.enemyRows.length) {
    errors.push(`allyRows(${b.allyRows.length}) 와 enemyRows(${b.enemyRows.length}) 의 행 수가 다르다`)
  }
  // 회전 대응: 행 r 과 (rowCount-1-r) 의 폭·오프셋이 같아야 한다
  const n = b.rows.length
  for (let r = 0; r < n; r++) {
    if (b.rows[r] !== b.rows[n - 1 - r]) {
      errors.push(`행 ${r} 과 ${n - 1 - r} 의 폭이 다르다 — 180° 회전 대응이 깨진다`)
    }
  }

  // 10. 환급표가 성급 수와 맞는다.
  // 짧으면 3성을 팔 때 sellValue 가 던지고, 그 시점은 플레이 중이다.
  const stars = combat.starMultiplier.length
  for (const key of ['multiplier', 'penalty']) {
    if (economy.sell[key]?.length !== stars) {
      errors.push(`economy.json > sell.${key} 가 ${economy.sell[key]?.length} 개다 (성급 ${stars} 단계와 같아야 한다)`)
    }
  }
  for (let star = 2; star <= stars; star++) {
    if (!shop.starUpCopies[String(star)]) {
      errors.push(`shop.json > starUpCopies 에 ${star}성 필요 매수가 없다`)
    }
  }

  // 11. 레벨 XP 표가 시작 레벨부터 끊김 없이 이어진다.
  // 중간이 비면 addXp 가 그 레벨에서 조용히 멈춰 최대 레벨에 영영 못 간다.
  const lvKeys = Object.keys(levels.xpToNext).map(Number).sort((a, b) => a - b)
  if (lvKeys[0] !== levels.startLevel) {
    errors.push(`levels.json > xpToNext 가 ${lvKeys[0]} 부터 시작한다 (startLevel ${levels.startLevel} 이어야 한다)`)
  }
  for (let i = 1; i < lvKeys.length; i++) {
    if (lvKeys[i] !== lvKeys[i - 1] + 1) {
      errors.push(`levels.json > xpToNext 에 레벨 ${lvKeys[i - 1] + 1} 이 빠졌다`)
    }
  }

  // 12. 벤치 칸이 배치 상한보다 넓다. 좁으면 합성 재료를 들고 있을 자리가 없다.
  const maxPop = lvKeys[lvKeys.length - 1] + 1
  // 램프는 라운드 수보다 길면 안 되고, 마지막 칸에서 baseIncome 으로 이어져야
  // 한다 — 램프가 baseIncome 을 넘으면 중간 라운드가 후반보다 부유해진다.
  const ramp = economy.incomeRamp ?? []
  if (!Array.isArray(ramp)) {
    errors.push('economy.json > incomeRamp 가 배열이 아니다')
  } else {
    for (const [i, v] of ramp.entries()) {
      if (!Number.isInteger(v) || v < 0) {
        errors.push(`economy.json > incomeRamp[${i}] 가 0 이상 정수가 아니다 (${v})`)
      }
      if (v > economy.baseIncome) {
        errors.push(
          `economy.json > incomeRamp[${i}] = ${v} 가 baseIncome ${economy.baseIncome} 보다 크다`,
        )
      }
    }
  }

  if (economy.benchSlots < maxPop) {
    errors.push(`벤치 ${economy.benchSlots} 칸이 최대 배치 인원 ${maxPop} 보다 좁다`)
  }

  // 13. 라운드 총수가 스펙의 23 이다. 스테이지 구성을 손대면 여기서 걸린다.
  const totalRounds = rounds.stages.reduce((a, st) => a + st.rounds, 0)
  if (totalRounds !== 23) errors.push(`총 라운드가 ${totalRounds} 이다 (23 이어야 한다)`)

  // 14. PvE 편성이 스테이지 수와 맞고, 실재하는 유닛만 쓰고, 판에 들어간다.
  if (rounds.pve.length !== rounds.stages.length) {
    errors.push(`PvE 편성 ${rounds.pve.length} 개가 스테이지 ${rounds.stages.length} 개와 다르다`)
  }
  const unitIds = new Set(list.map((u) => u.id))
  rounds.pve.forEach((def, i) => {
    for (const id of def.units) {
      if (!unitIds.has(id)) errors.push(`스테이지 ${i + 1} PvE 가 없는 유닛 "${id}" 를 쓴다`)
    }
    if (def.count > def.units.length) {
      errors.push(`스테이지 ${i + 1} PvE 가 후보 ${def.units.length} 종에서 ${def.count} 기를 뽑으려 한다`)
    }
    if (def.count > perSide) {
      errors.push(`스테이지 ${i + 1} PvE ${def.count} 기가 진영 ${perSide} 칸을 넘는다`)
    }
    if (!Number.isInteger(def.star) || def.star < 1 || def.star > stars) {
      errors.push(`스테이지 ${i + 1} PvE 의 성급 ${def.star} 이 1~${stars} 범위 밖이다`)
    }
  })

  // 15. 각 스테이지의 PvE 라운드 번호가 그 스테이지 안에 있다.
  rounds.stages.forEach((st, i) => {
    for (const r of st.pveRounds) {
      if (r < 1 || r > st.rounds) {
        errors.push(`스테이지 ${i + 1} 의 PvE 라운드 ${r} 이 1~${st.rounds} 범위 밖이다`)
      }
    }
  })

  // 16. 로비 인원과 이름 수가 맞는다. 어긋나면 봇 하나가 이름 없이 돈다.
  if (lobby.names.length !== lobby.size) {
    errors.push(`로비 이름 ${lobby.names.length} 개가 인원 ${lobby.size} 와 다르다`)
  }

  // 17. 성장표가 마지막 라운드까지 덮는다. 안 덮으면 후반 봇이 초반 세기로 남는다.
  const lastGrowth = lobby.growth[lobby.growth.length - 1]
  if (lastGrowth.untilRound < totalRounds) {
    errors.push(`로비 성장표가 ${lastGrowth.untilRound} 라운드까지만 있다 (${totalRounds} 까지 필요)`)
  }
  for (const g of lobby.growth) {
    if (g.units > perSide) errors.push(`로비 편성 ${g.units} 기가 진영 ${perSide} 칸을 넘는다`)
    if (g.star < 1 || g.star > stars) errors.push(`로비 성급 ${g.star} 이 1~${stars} 밖이다`)
    if (!combat.tierBase[String(g.maxTier)]) errors.push(`로비 maxTier ${g.maxTier} 에 tierBase 가 없다`)
  }

  // 18. 아이템 id 가 유일하다. 겹치면 뒤엣것이 앞엣것을 조용히 덮는다.
  const itemIds = items.items.map((i) => i.id)
  if (new Set(itemIds).size !== itemIds.length) {
    errors.push('아이템 id 가 중복이다')
  }

  // 19. 효과 키가 화이트리스트 안이다.
  // 오타 난 키는 아무도 읽지 않아 "효과 없는 아이템"이 조용히 출시된다.
  const ITEM_KEYS = new Set([
    'hp', 'def', 'mr', 'power', 'manaStart',
    'atkPct', 'attackSpeedPct', 'critChancePct',
    'pierceCount', 'piercePct', 'thornsPct', 'lifestealPct', 'auraAtkPct', 'auraRadius',
  ])
  for (const it of items.items) {
    if (!it.name?.ko) errors.push(`아이템 ${it.id} 에 한국어 이름이 없다`)
    for (const k of Object.keys(it.effect ?? {})) {
      if (!ITEM_KEYS.has(k)) errors.push(`아이템 ${it.id} 의 효과 키 "${k}" 를 아무도 읽지 않는다`)
    }
    if (Object.keys(it.effect ?? {}).length === 0) {
      errors.push(`아이템 ${it.id} 에 효과가 없다`)
    }
  }

  // 20. 지급 라운드 라벨이 실재한다. 스테이지 구성이 바뀌면 여기서 걸린다.
  const labels = new Set()
  for (let n = 1; n <= totalRounds; n++) labels.add(roundAt(n, rounds).label)
  for (const label of items.grantRounds) {
    if (!labels.has(label)) errors.push(`아이템 지급 라운드 "${label}" 이 실재하지 않는다`)
  }

  // 21. 유닛당 칸 수가 1 이상 정수다.
  if (!Number.isInteger(items.slotsPerUnit) || items.slotsPerUnit < 1) {
    errors.push(`items.json > slotsPerUnit 이 ${items.slotsPerUnit} 이다 (1 이상 정수여야 한다)`)
  }

  // 22. 아이템마다 아이콘 파일이 실재한다. 지금은 12장 다 있지만, id 를
  // 나중에 바꾸거나 지우면 아이콘만 조용히 고아가 되고 화면엔 깨진 이미지만 남는다.
  for (const id of itemIds) {
    if (!existsSync(`${ICON_DIR}item_${id}.png`)) {
      errors.push(`아이템 ${id} 의 아이콘 파일이 없다 (game/public/assets/ui/item_${id}.png)`)
    }
  }

  // 23. 미션 표. 모르는 kind 는 **조용히 0 점**이 된다 — 화면에는 뜨는데
  // 영원히 안 차는 미션이 그것이다. 표를 고치는 그 자리에서 걸려야 한다.
  const MISSION_KINDS = new Set([
    'games',
    'rankedGames',
    'top4',
    'firstPlace',
    'threeStar',
    'traitStep',
    'itemsWorn',
    'boardFull',
    'roundWins',
  ])
  const missionIds = new Set()
  for (const m of data.missions?.missions ?? []) {
    if (missionIds.has(m.id)) errors.push(`미션 id 가 겹친다: ${m.id}`)
    missionIds.add(m.id)
    if (!MISSION_KINDS.has(m.kind)) errors.push(`미션 ${m.id} 의 종류 "${m.kind}" 를 모른다`)
    if (!Number.isInteger(m.target) || m.target < 1)
      errors.push(`미션 ${m.id} 의 target 이 1 이상 정수가 아니다`)
    if (!(m.xp > 0)) errors.push(`미션 ${m.id} 의 xp 가 양수가 아니다`)
    if (!m.text) errors.push(`미션 ${m.id} 에 화면 문구가 없다`)
  }
  // 하루에 뽑을 수가 표에 있는 수보다 많으면 같은 미션이 두 번 뽑힌다.
  if ((data.missions?.perDay ?? 0) > (data.missions?.missions?.length ?? 0))
    errors.push('perDay 가 미션 종류 수보다 많다')

  // 24. 패스 보상. 단계·트랙이 틀리면 그 보상은 **조용히 사라진다** — 예외도
  // 안 나고 화면에도 안 뜬다. 표를 고치는 그 자리에서 걸려야 한다.
  const passSeen = new Map()
  const passLists = [
    ['아바타', data.cosmetics?.avatars ?? []],
    ['무대', data.cosmetics?.boards ?? []],
    ['이펙트', data.cosmetics?.booms ?? []],
  ]
  const maxPassLevel = data.pass?.maxLevel ?? 0
  for (const [what, list] of passLists) {
    for (const item of list) {
      if (item.unlock !== 'pass') continue
      if (
        !Number.isInteger(item.passLevel) ||
        item.passLevel < 1 ||
        item.passLevel > maxPassLevel
      ) {
        errors.push(`${what} ${item.id} 의 패스 단계가 1..${maxPassLevel} 밖이다`)
      }
      // 한 칸에 둘이 걸리면 화면이 하나만 그리고 나머지는 조용히 사라진다.
      // 트랙이 한 줄이라 단계 하나에 물건도 하나다.
      if (passSeen.has(item.passLevel)) {
        errors.push(
          `패스 보상이 겹친다: ${item.passLevel}단계에 ${passSeen.get(item.passLevel)} 와 ${item.id}`,
        )
      }
      passSeen.set(item.passLevel, item.id)
      // 아바타 보상은 그림이 있어야 한다. 없으면 트랙에 빈 액자가 뜬다.
      if (item.file && !existsSync(`${AVATAR_DIR}${item.file}`)) {
        errors.push(`${what} ${item.id} 의 파일이 없다 (${item.file})`)
      }
    }
  }

  // 25. 승리 이펙트의 형태. 모르는 이름이면 **조용히 기본 형태**로 떨어져서,
  // 여덟 종이 다시 색만 다른 하나가 된다(예외도 안 난다).
  const BOOM_STYLES = new Set(['burst', 'rain', 'storm', 'pillar', 'slash'])
  for (const b of data.cosmetics?.booms ?? []) {
    const style = b.fx?.style
    if (style && !BOOM_STYLES.has(style)) {
      errors.push(`승리 이펙트 ${b.id} 의 형태 "${style}" 를 모른다`)
    }
  }

  // 26. 무료 칸 목록. 트랙이 한 줄이 되면서 **여기가 유일한 단일소스**다 —
  // 범위 밖 단계를 적으면 그 칸은 영영 안 열리고, 화면에는 자물쇠만 남는다.
  const freeLevels = data.pass?.freeLevels ?? []
  const freeSeen = new Set()
  for (const lv of freeLevels) {
    if (!Number.isInteger(lv) || lv < 1 || lv > maxPassLevel) {
      errors.push(`무료 칸 ${lv} 가 1..${maxPassLevel} 밖이다`)
    }
    if (freeSeen.has(lv)) errors.push(`무료 칸 ${lv} 가 두 번 적혀 있다`)
    freeSeen.add(lv)
  }
  // 무료 칸이 하나도 없으면 트랙은 광고판이 되고, 전부 무료면 팔 것이 없다.
  if (freeLevels.length === 0) errors.push('무료 칸이 하나도 없다')
  if (freeLevels.length >= maxPassLevel) errors.push('무료 칸이 트랙 전체다 — 팔 것이 없다')

  // 27. 이름·설명은 **우리가 파는 모든 언어에** 있어야 한다. 한 언어가
  // 빠지면 그 화면에서 영어가 섞여 나온다 — 화면에서야 발견하게 된다.
  //
  // 언어 목록은 문구 표(game/src/lang/)에서 읽는다. 여기에 손으로 적어 두면
  // 언어를 더한 날 이 검사만 옛 목록을 보고 통과시킨다.
  const { STRINGS } = await import(pathToFileURL(SRC_DIR + 'i18n.js').href)
  const LANGS = Object.keys(STRINGS)
  const both = (v) => v == null || typeof v === 'string' || LANGS.every((l) => v[l])
  const named = [
    ['유닛', data.units?.units ?? []],
    ['아이템', data.items?.items ?? []],
    ['아바타', data.cosmetics?.avatars ?? []],
    ['무대', data.cosmetics?.boards ?? []],
    ['이펙트', data.cosmetics?.booms ?? []],
    ['상품', data.store?.products ?? []],
    ['미션', data.missions?.missions ?? []],
    ['시즌', data.season?.seasons ?? []],
  ]
  for (const [what, list] of named) {
    for (const x of list) {
      if (!both(x.name)) errors.push(`${what} ${x.id} 의 이름에 빠진 언어가 있다`)
      if (!both(x.desc)) errors.push(`${what} ${x.id} 의 설명에 빠진 언어가 있다`)
      if (!both(x.text)) errors.push(`${what} ${x.id} 의 문구에 빠진 언어가 있다`)
    }
  }
  for (const n of data.lobby?.names ?? []) {
    if (!both(n)) errors.push('봇 이름에 빠진 언어가 있다')
  }

  // 28. 소리. 두 가지가 조용히 어긋난다:
  //   - 화면이 표에 없는 이름을 부른다 — audio.js 가 그냥 넘기므로 그 소리만
  //     영영 안 난다(예외도 콘솔 경고도 없다)
  //   - 표에 적힌 파일이 없다 — 브라우저가 404 를 삼키고 역시 조용하다
  // 둘 다 "왜 이것만 소리가 안 나지"로 한참 뒤에 발견된다.
  errors.push(...(await audioErrors()))

  // 29. i18n 의 t 를 가리는 지역 이름. 가린 자리에서 t() 를 부르면 그 화면이
  //     통째로 안 뜨는데, 가려도 안 부르면 우연히 멀쩡해서 안 보인다.
  errors.push(...shadowErrors())

  return errors
}

/**
 * 소리 표와 실제 파일·부르는 쪽을 맞춰 본다.
 *
 * 표를 정규식으로 긁지 않고 **audio.js 를 그대로 불러온다** — 표가 소스 안에
 * 있으니 파일을 읽어 뜯는 방법도 되지만, 그러면 표 모양을 조금만 바꿔도
 * 검사기가 조용히 빈 표를 들고 통과한다. 불러오면 그런 여지가 없다.
 * (audio.js 는 부를 때까지 브라우저 물건을 안 건드려서 Node 에서도 뜬다.)
 */
async function audioErrors() {
  const errors = []
  const { SFX_NAMES, BGM_NAMES, AUDIO_FILES } = await import('../game/src/audio.js')
  const names = new Set(SFX_NAMES)
  const bgmNames = new Set(BGM_NAMES)

  for (const f of AUDIO_FILES) {
    if (!existsSync(AUDIO_DIR + f)) errors.push(`소리 파일 ${f} 가 없다 (node tools/audio-import.mjs)`)
  }

  // 부르는 쪽. 정규식 대신 여는 따옴표까지를 그대로 찾는다 — 이 파일에 역슬래시가
  // 섞이면 줄끝(CRLF)과 엮여 조용히 안 맞는 검사가 된다.
  const calls = (text, head) => {
    const out = []
    let i = 0
    for (;;) {
      i = text.indexOf(head, i)
      if (i < 0) return out
      i += head.length
      const end = text.indexOf("'", i)
      if (end < 0) return out
      out.push(text.slice(i, end))
      i = end
    }
  }
  for (const file of readdirSync(SRC_DIR)) {
    // audio.js 자신은 뺀다 — 거기 적힌 이름은 표 그 자체다.
    if (!file.endsWith('.js') || file === 'audio.js') continue
    const text = readFileSync(SRC_DIR + file, 'utf8')
    for (const n of calls(text, "sfx('")) {
      if (!names.has(n)) errors.push(`${file} 가 없는 효과음 "${n}" 를 부른다`)
    }
    for (const n of calls(text, "bgm('")) {
      if (!bgmNames.has(n)) errors.push(`${file} 가 없는 배경음 "${n}" 를 부른다`)
    }
  }
  return errors
}

/**
 * 화면 코드가 i18n 의 `t` 를 지역 이름으로 가리고 있나.
 *
 * 이 검사가 있는 이유: 한 판을 통째로 날린 버그가 이 종류였다. 결과판을 담은
 * `result` 를 `settle(result, info)` 의 매개변수가 가려서, **판이 끝나는 그
 * 순간에만** 터졌다. 패스 트랙의 `.map((t) => …)` 도 같았다 — 잠긴 칸을
 * 그릴 때만 터져서 창이 통째로 안 열렸다.
 *
 * 가려도 그 안에서 안 부르면 우연히 멀쩡하다. 그 우연이 문제다: 한 줄만
 * 더하면 같은 길로 가는데, 그때는 원인이 그 줄에 안 보인다.
 */
function shadowErrors() {
  const errors = []
  const IMPORTS_T = /import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*'\.\/i18n\.js'/
  // 지역에 t 를 만드는 꼴들. 화살표 매개변수 · 선언 · for 문.
  const SHADOWS = [
    ['(t)', '화살표 매개변수'],
    ['(t,', '매개변수'],
    [', t)', '매개변수'],
    ['const t =', '선언'],
    ['let t =', '선언'],
    ['for (const t ', 'for 문'],
    ['for (let t ', 'for 문'],
  ]
  for (const file of readdirSync(SRC_DIR)) {
    if (!file.endsWith('.js')) continue
    const text = readFileSync(SRC_DIR + file, 'utf8')
    if (!IMPORTS_T.test(text)) continue
    for (const [needle, what] of SHADOWS) {
      if (text.includes(needle)) errors.push(`${file} 가 i18n 의 t 를 ${what}로 가린다 ("${needle}")`)
    }
  }
  return errors
}

// Windows 에서 import.meta.url 은 file:///C:/... (슬래시 3개)로 렌더된다.
// 문자열을 손으로 조립하면 슬래시 수가 어긋나 가드가 영영 거짓이 되고,
// CLI 가 아무것도 안 하면서 exit 0 으로 통과한 척한다. pathToFileURL 로 정규화한다.
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) {
  const data = await loadData()
  const errors = await validate(data)
  if (errors.length > 0) {
    console.error(`불변식 위반 ${errors.length} 건:`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log('불변식 통과')
}
