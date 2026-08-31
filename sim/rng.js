// 시드 고정 정수 난수. mulberry32.
// sim/ 안에서 무작위성이 필요한 곳은 전부 이 모듈만 쓴다.
// Math.random() 은 결정론을 깨므로 sim/ 어디서도 호출하지 않는다.

export function createRng(seed) {
  let s = seed >>> 0

  function nextU32() {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }

  return {
    nextU32,
    int(n) {
      if (n <= 0) return 0
      return nextU32() % n
    },
    pick(arr) {
      return arr[this.int(arr.length)]
    },
    state() {
      return s
    },
  }
}
