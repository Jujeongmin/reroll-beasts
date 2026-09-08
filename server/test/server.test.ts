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

  test('아바타 위치는 유한한 수만 방송한다 — NaN 하나가 일곱 명의 화면을 깬다', async (server) => {
    await server.joinLobby();
    const bad = await server.updateAvatar(NaN, 0, 0);
    expect(bad.ok).toBe(false);
    const str = await server.updateAvatar('abc' as any, 0, 0);
    expect(str.ok).toBe(false);
    const ok = await server.updateAvatar(1.5, -2, 0);
    expect(ok.ok).toBe(true);
  });

  test('광고 보상 — 모르는 지면은 검증 전에 거절한다', async (server) => {
    await server.joinLobby();
    const r = await server.claimAdReward('revive-hero', 'req-1');
    expect(r.ok).toBe(false);
    expect(r.why).toBe('unknown_placement');
  });

  test('광고 보상 — 등수가 안 박힌 판에서는 줄 것이 없다', async (server) => {
    await server.joinLobby();
    const r = await server.claimAdReward('result-double', 'req-2');
    expect(r.ok).toBe(false);
    expect(r.why).toBe('no_match');
  });

  test('광고 보상 — requestId 가 글자가 아니면 거절한다', async (server) => {
    await server.joinLobby();
    const r = await server.claimAdReward('result-double', 42 as any);
    expect(r.ok).toBe(false);
    expect(r.why).toBe('bad_request');
  });
  test('아바타가 서 있는 좌석은 실재해야 한다', async (server) => {
    await server.joinLobby();
    const out = await server.updateAvatar(0, 0, 99);
    expect(out.ok).toBe(false);
    const neg = await server.updateAvatar(0, 0, -1);
    expect(neg.ok).toBe(false);
    const half = await server.updateAvatar(0, 0, 2.5);
    expect(half.ok).toBe(false);
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

    // 대기 시각을 과거로 밀어 시간 초과를 만든다 — 진짜 30초를 기다리는
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
    expect(res.why).toBe('not_for_sale');
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

  test('랭크 판이 끝나면 계정마다 순위표 줄이 하나씩 생긴다', async (server) => {
    // 순위표 줄을 계정으로 **걸러** 읽는다(전량을 읽지 않는다). 그 조건이 안
    // 맞으면 내 줄을 못 찾아 매번 새 줄을 더하거나, 지울 줄을 못 찾는다.
    //
    // 항복으로 끝낸다 — 여덟이 찬 방의 정상 마감은 실제 시각이 지나야 돌아서
    // 테스트가 기다릴 수 없다. 항복도 같은 settleRanks 를 타고 순위표를 쓴다.
    const accounts = ['lb-me','lb1','lb2','lb3','lb4','lb5','lb6','lb7'];
    let roomId = null;
    for (const a of accounts) {
      server.connect({ account: a });
      const r = await server.joinQueue('ranked');
      if (r.status === 'matched') roomId = r.roomId;
    }
    expect(roomId).toBeTruthy();

    // 셋이 항복한다 — 각자 제 줄을 쓴다.
    for (const a of ['lb-me','lb1','lb2']) {
      server.connect({ account: a });
      await server.joinMatchRoom(roomId);
      const out = await server.surrender();
      expect(out.ok, a).toBe(true);
    }

    server.connect({ account: 'lb-me' });
    const lb = await server.getLeaderboard(50);
    expect(lb.total).toBe(3);
    expect(lb.top.filter((x: any) => x.mine).length).toBe(1);
  });

  test('계정을 지우면 순위표에서도 내 줄만 사라진다', async (server) => {
    // resetAccount 도 계정으로 걸러 내 줄을 찾는다. 못 찾으면 지운 계정이
    // 순위표에 남아 유령 등수가 된다.
    const accounts = ['rs-me','rs1','rs2','rs3','rs4','rs5','rs6','rs7'];
    let roomId = null;
    for (const a of accounts) {
      server.connect({ account: a });
      const r = await server.joinQueue('ranked');
      if (r.status === 'matched') roomId = r.roomId;
    }
    for (const a of ['rs-me','rs1']) {
      server.connect({ account: a });
      await server.joinMatchRoom(roomId);
      await server.surrender();
    }

    server.connect({ account: 'rs-me' });
    expect((await server.getLeaderboard(50)).total).toBe(2);
    await server.resetAccount();
    const after = await server.getLeaderboard(50);
    expect(after.total).toBe(1);
    expect(after.top.filter((x: any) => x.mine).length).toBe(0);
  });
  test('상위 목록은 LP 가 가장 높은 줄들이다 — 먼저 들어온 줄이 아니다', async (server) => {
    // 전량을 안 읽고 DB 에 정렬을 맡기는 구조라, 목록이 "먼저 들어온 순서"로
    // 잘려도 아무도 눈치채지 못한다.
    //
    // **둘만 달라고 하는 것이 이 검사의 핵심이다.** 여유분이 want+5 라 일곱
    // 줄만 꺼내 오는데 순위표에는 여덟 줄이 있다 — 그래서 앞자리를 정말 DB 가
    // 고른다. 여유분 안에 다 들어오게 달라고 하면 우리가 화면에서 다시
    // 세우므로, DB 정렬을 통째로 빼도 통과한다(아무것도 안 지키는 검사가 된다).
    //
    // 항복으로 끝낸다 — 여덟이 찬 방의 정상 마감은 실제 시각이 지나야 돌아서
    // 테스트가 기다릴 수 없다. 항복 순서가 등수를 가르므로 LP 도 갈린다.
    const accounts = Array.from({ length: 8 }, (_, i) => `top${i}`);
    let roomId = null;
    for (const a of accounts) {
      server.connect({ account: a });
      const r = await server.joinQueue('ranked');
      if (r.status === 'matched') roomId = r.roomId;
    }
    expect(roomId).toBeTruthy();
    for (const a of accounts) {
      server.connect({ account: a });
      await server.joinMatchRoom(roomId);
      await server.surrender();
    }

    server.connect({ account: accounts[0] });
    const all = await server.getLeaderboard(50);
    expect(all.total).toBe(8);
    // LP 가 다 같으면 무엇을 골라도 통과한다 — 검사가 성립하는지부터 본다.
    expect(new Set(all.top.map((r: any) => r.lp)).size).toBeGreaterThan(1);

    const two = await server.getLeaderboard(2);
    // 전체 인원은 목록 길이와 별개다 — 둘만 달라도 여덟이라고 답해야 한다.
    expect(two.total).toBe(8);
    expect(two.top.length).toBe(2);
    expect(two.top.map((r: any) => r.lp)).toEqual(all.top.slice(0, 2).map((r: any) => r.lp));
    expect(two.top[0].lp).toBeGreaterThanOrEqual(two.top[1].lp);
  });
  test('내 등수는 나보다 LP 가 높은 사람 수 + 1 이다', async (server) => {
    // 등수를 세자고 순위표 전량을 읽지 않는다 — 나보다 위인 줄을 **세기만**
    // 한다. 그 수가 틀리면 목록에 뻔히 보이는 자리와 내 등수가 어긋난다.
    const accounts = ['rk0','rk1','rk2','rk3','rk4','rk5','rk6','rk7'];
    let roomId = null;
    for (const a of accounts) {
      server.connect({ account: a });
      const r = await server.joinQueue('ranked');
      if (r.status === 'matched') roomId = r.roomId;
    }
    for (const a of accounts) {
      server.connect({ account: a });
      await server.joinMatchRoom(roomId);
      await server.surrender();
    }

    for (const a of accounts) {
      server.connect({ account: a });
      const lb = await server.getLeaderboard(50);
      const mineRow = lb.top.find((r: any) => r.mine);
      expect(mineRow, a).toBeTruthy();
      const above = lb.top.filter((r: any) => r.lp > mineRow.lp).length;
      expect(lb.myRank, a).toBe(above + 1);
      expect(lb.myRank, a).toBeLessThanOrEqual(lb.total);
    }
  });

  test('랭크를 안 한 사람은 남들이 올라 있어도 등수가 없다', async (server) => {
    // 0 등이나 꼴등을 지어내면 "나도 순위표에 있다"로 읽힌다.
    const accounts = ['nr0','nr1','nr2','nr3','nr4','nr5','nr6','nr7'];
    let roomId = null;
    for (const a of accounts) {
      server.connect({ account: a });
      const r = await server.joinQueue('ranked');
      if (r.status === 'matched') roomId = r.roomId;
    }
    server.connect({ account: 'nr0' });
    await server.joinMatchRoom(roomId);
    await server.surrender();

    server.connect({ account: 'outsider' });
    const lb = await server.getLeaderboard();
    expect(lb.total).toBe(1);
    expect(lb.myRank).toBe(null);
    expect(lb.top.some((r: any) => r.mine)).toBe(false);
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
    // 지어낸 이름은 언어를 든 객체다 — 한 방에 언어가 다른 여덟 명이 앉는다.
    expect(s.seats[0].name.ko).toBe('유저mer2');
    expect(s.seats[0].name.en).toBe('Player mer2');
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

// ── 일일 미션 ───────────────────────────────────────────

// 미션 종류가 아홉이고 그중 셋이 날짜·계정으로 뽑힌다. **빈 판으로 지면**
// 거의 아무것도 안 움직인다(랭크도 아니고 3성도 시너지도 아이템도 없다) —
// 어떤 셋이 뽑히든 통과하려면 실제로 세우고 이겨야 한다.
const strongBoard = () =>
  ['bunny', 'frog', 'cat', 'chicken', 'green_blob', 'orc'].map((unitId, tile) => ({
    unitId,
    star: 3,
    tile,
    items: tile === 0 ? ['steel_sword', 'swift_gloves', 'oak_shield'] : [],
  }));

async function playFullGame(server: any) {
  await server.joinLobby();
  await server.updateLevel(9);
  await server.updateBoard(strongBoard());
  for (let i = 0; i < 30; i++) {
    const s = await server.resolveRound();
    if (!s || s.phase === 'done') break;
    await server.updateBoard(strongBoard());
  }
}

describe('일일 미션 — 판 끝에 센다', () => {
  test('판을 끝내면 진행도가 생긴다', async (server) => {
    server.connect({ account: 'mission1' });
    await playFullGame(server);
    const p = await server.getProfile();
    expect(p.missions).toBeTruthy();
    expect(p.missions.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.missions.progress.length).toBe(3);
    expect(p.missions.claimed).toEqual([false, false, false]);
    // 판 하나를 끝냈으니 적어도 한 칸은 움직였어야 한다 — 어떤 3개가 뽑혔든
    // "판 수"·"4위 안"·"라운드 승수" 중 하나는 걸린다.
    expect(p.missions.progress.some((v: number) => v > 0)).toBe(true);
  });
});

describe('일일 미션 — 수령', () => {
  test('안 찬 미션은 서버가 거절한다', async (server) => {
    server.connect({ account: 'mission2' });
    await server.joinLobby();
    const r = await server.claimMission(0);
    expect(r.ok).toBe(false);
  });

  test('다 찬 미션을 받으면 패스 경험치가 오르고 두 번은 못 받는다', async (server) => {
    server.connect({ account: 'mission3' });
    await playFullGame(server);
    const before = await server.getProfile();
    const idx = before.missions.progress.findIndex((v: number) => v > 0);
    expect(idx).toBeGreaterThanOrEqual(0);

    const r = await server.claimMission(idx);
    // 진행은 됐지만 목표에 못 미쳤을 수 있다. 그 경우도 거절이 맞다.
    if (!r.ok) {
      expect(r.why).toBeTruthy();
      return;
    }
    expect(r.profile.missions.claimed[idx]).toBe(true);
    expect(r.profile.pass.xp).toBeGreaterThan(before.pass.xp);

    const again = await server.claimMission(idx);
    expect(again.ok).toBe(false);
  });
});

describe('프리미엄 전용 겉모습', () => {
  test('프리미엄을 안 샀으면 전용 무대가 기본값으로 떨어진다', async (server) => {
    server.connect({ account: 'prem1' });
    await server.joinLobby();
    const r = await server.updateLook('voidstone', 'knight', 'flare');
    expect(r.skin).toBe('stone');
  });

  test('프리미엄을 사도 단계가 모자라면 안 열린다 — 사면 다 주는 것이 아니다', async (server) => {
    const account = 'prem2';
    server.connect({ account });
    await server.$onItemPurchased({
      account,
      purchaseId: 9401,
      productId: 'pass_premium_s1',
      quantity: 1,
    });
    await server.joinLobby();
    const p = await server.getProfile();
    expect(p.pass.premium).toBe(true);
    // 아직 1단계다. 9단계 보상은 잠긴 채여야 한다.
    const r = await server.updateLook('voidstone', 'knight', 'flare');
    expect(r.skin).toBe('stone');
  });
});

// ── 항복 · 계정 초기화 ──────────────────────────────────

describe('항복', () => {
  test('좌석이 죽고 전적이 남는다', async (server) => {
    server.connect({ account: 'quit1' });
    await server.joinLobby();
    const r = await server.surrender();
    expect(r.ok).toBe(true);
    expect(r.rank).toBeGreaterThan(0);

    const s = await server.getLobby();
    expect(s.seats[0].alive).toBe(false);
    expect(s.seats[0].hp).toBe(0);

    // 항복도 그 사람의 판이 끝난 것이다. 전적을 안 남기면 그게 곧 항복으로
    // 기록을 피하는 길이 된다.
    const p = await server.getProfile();
    expect(p.games).toBe(1);
    expect(p.recent[0]).toBe(r.rank);
  });

  test('두 번 눌러도 한 번이다', async (server) => {
    server.connect({ account: 'quit2' });
    await server.joinLobby();
    await server.surrender();
    const again = await server.surrender();
    expect(again.ok).toBe(false);
    const p = await server.getProfile();
    expect(p.games).toBe(1);
  });

  test('방에 없으면 거절한다', async (server) => {
    server.connect({ account: 'quit3' });
    const r = await server.surrender();
    expect(r.ok).toBe(false);
  });
});

describe('계정 초기화', () => {
  test('프로필이 통째로 사라진다', async (server) => {
    const account = 'wipe1';
    server.connect({ account });
    await server.setName('지울사람');
    await server.$onItemPurchased({
      account,
      purchaseId: 9501,
      productId: 'gems_small',
      quantity: 1,
    });
    const before = await server.getProfile();
    expect(before.gems).toBe(300);

    const r = await server.resetAccount();
    expect(r.ok).toBe(true);
    expect(await server.getProfile()).toBe(null);
  });

  test('결제 기록은 남는다 — 지우면 같은 결제가 두 번 들어온다', async (server) => {
    const account = 'wipe2';
    server.connect({ account });
    await server.$onItemPurchased({
      account,
      purchaseId: 9502,
      productId: 'gems_small',
      quantity: 1,
    });
    await server.resetAccount();
    // 같은 결제를 다시 보낸다. 영수증이 남아 있으면 중복으로 걸러야 한다.
    const again = await server.$onItemPurchased({
      account,
      purchaseId: 9502,
      productId: 'gems_small',
      quantity: 1,
    });
    expect(again.dup).toBe(true);
    expect(await server.getProfile()).toBe(null);
  });
});
