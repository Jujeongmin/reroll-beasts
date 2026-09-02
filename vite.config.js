import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Verse8 은 Vite 프로젝트를 전제한다 (docs.verse8.io — "Vite-based project").
// 구조 근거는 docs/verse8_구조_대조.md 에 정리했다.
//
// root 를 game/ 으로 잡는다. index.html 이 진입점이고 Vite 가 그것을 모듈
// 그래프의 뿌리로 삼는다. 저장소 루트에는 빌드에 안 들어가는 것만 남는다
// (sim/ 은 예외 — 아래 참조).
//
// assets/ 와 data/ 는 game/public/ 아래다 (publicDir 기본값 = <root>/public).
// 가공 없이 그대로 복사돼야 하는 것들이라 모듈 그래프에 넣지 않는다:
//   · assets  유닛 스프라이트 167장. 번들러가 건드릴 이유가 없다
//   · data    게임 규칙의 단일 소스. **런타임에 fetch 로 읽는다.**
//             import 로 바꾸면 번들에 박혀서 JSON 만 고쳐 배포하는 길이 막힌다
// 코드에서는 절대경로(`/assets/...`, `/data/...`)로 참조한다.
export default defineConfig({
  root: 'game',
  // .env 는 저장소 루트에 있다(플랫폼이 VITE_AGENT8_VERSE 를 거기 쓴다).
  // root 가 game/ 이라 envDir 을 안 주면 그 파일을 못 읽어 게임서버 접속이
  // 'default' verse 로 가서 조용히 실패한다.
  envDir: import.meta.dirname,
  publicDir: 'public',

  resolve: {
    // sim/ 은 저장소 루트에 있다 — 클라이언트(렌더러)와 서버(스냅샷 검증),
    // 테스트, 밸런스 러너가 **같이 쓰는** 모듈이라 어느 한쪽 안에 넣으면
    // 반대쪽이 어색해진다. alias 로 root 밖을 가리킨다.
    alias: { '@sim': resolve(import.meta.dirname, 'sim') },
  },

  server: {
    port: 5180,
    // root 밖(sim/)의 모듈을 개발 서버가 서빙하도록 허용한다. dev 전용이고
    // 프로덕션 빌드는 모듈 그래프를 그대로 따라가므로 영향 없다.
    fs: { allow: ['..'] },
    // **브라우저를 자동으로 열지 않는다.** Verse8 프리뷰는 리눅스 컨테이너에서
    // 도는데 거기엔 열 브라우저가 없어 매번 `spawn xdg-open ENOENT` 가 찍힌다.
    open: false,
    // **개발 서버 응답을 캐시하지 않는다.** Verse8 프리뷰가 컨테이너의 이 서버를
    // 프록시로 내보내는데, 중간이 모듈을 붙들면 화면이 옛 코드로 남는다.
    headers: { 'Cache-Control': 'no-store' },
  },

  build: {
    // 저장소 루트의 dist/ 로 뺀다 (game/ 안에 두면 소스와 산출물이 섞인다)
    outDir: '../dist',
    emptyOutDir: true,
    // top-level await 를 쓴다 (데이터·에셋을 받고 나서 화면을 연다).
    // 기본 타깃(es2020)은 이걸 못 써서 빌드가 터진다.
    target: 'esnext',
  },
})
