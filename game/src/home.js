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
    note: document.getElementById('home-note'),
    retry: document.getElementById('home-retry'),
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
      btn.disabled = v.menu !== 'enabled'
    }

    el.queue.hidden = !v.queue
    if (v.queue) el.queueText.textContent = v.queue.text

    el.head.textContent = v.profile ? v.profile.head : '첫 판을 기다린다'
    el.recent.textContent = v.profile ? v.profile.recent.join(' · ') : ''

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
    show() {
      el.root.hidden = false
    },
    hide() {
      el.root.hidden = true
    },
  }
}
