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

describe('라운드 진행', () => {
  // 1인 방은 early 가 허용된다 — 봇은 정찰을 안 하니 혼자 일찍 넘겨도
  // 손해 보는 사람이 없다. 덕분에 테스트가 마감 45초를 기다리지 않고
  // 진행 경로 전체를 덮는다.
  test('1인 방은 마감 전에도 라운드가 돈다', async (server) => {
    const before = await server.joinLobby();
    const after = await server.resolveRound();
    expect(after.round).toBe(before.round + 1);
    expect(after.fights.length).toBe(4);
    // 빈 판으로 섰으니 사람은 첫 판을 진다
    expect(after.seats[0].hp).toBeLessThan(before.seats[0].hp);
  });

  test('전투 시드가 실려 온다 — 클라가 로그를 재생성할 근거다', async (server) => {
    await server.joinLobby();
    const s = await server.resolveRound();
    for (const f of s.fights) {
      expect(typeof f.seed).toBe('number');
      expect(['A', 'B', 'draw']).toContain(f.winner);
    }
  });

  test('여러 라운드를 연달아 돌려도 상태가 선다', async (server) => {
    await server.joinLobby();
    let s = null;
    for (let i = 0; i < 5; i++) s = await server.resolveRound();
    expect(s.round).toBeGreaterThan(1);
    for (const seat of s.seats) {
      expect(seat.hp).toBeGreaterThanOrEqual(0);
      expect(seat.alive).toBe(seat.hp > 0);
    }
  });
});

describe('매칭 큐', () => {
  test('혼자면 랭크 큐는 기다린다', async (server) => {
    server.connect({ account: 'q-solo' });
    const r = await server.joinQueue('ranked');
    expect(r.status).toBe('waiting');
    expect(r.queued).toBe(1);
    await server.leaveQueue('ranked');
  });

  test('큐를 떠나면 idle 이 된다', async (server) => {
    server.connect({ account: 'q-leaver' });
    await server.joinQueue('ranked');
    await server.leaveQueue('ranked');
    const r = await server.pollQueue('ranked');
    expect(r.status).toBe('idle');
  });

  test('랭크 큐는 8명이 차면 전원이 같은 방을 받는다', async (server) => {
    const accounts = ['r1','r2','r3','r4','r5','r6','r7','r8'];
    let lastResult = null;
    for (const a of accounts) {
      server.connect({ account: a });
      lastResult = await server.joinQueue('ranked');
    }
    // 8번째 입장이 방을 만든다
    expect(lastResult.status).toBe('matched');
    const roomId = lastResult.roomId;

    // 나머지 7명도 폴링으로 같은 방에 안내된다
    for (const a of accounts.slice(0, 7)) {
      server.connect({ account: a });
      const r = await server.pollQueue('ranked');
      expect(r.status).toBe('matched');
      expect(r.roomId).toBe(roomId);
    }
  });

  test('매치 방 로비는 8명 전원이 사람이고, 누가 먼저 들어와도 같다', async (server) => {
    const accounts = ['m1','m2','m3','m4','m5','m6','m7','m8'];
    let matched = null;
    for (const a of accounts) {
      server.connect({ account: a });
      matched = await server.joinQueue('ranked');
    }
    expect(matched.status).toBe('matched');

    // 마지막 사람이 먼저 들어온다 — 순서가 결과를 바꾸면 안 된다
    server.connect({ account: 'm8' });
    const first = await server.joinMatchRoom(matched.roomId);
    expect(first.seats.every((s) => !s.isBot)).toBe(true);

    server.connect({ account: 'm1' });
    const second = await server.joinMatchRoom(matched.roomId);
    expect(second.seed).toBe(first.seed);
    expect(second.seats.map((s) => s.account)).toEqual(first.seats.map((s) => s.account));

    // 안내판이 지워졌다 — 다음 큐에서 이 방으로 또 끌려오면 안 된다
    const after = await server.pollQueue('ranked');
    expect(after.status).toBe('idle');
  });

  test('일반 큐는 대기 시간이 차면 봇을 채워 시작한다', async (server) => {
    server.connect({ account: 'n-alone' });
    const r1 = await server.joinQueue('normal');
    expect(r1.status).toBe('waiting');

    // 대기 시각을 과거로 밀어 시간 초과를 만든다 — 진짜 15초를 기다리는
    // 테스트는 검사가 아니라 형벌이다.
    const items = await $global.getCollectionItems('mmqueue-normal');
    const me = items.find((x) => x.account === 'n-alone');
    await $global.updateCollectionItem('mmqueue-normal', { __id: me.__id, at: 0 });

    const r2 = await server.pollQueue('normal');
    expect(r2.status).toBe('matched');

    const lobby = await server.joinMatchRoom(r2.roomId);
    expect(lobby.seats.filter((s) => !s.isBot)).toHaveLength(1);
    expect(lobby.seats.filter((s) => s.isBot)).toHaveLength(7);
    // 봇은 판을 들고 있어야 첫 라운드가 성립한다
    expect(lobby.seats.filter((s) => s.isBot).every((s) => s.board.length > 0)).toBe(true);
  });

  test('다인 방은 마감 전에 라운드가 안 넘어간다', async (server) => {
    const accounts = ['d1','d2','d3','d4','d5','d6','d7','d8'];
    let matched = null;
    for (const a of accounts) {
      server.connect({ account: a });
      matched = await server.joinQueue('ranked');
    }
    server.connect({ account: 'd1' });
    const lobby = await server.joinMatchRoom(matched.roomId);
    expect(lobby.round).toBe(1);

    // 사람이 8명이라 early 가 안 통한다 — 마감이 법이다
    const after = await server.resolveRound();
    expect(after.round).toBe(1);
    expect(after.fights.length).toBe(0);
  });
});
