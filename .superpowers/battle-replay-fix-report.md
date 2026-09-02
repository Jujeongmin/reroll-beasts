# battle.js 재생 버그 수정 보고

## 무엇이 틀렸었나

`game/src/battle.js` 의 `applyEvent` 가 `sim/combat.js`·`sim/skills.js` 가 낸 로그를
잘못 재생하고 있었다. 판정(hp·shield·mana·alive·tile)이 뷰(three.js 애니메이션·이펙트)와
한 함수 안에 뒤섞여 있어 `createBattle` 밖에서 시험할 방법이 없었다 — 그래서 아래
버그들이 골든 로그 테스트(사실 이건 `sim/`만 지킨다)를 몇 번이나 통과하고도 안 잡혔다.

## 작업 순서 (테스트 우선)

1. `game/src/replay.js` 를 새로 만들어 **기존 버그를 그대로 보존한 채** 판정 로직만
   순수 함수로 옮겼다 (동작 보존 리팩터). `battle.js` 는 이 함수를 호출하도록 바꾸고,
   `npm run check` 로 기존 369개 테스트가 그대로 통과함을 확인했다.
2. `tests/replay.test.js` 를 작성해 `replay.js` 를 직접 두들겼다. 14개 중 13개가
   실패했다 (아래 "수정 전 실패 출력" 참고) — 이중 차감, 존재하지 않는 이벤트 처리
   (shield·revive·death_blast·skill_splash), skill_buff 가 HP 를 건드리는 문제를
   정확히 그 이유로 잡아냈다.
3. `replay.js` 의 각 케이스를 사양대로 고쳤다.
4. 재실행 — 14/14 통과. `npm run check` 로 전체 383개(22종 불변식 포함) 재확인.

## 수정 전 실패 출력 (`npx vitest run tests/replay.test.js`, 13/14 실패)

```
✗ attack — 보호막과 HP 를 따로 깎는다 (합산 이중 차감 금지)
  → expected 260 to be 290   // toShield 30·toHp 10 인데 amount(=40) 전체를 HP 에서도 깎음
✗ skill_single — 보호막과 HP 를 따로 깎는다
  → expected 250 to be 270   // 위와 동일한 이중 차감
✗ skill_aoe — 두 대상 각각 보호막·HP 를 hits 값대로 깎는다
  → expected 15 to be +0     // hits[] 를 무시하고 top-level 합계로 깎음
✗ dot — 보호막이 있으면 보호막부터, 넘친 만큼만 HP 에서 깎는다
  → expected 10 to be +0     // 보호막을 아예 건드리지 않음
✗ death_blast — 폭발 대상들의 보호막·HP 가 hits 값대로 줄어든다
  → expected 5 to be +0      // death_blast 케이스가 아예 없음 (no-op)
✗ skill_splash — 튄 대상들의 보호막·HP 가 hits 값대로 줄어든다
  → expected 300 to be 288   // skill_splash 케이스가 아예 없음 (no-op)
✗ skill_buff — 자기 자신에게 방어력 버프 — HP 불변
  → expected 255 to be 300   // amount(스탯 크기)를 피해로 오해해 HP 를 깎음
✗ skill_buff — 음수 amount (goleling) 도 HP 를 건드리지 않는다
  → expected 345 to be 300   // amount:-45 → hp -= -45 → HP 가 상한 없이 증가
✗ skill_buff — grants 의 shieldGranted 는 보호막에 더해진다
  → expected 240 to be 300   // 위와 같은 원인으로 HP 가 줄어듦
✗ shield — 보호막을 그 값으로 설정한다 / amount 0 은 만료
  → expected +0 to be 120 / expected 120 to be +0   // shield 케이스가 없음
✗ revive — 되살리고 HP 를 로그값으로
  → expected false to be true   // revive 케이스가 없음, 죽은 채로 남음
✗ 전체 로그 재생 (탱커+망자 대진, seed 1)
  → expected 1908 to be less than or equal to 1863   // HP 가 maxHp 를 넘음 (goleling 버그의 누적)
```

## 버그별 수정 내용

