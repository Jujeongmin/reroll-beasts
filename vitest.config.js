import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// **vite.config.js 와 따로 둔다.** 거기서 root 를 game/ 으로 잡는데,
// vitest 가 그걸 그대로 물려받으면 tests/ 를 못 찾아 "No test files found" 로
// 조용히 통과해버린다 — 검사가 0건인데 초록불이 되는, 이 프로젝트가
// Task 4 에서 이미 한 번 당한 실패 형태다.
export default defineConfig({
  resolve: {
    alias: { '@sim': resolve(import.meta.dirname, 'sim') },
  },
  test: {
    root: import.meta.dirname,
    include: ['tests/**/*.test.js'],
  },
})
