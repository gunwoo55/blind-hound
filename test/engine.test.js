import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  getControlledCharacters,
  generateActionOptions,
  validateCommand,
  chooseVillainActions,
  advanceTurn,
  acceptBetrayalOffer,
  refuseBetrayalOffer,
  finalJoinVillain,
  serializeGameForStorage,
  hydrateGameFromStorage,
  sendChatMessage,
} from '../src/engine.js';

test('1인 테스트 모드는 혼자서 핵심 선역들을 조작할 수 있다', () => {
  const game = createGame({ mode: 'solo', humanCount: 1, playerNames: ['건우'], seed: 7 });
  assert.equal(game.players.length, 1);
  assert.equal(game.players[0].isSoloController, true);
  const controlled = getControlledCharacters(game, game.players[0].id);
  assert.ok(controlled.length >= 5, `controlled=${controlled.join(',')}`);
  assert.ok(controlled.includes('detective'));
  assert.ok(controlled.includes('hacker'));
});

test('드롭다운 행동은 현재 정보 조건에 따라 잠금 사유를 제공한다', () => {
  const game = createGame({ mode: 'solo', humanCount: 1, seed: 11 });
  const options = generateActionOptions(game, 'special_forces');
  const raidBoss = options.purpose.find((item) => item.id === 'raid_boss');
  assert.equal(raidBoss.locked, true);
  assert.match(raidBoss.reason, /보스 위치/);

  const hackerOptions = generateActionOptions(game, 'hacker');
  assert.ok(hackerOptions.purpose.some((item) => item.id === 'hide_protagonist_location' && !item.locked));
});

test('규칙 엔진은 위치 단계가 부족한 보스 습격 명령을 거부한다', () => {
  const game = createGame({ mode: 'solo', humanCount: 1, seed: 12 });
  const verdict = validateCommand(game, {
    actorId: 'special_forces',
    purpose: 'raid_boss',
    target: 'boss',
    locationId: 'D3',
    method: 'forced_entry',
    risk: 'high',
  });
  assert.equal(verdict.valid, false);
  assert.match(verdict.reasons.join(' '), /확인|추적/);
});

test('악역 AI는 VillainKnowledge로만 공격과 증거 파기 대상을 고른다', () => {
  const game = createGame({ mode: 'solo', humanCount: 1, seed: 13 });
  game.knowledge.truth.characters.protagonist.locationId = 'A1';
  game.knowledge.villain.characterIntel.protagonist = { stage: 'rumor', locationIds: ['A1'] };
  const actions = chooseVillainActions(game);
  assert.equal(actions.some((action) => action.type === 'direct_assault' && action.target === 'protagonist'), false);

  game.knowledge.villain.characterIntel.protagonist = { stage: 'confirmed', locationIds: ['A1'] };
  const confirmedActions = chooseVillainActions(game);
  assert.equal(confirmedActions.some((action) => action.type === 'direct_assault' && action.target === 'protagonist'), true);

  game.turn = 3;
  game.knowledge.truth.ledgerPieces.victim_list.status = 'secured';
  game.knowledge.villain.ledgerIntel = {
    victim_list: { stage: 'unknown', locationIds: [] },
    corrupt_wire: { stage: 'unknown', locationIds: [] },
    boss_account: { stage: 'unknown', locationIds: [] },
  };
  const truthOnlyLedgerActions = chooseVillainActions(game);
  assert.equal(truthOnlyLedgerActions.some((action) => action.type === 'destroy_evidence'), false);

  game.knowledge.villain.ledgerIntel.victim_list = { stage: 'confirmed', locationIds: ['B3'] };
  const knownLedgerActions = chooseVillainActions(game);
  assert.equal(knownLedgerActions.some((action) => action.type === 'destroy_evidence'), true);
});

