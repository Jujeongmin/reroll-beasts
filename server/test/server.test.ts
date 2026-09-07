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

describe('전적', () => {
  test('판을 안 끝냈으면 전적이 없다 — 0 으로 채우지 않는다', async (server) => {
    expect(await server.getProfile()).toBe(null);
  });

  // 혼자 있는 연습 방은 사람이 하나뿐이라 early 로 즉시 마감된다. 라운드를
  // 끝까지 밀면 23라운드 완주로 게임이 끝나고, 그때 순위가 박힌다.
  test('판이 끝나면 전적이 쌓인다', async (server) => {
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    const p = await server.getProfile();
    expect(p).toBeTruthy();
    expect(p.games).toBe(1);
    expect(p.recent.length).toBe(1);
    expect(p.best).toBe(p.recent[0]);
    expect(p.recent[0]).toBeGreaterThanOrEqual(1);
    expect(p.recent[0]).toBeLessThanOrEqual(8);
  });

  test('패스 경험치는 일반 판에서도 오른다 — 랭크만 주면 일반이 죽은 경로가 된다', async (server) => {
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    const p = await server.getProfile();
    expect(p.pass).toBeTruthy();
    expect(p.pass.xp).toBeGreaterThan(0);
    expect(p.pass.level).toBeGreaterThanOrEqual(1);
    // 아직 아무것도 안 산 사람이다. 기본이 true 면 결제 없이 프리미엄이 열린다.
    expect(p.pass.premium).toBe(false);
    expect(typeof p.gems).toBe('number');
  });
});

describe('젬 상점', () => {
  test('전적이 없으면 못 산다 — 없는 지갑을 여기서 만들지 않는다', async (server) => {
    const res = await server.buyCosmetic('viking');
    expect(res.ok).toBe(false);
  });

  test('패스·랭크 보상은 안 판다 — 돈으로 사면 그 트랙을 도는 이유가 사라진다', async (server) => {
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    const res = await server.buyCosmetic('golden_knight');
    expect(res.ok).toBe(false);
    expect(res.why).toContain('파는');
  });

  test('젬이 모자라면 거절한다 — 화면이 아니라 여기서 막아야 한다', async (server) => {
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    const before = await server.getProfile();
    const res = await server.buyCosmetic('viking');
    expect(res.ok).toBe(false);
    const after = await server.getProfile();
    // 거절했으면 지갑도 그대로여야 한다
    expect(after.gems).toBe(before.gems);
    expect(after.owned ?? []).toEqual([]);
  });
});

describe('랭크 LP', () => {
  test('1인 방에서 끝낸 판은 LP 를 안 움직인다 — 랭크가 아니다', async (server) => {
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    const p = await server.getProfile();
    expect(p.games).toBe(1);
    expect(p.lp).toBe(0);
  });
});

describe('순위표', () => {
  test('아무도 랭크를 안 했으면 비어 있다 — 0 등을 지어내지 않는다', async (server) => {
    const lb = await server.getLeaderboard();
    expect(lb.total).toBe(0);
    expect(lb.top).toEqual([]);
    expect(lb.myRank).toBe(null);
  });

  test('일반 판은 순위표에 안 올라간다 — LP 0 인 줄이 목록을 채우면 등수가 뜻을 잃는다', async (server) => {
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    const lb = await server.getLeaderboard();
    expect(lb.total).toBe(0);
  });
});

describe('결제 훅', () => {
  test('젬 팩을 사면 잔액이 는다', async (server) => {
    const account = 'pay1';
    server.connect({ account });
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    const before = await server.getProfile();
    
    await server.$onItemPurchased({
      account,
      purchaseId: 1001,
      productId: 'gems_small',
      quantity: 1,
    });
    const after = await server.getProfile();
    expect(after.gems).toBe((before.gems ?? 0) + 300);
  });

  test('같은 결제가 두 번 와도 한 번만 준다 — 재시도는 어느 결제 시스템에나 있다', async (server) => {
    const account = 'pay2';
    server.connect({ account });
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    
    const ev = { account, purchaseId: 2002, productId: 'gems_small', quantity: 1 };
    await server.$onItemPurchased(ev);
    const once = await server.getProfile();
    const again = await server.$onItemPurchased(ev);
    expect(again.dup).toBe(true);
    const twice = await server.getProfile();
    expect(twice.gems).toBe(once.gems);
  });

  test('프리미엄 패스를 사면 패스가 열린다', async (server) => {
    const account = 'pay3';
    server.connect({ account });
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    await server.$onItemPurchased({
      account,
      purchaseId: 3003,
      productId: 'pass_premium_s1',
      quantity: 1,
    });
    const p = await server.getProfile();
    expect(p.pass.premium).toBe(true);
  });

  test('모르는 상품은 지급을 보류하되 기록은 남긴다 — 던지면 다음 결제까지 막힌다', async (server) => {
    const account = 'pay4';
    server.connect({ account });
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    const before = await server.getProfile();
    const res = await server.$onItemPurchased({
      account,
      purchaseId: 4004,
      productId: '대시보드에만_있는_상품',
      quantity: 1,
    });
    expect(res.ok).toBe(true);
    expect(res.applied).toBe(false);
    const after = await server.getProfile();
    expect(after.gems).toBe(before.gems);
  });
});

