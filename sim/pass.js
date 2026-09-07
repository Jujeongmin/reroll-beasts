// 시즌 패스. 판을 끝내면 경험치가 오르고, 단계가 오르면 아바타가 열린다.
//
// **아바타 해금 단계는 여기 안 적는다.** cosmetics.json 이 이미 아바타마다
// `passLevel` 을 들고 있고, isUnlocked 가 그걸 본다. 여기에 또 적으면 두 표가
// 어긋나는 순간 "화면엔 열렸는데 못 고르는" 아바타가 생긴다. 트랙 화면은
// cosmetics 를 **읽어서** 만든다 — 단일소스가 하나여야 한다.
//
// 순수 함수인 이유는 나머지 sim 과 같다: 서버가 이 함수로 경험치를 올리고,
// 화면은 같은 함수로 그린다. 둘이 다른 셈을 타면 진행도가 서로 달라진다.

/** 아무것도 안 한 사람의 패스. 저장된 값이 없을 때 이걸로 친다. */
export const EMPTY_PASS = { xp: 0, level: 1, premium: false }

/**
 * 한 판의 순위로 버는 경험치.
 *
 * 일반 판은 절반이다 — 봇이 섞인 방이라 같은 1등이라도 값이 다르다. 0 으로
 * 두지 않는 이유: 랭크만 주면 일반 매치가 패스에 대해 죽은 경로가 되고,
 * 그러면 랭크를 돌 실력이 안 되는 사람은 패스를 영영 못 올린다.
 */
export function xpForRank(rank, data, { ranked = true } = {}) {
  const p = data.pass
  const base = p.xpByRank[rank] ?? 0
  return Math.round(base * (ranked ? 1 : p.casualScale))
}

/** 이 시즌에 더 이상 쌓이지 않는 경험치 총량. 최고 단계에 닿는 값이다. */
export function xpCap(data) {
  return (data.pass.maxLevel - 1) * data.pass.xpPerLevel
}

/** 누적 경험치 → 단계. 1단계에서 시작한다 — 0단계는 사람이 안 쓰는 말이다. */
export function passLevelOf(xp, data) {
  const p = data.pass
  return Math.min(p.maxLevel, 1 + Math.floor(Math.max(0, xp) / p.xpPerLevel))
}

/**
 * 화면이 쓰는 진행도.
 *
 * 최고 단계에서는 `need` 만큼 다 찬 것으로 준다 — 남은 양을 0 으로 주면
 * 게이지가 텅 비어서 "방금 초기화됐다"로 읽힌다.
 */
export function passProgress(xp, data) {
  const p = data.pass
  const level = passLevelOf(xp, data)
  const done = level >= p.maxLevel
  const into = done ? p.xpPerLevel : Math.max(0, xp) % p.xpPerLevel
  return {
    xp: Math.max(0, xp),
    level,
    max: p.maxLevel,
    into,
    need: p.xpPerLevel,
    ratio: into / p.xpPerLevel,
    done,
  }
}

/**
 * 이 단계가 **누구나 받는 칸**인가.
 *
 * 트랙은 한 줄이다. 칸마다 보상이 하나이고 기본은 프리미엄을 사야 열린다 —
 * 무료 칸은 그중 몇 개다. 목록을 pass.json 한 곳에 두는 이유: 코스메틱 줄에도
 * 무료 표시를 적으면 두 표가 어긋나는 순간 "화면엔 자물쇠인데 서버는 열어
 * 주는" 칸이 생긴다.
 */
export function isFreeLevel(level, data) {
  return (data.pass.freeLevels ?? []).includes(level)
}

/**
 * 그 단계에서 주는 젬. 물건이 걸린 칸은 0 이다 — 한 칸에 보상 하나다.
 *
 * 무료 칸을 더 주는 이유: 무료 칸이 아홉뿐이라 프리미엄 칸과 같은 값이면
 * 한 시즌을 다 돌아도 젬 상점에서 살 수 있는 것이 없다.
 */
export function gemsAt(level, data) {
  const rule = data.pass.gems
  if (!rule || level < 1 || level > data.pass.maxLevel) return 0
  if (itemAt(level, data)) return 0
  return isFreeLevel(level, data) ? (rule.freeAmount ?? rule.amount ?? 0) : (rule.amount ?? 0)
}

