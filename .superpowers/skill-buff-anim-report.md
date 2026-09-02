# skill_buff 애니메이션/이펙트 버그 수정

## 변경
`game/src/battle.js`

1. `applyEvent` 의 공용 dispatch(`attack` / `skill_single` / `skill_aoe` / `skill_buff`)에서
   `skill_buff` 를 분리했다. 새 `skill_buff` 케이스는 캐스터의 `attack` 클립(=캐스트 표시)과
   `faceTo` 만 하고, 공용 hit 루프(`e.targetIds` 순회 → `hit` 재생)를 아예 타지 않는다.
   `fireBolt` 호출도 빠졌다 — 버프는 쏘는 게 아니다.
2. `fxFor` 에 `skill_buff` 케이스를 추가했다. `e.grants` 를 순회해 각 대상 위치에
   `glow` 를 은은하게(`size 0.9, life 0.5, rise 0.5`) 띄운다. 대상별로 하나씩만 뜨므로
   6인 버프에도 화면이 하얘지지 않는다.
3. 두 지점 모두 "왜"를 설명하는 한국어 주석을 남겼다 — 모델셋에 버프/캐스트 클립이
   없다는 것, 캐스터가 자기 자신을 targetIds 에 넣는 자가 버프가 있어 공용 hit 루프를
   타면 방금 튼 attack 클립을 같은 이벤트 안에서 덮어써 버린다는 것.

`sim/`, `game/src/replay.js` 는 건드리지 않았다. reducer 출력(상태)은 그대로이고
바뀐 건 클립·이펙트뿐이다.

## 버프 있는 전투를 만든 방법
`tests/fixtures/combat-golden-buffs.json` 을 보고 `yeti`(아군 버프) + `pink_blob`(자가 버프)
조합이 실제로 `skill_buff` 를 낸다는 걸 먼저 확인했다.

브라우저 검증은 `npm run dev` (포트 5180, `?seed=20260901`)를 띄운 뒤, `prep.js` 가
`import.meta.env.DEV` 에서 노출하는 `window.__dev` 훅을 콘솔에서 썼다:

```js
const dev = window.__dev
dev.run.state.board[0] = { uid: 'dbg-pink', unitId: 'pink_blob', star: 2, items: [] }
dev.run.state.board[1] = { uid: 'dbg-yeti', unitId: 'yeti', star: 2, items: [] }
dev.run.state.board[2] = { uid: 'dbg-orc', unitId: 'orc', star: 1, items: [] }
dev.refresh()
dev.fight()
```

`dev.run.fight.result.log` 를 읽어 `skill_buff` 이벤트가 실제로 나오는 것부터 확인했다
(캐스터 1(yeti) → 대상 [0,1,2] atkPct 버프, 캐스터 0(pink_blob) → 자기 자신 def 버프).

## 브라우저에서 본 것
스크린샷 타이밍만으로는 0.5초짜리 이펙트를 잡기 어려워서(탭이 백그라운드로
스로틀되어 실제 진행 속도가 예측과 어긋났다), `scene.spawnFx` 와 각 유닛
`UnitView.play` 를 콘솔에서 몽키패치해 호출 로그를 직접 확인하는 방식으로 검증했다:

- `yeti`·`pink_blob` 어느 쪽도 자기 자신의 `attack` 재생 바로 다음에 `hit` 을 재생한
  적이 없었다(전체 세션 838개 호출 로그에서 "자기 자신에게 attack→hit" 패턴 0건).
  버프 전에는 이 패턴이 곧 "캐스트 애니메이션이 hit 로 덮이는" 버그였다.
- `skill_buff` 이벤트마다 `scene.spawnFx('glow', ...)` 가 대상 수만큼(첫 전투 기준 4회:
  3인 버프 + 1인 자가 버프) 정확히 호출됐다.
- 콘솔에 에러/미처리 예외 없음. 정상적인 "탈락" alert(자동 억제됨) 외에는 없었음.
- 별도로 실제 화면 스크린샷 1장으로 전투 중(체력바 표시, 유닛 이동) 상태를 확인했다 —
  버프 순간을 정확히 포착하지는 못했지만 전투 자체가 정상 진행 중임을 보였다.

## 건너뛴 것
없음. `npm run check` (불변식 22종 + 테스트 386개) 통과, 골든 픽스처 불변,
`PROJECT/Status.md` 의 테스트 수(386)도 그대로라 수정 불필요했다.