1. **attack / skill_single 이중 차감** — `game/src/replay.js` 의 해당 케이스가
   더 이상 `amount`(=dealt)를 쓰지 않는다. `thorns` 가 이미 하던 대로
   `e.toShield`·`e.toHp` 를 따로 뺀다.
2. **skill_aoe 이중 차감** — top-level `amount`(합계) 대신 `e.hits[]` 의 대상별
   `toShield`/`toHp` 를 쓴다. `death_blast`·`skill_splash` 와 같은 패턴이라 세 타입을
   한 케이스로 묶었다.
3. **skill_buff 가 HP 를 깎거나 부풀림** — `sim/skills.js:167` 의 `amount` 는
   스탯 버프 크기(예: `pb_harden` def+45, `gl_stone` damageTakenPct -45)라 피해가
   아니다. HP 관련 처리를 전부 없애고 `grants[].shieldGranted` 만 보호막에 더한다.
4. **dot 가 보호막을 무시** — `sim/combat.js:361` 이 `toShield`/`toHp` 를 이미 나눠
   싣는다. thorns 와 같은 패턴으로 고쳤다.
5. **shield 이벤트 미처리** — `sim/combat.js` 가 전투 시작·만료 시 절대값을 싣는다
   (`amount: 0` = 만료). `st.shield = e.amount` 로 그대로 대입한다.
6. **revive 이벤트 미처리** — `st.alive = true; st.hp = e.hp` 로 되살리고,
   시뮬이 부활 시 `c.shield = 0` 으로 지우는 것과 맞춰 `st.shield = 0` 도 같이 한다
   (이 초기화는 로그에 별도 `shield` 이벤트로 안 남는다 — sim 을 읽고 확인).
7. **death_blast 이벤트 미처리** — `e.hits[]` 로 skill_aoe 와 같은 방식으로 처리.
8. **skill_splash 이벤트 미처리** — 위와 동일.

## 뽑아낸 이음매 (`game/src/replay.js`)

- `createUnitState(spawn)` — spawn 이벤트 → 순수 상태(`tile · maxHp · hp · shield ·
  mana · manaFull · alive`).
- `applyReplayEvent(unitState, event)` — 이벤트 하나 → 그 상태만 변경. three.js·DOM
  의존 없음 (import 없음).
- `battle.js` 는 `unitState` 맵에 뷰 전용 필드(`prevTile · moveTick · anim ·
  animUntil`)를 얹어 그대로 쓰고, `applyEvent` 에서 애니메이션·이펙트를 먼저 판단한
  **다음** `applyReplayEvent` 를 호출해 상태를 반영한다 — "죽기 직전엔 hit 애니메이션,
  그 다음이 사망"이라는 순서를 유지하려고 애니메이션 판단을 상태 변경보다 앞에 뒀다.
- `fxFor`(이펙트)는 원래 위치 그대로 뒀다 — 이미 로그 필드만 읽고 상태에 안 붙는
  순수 반응이라 옮길 이유가 없었다.

## 브라우저 확인

`preview_start` (포트 5180) → `http://localhost:5180/?seed=20260901`. 유닛을 사서
보드에 배치하고 라운드 1-1 → 2-1 까지 여러 번의 실제 전투를 지나가며 콘솔을 확인했다.
`read_console_messages` 에 vite HMR 로그 외 에러·경고가 한 번도 없었다. 전투 장면에서
말들이 서로 공격하고 죽고, 위에 뜬 배지(체력/보호막 바)가 사라지지 않고 유지된 채
다음 라운드로 넘어가는 것을 확인했다 — 화면이 하얗게 굳거나 바가 0 으로 순간이동하는
증상은 없었다. 스크린샷 예산을 아끼려고 최종 확인은 콘솔 로그 + `javascript_tool` 로
에러 텍스트 유무를 직접 질의하는 방식으로 마무리했다(별도 결과 스크린샷은 생략).

## 건너뛴 것

- 없음 — 명세의 8개 버그, 손으로 만든 이벤트 단위 테스트, 전체 로그 일관성 테스트
  전부 작성·통과했다. `thorns`·`heal`·`move`·`leap`·`mana` 는 원래도 맞게 처리되고
  있어 손대지 않았다(다만 `replay.js` 로 옮기며 순수 함수 경로를 같이 태웠다).

