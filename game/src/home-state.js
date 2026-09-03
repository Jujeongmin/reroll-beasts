// 홈이 무엇을 그릴지 정한다. DOM 을 모른다 — 그래야 상태 전이가 브라우저
// 없이 검사된다. 그리는 일은 home.js 가 한다.

/**
 * 상태에서 화면을 계산한다.
 *
 * 실패 사유를 뭉뚱그리지 않는 이유: 인증 없는 로컬 실행(플랫폼이 iframe URL
 * 로 넣어 주는 auth 가 없다)은 서버 장애와 다른 일이다. "서버 오류"로만
 * 적으면 개발 중에 매번 엉뚱한 곳을 뒤진다.
 */
export function homeView({ status, hasAuth, profile, queue, data }) {
  if (queue) {
    const label = queue.mode === 'ranked' ? '랭크' : '일반'
    const sec = Math.floor((queue.waitedMs ?? 0) / 1000)
    return {
      menu: 'hidden',
      notice: null,
      profile: viewProfile(profile),
      queue: { text: `${label} 대기 ${queue.queued}/${data.lobby.size} · ${sec}초` },
    }
  }

  if (status === 'connecting') {
    return { menu: 'disabled', notice: '서버에 붙는 중…', profile: null, queue: null }
  }
  if (status === 'failed') {
    return {
      menu: 'disabled',
      notice: hasAuth
        ? '서버에 못 붙었다 — 다시 시도'
        : '로컬 실행 — 인증이 없어 서버에 못 붙는다',
      profile: null,
      queue: null,
    }
  }
  return { menu: 'enabled', notice: null, profile: viewProfile(profile), queue: null }
}

/** 기록이 없으면 null. 홈이 "첫 판을 기다린다" 를 대신 그린다. */
function viewProfile(profile) {
  if (!profile || !profile.games) return null
  return {
    head: `전적 ${profile.games}판 · 최고 ${profile.best}위`,
    recent: profile.recent ?? [],
  }
}
