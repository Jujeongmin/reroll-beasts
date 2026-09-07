// 홈 화면. 그리기와 클릭만 한다.
//
// **매치메이커를 모른다.** 서버 접속·큐는 main.js 가 쥐고 여기에는 상태만
// 밀어 넣는다. 홈이 SDK 를 알면 홈을 확인하려면 네트워크가 필요해진다.

import { homeView } from './home-state.js'
import { checkName, displayName, tagDuplicates } from '@sim/name.js'
import { missionsFor, dayKeyOf } from '@sim/missions.js'
import { t, textOf, esc } from './i18n.js'
import { avatarChoices, boardChoices, boomChoices } from '@sim/cosmetics.js'
import { storeProducts } from '@sim/store.js'
import { seasonAt, daysLeft } from '@sim/season.js'
import { passProgress, passTrack, EMPTY_PASS } from '@sim/pass.js'
import { sfx } from './audio.js'

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
  onBoardPortrait,
  onBuyAvatar,
  onSetName,
  onPickBoard,
  onPickedBoard,
  onPickBoom,
  onPickedBoom,
  onStoreItems,
  onBuyPack,
  onClaimMission,
  onSettings,
}) {
  const el = {
    root: document.getElementById('home'),
    menu: document.getElementById('home-menu'),
    queue: document.getElementById('queue-status'),
    queueText: document.getElementById('queue-text'),
    queueNote: document.getElementById('queue-note'),
    queueCancel: document.getElementById('queue-cancel'),
    head: document.getElementById('record-head'),
    recent: document.getElementById('record-recent'),
    tier: document.getElementById('record-tier'),
    badge: document.getElementById('record-badge'),
    lp: document.getElementById('record-lp'),
    bar: document.getElementById('record-bar'),
    barFill: document.querySelector('#record-bar i'),
    rankBtn: document.getElementById('record-rank'),
    nameBtn: document.getElementById('record-name'),
    nameBox: document.getElementById('namebox'),
    nameInput: document.getElementById('name-input'),
    nameWhy: document.getElementById('name-why'),
    nameSave: document.getElementById('name-save'),
    nameClose: document.getElementById('name-close'),
    hint: document.getElementById('home-hint'),
    skinsBtn: document.getElementById('btn-skins'),
    skins: document.getElementById('skins'),
    skinsGrid: document.getElementById('skins-grid'),
    skinsTabs: document.getElementById('skins-tabs'),
    skinsGems: document.getElementById('skins-gems'),
    skinsPick: document.getElementById('skins-pick'),
    skinsWhy: document.getElementById('skins-why'),
    skinsAct: document.getElementById('skins-act'),
    skinsClose: document.getElementById('skins-close'),
    shopBtn: document.getElementById('btn-shop'),
    settingsBtn: document.getElementById('btn-settings'),
    shop: document.getElementById('gemshop'),
    shopGems: document.getElementById('shop-gems'),
    shopPacks: document.getElementById('shop-packs'),
    shopClose: document.getElementById('shop-close'),
    hintGo: document.getElementById('hint-go'),
    hintClose: document.getElementById('hint-close'),
    board: document.getElementById('board'),
    boardRows: document.getElementById('board-rows'),
    boardSub: document.getElementById('board-sub'),
    boardClose: document.getElementById('board-close'),
    missions: document.getElementById('home-missions'),
    missionRows: document.getElementById('mission-rows'),
    conn: document.getElementById('home-conn'),
    note: document.getElementById('home-note'),
    retry: document.getElementById('home-retry'),
    hero: document.getElementById('home-hero'),
    pass: document.getElementById('home-pass'),
    passSub: document.getElementById('pass-sub'),
    passLv: document.getElementById('pass-lv'),
    passGems: document.getElementById('pass-gems'),
    passNext: document.getElementById('pass-next'),
    passNextArt: document.getElementById('pass-next-art'),
    passNextLv: document.getElementById('pass-next-lv'),
    passBar: document.querySelector('#pass-bar i'),
    passSheet: document.getElementById('passtrack'),
    passRows: document.getElementById('pass-rows'),
    passHead: document.getElementById('pass-head'),
    passNote: document.getElementById('pass-note'),
    passClose: document.getElementById('pass-close'),
  }

  // 플랫폼이 iframe URL 로 넣어 주는 값. 없으면 로컬 실행이다.
  const hasAuth = new URLSearchParams(location.search).has('auth')

  // account 는 서버에 붙은 뒤에 온다(setAccount). 미션 추첨이 이 값을 쓴다 —
  // 없으면 남의 목록을 그리게 되므로 빈 문자열로 시작한다.
  let state = { status: 'connecting', profile: null, queue: null, account: '' }
  // 큐 초를 1초마다 올리는 타이머. 큐가 없으면 0.
  let queueTick = 0

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
  el.shop.addEventListener('click', backdrop(el.shop))
  // 패스 트랙은 **가로로** 민다. 휠은 기본이 세로라 마우스로는 못 민다 —
  // 세로로 안 넘치는 상자라 휠을 굴려도 아무 일이 안 일어나고, 그러면 25칸
  // 중 여덟 칸만 본 채로 닫는다. 세로 굴림을 가로 밀기로 옮긴다.
  //
  // deltaY 를 쓰는 이유: 가로 휠(deltaX)이 달린 장치는 이미 잘 민다. 그쪽이
  // 왔으면 그대로 두고, 세로만 왔을 때만 옮긴다.
  el.passRows.addEventListener(
    'wheel',
    (ev) => {
      if (ev.deltaY === 0 || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return
      // 트랙이 끝까지 갔으면 화면 전체가 대신 움직이게 둔다 — 안 그러면
      // 다 민 뒤에도 휠이 먹통이라 "얼었다"로 읽힌다.
      const max = el.passRows.scrollWidth - el.passRows.clientWidth
      const next = el.passRows.scrollLeft + ev.deltaY
      if (max <= 0 || (next < 0 && ev.deltaY < 0) || (next > max && ev.deltaY > 0)) return
      ev.preventDefault()
      el.passRows.scrollLeft = next
    },
    { passive: false },
  )

  el.nameBox.addEventListener('click', backdrop(el.nameBox))
  el.nameClose.addEventListener('click', () => closeSheet(el.nameBox))
  /**
   * 이름 창을 연다. why 를 주면 왜 지금 뜨는지 한 줄로 말한다 —
   * 아무 설명 없이 뜨는 입력창은 광고처럼 읽혀서 그냥 닫힌다.
   */
  function openName({ why = '' } = {}) {
    el.nameBox.classList.remove('closing')
    el.nameBox.hidden = false
    el.nameWhy.textContent = why
    // 지금 이름을 채워 둔다 — 빈 칸이면 뭘 바꾸는지 모른 채 새로 지어야 한다.
    el.nameInput.value = state.profile?.name ?? ''
    el.nameInput.focus()
  }
  el.nameBtn.addEventListener('click', () => openName())
  // 규칙은 클라와 서버가 **같은 함수**를 본다. 여기서 미리 알려 주는 것은
  // 편의고, 막는 것은 서버다.
  // 한글을 치는 동안 칸의 값은 "ㅇ" → "ㅇㅏ" → "안" 으로 오간다. 그 중간을
  // 그대로 검사하면 다 치기도 전에 "너무 짧다"가 떴다 사라져서, 뭘 잘못한 줄
  // 알고 손이 멈춘다. 글자가 맺힐 때까지 기다린다.
  let composing = false
  const showNameWhy = () => {
    const c = checkName(el.nameInput.value)
    el.nameWhy.textContent = el.nameInput.value && !c.ok ? t('why.' + c.why) : ''
  }
  el.nameInput.addEventListener('compositionstart', () => {
    composing = true
    el.nameWhy.textContent = ''
  })
  el.nameInput.addEventListener('compositionend', () => {
    composing = false
    showNameWhy()
  })
  el.nameInput.addEventListener('input', () => {
    if (!composing) showNameWhy()
  })
  el.nameInput.addEventListener('keydown', (ev) => {
    // 조합 중의 Enter 는 **글자를 확정하는 키**다. 한글을 치다 Enter 로
    // 음절을 맺으면 그것으로 저장이 돌아가, 아직 두 글자가 안 됐다는 소리를
    // 듣는다.
    if (ev.key === 'Enter' && !ev.isComposing) saveName()
  })
  el.nameSave.addEventListener('click', () => saveName())

  async function saveName() {
    const c = checkName(el.nameInput.value)
    if (!c.ok) {
      el.nameWhy.textContent = t('why.' + c.why)
      return
    }
    const res = await onSetName?.(c.name)
    // 서버가 거절하면 그 사유를 그대로 적는다 — 클라가 통과시킨 것도 서버가
    // 막을 수 있다(규칙이 나중에 갈릴 수 있다).
    if (!res?.ok) {
      el.nameWhy.textContent = res?.why ? t('why.' + res.why) : t('name.failed')
      return
    }
    if (res.profile) state = { ...state, profile: res.profile }
    render()
    closeSheet(el.nameBox)
  }
  el.shopBtn.addEventListener('click', () => openShop())
  // 설정은 서버가 없어도 열린다 — 움직임·초기화는 기기 쪽 값이다.
  el.settingsBtn.addEventListener('click', () => onSettings?.())
  el.shopClose.addEventListener('click', () => closeSheet(el.shop))

  // ── 꾸미기(아바타 · 무대) ───────────────────────────────
  //
  // 고르는 곳과 사는 곳을 **한 창에** 둔다. 갈라 두면 "이걸 쓰고 싶다"와
  // "이걸 산다" 사이에 화면을 한 번 옮겨야 하고, 잠긴 것을 눌렀을 때 어디로
  // 가야 하는지도 따로 배워야 한다.
  let skinTab = 'avatar'
  let skinPick = null

  function openSkins() {
    sfx('open')
    // 닫는 중에 다시 누를 수 있다. closing 이 남아 있으면 열자마자 사라진다.
    el.skins.classList.remove('closing')
    el.skins.hidden = false
    skinPick = null
    drawSkins()
  }

  /**
   * 승리 이펙트 그림 한 조각.
   *
   * 색 원 하나로 그리면 어느 이펙트나 같은 점이라, 무엇이 터지는지를 아무것도
   * 안 말한다 — **실제로 터질 때 쓰는 스프라이트**를 그 색으로 물들여 쓴다.
   * 꾸미기 창과 패스 트랙이 같은 그림을 쓴다: 트랙에서 본 것과 고르는 곳에서
   * 본 것이 다르면 같은 물건인 줄 모른다.
   */
  const fxArt = (fx, cls = '') => {
    const color = fx?.color ?? '#ffd166'
    const burst = fx?.burst ?? 'burst'
    const ring = fx?.ring ?? 'ring'
    return (
      `<i class="fxart ${cls}" style="color:${color};` +
      `--burst:url('/assets/fx/${burst}.webp');--ring:url('/assets/fx/${ring}.webp')"></i>`
    )
  }

  /** 지금 탭의 목록. 아바타든 무대든 같은 모양으로 그린다. */
  function skinList() {
    const owned = ownedNow()
    if (skinTab === 'avatar') return avatarChoices(data, owned)
    if (skinTab === 'board') return boardChoices(data, owned)
    return boomChoices(data, owned)
  }

  function currentId() {
    if (skinTab === 'avatar') return onPickedAvatar()
    if (skinTab === 'board') return onPickedBoard?.()
    return onPickedBoom?.()
  }

  function drawSkins() {
    const list = skinList()
    const cur = currentId()
    el.skinsGems.textContent = String(ownedNow().gems)
    for (const tab of el.skinsTabs.querySelectorAll('[data-tab]')) {
      tab.classList.toggle('on', tab.dataset.tab === skinTab)
    }
    el.skinsGrid.innerHTML = list
      .map((c) => {
        // 무대는 초상을 찍을 수 없다 — 3D 판을 목록마다 그리는 값이 너무 크다.
        // 실제로 바뀌는 색 셋(잔디·돌·테두리)을 그대로 보여 준다.
        // 무대는 **진짜 판을 찍어** 보여 준다. 색 스와치는 그림이 오기
        // 전까지 자리를 채운다 — 빈 칸을 두면 목록이 한 번 덜컹인다.
        // 승리 이펙트는 판 위에서만 보이는 물건이라 카드에 담을 그림이 없다.
        // 색으로라도 무엇이 터질지 말해 준다.
        if (skinTab === 'boom') {
          return (
            `<div class="card${c.unlocked ? '' : ' locked'}${c.id === cur ? ' on' : ''}` +
            `${c.id === skinPick ? ' sel' : ''}" data-skin="${c.id}">` +
            `<span class="boomart">${fxArt(c.fx)}</span>` +
            `<span class="nm">${textOf(c.name)}</span>` +
            `<span class="why">${c.unlocked ? '' : c.reason}</span></div>`
          )
        }
        const art = c.file
          ? `<img alt="" data-file="${c.file}" />`
          : `<span class="swatch"><i class="g1" style="background:${c.colors?.ground}"></i>` +
            `<i class="g2" style="background:${c.colors?.floor};color:${c.colors?.ring}"><i></i></i></span>` +
            `<img class="shot" alt="" data-board="${c.id}" />`
        return (
          `<div class="card${c.unlocked ? '' : ' locked'}${c.id === cur ? ' on' : ''}` +
          `${c.id === skinPick ? ' sel' : ''}" data-skin="${c.id}">${art}` +
          `<span class="nm">${textOf(c.name)}</span>` +
          `<span class="why">${c.unlocked ? '' : c.reason}</span></div>`
        )
      })
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
    for (const img of el.skinsGrid.querySelectorAll('img[data-board]')) {
      onBoardPortrait?.(img.dataset.board)
        .then((url) => {
          img.src = url
        })
        .catch(() => {})
    }
    drawSkinFoot()
  }

  /**
   * 아래 줄. 고른 것 하나에 대해서만 말한다.
   *
   * 카드마다 사기 버튼을 달지 않는 이유: 목록이 버튼 밭이 되고, 고르려다
   * 잘못 눌러 사는 일이 생긴다. 값을 쓰는 일은 한 번 더 눌러야 한다.
   */
  function drawSkinFoot() {
    const c = skinList().find((x) => x.id === skinPick)
    if (!c) {
      el.skinsPick.textContent = ''
      el.skinsWhy.textContent = ''
      el.skinsAct.hidden = true
      return
    }
    el.skinsPick.textContent = textOf(c.name)
    if (c.unlocked) {
      const cur = currentId()
      el.skinsWhy.textContent = c.id === cur ? t('skins.inUse') : ''
      el.skinsAct.hidden = c.id === cur
      el.skinsAct.textContent = t('skins.pick')
      el.skinsAct.dataset.act = 'use'
      return
    }
    if (c.canBuy) {
      el.skinsWhy.textContent = ''
      el.skinsAct.hidden = false
      el.skinsAct.textContent = t('skins.buy', { n: c.price })
      el.skinsAct.dataset.act = 'buy'
      return
    }
    // 못 사는 이유를 그대로 적는다. 값을 숨기면 얼마를 모아야 하는지 모른다.
    el.skinsWhy.textContent = c.price ? t('skins.priceWhy', { n: c.price, why: t('why.' + c.why) }) : c.reason
    el.skinsAct.hidden = true
  }

  el.skinsTabs.addEventListener('click', (ev) => {
    const tab = ev.target.closest('[data-tab]')
    if (!tab || tab.dataset.tab === skinTab) return
    skinTab = tab.dataset.tab
    skinPick = null
    drawSkins()
  })

  // 카드를 누르면 **고르기만** 한다. 열린 것을 두 번 누르면 곧장 쓴다 —
  // 이미 가진 것을 아래 줄까지 가서 한 번 더 누르게 하면 번거롭다.
  el.skinsGrid.addEventListener('click', (ev) => {
    const card = ev.target.closest('[data-skin]')
    if (!card) return
    const id = card.dataset.skin
    const again = skinPick === id
    skinPick = id
    const c = skinList().find((x) => x.id === id)
    if (again && c?.unlocked) applySkin(id)
    else drawSkins()
  })

  el.skinsAct.addEventListener('click', async () => {
    if (!skinPick || el.skinsAct.dataset.busy) return
    if (el.skinsAct.dataset.act === 'use') return applySkin(skinPick)
    el.skinsAct.dataset.busy = '1'
    el.skinsAct.textContent = t('skins.buying')
    // 구매는 **서버가** 판정한다. 여기서 잔액을 깎고 그리면, 서버가 거절했을
    // 때 화면만 산 것처럼 남는다. 서버가 준 새 전적으로 다시 그린다.
    const res = await onBuyAvatar?.(skinPick)
    delete el.skinsAct.dataset.busy
    if (res?.profile) state = { ...state, profile: res.profile }
    // 사자마자 입혀 준다 — 산 것을 다시 눌러 고르게 하면 "샀는데 안 바뀐다"로
    // 읽힌다.
    sfx(res?.ok ? 'buy' : 'error')
    if (res?.ok) applySkin(skinPick)
    else drawSkins()
    render()
  })

  /** 고른 것을 실제로 입힌다. 저장은 main 이 한다(홈은 저장소를 모른다). */
  function applySkin(id) {
    if (skinTab === 'avatar') onPickAvatar(id)
    else if (skinTab === 'board') onPickBoard?.(id)
    else onPickBoom?.(id)
    drawSkins()
  }



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
    sfx('open')
    el.passSheet.classList.remove('closing')
    el.passSheet.hidden = false
    const p = state.profile?.pass ?? EMPTY_PASS
    const prog = passProgress(p.xp ?? 0, data)
    const gems = state.profile?.gems ?? 0
    el.passHead.textContent = prog.done
      ? t('pass.doneHead', { max: prog.max, gems })
      : t('pass.head', { lv: prog.level, left: prog.need - prog.into, gems })

    const track = passTrack(data, p)

    /**
     * 보상 한 칸. 종류마다 다르게 그린다.
     *
     * 한 단계가 물건과 젬을 **같이** 줄 수 있다. 하나만 그리면 나머지가 화면에서
     * 사라지는데 지급은 그대로 되므로, 화면이 거짓말이 된다.
     *
     * 무대를 판 견본으로 안 찍는 이유: 꾸미기 창은 한 번에 다섯 장이고 캐시가
     * 있지만 트랙은 스물다섯 칸이 한 번에 열린다 — 여는 순간 프레임이 끊긴다.
     * 색 띠면 "무슨 색 판인가"는 전해진다.
     *
     * 이펙트를 안 움직이는 이유: 이펙트는 움직여야 뜻이 사는데 스물다섯 칸이
     * 동시에 움직이면 어디를 봐야 할지 모른다. 색 점만 두고 자세한 것은
     * 꾸미기 창에서 본다.
     */
    const cell = (slot) => {
      const gem = slot.gems ? `<span class="badge gem">${slot.gems}</span>` : ''
      const it = slot.item
      if (!it) {
        return slot.gems
          ? `<span class="rw gem">${slot.gems}</span>`
          : '<span class="rw none"></span>'
      }
      if (it.kind === 'avatar') {
        return `<div class="rw av"><img alt="" data-file="${it.file}" title="${textOf(it.name)}" />${gem}</div>`
      }
      if (it.kind === 'board') {
        // **진짜 판을 찍어** 보여 준다 — 색 띠만으로는 그 무대가 어떻게 보이는지
        // 알 수 없다. 색 띠는 그림이 오기 전까지 자리를 지킨다(꾸미기 창과 같은
        // 방식이다). 찍은 것은 main 이 캐시하므로 같은 무대를 다시 안 그린다.
        const c = it.colors ?? {}
        return (
          `<div class="rw sk" title="${textOf(it.name)}">` +
          `<i style="background:${c.floor ?? '#888'}"></i>` +
          `<i style="background:${c.ground ?? '#666'}"></i>` +
          `<i style="background:${c.base ?? '#333'}"></i>` +
          `<i style="background:${c.ring ?? '#fff'}"></i>` +
          `<img class="shot" alt="" data-board="${it.id}" />${gem}</div>`
        )
      }
      return `<div class="rw bm" title="${textOf(it.name)}">${fxArt(it.fx)}${gem}</div>`
    }

    // 프리미엄을 샀으면 자물쇠를 안 그린다 — 이미 열린 칸에 자물쇠가 남아
    // 있으면 산 것이 화면에 안 남는다.
    const bought = !!p.premium
    el.passNote.textContent = bought
      ? t('pass.unlocked')
      : t('pass.locked')
    el.passRows.innerHTML = track
      // 칸 이름을 slot 으로 둔다. t 라고 부르면 i18n 의 t 를 가려서,
      // **잠긴 칸을 그리는 순간** t('pass.lockTip') 이 슬롯 객체를 부른다 —
      // 패스 창이 통째로 안 열린다.
      .map((slot) => {
        // 칸은 셋 중 하나다: **받았다 · 아직이다 · 잠겼다.**
        // 받은 것과 아직인 것이 똑같이 보이면 "내가 저걸 받았던가"를 트랙에서
        // 알 수 없고, 그러면 진행도 화면이 진행도를 말하지 않는다.
        const shut = !slot.free && !bought
        const done = slot.reached && !shut
        return (
          `<div class="step${slot.reached ? ' got' : ''}${shut ? ' shut' : ''}` +
          `${slot.free ? ' open' : ''}${done ? ' done' : ''}">` +
          `<div class="lv">${slot.level}</div>${cell(slot)}` +
          (shut ? `<i class="lock" title="${t('pass.lockTip')}"></i>` : '') +
          '</div>'
        )
      })
      .join('')
    // 무대는 진짜 판을 찍어 덮는다. 오기 전까지는 아래 색 띠가 자리를 지킨다.
    for (const img of el.passRows.querySelectorAll('img[data-board]')) {
      onBoardPortrait?.(img.dataset.board)
        .then((url) => {
          img.src = url
        })
        .catch(() => {})
    }
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
    // **아바타만 보면 안 된다.** 그 사이에 무대와 이펙트가 여럿 있는데 열 단계
    // 뒤 아바타를 가리키면, 코앞의 보상이 화면에서 사라진다 — 다음 목표는
    // 가까운 것이어야 한다.
    const next = [...data.cosmetics.avatars, ...data.cosmetics.boards, ...data.cosmetics.booms]
      .filter((x) => x.unlock === 'pass' && x.passLevel > level)
      .sort((a, b) => a.passLevel - b.passLevel)[0]
    // 남은 보상이 없으면 칸을 비운다. 빈 액자를 남기면 "받을 게 있는데 그림을
    // 못 불러왔다"로 읽힌다.
    el.passNext.parentElement.hidden = !next
    if (!next) return
    // **이름을 같이 적는다.** 단계 숫자만 적으면 "4단계가 뭔데?"가 되고, 그
    // 답이 화면에 없으면 미리보기가 미리보기 노릇을 못 한다.
    el.passNextLv.textContent = t('pass.next', { lv: next.passLevel, name: textOf(next.name) })
    el.passNext.parentElement.title = t('pass.nextTip', { lv: next.passLevel, name: textOf(next.name) })
    // 아바타가 아니면 찍을 그림이 없다. 색 한 칸으로 때우면 빈 상자로 읽히므로,
    // 무대는 색 띠로 이펙트는 그 스프라이트로 — 트랙에서 쓰는 그 그림이다.
    if (!next.file) {
      nextShown = null
      el.passNext.hidden = true
      el.passNextArt.hidden = false
      if (next.fx) {
        el.passNextArt.innerHTML = fxArt(next.fx, 'big')
        return
      }
      // 무대는 색 띠를 먼저 깔고 그 위에 진짜 판을 덮는다 — 색만 보여 주면
      // "무슨 색인지"는 알아도 "어떻게 보이는지"는 모른다.
      el.passNextArt.innerHTML =
        '<span class="strip">' +
        [next.colors?.floor, next.colors?.ground, next.colors?.base, next.colors?.ring]
          .map((c) => `<i style="background:${c ?? '#888'}"></i>`)
          .join('') +
        '</span><img class="shot" alt="" />'
      const shot = el.passNextArt.querySelector('img.shot')
      onBoardPortrait?.(next.id)
        .then((url) => {
          shot.src = url
        })
        .catch(() => {})
      return
    }
    el.passNext.hidden = false
    el.passNextArt.hidden = true
    if (next.file === nextShown) return
    nextShown = next.file
    onAvatarPortrait?.(next.file)
      .then((url) => {
        el.passNext.src = url
      })
      .catch(() => {})
  }

  /** 지금 가진 것. 코스메틱 해금 판정이 이걸 본다. */
  function ownedNow() {
    return {
      lp: state.profile?.lp ?? 0,
      passLevel: state.profile?.pass?.level ?? 1,
      gems: state.profile?.gems ?? 0,
      avatars: state.profile?.owned ?? [],
    }
  }

  /**
   * 젬 상점.
   *
   * 못 사는 것도 값을 그대로 보여 준다 — 얼마가 모자란지 알아야 모을 마음이
   * 생긴다. 버튼만 죽인다.
   */
  function openShop() {
    sfx('open')
    el.shop.classList.remove('closing')
    el.shop.hidden = false
    el.shopGems.textContent = String(ownedNow().gems)
    drawPacks()
  }

  /**
   * 젬 충전 줄.
   *
   * 값은 **플랫폼이 준 것**만 쓴다. 우리 파일에는 값이 없다 — 대시보드가 VX 로
   * 쥔다. 여기 적어 두면 결제창과 다른 수가 화면에 뜬다. 플랫폼을 못 붙었으면
   * 값 자리에 그 사실을 적는다.
   */
  async function drawPacks() {
    el.shopPacks.innerHTML = `<div class="none">${t('shop.loading')}</div>`
    const live = await onStoreItems?.()
    const known = storeProducts(data)

    /**
     * 상품 한 줄.
     *
     * **목록은 결제가 안 열려도 그린다.** 전에는 플랫폼을 못 붙으면 "결제는
     * Verse8 에서만 열린다" 한 줄만 남아서, 무엇을 파는 가게인지조차 알 수
     * 없었다 — 값을 볼 수 없는 것과 물건을 볼 수 없는 것은 다른 일이다.
     *
     * 값은 **플랫폼이 준 것**만 쓴다(VX). 우리 파일에는 값이 없다. 못 받았으면
     * 값 자리에 "결제창에서" 라고 적는다 — 없는 수를 지어내지 않는다.
     */
    const row = (p, item) => {
      const price = item ? `<div class="p">${item.price}</div>` : `<div class="p off">${t('shop.priceLater')}</div>`
      // 이름이 이미 "젬 1,000" 이라 젬 수를 또 적으면 같은 말이 두 번이다.
      // 설명만 적되, 패스는 무엇인지 한 마디를 앞에 붙인다.
      const what = p.premium ? t('shop.passWhat') : ''
      return (
        `<div class="pack${item ? '' : ' off'}" data-pack="${item ? p.id : ''}">` +
        `<img alt="" src="/assets/store/${p.icon ?? `store_${p.id}.png`}" />` +
        `<div class="t"><div class="n">${item?.name || textOf(p.name)}</div>` +
        `<div class="d">${what}${p.desc}</div>` +
        `${p.bonus ? `<div class="b">${p.bonus}</div>` : ''}</div>` +
        price +
        '</div>'
      )
    }

    el.shopPacks.innerHTML =
      (live
        ? ''
        : `<div class="none">${t('shop.offline')}</div>`) +
      known.map((p) => row(p, live?.find((x) => x.productId === p.id))).join('')
  }

  el.shopPacks.addEventListener('click', (ev) => {
    const row = ev.target.closest('[data-pack]')
    if (row) onBuyPack?.(row.dataset.pack)
  })

  /** 순위표를 연다. 서버가 안 주면 그 사실을 그대로 적는다 — 빈 표를 띄우면
   *  아무도 없는 것처럼 보인다. */
  async function openBoard() {
    sfx('open')
    el.board.classList.remove('closing')
    el.board.hidden = false
    el.boardRows.innerHTML = `<div class="empty">${t('board.loading')}</div>`
    const lb = await onBoard?.()
    if (!lb) {
      el.boardRows.innerHTML = `<div class="empty">${t('board.failed')}</div>`
      el.boardSub.textContent = ''
      return
    }
    el.boardSub.textContent = lb.myRank ? t('board.mine', { total: lb.total, rank: lb.myRank }) : t('board.total', { total: lb.total })
    if (!lb.top.length) {
      el.boardRows.innerHTML = `<div class="empty">${t('board.empty')}</div>`
      return
    }
    // 같은 이름이 두 줄 이상이면 그 줄들에만 계정 꼬리가 붙는다.
    const shown = tagDuplicates(lb.top.map((r) => ({ text: r.name, tag: r.tag })))
    el.boardRows.innerHTML = lb.top
      .map(
        (r, i) =>
          `<div class="row${r.mine ? ' mine' : ''}"><span class="no">${r.rank}</span>` +
          `<span class="nm">${esc(shown[i].name)}` +
          (shown[i].tag ? `<span class="tg">#${esc(shown[i].tag)}</span>` : '') +
          `</span><span class="lp">${r.lp} LP</span></div>`,
      )
      .join('')
  }
  el.retry.addEventListener('click', () => onRetry())

  /**
   * 오늘의 미션 세 줄.
   *
   * 목록은 **서버에서 안 받는다** — 날짜와 계정으로 다시 계산한다
   * (sim/missions.js). 진행도만 프로필에서 읽는다. 서버가 없으면 카드를 안
   * 띄운다: 미션은 계정에 쌓이는 값이라 로컬로 흉내 낼 수 없다.
   */
  function renderMissions() {
    const ms = state.profile?.missions
    if (!ms || !Array.isArray(ms.progress)) {
      el.missions.hidden = true
      return
    }
    el.missions.hidden = false
    const list = missionsFor(ms.day ?? dayKeyOf(Date.now()), state.account, data)
    el.missionRows.replaceChildren(
      ...list.map((m, i) => {
        const got = Math.min(ms.progress[i] ?? 0, m.target)
        const full = got >= m.target
        const claimed = !!ms.claimed?.[i]
        const row = document.createElement('div')
        row.className = 'row' + (claimed ? ' done' : '')
        row.innerHTML =
          `<div class="line"><b>${textOf(m.text)}</b>` +
          (full && !claimed
            ? `<button data-claim="${i}">${t('mission.claim')}</button>`
            : `<span class="n">${got}/${m.target}</span>`) +
          '</div>' +
          `<div class="bar"><i style="width:${Math.round((got / m.target) * 100)}%"></i></div>`
        return row
      }),
    )
  }

  // 위임으로 받는다 — 줄은 다시 그릴 때마다 새로 만들어진다.
  el.missionRows.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-claim]')
    if (!btn) return
    // 두 번 눌러도 한 번만 간다. 판정은 서버가 다시 하지만, 두 번째 호출이
    // 거절로 돌아오면 화면에 "못 받는다"가 뜬다.
    btn.disabled = true
    const res = await onClaimMission?.(Number(btn.dataset.claim))
    if (res?.profile) state = { ...state, profile: res.profile }
    // 못 받았으면 다시 누를 수 있어야 한다. 서버가 잠깐 끊겼을 수도 있는데
    // 버튼이 굳으면 새로고침 말고는 길이 없다.
    sfx(res?.ok ? 'buy' : 'error')
    if (!res?.ok) btn.disabled = false
    render()
  })

  function render() {
    const v = homeView({ ...state, hasAuth, data })

    el.menu.hidden = v.menu === 'hidden'
    for (const btn of el.menu.querySelectorAll('[data-mode]')) {
      // 튜토리얼만 접속 상태와 무관하다 — 서버 없이 도는 유일한 경로다.
      const own = btn.dataset.mode === 'tutorial' ? v.tutorial : v.menu
      btn.disabled = own !== 'enabled'
    }

    el.queue.hidden = !v.queue
    if (v.queue) {
      el.queueText.textContent = v.queue.text
      el.queueNote.textContent = v.queue.note ?? ''
    }

    el.head.textContent = v.profile ? v.profile.head : t('home.waitFirst')
    el.recent.textContent = v.profile ? v.profile.recent.join(' · ') : ''

    // 기록이 없으면 티어 줄도 비워 둔다 — 한 판도 안 한 사람에게 "브론즈 0"
    // 을 붙이면 진 것 같은 인상이 된다.
    el.tier.textContent = v.profile ? v.profile.tier : t('home.rankNone')
    el.badge.className = `badge ${v.profile ? v.profile.tierId : ''}`
    el.lp.textContent = v.profile ? `${v.profile.lp} LP` : ''
    const next = v.profile?.next
    el.bar.hidden = !next
    if (next) {
      el.barFill.style.width = `${Math.round(next.ratio * 100)}%`
      el.bar.title = t('home.toNext', { tier: next.name, lp: next.need })
    }

    // 순위표는 서버가 붙어 있어야 볼 수 있다. 기록이 없어도 남의 등수는
    // 궁금하니 전적 유무와는 무관하게 연다.
    // 상점은 서버가 붙어 있어야 한다 — 구매 판정이 서버에 있다. 못 붙은
    // 채로 열어 두면 눌러도 아무 일이 없는 버튼이 된다.
    // 이름은 서버에 저장된다 — 못 붙었으면 바꿀 수도 없다.
    el.nameBtn.hidden = state.status !== 'ready'
    el.nameBtn.textContent = displayName(state.profile?.name, null) === t('home.guest') ? t('home.setName') : state.profile?.name
    el.shopBtn.hidden = state.status !== 'ready'
    el.rankBtn.hidden = state.status !== 'ready'
    el.rankBtn.textContent = t('home.leaderboard')

    // 패스 칸. 시즌 이름·남은 날과 함께 **내 단계**를 적는다 — 진행도가 안
    // 보이면 눌러 볼 이유가 없다.
    const s = seasonAt(Date.now(), data)
    const left = daysLeft(Date.now(), data)
    el.passSub.textContent = s ? t('pass.leftDays', { name: textOf(s.name), days: left }) : t('pass.soon')
    const prog = passProgress(state.profile?.pass?.xp ?? 0, data)
    el.passLv.textContent = t('pass.level', { n: prog.level })
    el.passBar.style.width = `${Math.round(prog.ratio * 100)}%`
    el.passGems.textContent = String(state.profile?.gems ?? 0)
    showNextReward(prog.level)

    renderMissions()

    el.note.textContent = v.notice ?? ''
    el.retry.hidden = state.status !== 'failed'
    // 할 말이 없으면 상자째 감춘다. 붙고 나면 적을 것이 없어서, 늘 띄워 두면
    // 빈 네모 하나가 하늘 구석에 박혀 있다.
    el.conn.hidden = !el.note.textContent && el.retry.hidden
  }

  render()

  return {
    /** 밖에서 이름 창을 연다. 튜토리얼을 막 끝낸 사람에게 쓴다. */
    openName,
    /** 밖에서 다시 그린다. 언어가 바뀐 자리에서 홈이 따라와야 한다. */
    redraw() {
      render()
    },
    setStatus(status) {
      state = { ...state, status }
      render()
    },
    /** 계정. 미션 추첨이 이 값을 쓴다 — 서버에 붙은 뒤에 온다. */
    setAccount(account) {
      state = { ...state, account }
      render()
    },
    setProfile(profile) {
      state = { ...state, profile }
      render()
    },
    /**
     * 큐 상태가 왔다. 서버는 2초마다 답하는데 화면의 초는 1초마다 올라야 한다 —
     * 그냥 두면 0, 2, 4 로 두 칸씩 뛰어서 멈춘 것처럼 보인다. 받은 값을 시작점으로
     * 잡고 그 사이는 화면이 스스로 센다. 다음 답이 오면 다시 맞춘다 — 세는 것은
     * 화면이지만 **옳은 값은 서버가 정한다.**
     */
    setQueue(queue) {
      clearInterval(queueTick)
      queueTick = 0
      state = { ...state, queue }
      render()
      if (!queue) return
      const base = queue.waitedMs ?? 0
      const from = performance.now()
      queueTick = setInterval(() => {
        state = { ...state, queue: { ...queue, waitedMs: base + (performance.now() - from) } }
        render()
      }, 1000)
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

    /** 전적이 와서 "이미 봤다"가 밝혀졌다. 표시를 거둔다. */
    clearTutorialNew() {
      el.menu.querySelector('[data-mode="tutorial"]')?.classList.remove('is-new')
      el.hint.hidden = true
      el.root.classList.remove('guiding')
    },
    show() {
      el.root.hidden = false
    },
    hide() {
      el.root.hidden = true
    },
  }
}
