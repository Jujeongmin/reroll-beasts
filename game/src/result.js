// 결과판. 판이 끝나면 한 장 뜬다.
//
// 줄 하나가 사람 하나고, 줄 안에 그 사람 유닛이 성급과 함께 늘어선다.
// **보드 격자를 여덟 개 그리지 않는다** — 자리가 없어서가 아니라 읽히지
// 않아서다. 격자 여덟 개를 한 화면에 넣으면 어느 것도 안 읽히는데, 이 화면이
// 답해야 하는 질문은 "무엇으로 짰나" 하나다.
//
// 등수는 **서버가 박은 것만** 쓴다(seat.rank). 클라가 살아 있는 수를 세어
// 스스로 매기면 그 셈이 서버와 어긋나는 날이 오고, 화면에 뜬 등수와 실제로
// 받은 LP 가 서로 다른 말을 한다. 아직 살아 있는 사람은 등수가 없다 —
// 그 자리에는 `–` 를 적는다. 없는 등수를 지어내지 않는다.

import { unitById } from '@sim/data.js'
import { lpDelta, phaseProgress, divisionOf, divisionLabel, nextDivisionLabel, TIERS } from '@sim/rank.js'
import { xpForRank } from '@sim/pass.js'
import { accountTag, tagDuplicates, joinTag } from '@sim/name.js'
import { t, textOf, esc } from './i18n.js'
import { sfx } from './audio.js'

const STAR = ['', '★', '★★', '★★★']
// 성급 색. prep·scene3d 와 같은 값이어야 화면끼리 안 어긋난다.
const STAR_COLOR = ['#d99154', '#e6edf5', '#ffd166']

/** 티어 문장. tools/tier-icons.mjs 가 찍는다. */
const TIER_ART = (id) => `url('/assets/ui/tier_${id}.png')`

/**
 * @param {object} o
 * @param {object} o.data
 * @param {(unitId: string, star: number) => Promise<string>} o.thumbFor 유닛 초상
 * @param {() => void} o.onClose 나가기를 눌렀다
 * @param {(placementId: string, requestId: string) => Promise<any>} [o.onAd] 광고를 끝까지
 *   봤다 — 서버에 지급을 청구한다. 없으면 버튼이 안 뜬다
 */
