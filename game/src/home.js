// 홈 화면. 그리기와 클릭만 한다.
//
// **매치메이커를 모른다.** 서버 접속·큐는 main.js 가 쥐고 여기에는 상태만
// 밀어 넣는다. 홈이 SDK 를 알면 홈을 확인하려면 네트워크가 필요해진다.

import { homeView } from './home-state.js'

/**
 * @param {object} o
 * @param {object} o.data                    로드된 규칙 데이터
 * @param {(mode: string) => void} o.onPick  모드를 골랐다
 * @param {() => void} o.onCancelQueue       대기를 취소했다
 * @param {() => void} o.onRetry             다시 붙어 보라
 * @param {() => Promise<object|null>} o.onBoard  순위표를 열었다. 서버가 준
 *   { total, myRank, top[] } 를 돌려주면 그린다 — 홈은 서버를 모른다
 */
export function createHome({ data, onPick, onCancelQueue, onRetry, onBoard }) {
  const el = {
    root: document.getElementById('home'),
    menu: document.getElementById('home-menu'),
    queue: document.getElementById('queue-status'),
    queueText: document.getElementById('queue-text'),
    queueCancel: document.getElementById('queue-cancel'),
    head: document.getElementById('record-head'),
    recent: document.getElementById('record-recent'),
    tier: document.getElementById('record-tier'),
    badge: document.getElementById('record-badge'),
    lp: document.getElementById('record-lp'),
    bar: document.getElementById('record-bar'),
    barFill: document.querySelector('#record-bar i'),
    rankBtn: document.getElementById('record-rank'),
    hint: document.getElementById('home-hint'),
    hintGo: document.getElementById('hint-go'),
    hintClose: document.getElementById('hint-close'),
    board: document.getElementById('board'),
    boardRows: document.getElementById('board-rows'),
    boardSub: document.getElementById('board-sub'),
    boardClose: document.getElementById('board-close'),
    note: document.getElementById('home-note'),
    retry: document.getElementById('home-retry'),
    hero: document.getElementById('home-hero'),
  }

  // 플랫폼이 iframe URL 로 넣어 주는 값. 없으면 로컬 실행이다.
  const hasAuth = new URLSearchParams(location.search).has('auth')

  let state = { status: 'connecting', profile: null, queue: null }

  el.menu.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-mode]')
    if (!btn || btn.disabled) return
    onPick(btn.dataset.mode)
  })
  el.queueCancel.addEventListener('click', () => onCancelQueue())
  el.rankBtn.addEventListener('click', () => openBoard())
  // 말풍선을 누르면 그대로 튜토리얼로 간다 — 옆 버튼을 다시 찾게 하지 않는다.
  el.hintGo.addEventListener('click', () => onPick('tutorial'))
  el.hintClose.addEventListener('click', () => {
    el.hint.hidden = true
  })
  el.boardClose.addEventListener('click', () => {
    el.board.hidden = true
  })

  /** 순위표를 연다. 서버가 안 주면 그 사실을 그대로 적는다 — 빈 표를 띄우면
   *  아무도 없는 것처럼 보인다. */
  async function openBoard() {
    el.board.hidden = false
    el.boardRows.innerHTML = '<div class="empty">불러오는 중…</div>'
    const lb = await onBoard?.()
    if (!lb) {
      el.boardRows.innerHTML = '<div class="empty">순위표를 못 받았다</div>'
      el.boardSub.textContent = ''
      return
    }
    el.boardSub.textContent = lb.myRank ? `${lb.total}명 중 ${lb.myRank}등` : `${lb.total}명`
    if (!lb.top.length) {
      el.boardRows.innerHTML = '<div class="empty">아직 랭크 판을 끝낸 사람이 없다</div>'
      return
    }
    el.boardRows.innerHTML = lb.top
      .map(
        (r) =>
          `<div class="row${r.mine ? ' mine' : ''}"><span class="no">${r.rank}</span>` +
          `<span class="nm">${r.name}</span><span class="lp">${r.lp} LP</span></div>`,
      )
      .join('')
  }
  el.retry.addEventListener('click', () => onRetry())

  function render() {
    const v = homeView({ ...state, hasAuth, data })

    el.menu.hidden = v.menu === 'hidden'
    for (const btn of el.menu.querySelectorAll('[data-mode]')) {
      // 튜토리얼만 접속 상태와 무관하다 — 서버 없이 도는 유일한 경로다.
      const own = btn.dataset.mode === 'tutorial' ? v.tutorial : v.menu
      btn.disabled = own !== 'enabled'
    }

    el.queue.hidden = !v.queue
    if (v.queue) el.queueText.textContent = v.queue.text

    el.head.textContent = v.profile ? v.profile.head : '첫 판을 기다린다'
    el.recent.textContent = v.profile ? v.profile.recent.join(' · ') : ''

    // 기록이 없으면 티어 줄도 비워 둔다 — 한 판도 안 한 사람에게 "브론즈 0"
    // 을 붙이면 진 것 같은 인상이 된다.
    el.tier.textContent = v.profile ? v.profile.tier : '랭크 없음'
    el.badge.className = `badge ${v.profile ? v.profile.tierId : ''}`
    el.lp.textContent = v.profile ? `${v.profile.lp} LP` : ''
    const next = v.profile?.next
    el.bar.hidden = !next
    if (next) {
      el.barFill.style.width = `${Math.round(next.ratio * 100)}%`
      el.bar.title = `${next.name}까지 ${next.need} LP`
    }

    // 순위표는 서버가 붙어 있어야 볼 수 있다. 기록이 없어도 남의 등수는
    // 궁금하니 전적 유무와는 무관하게 연다.
    el.rankBtn.hidden = state.status !== 'ready'
    el.rankBtn.textContent = '전체 순위 보기'

    el.note.textContent = v.notice ?? ''
    el.retry.hidden = state.status !== 'failed'
  }

  render()

  return {
    setStatus(status) {
      state = { ...state, status }
      render()
    },
    setProfile(profile) {
      state = { ...state, profile }
      render()
    },
    setQueue(queue) {
      state = { ...state, queue }
      render()
    },
    /** 간판 캐릭터. 부팅에서 한 번 찍어 넘어온다. */
    setHero(url) {
      el.hero.src = url
    },
    /**
     * 아직 튜토리얼을 안 본 사람에게 표를 단다.
     *
     * 자동으로 밀어 넣지 않는 이유: 부팅하자마자 게임 안이면 무슨 게임인지
     * 보기도 전에 조작부터 배우고, 나가는 길도 모른다. 눈에 띄게만 한다.
     */
    markTutorialNew() {
      el.menu.querySelector('[data-mode="tutorial"]')?.classList.add('is-new')
      el.hint.hidden = false
    },
    show() {
      el.root.hidden = false
    },
    hide() {
      el.root.hidden = true
    },
  }
}
