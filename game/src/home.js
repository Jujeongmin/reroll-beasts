// 홈 화면. 그리기와 클릭만 한다.
//
// **매치메이커를 모른다.** 서버 접속·큐는 main.js 가 쥐고 여기에는 상태만
// 밀어 넣는다. 홈이 SDK 를 알면 홈을 확인하려면 네트워크가 필요해진다.

import { homeView } from './home-state.js'
import { avatarChoices } from '@sim/cosmetics.js'
import { seasonAt, daysLeft } from '@sim/season.js'
import { passProgress, passTrack, EMPTY_PASS } from '@sim/pass.js'

/**
 * @param {object} o
 * @param {object} o.data                    로드된 규칙 데이터
 * @param {(mode: string) => void} o.onPick  모드를 골랐다
 * @param {() => void} o.onCancelQueue       대기를 취소했다
 * @param {() => void} o.onRetry             다시 붙어 보라
 * @param {() => Promise<object|null>} o.onBoard  순위표를 열었다. 서버가 준
 *   { total, myRank, top[] } 를 돌려주면 그린다 — 홈은 서버를 모른다
 */
export function createHome({
  data,
  onPick,
  onCancelQueue,
  onRetry,
  onBoard,
  onPickAvatar,
  onPickedAvatar,
  onAvatarPortrait,
}) {
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
    skinsBtn: document.getElementById('btn-skins'),
    skins: document.getElementById('skins'),
    skinsGrid: document.getElementById('skins-grid'),
    skinsClose: document.getElementById('skins-close'),
    hintGo: document.getElementById('hint-go'),
    hintClose: document.getElementById('hint-close'),
    board: document.getElementById('board'),
    boardRows: document.getElementById('board-rows'),
    boardSub: document.getElementById('board-sub'),
    boardClose: document.getElementById('board-close'),
    note: document.getElementById('home-note'),
    retry: document.getElementById('home-retry'),
    hero: document.getElementById('home-hero'),
    pass: document.getElementById('home-pass'),
    passSub: document.getElementById('pass-sub'),
    passLv: document.getElementById('pass-lv'),
    passGems: document.getElementById('pass-gems'),
    passNext: document.getElementById('pass-next'),
    passNextLv: document.getElementById('pass-next-lv'),
    passBar: document.querySelector('#pass-bar i'),
    passSheet: document.getElementById('passtrack'),
    passRows: document.getElementById('pass-rows'),
    passHead: document.getElementById('pass-head'),
    passClose: document.getElementById('pass-close'),
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
    el.root.classList.remove('guiding')
  })
  /**
   * 창을 접는다.
   *
   * 바로 hidden 을 걸지 않는 이유: 그러면 줄어드는 애니메이션이 시작도 못
   * 하고 화면이 툭 끊긴다. `closing` 을 달아 애니메이션을 돌리고, 끝난
   * **뒤에** 감춘다. animationend 만 믿지는 않는다 — 창이 안 보이는 탭에서는
   * 안 올 수 있어서, 그때는 창이 열린 채로 남는다. 시간으로 한 번 더 받는다.
   */
  function closeSheet(veil) {
    if (veil.hidden || veil.classList.contains('closing')) return
    veil.classList.add('closing')
    const done = () => {
      veil.hidden = true
      veil.classList.remove('closing')
    }
    setTimeout(done, 260)
  }

  // 바깥(어두운 바닥)을 눌러도 닫힌다. 창 안을 눌렀을 때는 닫으면 안 되니
  // 대상이 바닥 자신일 때만 — 카드를 고르다 닫히면 고른 것이 안 보인다.
  const backdrop = (veil) => (ev) => {
    if (ev.target === veil) closeSheet(veil)
  }
  el.board.addEventListener('click', backdrop(el.board))
  el.skins.addEventListener('click', backdrop(el.skins))
  el.passSheet.addEventListener('click', backdrop(el.passSheet))

  el.pass.addEventListener('click', () => openPass())
  el.passClose.addEventListener('click', () => closeSheet(el.passSheet))
  el.boardClose.addEventListener('click', () => closeSheet(el.board))
  el.skinsBtn.addEventListener('click', () => openSkins())
  el.skinsClose.addEventListener('click', () => closeSheet(el.skins))

  /**
   * 아바타 목록. 잠긴 것도 **보여 준다** — 무엇이 기다리는지 알아야 그걸
   * 얻을 이유가 생긴다. 다만 눌리지는 않는다.
   */
  async function openSkins() {
    // 닫는 중에 다시 누를 수 있다. closing 이 남아 있으면 열자마자 사라진다.
    el.skins.classList.remove('closing')
    el.skins.hidden = false
    const picked = onPickedAvatar()
    const list = avatarChoices(data, ownedNow())
    el.skinsGrid.innerHTML = list
      .map(
        (c) =>
          `<div class="card${c.unlocked ? '' : ' locked'}${c.id === picked ? ' on' : ''}" data-skin="${c.id}">` +
          `<img alt="" data-file="${c.file}" />` +
          `<span class="nm">${c.name}</span>` +
          `<span class="why">${c.reason ?? ''}</span></div>`,
      )
      .join('')
    // 초상은 3D 모델을 찍어 만든다 — 2D 아이콘을 따로 그리면 모델을 바꿀 때
    // 어긋난다. 목록을 먼저 띄우고 그림은 오는 대로 채운다.
    for (const img of el.skinsGrid.querySelectorAll('img[data-file]')) {
      onAvatarPortrait?.(img.dataset.file)
        .then((url) => {
          img.src = url
        })
        .catch(() => {})
    }
  }

  el.skinsGrid.addEventListener('click', (ev) => {
    const card = ev.target.closest('[data-skin]')
    if (!card || card.classList.contains('locked')) return
    onPickAvatar(card.dataset.skin)
    for (const c of el.skinsGrid.querySelectorAll('[data-skin]')) c.classList.remove('on')
    card.classList.add('on')
  })

  /**
   * 시즌 패스 트랙.
   *
   * 세로 목록이 아니라 **가로 트랙**으로 그린다 — 단계가 25개라 세로로 세우면
   * 한 화면에 네댓 줄만 보이고, "얼마나 남았나"가 안 읽힌다. 가로로 밀면 지난
   * 칸과 남은 칸이 한눈에 들어온다.
   *
   * 프리미엄 줄도 **보여 준다**. 아직 살 수 없지만, 무엇을 놓치고 있는지
   * 안 보이면 나중에 살 이유도 생기지 않는다.
   */
  function openPass() {
    el.passSheet.classList.remove('closing')
    el.passSheet.hidden = false
    const p = state.profile?.pass ?? EMPTY_PASS
    const prog = passProgress(p.xp ?? 0, data)
    const gems = state.profile?.gems ?? 0
    el.passHead.textContent = prog.done
      ? `${prog.max}단계 · 다 올랐다 · 젬 ${gems}`
      : `${prog.level}단계 · 다음까지 ${prog.need - prog.into} · 젬 ${gems}`

    const track = passTrack(data, p)
    el.passRows.innerHTML = track
      .map((t) => {
        // 한 단계가 아바타와 젬을 **같이** 줄 수 있다. 하나만 그리면 나머지가
        // 화면에서 사라지는데, 지급은 그대로 되므로 화면이 거짓말이 된다.
        const free = t.free.avatar
          ? `<div class="rw av"><img alt="" data-file="${t.free.avatar.file}" title="${t.free.avatar.name}" />` +
            (t.free.gems ? `<span class="badge gem">${t.free.gems}</span>` : '') +
            '</div>'
          : t.free.gems
            ? `<span class="rw gem">${t.free.gems}</span>`
            : '<span class="rw none"></span>'
        const prem = t.premium.gems
          ? `<span class="rw gem">${t.premium.gems}</span>`
          : '<span class="rw none"></span>'
        return (
          `<div class="step${t.reached ? ' got' : ''}">` +
          `<div class="lv">${t.level}</div>${free}<div class="prem">${prem}</div></div>`
        )
      })
      .join('')
    // 아바타 그림은 아바타 목록과 같은 방식으로 찍어 온다.
    for (const img of el.passRows.querySelectorAll('img[data-file]')) {
      onAvatarPortrait?.(img.dataset.file)
        .then((url) => {
          img.src = url
        })
        .catch(() => {})
    }
    // 지금 단계가 보이는 자리에서 열린다 — 늘 1단계부터 보여 주면 25단계인
    // 사람은 매번 끝까지 밀어야 자기 자리를 찾는다.
    const cur = el.passRows.children[Math.max(0, prog.level - 2)]
    cur?.scrollIntoView({ inline: 'start', block: 'nearest' })
  }

  /**
   * 홈 패스 카드의 "다음 보상" 미리보기.
   *
   * 초상은 3D 모델을 찍어 오는 무거운 일이라, 같은 파일이면 다시 안 찍는다 —
   * render() 는 접속 상태가 바뀔 때마다 도는데 그때마다 찍으면 홈이 끊긴다.
   */
  let nextShown = null
  function showNextReward(level) {
    const next = data.cosmetics.avatars
      .filter((a) => a.unlock === 'pass' && a.passLevel > level)
      .sort((a, b) => a.passLevel - b.passLevel)[0]
    // 남은 아바타가 없으면 칸을 비운다. 빈 액자를 남기면 "받을 게 있는데
    // 그림을 못 불러왔다"로 읽힌다.
    el.passNext.parentElement.hidden = !next
    if (!next || next.file === nextShown) return
    nextShown = next.file
    el.passNextLv.textContent = `${next.passLevel}단계`
    onAvatarPortrait?.(next.file)
      .then((url) => {
        el.passNext.src = url
      })
      .catch(() => {})
  }

  /** 지금 가진 것. 코스메틱 해금 판정이 이걸 본다. */
  function ownedNow() {
    return { lp: state.profile?.lp ?? 0, passLevel: state.profile?.pass?.level ?? 1 }
  }

  /** 순위표를 연다. 서버가 안 주면 그 사실을 그대로 적는다 — 빈 표를 띄우면
   *  아무도 없는 것처럼 보인다. */
  async function openBoard() {
    el.board.classList.remove('closing')
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

    // 패스 칸. 시즌 이름·남은 날과 함께 **내 단계**를 적는다 — 진행도가 안
    // 보이면 눌러 볼 이유가 없다.
    const s = seasonAt(Date.now(), data)
    const left = daysLeft(Date.now(), data)
    el.passSub.textContent = s ? `${s.name} · ${left}일 남음` : '준비 중'
    const prog = passProgress(state.profile?.pass?.xp ?? 0, data)
    el.passLv.textContent = `${prog.level}단계`
    el.passBar.style.width = `${Math.round(prog.ratio * 100)}%`
    el.passGems.textContent = String(state.profile?.gems ?? 0)
    showNextReward(prog.level)

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
    /** 간판 캐릭터(정지 초상). 부팅에서 한 번 찍어 넘어온다. */
    setHero(url) {
      el.hero.src = url
    },
    /**
     * 살아 있는 모델이 준비됐다. 정지 초상을 내린다.
     *
     * 초상을 먼저 띄우고 나중에 바꾸는 이유: 모델·믹서 준비가 몇 프레임
     * 걸리는데 그동안 자리가 비면 홈이 한 번 휑해 보인다.
     */
    setHeroLive() {
      el.hero.hidden = true
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
      // 나머지를 덮어 고를 것을 하나로 줄인다.
      el.root.classList.add('guiding')
    },
    show() {
      el.root.hidden = false
    },
    hide() {
      el.root.hidden = true
    },
  }
}
