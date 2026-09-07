// 문자열 표.
//
// **키가 없으면 키를 그대로 그린다.** 빈 화면보다 낫고, 빠뜨린 자리가 화면에서
// 바로 눈에 띈다 — 조용히 빈칸으로 두면 배포 뒤에야 발견한다.
//
// 언어는 기기에 저장한다(rr.lang). 계정에 두면 값 하나 바꾸는 데 서버 왕복이
// 필요하고, 기기마다 다른 언어를 쓰는 사람이 있다.
//
// 영어는 직역이 아니다. 그 자리에서 하는 일을 영어로 쓴 것이다 — 한국어 문장을
// 그대로 옮기면 버튼 폭을 넘기거나, 게임에서 안 쓰는 말이 된다.

const LANG_KEY = 'rr.lang'

export const STRINGS = {
  ko: {
    // ── 홈 ──
    'prep.buyxp': '경험치 구매',
    'prep.reroll': '새로고침',
    'coach.fight': '싸우자',
    'coach.home': '홈으로',
    'coach.skip': '건너뛰기',
    'home.cancel': '취소',
    'skins.title': '꾸미기',
    'skins.avatar': '아바타',
    'skins.board': '무대',
    'skins.boom': '승리',
    'name.title': '이름 바꾸기',
    'name.note': '순위표와 남의 화면에 이 이름이 뜬다',
    'name.save': '저장',
    'board.title': '순위표',
    'rotate': '가로로 돌려주세요',
    'boot.loading': '불러오는 중…',
    'settings.ingame': '설정',
    'menu.normal': '일반 매치',
    'name.failed': '저장을 못 했다',
    'skins.inUse': '지금 쓰는 중',
    'skins.pick': '이걸로 하기',
    'skins.buy': '{n} 젬으로 사기',
    'skins.priceWhy': '{n} 젬 · {why}',
    'skins.buying': '사는 중…',
    'pass.doneHead': '{max}단계 · 다 올랐다 · 젬 {gems}',
    'pass.head': '{lv}단계 · 다음까지 {left} · 젬 {gems}',
    'pass.lockTip': '프리미엄 패스를 사야 열린다',
    'pass.next': '{lv}단계 · {name}',
    'pass.nextTip': '{lv}단계 보상: {name}',
    'pass.leftDays': '{name} · {days}일 남음',
    'shop.loading': '상품을 불러오는 중…',
    'shop.passWhat': '시즌 패스 · ',
    'board.loading': '불러오는 중…',
    'board.failed': '순위표를 못 받았다',
    'board.empty': '아직 랭크 판을 끝낸 사람이 없다',
    'board.mine': '{total}명 중 {rank}등',
    'board.total': '{total}명',
    'home.toNext': '{tier}까지 {lp} LP',
    'home.guest': '유저',
    'menu.ranked': '랭크 매치',
    'menu.tutorial': '튜토리얼',
    'menu.skins': '꾸미기',
    'menu.shop': '상점',
    'menu.settings': '설정',
    'home.rankNone': '랭크 없음',
    'home.waitFirst': '첫 판을 기다린다',
    'home.leaderboard': '전체 순위 보기',
    'home.setName': '이름 정하기',
    'home.retry': '다시 시도',
    'home.firstHint': '처음이라면 여기부터 시작',
    'home.close': '닫기',

    // ── 시즌 패스 ──
    'pass.title': '시즌 패스',
    'pass.level': '{n}단계',
    'pass.locked': '자물쇠 칸은 프리미엄 패스를 사야 열린다',
    'pass.unlocked': '프리미엄 패스를 갖고 있다 — 모든 칸이 열린다',
    'pass.soon': '준비 중',

    // ── 상점 ──
    'shop.title': '젬 충전',
    'shop.note': '꾸미기는 [꾸미기]에서 산다',
    'shop.offline': '결제는 Verse8 에서 실행할 때만 열린다 — 값은 참고값이다',
    'shop.about': '약 ${usd}',

    // ── 미션 ──
    'mission.title': '오늘의 미션',
    'mission.claim': '받기',

    // ── 설정 ──
    'settings.title': '설정',
    'settings.sfx': '효과음',
    'settings.bgm': '배경음',
    'settings.language': '언어',
    'settings.motion': '화면 효과 줄이기',
    'settings.account': '내 계정',
    'settings.reset': '데이터 초기화',
    'settings.resetGo': '지운다',
    'settings.resetWarn': '전적 · 젬 · 패스 · 산 아바타 · 닉네임이 사라진다 · 되돌릴 수 없다',
    'settings.surrender': '항복',
    'settings.surrenderGo': '항복한다',
    'settings.surrenderWarn': '이 판이 끝난다 · 순위는 지금 자리로 기록된다',
    'settings.cancel': '그만두기',
    'settings.credits': 'Reroll Beasts · 출처는 CREDITS.md',

    // ── 서버가 보내는 사유 ──
    'why.no_item': '없는 물건',
    'why.not_for_sale': '파는 물건이 아니다',
    'why.owned': '이미 갖고 있다',
    'why.unlocked': '이미 열렸다',
    'why.need_gems': '젬이 모자라다',
    'why.no_profile': '아직 젬이 없다',
    'why.not_ready': '아직 못 받는다',
    'why.no_room': '방에 없다',
    'why.already_done': '이미 끝난 판이다',
    'why.bad_request': '잘못된 요청',
  },
  en: {
    'menu.normal': 'Normal',
    'name.failed': "Couldn't save",
    'skins.inUse': 'In use',
    'skins.pick': 'Use this',
    'skins.buy': 'Buy for {n} gems',
    'skins.priceWhy': '{n} gems · {why}',
    'skins.buying': 'Buying…',
    'pass.doneHead': 'Lv {max} · maxed · {gems} gems',
    'pass.head': 'Lv {lv} · {left} to next · {gems} gems',
    'pass.lockTip': 'Needs the Premium Pass',
    'pass.next': 'Lv {lv} · {name}',
    'pass.nextTip': 'Lv {lv} reward: {name}',
    'pass.leftDays': '{name} · {days} days left',
    'shop.loading': 'Loading products…',
    'shop.passWhat': 'Season Pass · ',
    'board.loading': 'Loading…',
    'board.failed': "Couldn't load the leaderboard",
    'board.empty': 'Nobody has finished a ranked match yet',
    'board.mine': '#{rank} of {total}',
    'board.total': '{total} players',
    'home.toNext': '{lp} LP to {tier}',
    'home.guest': 'Player',
    'prep.buyxp': 'Buy XP',
    'prep.reroll': 'Reroll',
    'coach.fight': 'Fight',
    'coach.home': 'Home',
    'coach.skip': 'Skip',
    'home.cancel': 'Cancel',
    'skins.title': 'Cosmetics',
    'skins.avatar': 'Avatar',
    'skins.board': 'Arena',
    'skins.boom': 'Win FX',
    'name.title': 'Change name',
    'name.note': 'Shown on the leaderboard and to others',
    'name.save': 'Save',
    'board.title': 'Leaderboard',
    'rotate': 'Please rotate to landscape',
    'boot.loading': 'Loading…',
    'settings.ingame': 'Settings',
    'menu.ranked': 'Ranked',
    'menu.tutorial': 'Tutorial',
    'menu.skins': 'Cosmetics',
    'menu.shop': 'Shop',
    'menu.settings': 'Settings',
    'home.rankNone': 'Unranked',
    'home.waitFirst': 'Play your first match',
    'home.leaderboard': 'Leaderboard',
    'home.setName': 'Set a name',
    'home.retry': 'Retry',
    'home.firstHint': 'New here? Start with this',
    'home.close': 'Close',

    'pass.title': 'Season Pass',
    'pass.level': 'Lv {n}',
    'pass.locked': 'Locked tiers need the Premium Pass',
    'pass.unlocked': 'Premium Pass active — every tier is open',
    'pass.soon': 'Coming soon',

    'shop.title': 'Get Gems',
    'shop.note': 'Cosmetics are bought in [Cosmetics]',
    'shop.offline': 'Purchases only work inside Verse8 — prices shown are estimates',
    'shop.about': 'about ${usd}',

    'mission.title': "Today's Missions",
    'mission.claim': 'Claim',

    'settings.title': 'Settings',
    'settings.sfx': 'Sound effects',
    'settings.bgm': 'Music',
    'settings.language': 'Language',
    'settings.motion': 'Reduce effects',
    'settings.account': 'My account',
    'settings.reset': 'Reset data',
    'settings.resetGo': 'Delete',
    'settings.resetWarn': 'Record, gems, pass, avatars and name are gone · cannot be undone',
    'settings.surrender': 'Surrender',
    'settings.surrenderGo': 'Surrender',
    'settings.surrenderWarn': 'This match ends · your rank is recorded where you stand',
    'settings.cancel': 'Cancel',
    'settings.credits': 'Reroll Beasts · credits in CREDITS.md',

    'why.no_item': 'No such item',
    'why.not_for_sale': 'Not for sale',
    'why.owned': 'Already owned',
    'why.unlocked': 'Already unlocked',
    'why.need_gems': 'Not enough gems',
    'why.no_profile': 'No gems yet',
    'why.not_ready': 'Not ready to claim',
    'why.no_room': 'Not in a match',
    'why.already_done': 'This match already ended',
    'why.bad_request': 'Bad request',
  },
}

