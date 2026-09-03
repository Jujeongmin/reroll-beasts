// 가상 조이스틱. 손가락으로 아바타를 움직인다.
//
// **고정 자리에 두지 않는다.** 화면 구석은 이미 상점·순위표가 쓰고 있고,
// 812×390 에 조이스틱 자리를 새로 내면 판이 그만큼 작아진다. 대신 빈 땅을
// 짚는 그 자리에 뜬다 — 엄지가 어디에 있든 거기가 중심이다.
//
// 짧게 톡 치면 조이스틱이 아니라 "그리로 걸어가라"가 된다. 손가락 하나로
// 두 가지를 시키는 흔한 방법이고, 가른 기준은 **끌었느냐**다.

/** 이만큼 끌어야 조이스틱으로 친다. 그 아래는 탭이다. */
const DEAD = 10
/** 최대로 기울인 것으로 치는 거리. 이보다 멀리 끌어도 속도는 안 는다. */
const RANGE = 46

/**
 * @param {object} o
 * @param {Element} o.root            조이스틱을 그릴 자리(화면 좌표계)
 * @param {(dx:number,dy:number)=>void} o.onMove  -1~1 방향. 0,0 이면 정지
 * @param {(x:number,y:number)=>void} o.onTap     끌지 않고 뗐다
 */
export function createJoystick({ root, onMove, onTap }) {
  const el = document.createElement('div')
  el.className = 'stick'
  el.innerHTML = '<i class="knob"></i>'
  el.hidden = true
  root.appendChild(el)
  const knob = el.querySelector('.knob')

  let id = null
  let ox = 0
  let oy = 0
  let dragged = false
  // 마우스인가. PC 에서는 원을 안 띄운다 — 조이스틱은 엄지가 화면을 가릴 때
  // 중심을 찾아 주는 물건이고, 커서로 끄는 화면에서는 커서가 이미 그 일을
  // 한다. 원만 떠서 클릭한 자리를 가린다.
  let mouse = false

  function show(x, y) {
    const r = root.getBoundingClientRect()
    el.style.left = `${x - r.left}px`
    el.style.top = `${y - r.top}px`
    knob.style.transform = 'translate(-50%, -50%)'
    el.hidden = false
  }

  return {
    /** prep 이 "빈 땅을 짚었다"고 알려 줄 때 부른다. */
    start(ev) {
      if (id !== null) return
      id = ev.pointerId
      ox = ev.clientX
      oy = ev.clientY
      dragged = false
      mouse = ev.pointerType === 'mouse'
      // 아직 안 띄운다. 톡 치기만 할 수도 있는데 그때마다 원이 번쩍이면
      // 화면이 시끄럽다 — 끌기 시작할 때 뜬다.
    },

    move(ev) {
      if (ev.pointerId !== id) return
      const dx = ev.clientX - ox
      const dy = ev.clientY - oy
      const len = Math.hypot(dx, dy)
      if (!dragged && len < DEAD) return
      if (!dragged) {
        dragged = true
        // 끄는 조작 자체는 마우스에서도 통한다 — 원만 안 그린다.
        if (!mouse) show(ox, oy)
      }
      const k = Math.min(1, len / RANGE)
      const nx = (dx / (len || 1)) * k
      const ny = (dy / (len || 1)) * k
      if (!mouse) {
        knob.style.transform = `translate(calc(-50% + ${nx * RANGE}px), calc(-50% + ${ny * RANGE}px))`
      }
      onMove(nx, ny)
    },

    end(ev) {
      if (ev.pointerId !== id) return
      id = null
      el.hidden = true
      onMove(0, 0)
      if (!dragged) onTap(ev.clientX, ev.clientY)
      dragged = false
    },

    /** 지금 끌고 있나. 끌고 있으면 다른 입력이 끼어들면 안 된다. */
    get active() {
      return id !== null
    },
  }
}