test('대기/방어 기본 행동은 공격 행동처럼 실패 판정이 나지 않는다', () => {
  const game = createGame({ mode: 'solo', humanCount: 1, seed: 1972 });
  const next = advanceTurn(game, [
    {
      actorId: 'protagonist',
      purpose: 'wait_defend',
      target: 'protagonist',
      locationId: 'A1',
      method: 'slow_safe',
      resource: 'none',
      cooperator: 'none',
      risk: 'low',
      disclosure: 'private',
      fallback: 'hold_position',
      secret: false,
      memo: '',
    },
  ]);
  assert.notEqual(next.turnLog[0].results[0].outcome, '실패');
  assert.notEqual(next.turnLog[0].results[0].outcome, '역공');
});

test('배신 제안은 지정된 플레이어가 아니면 수락할 수 없다', () => {
  const game = createGame({ mode: 'hotseat', humanCount: 2, seed: 31 });
  game.betrayalOffers.push({
    id: 'offer_owner_only',
    turn: 3,
    playerId: 'player_1',
    from: 'broker',
    status: 'open',
    reward: { dirtyMoney: 2, privileges: ['secret_move'] },
    demand: '폐공장 수색 지연',
    message: '비밀 제안',
  });
  const next = acceptBetrayalOffer(game, 'offer_owner_only', 'player_2');
  assert.equal(next.betrayalOffers[0].status, 'open');
  assert.equal(next.players.find((player) => player.id === 'player_2').dirtyMoney, 0);
});

test('배신 제안은 지정된 플레이어가 아니면 거절할 수 없다', () => {
  const game = createGame({ mode: 'hotseat', humanCount: 2, seed: 32 });
  game.betrayalOffers.push({
    id: 'offer_refuse_owner_only',
    turn: 3,
    playerId: 'player_1',
    from: 'broker',
    status: 'open',
    reward: { dirtyMoney: 2, privileges: ['secret_move'] },
    demand: '폐공장 수색 지연',
    message: '비밀 제안',
  });
  const next = refuseBetrayalOffer(game, 'offer_refuse_owner_only', 'player_2');
  assert.equal(next.betrayalOffers[0].status, 'open');
});

test('규칙 엔진은 잠긴 자원과 소유하지 않은 인물 행동을 거부한다', () => {
  const game = createGame({ mode: 'hotseat', humanCount: 2, seed: 33 });
  const lockedResource = validateCommand(game, {
    playerId: 'player_2',
    actorId: 'detective',
    purpose: 'trace_threat_phone',
    target: 'threat_phone',
    locationId: 'A3',
    method: 'official',
    resource: 'press_card',
    cooperator: 'none',
    risk: 'low',
  });
  assert.equal(lockedResource.valid, false);
  assert.match(lockedResource.reasons.join(' '), /잠긴|기자/);

  const wrongActor = validateCommand(game, {
    playerId: 'player_2',
    actorId: 'protagonist',
    purpose: 'wait_defend',
    target: 'protagonist',
    locationId: 'A1',
    method: 'slow_safe',
    resource: 'none',
    cooperator: 'none',
    risk: 'low',
  });
  assert.equal(wrongActor.valid, false);
  assert.match(wrongActor.reasons.join(' '), /조작 권한/);

  const dirtyMoneyWithoutBalance = validateCommand(game, {
    playerId: 'player_1',
    actorId: 'protagonist',
    purpose: 'wait_defend',
    target: 'protagonist',
    locationId: 'A1',
    method: 'slow_safe',
    resource: 'dirty_money',
    cooperator: 'none',
    risk: 'low',
  });
  assert.equal(dirtyMoneyWithoutBalance.valid, false);
  assert.match(dirtyMoneyWithoutBalance.reasons.join(' '), /더러운 돈/);
});

test('최종 전향을 가장한 이중 배신도 조건 없이는 열리지 않는다', () => {
  const game = createGame({ mode: 'solo', humanCount: 1, seed: 41 });
  const next = finalJoinVillain(game, 'player_1', 'fake');
  assert.deepEqual(next.players[0].blackPrivileges, []);
  assert.equal(next.players[0].finalFaction, 'hero');
  assert.equal(next.players[0].suspicion, 0);
});

