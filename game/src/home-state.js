// 홈이 무엇을 그릴지 정한다. DOM 을 모른다 — 그래야 상태 전이가 브라우저
// 없이 검사된다. 그리는 일은 home.js 가 한다.
import { tierOf, tierProgress } from '@sim/rank.js'
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
      queue: { text: t('queue.waiting', { mode: label, n: queue.queued, size: data.lobby.size, sec }) },
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
  const tier = tierOf(lp)
  const p = tierProgress(lp)
  return {
    head: t('home.record', { games: profile.games, best: profile.best }),
    recent: profile.recent ?? [],
    tier: tier.name,
    tierId: tier.id,
    lp,
    // 다음 티어까지. 최고 티어면 남은 게 없으니 막대도 안 그린다.
    next: p ? { name: p.next.name, need: p.need, ratio: Math.max(0, Math.min(1, p.ratio)) } : null,
  }
}