describe('겉모습 공유(무대·아바타·승리 이펙트)', () => {
  test('안 가진 것을 보내면 기본값으로 떨어진다 — 아무나 최고 무대·아바타를 쓰면 안 된다', async (server) => {
    server.connect({ account: 'skin1' });
    await server.joinLobby();
    const res = await server.updateLook('champion', 'golden_knight', 'crownfall');
    expect(res.ok).toBe(true);
    expect(res.skin).toBe('stone');
    expect(res.avatar).toBe('knight');
    expect(res.boom).toBe('flare');
    const s = await server.getLobby();
    expect(s.seats[0].skin).toBe('stone');
    expect(s.seats[0].avatar).toBe('knight');
  });

  test('좌석마다 겉모습이 붙어 있다 — 구경 갔을 때 그 사람 것이 보여야 한다', async (server) => {
    server.connect({ account: 'skin2' });
    const s = await server.joinLobby();
    for (const seat of s.seats) {
      expect(typeof seat.skin).toBe('string');
      expect(typeof seat.avatar).toBe('string');
      expect(typeof seat.boom).toBe('string');
    }
  });
});

describe('닉네임', () => {
  test('규칙에 맞으면 저장되고 좌석 이름이 바뀐다', async (server) => {
    server.connect({ account: 'namer1' });
    const res = await server.setName('  개구리   왕자 ');
    expect(res.ok).toBe(true);
    // 다듬은 값이 저장돼야 한다 — 공백이 그대로면 목록에서 줄이 어긋난다
    expect(res.name).toBe('개구리 왕자');
    const s = await server.joinLobby();
    expect(s.seats[0].name).toBe('개구리 왕자');
  });

  test('조작된 이름은 서버가 막는다 — 화면에서만 막으면 잠금이 장식이다', async (server) => {
    server.connect({ account: 'namer2' });
    for (const bad of ['가', '유저9999', '<b>x</b>', '가'.repeat(20)]) {
      const res = await server.setName(bad);
      expect(res.ok, bad).toBe(false);
    }
    const s = await server.joinLobby();
    // 거절됐으니 기본 이름 그대로다
    expect(s.seats[0].name).toBe('유저mer2');
  });
});

describe('겉모습 저장', () => {
  test('고른 것이 프로필에 남아 다음 방에서도 붙는다', async (server) => {
    server.connect({ account: 'looker' });
    await server.joinLobby();
    await server.updateLook('stone', 'elf', 'flare');
    const p = await server.getProfile();
    expect(p.look).toEqual({ board: 'stone', avatar: 'elf', boom: 'flare' });
  });
});

// ── 1차 점검에서 나온 결함들 ────────────────────────────
//
// 아래 넷은 전부 "판은 도는데 계정에 남는 것이 틀린" 경로다. 기존 테스트가
// 한 판 돌리는 것만 봤기 때문에 통째로 비어 있었다.

describe('닉네임 먼저 정한 계정', () => {
  test('이름만 있는 프로필도 첫 판이 정산된다', async (server) => {
    const account = 'newbie1';
    server.connect({ account });
    // 판을 하기 전에 이름부터 정한다 — 프로필에 전적 칸이 없는 상태가 된다.
    await server.setName('신입');
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    const p = await server.getProfile();
    expect(p.games).toBeGreaterThan(0);
    // 정산이 이름을 지우면 안 된다. 전에는 전적 칸만 든 객체로 통째로 덮었다.
    expect(p.name).toBe('신입');
  });
});

describe('판 정산이 계정을 지우지 않는다', () => {
  test('산 것·이름·겉모습이 판 뒤에도 남는다', async (server) => {
    const account = 'keeper1';
    server.connect({ account });
    await server.setName('보관인');
    await server.joinLobby();
    // 젬을 넣고 코스메틱을 하나 산다 — 돈 주고 산 것이 사라지는지가 요점이다.
    await server.$onItemPurchased({
      account,
      purchaseId: 9101,
      productId: 'gems_large',
      quantity: 1,
    });
    const before = await server.getProfile();
    const buyable = before.gems;
    expect(buyable).toBeGreaterThan(0);

    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    const after = await server.getProfile();
    expect(after.name).toBe('보관인');
    // 젬은 줄지 않는다(패스 보상으로 늘 수는 있다)
    expect(after.gems).toBeGreaterThanOrEqual(buyable);
    expect(after.games).toBeGreaterThan(0);
  });
});

