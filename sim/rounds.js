// 라운드 진행. 스테이지·PvE 편성·패배 피해를 rounds.json 에서 읽는다.
// 순수 함수다 — 서버가 "이 사람이 지금 몇 라운드인가"를 같은 코드로 센다.

export function totalRounds(rounds) {
  return rounds.stages.reduce((a, s) => a + s.rounds, 0)
}

/**
 * 통산 라운드 번호(1부터) → 스테이지 정보.
 *
 * 화면에 "2-3" 으로 보이는 그 번호를 여기서 만든다. 화면 쪽에서 따로 세면
 * 스테이지 구성이 바뀔 때 표시와 실제 편성이 어긋난다.
 */
export function roundAt(n, rounds) {
  let left = n
  for (let i = 0; i < rounds.stages.length; i++) {
    const st = rounds.stages[i]
    if (left <= st.rounds) {
      return {
        stage: i + 1,
        stageIndex: i,
        roundInStage: left,
        label: `${i + 1}-${left}`,
        isPve: st.pveRounds.includes(left),
        damage: st.damage,
      }
    }
    left -= st.rounds
  }
  return null
}

/**
 * PvE 적 편성. 스테이지별 후보에서 count 만큼 뽑아 앞줄부터 채운다.
 *
 * 타일은 **로컬 좌표**다 — 진영 변환은 sim/combat.js 가 한다.
 * 여기서 전장 좌표를 쓰면 적이 자기 진영 밖에 서게 된다.
 */
export function pveBoard(stageIndex, rng, data) {
  const def = data.rounds.pve[stageIndex]
  if (!def) throw new Error(`스테이지 ${stageIndex + 1} 의 PvE 편성이 없다`)

  // 후보를 섞어 매판 같은 조합만 나오지 않게 한다. Fisher-Yates.
  const pool = [...def.units]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, def.count).map((unitId, tile) => ({ unitId, star: def.star, tile }))
}

/**
 * 패배 시 잃는 HP = 스테이지 계수 + 살아남은 적 유닛 수.
 * 이겼으면 0 이다.
 */
export function defeatDamage(survivingEnemies, stageDamage) {
  return stageDamage + survivingEnemies
}

/**
 * 아이템 지급 라운드 라벨 → 절대 라운드 번호 집합.
 *
 * items.json 이 라벨("2-3")로 적는 이유: 절대 번호로 적으면 스테이지 구성을
 * 바꿀 때 지급 시점이 소리 없이 다른 곳으로 옮겨 간다.
 */
export function grantIndices(data) {
  const total = totalRounds(data.rounds)
  const byLabel = new Map()
  for (let n = 1; n <= total; n++) byLabel.set(roundAt(n, data.rounds).label, n)

  const out = new Set()
  for (const label of data.items.grantRounds) {
    const n = byLabel.get(label)
    if (n === undefined) throw new Error(`아이템 지급 라운드 "${label}" 이 실재하지 않는다`)
    out.add(n)
  }
  return out
}

/**
 * 아이템 드랍용 시드. 라운드마다 갈라지고, 상점 시드와도 갈라진다.
 *
 * 여기 두는 이유: main.js 는 배선만 하고 규칙은 sim/ 이 갖는다. 공식이 화면
 * 쪽에 살면 테스트가 그걸 못 부르고, 테스트는 같은 식을 베껴 적을 수밖에 없어
 * "같은 식은 같은 값을 낸다"만 증명하게 된다 — 공식을 바꿔도 통과한다.
 *
 * 2654435761 은 홀수라 2^32 곱셈이 전단사다. 라운드가 다르면 시드도 반드시
 * 다르다 — 확률이 아니라 보장이다.
 */
export function itemSeed(runSeed, roundIndex) {
  return (runSeed ^ 0x1737 ^ (roundIndex * 2654435761)) >>> 0
}
