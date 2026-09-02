describe('sim 이식', () => {
  test('ping returns pong', async (server) => {
    expect(await server.ping()).toBe('pong');
  });

  // 이 시험의 요점은 "서버에서 돌더라" 가 아니라 "클라와 **같은 답**을 내더라" 다.
  // 기대값은 같은 입력(frog vs orc, seed 7)을 로컬에서 sim/ 으로 돌려 얻었다.
  // 하나라도 어긋나면 서버가 결과만 보내고 클라가 로그를 재생성하는 구조가 깨진다.
  test('서버가 클라와 같은 전투 결과를 낸다', async (server) => {
    const out = await server.simProbe();
    expect(out).toContain('winner=B');
    expect(out).toContain('ticks=595');
    expect(out).toContain('log=68');
    expect(out).toContain('rounds=23');
    expect(out).toContain('units=26');
  });
});

describe('로비 입장', () => {
  test('8석이 차고 봇이 판을 들고 있다', async (server) => {
    const s = await server.joinLobby();
    expect(s.seats.length).toBe(8);
    expect(s.round).toBe(1);
    expect(s.phase).toBe('prep');

    // 0번이 사람, 나머지는 봇
    expect(s.seats[0].isBot).toBe(false);
    expect(s.seats[0].account).toBeTruthy();
    expect(s.seats[1].isBot).toBe(true);

    // 봇은 입장 시점에 이미 판을 들고 있어야 한다 — 안 그러면 첫 라운드에
    // 빈 판과 싸워 전원이 부전승한다.
    const botUnits = s.seats.slice(1).reduce((n, x) => n + x.board.length, 0);
    expect(botUnits).toBeGreaterThan(0);

    // 사람은 아직 아무것도 안 놓았다
    expect(s.seats[0].board.length).toBe(0);
  });

  test('두 번 들어가도 같은 로비다', async (server) => {
    const a = await server.joinLobby();
    const b = await server.joinLobby();
    expect(b.seed).toBe(a.seed);
    expect(b.round).toBe(a.round);
  });
});

describe('정찰 — 배치 공유', () => {
  test('내 보드가 좌석에 반영된다', async (server) => {
    await server.joinLobby();
    await server.updateBoard([{ unitId: 'frog', star: 1, tile: 0, items: [] }]);

    const s = await server.getLobby();
    expect(s.seats[0].board.length).toBe(1);
    expect(s.seats[0].board[0].unitId).toBe('frog');
  });

  test('레벨도 공유된다', async (server) => {
    await server.joinLobby();
    await server.updateLevel(7);
    const s = await server.getLobby();
    expect(s.seats[0].level).toBe(7);
  });
});

describe('라운드 진행 — 서버가 마감 시각을 쥔다', () => {
  test('시간이 안 됐으면 진행하지 않는다', async (server) => {
    const before = await server.joinLobby();
    // deadline 은 지금보다 한참 뒤다. 클라가 재촉해도 넘어가면 안 된다 —
    // 넘어가면 배치 시간을 마음대로 건너뛸 수 있다.
    const after = await server.resolveRound();
    expect(after.round).toBe(before.round);
    expect(after.fights.length).toBe(0);
  });
});