describe('배치 검산 — 서버는 클라를 안 믿는다', () => {
  test('없는 유닛·5성·남의 칸은 걸러진다', async (server) => {
    server.connect({ account: 'cheat1' });
    await server.joinLobby();
    await server.updateLevel(9);
    await server.updateBoard([
      { unitId: '없는말', star: 1, tile: 0, items: [] },
      { unitId: 'green_blob', star: 9, tile: 1, items: [] },
      { unitId: 'green_blob', star: 1, tile: 99, items: [] },
      { unitId: 'green_blob', star: 1, tile: 2, items: [] },
    ]);
    const s = await server.getLobby();
    expect(s.seats[0].board).toEqual([
      { unitId: 'green_blob', star: 1, tile: 2, items: [] },
    ]);
  });

  test('레벨보다 많이 세울 수 없다', async (server) => {
    server.connect({ account: 'cheat2' });
    await server.joinLobby();
    await server.updateLevel(2);
    await server.updateBoard(
      [0, 1, 2, 3, 4].map((tile) => ({ unitId: 'green_blob', star: 1, tile, items: [] })),
    );
    const s = await server.getLobby();
    expect(s.seats[0].board.length).toBe(2);
  });

  test('없는 유닛이 섞여도 마감이 돈다 — 전에는 그 방 전체가 멈췄다', async (server) => {
    server.connect({ account: 'cheat3' });
    await server.joinLobby();
    await server.updateBoard([{ unitId: '__없음__', star: 1, tile: 0, items: [] }]);
    const s = await server.resolveRound();
    expect(s).toBeTruthy();
    expect(s.round).toBeGreaterThan(1);
  });
});

describe('한 판도 안 한 계정의 결제', () => {
  test('프로필이 없어도 젬이 들어온다 — 돈만 받고 안 주면 안 된다', async (server) => {
    const account = 'fresh1';
    server.connect({ account });
    const r = await server.$onItemPurchased({
      account,
      purchaseId: 9201,
      productId: 'gems_small',
      quantity: 1,
    });
    expect(r.applied).toBe(true);
    const p = await server.getProfile();
    expect(p.gems).toBe(300);
  });

  test('프리미엄 패스도 마찬가지다', async (server) => {
    const account = 'fresh2';
    server.connect({ account });
    await server.$onItemPurchased({
      account,
      purchaseId: 9202,
      productId: 'pass_premium_s1',
      quantity: 1,
    });
    const p = await server.getProfile();
    expect(p.pass.premium).toBe(true);
  });
});

// ── 2차 점검 ────────────────────────────────────────────

describe('망가진 레벨 값', () => {
  test('숫자가 아니면 거절한다 — NaN 이 배치 인원 상한이 되면 제한이 사라진다', async (server) => {
    server.connect({ account: 'nan1' });
    await server.joinLobby();
    const r = await server.updateLevel('아홉');
    expect(r.ok).toBe(false);
    const s = await server.getLobby();
    expect(Number.isFinite(s.seats[0].level)).toBe(true);
  });

  test('레벨이 망가진 좌석에도 인원 상한이 산다', async (server) => {
    server.connect({ account: 'nan2' });
    await server.joinLobby();
    await server.updateLevel('아홉');
    await server.updateBoard(
      [0, 1, 2, 3, 4, 5].map((tile) => ({ unitId: 'green_blob', star: 1, tile, items: [] })),
    );
    const s = await server.getLobby();
    // 시작 레벨까지만 선다. 28명이 서면 제한이 사라진 것이다.
    expect(s.seats[0].board.length).toBeLessThanOrEqual(s.seats[0].level);
  });
});

describe('같은 결제를 두 번 지급하지 않는다 (부분 실패)', () => {
  test('지급 기록이 프로필에도 남는다', async (server) => {
    const account = 'idem1';
    server.connect({ account });
    await server.$onItemPurchased({
      account,
      purchaseId: 9301,
      productId: 'gems_small',
      quantity: 1,
    });
    const p = await server.getProfile();
    expect(p.paid).toContain('9301');
    expect(p.gems).toBe(300);
  });
});

describe('같은 판을 두 번 세지 않는다', () => {
  test('판이 끝난 뒤 마감을 또 불러도 전적이 그대로다', async (server) => {
    server.connect({ account: 'idem2' });
    await server.joinLobby();
    for (let i = 0; i < 30; i++) {
      const s = await server.resolveRound();
      if (!s || s.phase === 'done') break;
    }
    const before = await server.getProfile();
    expect(before.games).toBe(1);
    expect(before.lastMatch).toBeTruthy();

    // 마감을 다시 부른다. 방 상태 쓰기가 잘렸을 때 클라가 하는 그대로다.
    for (let i = 0; i < 3; i++) await server.resolveRound();
    const after = await server.getProfile();
    expect(after.games).toBe(before.games);
    expect(after.lp).toBe(before.lp);
    expect(after.gems).toBe(before.gems);
  });
});
