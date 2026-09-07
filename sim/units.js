// 유닛 표 찾기. data.js 에서 떼어 둔 이유 하나: 서버 번들.
//
// data.js 의 loadData 는 Node 전용이라 import.meta.url 을 쓴다. 서버(isolated-vm,
// IIFE 번들)는 그 함수를 절대 안 부르지만, unitById 를 쓰려고 data.js 를 물면
// 그 파일이 통째로 번들에 들어가고 esbuild 가 배포할 때마다 "import.meta 가
// 빈다"고 경고한다. 그 경고가 언젠가 진짜 경고를 가린다. 규칙(sim)은 이 파일을
// 물고, 화면은 data.js 를 물어도 된다(ESM, 비어도 안 부른다).

export function unitById(unitsData, id) {
  return unitsData.units.find((u) => u.id === id)
}
