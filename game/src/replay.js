// 로그 사건 → 유닛 상태. three.js·DOM 을 쓰지 않는 순수 함수다.
//
// battle.js 의 applyEvent 는 애니메이션·이펙트까지 뒤섞여 있어 통째로 띄우지
// 않고는 시험할 수 없었다 — 그래서 이 double-count 버그들이 안 잡혔다.
// 판정(hp·shield·mana·alive·tile)은 여기서만 하고, 그림은 battle.js 가
// 이 함수가 상태를 바꾼 *다음* 반응으로 그린다.

/** spawn 이벤트로 유닛 하나의 초기 상태를 만든다. */
export function createUnitState(spawn) {
  return {
    tile: spawn.tile,
    maxHp: spawn.maxHp,
    hp: spawn.maxHp,
    shield: 0,
    mana: spawn.mana ?? 0,
    manaFull: spawn.manaFull ?? 0,
    alive: true,
  }
}

/**
 * 로그 사건 하나를 유닛 상태 맵(casterId → state)에 반영한다.
 * hp · shield · mana · alive · tile 만 건드린다.
 */
export function applyReplayEvent(unitState, e) {
  switch (e.type) {
    case 'mana': {
      const st = unitState.get(e.casterId)
      if (st) st.mana = e.value
      break
    }

    case 'leap':
    case 'move': {
      const st = unitState.get(e.casterId)
      if (st) st.tile = e.tile
      break
    }

    // amount(=dealt)는 toShield+toHp 의 합계다. 합계로 HP 를 깎고 toShield 로
    // 보호막도 깎으면 보호막이 막은 몫이 두 번 깎인다 — thorns 가 이미 하던 대로
    // toShield·toHp 를 따로 적용해야 한다 (sim/damage.js 의 toShield+toHp===dealt).
    case 'attack':
    case 'skill_single': {
      const ts = unitState.get(e.targetIds?.[0])
      if (ts) {
        ts.shield = Math.max(0, ts.shield - (e.toShield ?? 0))
        ts.hp = Math.max(0, ts.hp - (e.toHp ?? 0))
      }
      break
    }

    // skill_aoe 는 대상별 toShield·toHp 를 top-level 이 아니라 hits[] 로 싣는다
    // (sim/skills.js castAoe) — top-level amount 는 합계일 뿐이라 쓰면 안 된다.
    case 'skill_aoe':
    case 'death_blast':
    case 'skill_splash': {
      for (const h of e.hits ?? []) {
        const ts = unitState.get(h.id)
        if (!ts) continue
        ts.shield = Math.max(0, ts.shield - (h.toShield ?? 0))
        ts.hp = Math.max(0, ts.hp - (h.toHp ?? 0))
      }
      break
    }

    // skill_buff 의 amount 는 방어력·공격력 같은 스탯 버프 크기지 피해가 아니다
    // (sim/skills.js:167, castBuff 는 p.amount 를 그대로 로그에 싣는다) —
    // 실제 효과는 grants[] 의 보호막뿐이다.
    case 'skill_buff': {
      for (const g of e.grants ?? []) {
        const ts = unitState.get(g.id)
        if (ts) ts.shield += g.shieldGranted ?? 0
      }
      break
    }

    // dot 의 top-level toShield·toHp 는 대상 하나만을 위한 값이다
    // (sim/combat.js:361, targetIds 는 항상 [c.id] 하나뿐이다) — 배열로 순회하면
    // 여럿에게 뿌리는 계약처럼 보이지만, 여럿에게 뿌린 피해는 hits[] 로 오는
    // skill_aoe·death_blast·skill_splash 처럼 다른 모양을 쓴다.
    case 'dot': {
      const ts = unitState.get(e.targetIds?.[0])
      if (ts) {
        ts.shield = Math.max(0, ts.shield - (e.toShield ?? 0))
        ts.hp = Math.max(0, ts.hp - (e.toHp ?? 0))
      }
      break
    }

    // 반사. casterId 는 되돌린 쪽이고, top-level toShield·toHp 는 targetIds[0]
    // (되돌려받는 쪽) 하나만을 위한 값이다 (sim/combat.js:479 도 항상 단일
    // 대상만 싣는다) — 여럿에게 뿌린 피해는 hits[] 를 쓰는 다른 이벤트들과 모양이 다르다.
    case 'thorns': {
      const ts = unitState.get(e.targetIds?.[0])
      if (ts) {
        ts.shield = Math.max(0, ts.shield - (e.toShield ?? 0))
        ts.hp = Math.max(0, ts.hp - (e.toHp ?? 0))
      }
      break
    }

    case 'heal': {
      const ts = unitState.get(e.casterId)
      if (ts) ts.hp = Math.min(ts.maxHp, ts.hp + (e.amount ?? 0))
      break
    }

    // 보호막 절대값 설정. amount 0 은 만료다 (sim/combat.js 가 시작 때 한 번,
    // 만료 시 한 번 싣는다) — 증분이 아니라 그 시점의 값 그대로다.
    case 'shield': {
      const st = unitState.get(e.casterId)
      if (st) st.shield = e.amount ?? 0
      break
    }

    case 'revive': {
      const st = unitState.get(e.casterId)
      if (st) {
        st.alive = true
        st.hp = e.hp
        // 시뮬도 되살릴 때 c.shield = 0 으로 지운다 (sim/combat.js sweepDeaths).
        // 그 초기화는 따로 shield 이벤트로 남지 않으므로 여기서 같이 한다.
        st.shield = 0
      }
      break
    }

    case 'death': {
      const st = unitState.get(e.casterId)
      if (st) {
        st.alive = false
        st.hp = 0
      }
      break
    }

    default:
      break
  }
}