test('저장 스냅샷은 숨겨진 상태를 직접 쓰지 않고 재접속 시 턴 로그로 재구성한다', () => {
  const game = createGame({ mode: 'solo', humanCount: 1, seed: 42 });
  const afterTurn = advanceTurn(game, [
    {
      playerId: 'player_1',
      actorId: 'protagonist',
      purpose: 'wait_defend',
      target: 'protagonist',
      locationId: 'A1',
      method: 'slow_safe',
      resource: 'none',
      cooperator: 'none',
      risk: 'low',
      disclosure: 'private',
      fallback: 'hold_position',
      secret: false,
      memo: '',
    },
  ]);
  assert.equal(afterTurn.knowledge.truth.characters.protagonist.protected, true);
  const stored = serializeGameForStorage(afterTurn);
  const serialized = JSON.stringify(stored);
  assert.equal(stored.knowledge.truth, undefined);
  assert.equal(stored.knowledge.villain, undefined);
  assert.equal(stored.caseSet, undefined);
  assert.equal(stored.characters, undefined);
  assert.equal(serialized.includes('"truth"'), false);
  assert.equal(serialized.includes('"villainActions"'), false);
  assert.equal(serialized.includes('initialLocationId'), false);
  const hydrated = hydrateGameFromStorage(JSON.parse(serialized));
  assert.ok(hydrated.knowledge.truth.characters.protagonist);
  assert.equal(hydrated.knowledge.truth.characters.protagonist.protected, true);
  assert.equal(hydrated.players[0].name, game.players[0].name);
});

test('AI/NPC 협력자는 채팅 설득 수락 전에는 명령서 협력 인물로 잠긴다', () => {
  const game = createGame({ mode: 'hotseat', humanCount: 2, seed: 61 });
  const before = generateActionOptions(game, 'detective', 'player_1');
  const seoBefore = before.cooperator.find((item) => item.id === 'seo_eunchae');
  assert.equal(seoBefore.locked, true);
  assert.match(seoBefore.reason, /채팅/);

  const afterChat = sendChatMessage(game, 'npc:seo_eunchae', 'player_1', '장부 증거를 안전하게 공개하려면 네 협력이 필요해. 우리가 보호할게, 이번 턴 도와줘.');
  const after = generateActionOptions(afterChat, 'detective', 'player_1');
  const seoAfter = after.cooperator.find((item) => item.id === 'seo_eunchae');
  assert.equal(seoAfter.locked, false);
  assert.ok(afterChat.npcCooperation.player_1.seo_eunchae.accepted);
});

test('다른 인간 플레이어 인물은 내 명령서로 직접 지시할 수 없다', () => {
  const game = createGame({ mode: 'hotseat', humanCount: 2, seed: 62 });
  const options = generateActionOptions(game, 'protagonist', 'player_1');
  const detective = options.cooperator.find((item) => item.id === 'detective');
  assert.equal(detective.locked, true);
  assert.match(detective.reason, /다른 인간 플레이어/);
});

test('턴 진행은 명령서 판정, 악역 방해, 다음 턴 브리핑을 생성한다', () => {
  const game = createGame({ mode: 'solo', humanCount: 1, seed: 21 });
  const next = advanceTurn(game, [
    {
      actorId: 'hacker',
      purpose: 'hide_protagonist_location',
      target: 'protagonist',
      locationId: 'A1',
      method: 'fake_signal',
      resource: 'encrypted_messenger',
      cooperator: 'protagonist',
      risk: 'medium',
      disclosure: 'group',
      fallback: 'hold_position',
      secret: false,
      memo: '복싱장 근처 신호를 여러 곳으로 분산한다.',
    },
  ]);
  assert.equal(next.turn, 2);
  assert.ok(next.turnLog[0].results.length >= 1);
  assert.ok(next.briefing.includes('턴 2'));
  assert.notEqual(next.knowledge.villain.characterIntel.protagonist.stage, 'confirmed');
});