let current = null

/**
 * 지금 언어. 저장된 값이 없으면 **기기가 쓰는 언어**를 따른다 — 처음 온 사람에게
 * 무엇으로 볼지 묻지 않는다.
 */
export function lang() {
  if (current) return current
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'ko' || saved === 'en') return (current = saved)
  } catch {
    // 저장소를 못 읽는 브라우저가 있다. 기기 언어만 본다.
  }
  const nav = String(globalThis.navigator?.language ?? 'ko').toLowerCase()
  return (current = nav.startsWith('ko') ? 'ko' : 'en')
}

/** 언어를 바꾼다. 화면은 부르는 쪽이 다시 그린다 — 여기서 DOM 을 모른다. */
export function setLang(v) {
  current = v === 'en' ? 'en' : 'ko'
  try {
    localStorage.setItem(LANG_KEY, current)
  } catch {
    // 못 적어도 이번 판에는 바뀐다.
  }
  return current
}

/** 키 → 문장. `{n}` 같은 자리는 vars 로 채운다. */
export function t(key, vars) {
  const table = STRINGS[lang()] ?? STRINGS.ko
  let s = table[key]
  if (s == null) return key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  }
  return s
}

/**
 * 데이터에 든 이름·설명. `{ ko, en }` 이면 지금 언어를, 문자열이면 그대로.
 *
 * 문자열도 받는 이유: 데이터 파일을 한 번에 다 옮기지 않는다. 아직 한국어만
 * 있는 줄도 화면에는 떠야 하고, 그래야 옮기는 도중에도 게임이 돈다.
 */
export function textOf(field) {
  if (field == null) return ''
  if (typeof field === 'string') return field
  return field[lang()] ?? field.ko ?? field.en ?? ''
}

/** `data-i18n` 이 붙은 요소를 채운다. 정적 문구는 이 한 번으로 끝난다. */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n)
  }
  for (const el of root.querySelectorAll('[data-i18n-aria]')) {
    el.setAttribute('aria-label', t(el.dataset.i18nAria))
  }
}