export function createResult({ data, thumbFor, onClose, onAd = null }) {
  const el = {
    root: document.getElementById('result'),
    title: document.getElementById('result-title'),
    sub: document.getElementById('result-sub'),
    place: document.getElementById('result-place'),
    band: document.getElementById('result-band'),
    rows: document.getElementById('result-rows'),
    close: document.getElementById('result-close'),
    ad: document.getElementById('result-ad'),
  }

  // 광고 SDK. 없으면(로컬·미지원) 버튼을 아예 안 보인다 — 눌러도 아무 일도
  // 안 생기는 버튼을 두는 것보다 낫다. 한 번 unsupported_env 가 오면 이 세션
  // 동안 숨긴다(문서 규칙).
  const ads = () => globalThis.Verse8Ads
  let adsOff = false
  let adBusy = false

  el.ad.addEventListener('click', async () => {
    if (adBusy || !ads() || !onAd) return
    adBusy = true
    el.ad.disabled = true
    try {
      const r = await ads().showRewarded({ placementId: 'result-double' })
      if (r.status === 'rewarded') {
        const res = await onAd('result-double', r.requestId)
        if (res?.ok) {
          el.ad.textContent = t('result.adDone', { xp: res.xp })
          el.ad.classList.add('done')
          return // 받았다. 다시 누를 수 없다.
        }
        el.ad.textContent = t('result.adRefused')
        return
      }
      if (r.status === 'dismissed') {
        el.ad.textContent = t('result.adDismissed')
        el.ad.disabled = false
        return
      }
      if (r.error?.code === 'unsupported_env') {
        adsOff = true
        el.ad.hidden = true
        return
      }
      el.ad.textContent = t('result.adFail')
      el.ad.disabled = r.error?.code === 'busy'
    } finally {
      adBusy = false
    }
  })

  el.close.addEventListener('click', () => {
    el.root.classList.add('closing')
    setTimeout(() => {
      el.root.hidden = true
      el.root.classList.remove('closing')
      onClose?.()
    }, 200)
  })

  /**
   * 줄 순서.
   *
   * 등수가 있는 사람은 등수 순, 없는 사람(아직 살아 있다)은 그 위에 체력 순으로
   * 놓는다 — 위쪽이 잘하고 있는 쪽이라는 읽기가 두 무리에서 같아진다.
   */
  const order = (seats) =>
    [...seats].sort((a, b) => {
      const ar = a.rank ?? 0
      const br = b.rank ?? 0
      // 등수 없는 쪽이 먼저. 0 을 그냥 비교하면 1등보다 뒤로 간다.
      if (!ar !== !br) return ar ? 1 : -1
      if (ar && br) return ar - br
      return (b.hp ?? 0) - (a.hp ?? 0)
    })

  /** 그 좌석의 유닛들. 정찰로 받아 둔 마지막 배치다. */
  const unitsOf = (seat) =>
    (seat.board ?? [])
      .filter(Boolean)
      // 성급 높은 것부터. 판에서 무엇이 중심이었는지가 앞에 온다.
      .sort((x, y) => (y.star ?? 1) - (x.star ?? 1))

  function rowFor(seat, label, mine, ranked) {
    const d = document.createElement('div')
    // 1·2·3 만 색이 다르다 — 시상대가 있는 게임에서 그 셋은 다른 이야기다.
    const podium = seat.rank >= 1 && seat.rank <= 3 ? ` p${seat.rank}` : ''
    d.className = 'r' + (mine ? ' me' : '') + (seat.rank ? '' : ' out') + podium

    const units = unitsOf(seat)
    const art = units
      .map((u) => {
        const star = Math.max(1, Math.min(3, u.star ?? 1))
        const meta = unitById(data.units, u.unitId)
        const name = meta ? textOf(meta.name) : u.unitId
        return (
          `<span class="u" style="--sc:${STAR_COLOR[star - 1]}" data-unit="${u.unitId}" data-star="${star}" title="${name} ${STAR[star]}">` +
          `<img alt="${name}" />` +
          `<i>${STAR[star]}</i></span>`
        )
      })
      .join('')

    // 남의 LP 는 안 적는다. 남의 점수는 남의 구간(배치·준배치)에 달렸고 내
    // 화면이 그 사람의 판수를 알 길이 없다 — 모르는 수를 적으면 거짓말이다.
    // 내 점수는 위 띠에 있다.
    const lpText = ''

    d.innerHTML =
      `<span class="no${seat.rank ? '' : ' none'}">${seat.rank ?? '–'}</span>` +
      `<span class="who"><span class="n">${esc(label.name)}` +
      (label.tag ? `<span class="tg">#${esc(label.tag)}</span>` : '') +
      `</span><span class="hp">${t('result.hp', { hp: Math.max(0, seat.hp ?? 0) })}</span></span>` +
      `<span class="us">${art || `<span class="empty">${t('result.noUnits')}</span>`}</span>` +
      lpText

    // 초상은 뒤늦게 붙인다 — 스물넷을 기다렸다 한 번에 그리면 창이 늦게 뜬다.
    for (const span of d.querySelectorAll('.u')) {
      thumbFor(span.dataset.unit, Number(span.dataset.star))
        .then((url) => {
          const img = span.querySelector('img')
          if (img) img.src = url
        })
        .catch(() => {
          // 초상 하나가 없어도 줄은 읽힌다 — 성급과 이름(title)이 남는다.
        })
    }
    return d
  }


  /**
   * 내 티어 띠. 랭크 판에서만 그린다.
   *
   * 숫자만 적으면 "+28 LP" 가 많은지 적은지는 티어 문턱을 외운 사람만 안다.
   * 막대 위에서 **움직인 구간을 칠하면** 어디에서 어디로 갔는지가 한눈에
   * 보인다. 오른 쪽은 밝게, 내린 쪽은 잃은 자리에 빗금을 둔다 — 빈칸으로
   * 두면 원래 거기까지 안 갔던 것처럼 보인다.
   *
   * @param {number} before 판 전 LP
   * @param {number} delta  이 판이 움직인 LP
   */
  function drawBand(before, delta, progress) {
    const after = Math.max(0, before + delta)
    // 막대는 **끝난 뒤의 단계** 칸에 그린다. 티어 한 칸(골드는 500 LP)을
    // 눈금으로 쓰면 한 판(±30)으로는 막대가 거의 안 움직여, 이겼는데
    // 아무것도 안 변한 것처럼 보인다. 단계 한 칸은 100 이라 한 판이 보인다.
    const d = divisionOf(after)
    const span = Math.max(1, (d.to ?? after + 1) - d.from)
    const pos = (lp) => Math.max(0, Math.min(1, (lp - d.from) / span)) * 100
    const lo = pos(Math.min(before, after))
    const hi = pos(Math.max(before, after))
    // 칸을 넘어왔으면 이번 판이 이 칸을 처음부터 채운 것으로 보인다 — 실제로
    // 그랬다. 아래 칸에 남은 몫은 그 칸에서 이미 지나갔다.
    const next = nextDivisionLabel(after)

    const moved =
      delta === 0
        ? ''
        : `<i class="${delta > 0 ? 'gain' : 'loss'}" style="left:${lo}%;width:${hi - lo}%"></i>`

    el.band.innerHTML =
      `<span class="head"><span class="badge" style="background-image:${TIER_ART(d.tier.id)}"></span>` +
      // 배치 중이면 티어 앞에 "임시". 계산은 평소와 같고 이름만 다르다 —
      // 감추면 다섯 판 동안 점수가 어디로 가는지 모른다.
      `<span class="tn">${progress?.phase === 'placement' ? t('result.provisional') + ' ' : ''}${divisionLabel(after)}</span>` +
      `<span class="delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'none'}">` +
      `${delta > 0 ? '+' : ''}${delta}</span></span>` +
      '<span class="mid">' +
      `<span class="bar"><i class="kept" style="width:${lo}%"></i>${moved}</span>` +
      '<span class="nums">' +
      `<b>${after}</b> LP` +
      (next ? `<span class="to">${t('result.toNext', { tier: next, lp: d.need })}</span>` : '') +
      '</span>' +
      // 왜 이만큼 움직였나. 배치·준배치는 평소와 폭이 달라서 이 한 줄이 없으면
      // +300 이 오류로 보인다.
      (progress ? `<span class="phase">${t(progress.phase === 'placement' ? 'result.phasePlacement' : 'result.phaseSoft', { n: progress.n, of: progress.of })}</span>` : '') +
      '</span>' +
      // 다섯 칸 사다리. 내가 선 칸을 밝히고, 지나온 칸은 색만 남긴다.
      '<span class="ladder">' +
      TIERS.map((x, i) => {
        const at = TIERS.findIndex((y) => y.id === d.tier.id)
        const cls = i === at ? ' on' : i < at ? ' past' : ''
        return `<span class="step${cls}"><i style="background-image:${TIER_ART(x.id)}"></i><b>${x.name}</b></span>`
      }).join('') +
      '</span>'
    el.band.hidden = false
  }

  // 마지막으로 띄운 인자. 등수가 늦게 와도 같은 화면을 다시 그리려면
  // 무엇으로 그렸는지를 들고 있어야 한다.
  let shown = null

  return {
    /**
     * @param {object} o
     * @param {object[]} o.seats 좌석 미러(run.lobby)
     * @param {number|null} o.mySeatId 내 좌석
     * @param {boolean} o.ranked 랭크 판인가 — LP 가 움직였나
     * @param {boolean} o.won 내가 1등인가
     * @param {number} o.lp 판에 들어가기 전 내 LP
     * @param {number} o.rankedGames 판에 들어가기 전 내 랭크 판수 — 배치·준배치를 가른다
     */
    open(args) {
      shown = args
      el.ad.classList.remove('done')
      draw(args)
    },

    /**
     * 좌석이 갱신됐다. **떠 있을 때만** 다시 그린다.
     *
     * 내 체력이 0 이 되는 순간과 서버가 등수를 박는 순간은 같지 않다 —
     * 화면은 곧장 뜨고, 등수와 LP 는 한 박자 뒤에 온다. 그때 다시 안 그리면
     * 여덟 줄이 영영 `–` 로 남는다.
     */
    seatsChanged(seats) {
      if (!shown || el.root.hidden) return
      shown = { ...shown, seats }
      draw(shown)
    },
  }

  function draw({ seats, mySeatId, ranked = false, won = false, lp = 0, rankedGames = 0 }) {
      const rows = order(seats ?? [])
      const me = rows.find((s) => s.id === mySeatId)
      // 이름은 겹칠 수 있다. 같은 목록에 같은 이름이 둘이면 그 줄들에만 꼬리.
      const labels = tagDuplicates(
        rows.map((s) => ({ text: textOf(s.name), tag: accountTag(s.account) })),
      )

      // 등수를 크게 세운다. 작게 적으면 여덟 줄을 다 훑고 나서야 내가 몇
      // 등인지 안다. 아직 안 정해졌으면 자리를 비운다 — 없는 등수를
      // 지어내지 않는다.
      el.place.innerHTML = me?.rank ? `<b>${me.rank}</b><i>${t('result.placeUnit')}</i>` : ''
      // 이름은 등수 옆에 둔다. 여덟 줄 중 내 줄을 찾지 않아도 되게.
      const myLabel = me ? labels[rows.indexOf(me)] : null
      el.title.textContent = myLabel ? joinTag(myLabel) : t('result.title')
      el.sub.textContent = ranked ? t('result.ranked') : t('result.casual')
      // 띠는 랭크 판에서, 내 등수가 확정된 뒤에만 그린다. 일반 판에서 0 을
      // 그리면 움직였는데 0 인 것처럼 읽힌다.
      if (ranked && me?.rank) drawBand(lp, lpDelta(me.rank, rankedGames), phaseProgress(rankedGames))
      else el.band.hidden = true

      el.rows.replaceChildren(
        ...rows.map((seat, i) => rowFor(seat, labels[i], seat.id === mySeatId, ranked)),
      )

      // 광고 버튼은 등수가 박힌 뒤에만. 등수가 없으면 서버도 줄 수 없다.
      // 다시 그릴 때 이미 받은 상태(done)는 건드리지 않는다.
      if (!el.ad.classList.contains('done')) {
        const can = !!onAd && !!ads() && !adsOff && !!me?.rank
        el.ad.hidden = !can
        // **얼마인지 적는다.** "2배" 만으로는 기준을 모른다 — 이번 판이 몇을
        // 줬는지가 화면 어디에도 없었다. 지급은 서버가 같은 함수로 다시
        // 세므로(sim/ads.js 가 xpForRank 를 부른다) 여기 뜬 수가 곧 받는 수다.
        el.ad.textContent = t('result.ad', {
          xp: me?.rank ? xpForRank(me.rank, data, { ranked }) : 0,
        })
        el.ad.disabled = false
      }

      // 소리와 애니메이션은 처음 뜰 때만. 등수가 늦게 와서 다시 그릴 때마다
      // 팡파르가 울리면 판이 여러 번 끝난 것처럼 들린다.
      if (el.root.hidden) {
        el.root.classList.remove('closing')
        el.root.hidden = false
        sfx(won ? 'win' : 'lose')
      }
  }
}