/**
 * from 단계 **다음**부터 to 단계까지 받은 젬 합계.
 *
 * from 을 빼는 이유: 이미 지난 단계라 저번에 받았다. 포함하면 판이 끝날
 * 때마다 같은 보상을 다시 준다.
 */
export function gemsBetween(from, to, premium, data) {
  let sum = 0
  for (let lv = from + 1; lv <= to; lv++) {
    // 프리미엄을 안 샀으면 잠긴 칸의 젬은 안 들어온다 — 화면이 자물쇠를 그려
    // 놓고 젬만 주면 그 자물쇠가 거짓말이 된다.
    if (!premium && !isFreeLevel(lv, data)) continue
    sum += gemsAt(lv, data)
  }
  return sum
}

/**
 * 판 하나를 반영한 새 패스 상태.
 *
 * 새 객체를 낸다 — 서버가 유저 상태를 읽어 고쳐 쓰므로, 제자리에서 고치면
 * 실패한 쓰기와 성공한 쓰기를 구분할 수 없다(mergeProfile 과 같은 이유).
 * `earned` 는 이번에 새로 번 젬이다. 잔액이 아니라 증분을 주는 이유: 잔액을
 * 여기서 계산하려면 이 함수가 지갑까지 알아야 하고, 그러면 패스와 지갑이
 * 한 덩어리가 된다.
 */
export function advancePass(prev, rank, data, opts = {}) {
  return addPassXp(prev, xpForRank(rank, data, opts), data)
}

/**
 * 패스에 경험치를 **직접** 얹는다.
 *
 * 순위가 아니라 경험치를 받는 이유: 미션 보상은 정해진 값이라 advancePass 로는
 * 못 얹는다. 단계가 오를 때 젬을 주는 셈(gemsBetween)을 두 곳에 적으면 미션으로
 * 오른 단계만 젬을 안 주는 일이 생긴다 — 그래서 두 경로가 여기 하나로 모인다.
 *
 * 음수는 안 받는다. 경험치를 빼앗는 길을 열어 두면, 어딘가에서 부호 하나 틀린
 * 값이 들어왔을 때 진행도가 조용히 되감긴다.
 */
export function addPassXp(prev, gain, data) {
  const before = { ...EMPTY_PASS, ...(prev ?? {}) }
  const xp = Math.min(xpCap(data), before.xp + Math.max(0, gain ?? 0))
  const level = passLevelOf(xp, data)
  return {
    xp,
    level,
    premium: !!before.premium,
    earned: gemsBetween(before.level, level, before.premium, data),
  }
}

/**
 * 그 단계에 걸린 물건. 없으면 null.
 *
 * 아바타·무대·이펙트를 **한 번에** 훑는다. 종류마다 목록이 갈려 있지만 트랙에
 * 서는 자리는 하나다 — 종류별로 따로 그리면 한 칸에 둘이 겹친 것을 화면이
 * 못 본다(그 겹침은 불변식이 막는다).
 */
export function itemAt(level, data) {
  const lists = [
    ['avatar', data.cosmetics.avatars],
    ['board', data.cosmetics.boards],
    ['boom', data.cosmetics.booms],
  ]
  for (const [kind, list] of lists) {
    const found = list.find((x) => x.unlock === 'pass' && x.passLevel === level)
    if (found) {
      return {
        kind,
        id: found.id,
        name: found.name,
        file: found.file ?? null,
        colors: found.colors ?? null,
        fx: found.fx ?? null,
      }
    }
  }
  return null
}

/**
 * 트랙 한 줄씩. 화면이 그대로 그린다.
 *
 * **한 줄이다.** 칸마다 보상이 하나이고, free 가 거짓인 칸은 프리미엄을 사야
 * 열린다. 두 줄로 나눠 그리던 때는 무료 줄만 보고 "받을 게 이것뿐"으로 읽혔다 —
 * 한 줄에 자물쇠를 세우면 무엇을 놓치는지가 같은 자리에서 보인다.
 *
 * 잠긴 단계도 **전부** 준다. 무엇이 기다리는지 보여야 살 이유가 생긴다.
 */
export function passTrack(data, pass = EMPTY_PASS) {
  const cur = passLevelOf(pass.xp ?? 0, data)
  const out = []
  for (let level = 1; level <= data.pass.maxLevel; level++) {
    out.push({
      level,
      reached: level <= cur,
      free: isFreeLevel(level, data),
      gems: gemsAt(level, data),
      item: itemAt(level, data),
    })
  }
  return out
}
