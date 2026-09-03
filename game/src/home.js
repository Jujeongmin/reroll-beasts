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
 */
export function createHome({ data, onPick, onCancelQueue, onRetry }) {
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
    show() {
      el.root.hidden = false
    },
    hide() {
      el.root.hidden = true
    },
  }
}
