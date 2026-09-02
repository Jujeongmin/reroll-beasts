describe('sim import 가능성', () => {
  test('ping returns pong', async (server) => {
    expect(await server.ping()).toBe('pong');
  });

  // 이 시험의 요점은 "서버에서 돌더라" 가 아니라 "클라와 **같은 답**을 내더라" 다.
  // 아래 기대값은 같은 입력(frog vs orc, seed 7)을 로컬에서 sim/ 으로 돌려
  // 얻은 값이다. 하나라도 어긋나면 서버 검산이 성립하지 않는다.
  test('서버가 클라와 같은 전투 결과를 낸다', async (server) => {
    const out = await server.simProbe();
    expect(out).toContain('winner=B');
    expect(out).toContain('ticks=595');
    expect(out).toContain('log=68');
    expect(out).toContain('rounds=23');
    expect(out).toContain('units=26');
  });
});
