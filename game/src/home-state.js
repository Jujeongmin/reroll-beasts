// 홈이 무엇을 그릴지 정한다. DOM 을 모른다 — 그래야 상태 전이가 브라우저
// 없이 검사된다. 그리는 일은 home.js 가 한다.
import { divisionOf, divisionLabel, nextDivisionLabel, phaseProgress } from '@sim/rank.js'
import { t } from './i18n.js'


/**
 * 상태에서 화면을 계산한다.
 *
 * 실패 사유를 뭉뚱그리지 않는 이유: 인증 없는 로컬 실행(플랫폼이 iframe URL
 * 로 넣어 주는 auth 가 없다)은 서버 장애와 다른 일이다. "서버 오류"로만
 * 적으면 개발 중에 매번 엉뚱한 곳을 뒤진다.
 */
export function homeView({ status, hasAuth, profile, queue, data }) {
  if (queue) {
    const label = t(queue.mode === 'ranked' ? 'queue.ranked' : 'queue.normal')
    const sec = Math.floor((queue.waitedMs ?? 0) / 1000)
    return {
      menu: 'hidden',
      tutorial: 'hidden',
      notice: null,
      profile: viewProfile(profile),
      queue: {
        text: t('queue.waiting', { mode: label, n: queue.queued, size: data.lobby.size, sec }),
        // 무엇을 기다리는지 한 줄. 숫자는 lobby.json 에서 읽는다 — 글자에 30 을
        // 박아 두면 서버가 봇을 채우는 시각과 화면이 말하는 시각이 갈린다.
        note:
          queue.mode === 'ranked'
            ? t('queue.rankedNote', { size: data.lobby.size })
            : t('queue.botNote', { sec: Math.round((data.lobby.matching?.normalWaitMs ?? 0) / 1000) }),
      },
    }
  }

  if (status === 'connecting') {
    return { menu: 'disabled', tutorial: 'enabled', notice: t('conn.connecting'), profile: null, queue: null }
  }
  // 튜토리얼은 서버가 없어도 돈다. 접속 실패에 같이 잠기면 처음 온 사람이
  // 아무 데도 못 간다 — 배울 곳조차 없어진다.
  if (status === 'failed') {
    return {
      menu: 'disabled',
      tutorial: 'enabled',
      notice: hasAuth
        ? t('conn.failed')
        : t('conn.local'),
      profile: null,
      queue: null,
    }
  }
  return {
    menu: 'enabled',
    tutorial: 'enabled',
    notice: null,
    profile: viewProfile(profile),
    queue: null,
  }
}

/** 기록이 없으면 null. 홈이 "첫 판을 기다린다" 를 대신 그린다. */
function viewProfile(profile) {
  if (!profile || !profile.games) return null
  const lp = profile.lp ?? 0
  const d = divisionOf(lp)
  return {
    head: t('home.record', { games: profile.games, best: profile.best }),
    recent: profile.recent ?? [],
    // 배치 중이면 "임시" 를 앞에. 계산은 같고 이름만 다르다.
    tier: (phaseProgress(profile.rankedGames ?? 0)?.phase === 'placement' ? t('home.provisional') + ' ' : '') + divisionLabel(lp),
    // 배치 3/5 · 준배치 7/10. 평소면 null — 홈이 안 그린다.
    phase: phaseProgress(profile.rankedGames ?? 0),
    tierId: d.tier.id,
    lp,
    // 다음 **단계**까지. 티어 한 칸(500 LP)을 눈금으로 쓰면 한 판으로는 막대가
    // 거의 안 움직여 이겼는데 아무것도 안 변한 것처럼 보인다.
    // 최고 티어는 위가 안 막혀 있어 남은 게 없다 — 막대도 안 그린다.
    // 맨 위 칸에는 갈 곳이 없다(d.to 가 null) — 없는 목표로 막대를 그리면
    // 영영 안 차는 막대가 된다. **division 이 아니라 to 를 본다**: 이제 모든
    // 티어에 1~5 단계가 있어 division 은 늘 값이 있다.
    next: d.to === null ? null : { name: nextDivisionLabel(lp), need: d.need, ratio: d.ratio },
  }
}