## 참고 — 불변식 카운트

`PROJECT/Status.md` 의 `불변식 22종 + 테스트 369개` → `383개` 로 갱신
(`tests/replay.test.js` 14개 추가).

## 후속 조치 (code review 후속 3건)

### M1 — 전체 전투 테스트가 "범위 안"만 보고 "정확한 회계"는 안 보던 문제

`tests/replay.test.js` `replayFullLog` 에 두 가지를 추가했다.

1. `death` 이벤트를 적용하기 *전에*, 그 유닛의 hp 가 이미 0 이어야 한다는
   assertion (`expect(st?.hp).toBe(0)`). death 는 사건이 이미 0 으로 깎아둔 걸
   확정할 뿐, 재생기가 그 자리에서 스스로 0 으로 만드는 게 아니라는 뜻이다.
2. 동반 불변식도 넣었다: hp 가 0 이 됐는데 아직 alive 인 유닛을 `zeroHpPending`
   Set 에 담아두고, death 로 alive 가 꺼지면 지운다. 로그 끝까지 가도 안 풀린
   채 남으면 실패 — 기존 "최종 상태" 검사(death 로그 없으면 hp>0)가 놓치는
   중간 상태(0 으로 떨어졌다가 death 없이 다시 회복되는 경우)를 잡는다. 5줄
   안으로 깔끔하게 들어가서 스킵하지 않고 넣었다.

**사보타주 증거** — `game/src/replay.js` 의 `skill_splash` 를 잠시 no-op 으로
되돌리고 버섯 픽스처만 돌렸다:

```
✗ 버섯 시너지(튄 피해) 대진 — skill_splash 를 포함해 생존자 수가 일치
  → 유닛 5 는 death 이벤트가 오기 전부터 hp 0 이어야 한다: expected 51 to be +0
- Expected: 0
+ Received: 51
```

리뷰어가 말한 "잔여 hp 51, 두 유닛" 중 하나와 정확히 일치. 확인 후 원복,
`npx vitest run tests/replay.test.js` 14→17개 전부 통과 확인.

### M2 — `thorns`·`heal` 이 이음매를 건넜는데 테스트가 없던 문제

같은 파일에 손으로 만든 케이스 2개(테스트 3개) 추가:

- `thorns` — `casterId`(반사한 쪽)는 안 건드리고 `targetIds[0]`(되돌려받는
  쪽)의 shield·hp 만 깎이는지 확인.
- `heal` — `casterId` 의 hp 가 amount 만큼 오르고, `maxHp` 에서 잘리는지
  (290+50 → 300) 확인.

640전 시뮬 중 두 이벤트 모두 한 번도 안 나온 픽스처였다는 리뷰 지적대로,
`sim/combat.js`·`sim/skills.js` 를 안 건드리고 이벤트 오브젝트를 손으로
만들어 재생기만 시험했다.

### M4 — `dot`·`thorns` 가 targetIds 를 순회하며 top-level 값 하나를 매번 적용하던 문제

`game/src/replay.js` 의 두 case 를 `for (const id of e.targetIds ?? [])` 에서
`unitState.get(e.targetIds?.[0])` 로 바꿨다. 두 이벤트 모두 emitter
(`sim/combat.js:361`, `:479`)가 항상 단일 대상만 싣는다는 사실은 그대로라 동작
변화는 없다 — 목적은 "여럿에게 뿌린다"는 잘못된 계약을 코드 모양에서
지우는 것. hits[] 를 쓰는 skill_aoe·death_blast·skill_splash 와 구분한다는
한국어 주석을 남겼다.

## 건너뛴 것

없음. M1 의 동반 불변식(hp 0 → death/revive)도 포함해 전부 적용했다.

## 참고 — 테스트 카운트 갱신

`PROJECT/Status.md` 의 `불변식 22종 + 테스트 383개` → `386개`
(`tests/replay.test.js` 14→17개, +3: thorns 1 + heal 2).
