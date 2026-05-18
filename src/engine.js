import { CASE_01, LOCATION_STAGE, LOCATION_STAGE_LABEL } from './data/case01.js';

const PLAYER_ROLE_ORDER = ['protagonist', 'detective', 'hacker', 'special_forces', 'reporter', 'prosecutor'];
const SOLO_CONTROLLED = ['protagonist', 'detective', 'hacker', 'special_forces', 'reporter', 'prosecutor'];
const GAME_VERSION = 1;

export function createGame({ mode = 'solo', humanCount = 1, playerNames = [], seed = Date.now() } = {}) {
  const safeHumanCount = Math.max(1, Math.min(6, Number(humanCount) || 1));
  const characters = Object.fromEntries(CASE_01.characters.map((character) => [character.id, { ...character }]));
  const locations = Object.fromEntries(CASE_01.map.map((location) => [location.id, { ...location, discoveredName: location.name, notes: [] }]));
  const players = Array.from({ length: safeHumanCount }, (_, index) => {
    const roleId = PLAYER_ROLE_ORDER[index] || 'reporter';
    return {
      id: `player_${index + 1}`,
      name: playerNames[index] || (index === 0 ? '건우' : `플레이어 ${index + 1}`),
      characterId: mode === 'solo' && safeHumanCount === 1 ? 'protagonist' : roleId,
      isSoloController: mode === 'solo' && safeHumanCount === 1,
      finalFaction: 'hero',
      dirtyMoney: 0,
      suspicion: 0,
      blackPrivileges: [],
      weakness: index === 0 ? '도윤을 살려야 한다는 압박' : '팀에서 배제될 수 있다는 불안',
      reconnectKey: makeToken(seed, index),
    };
  });

  const truthCharacters = Object.fromEntries(
    CASE_01.characters.map((character) => [
      character.id,
      {
        locationId: character.initialLocationId,
        alive: true,
        captured: false,
        protected: false,
        exposed: false,
      },
    ]),
  );

  const ledgerPieces = Object.fromEntries(
    CASE_01.ledgerPieces.map((piece) => [
      piece.id,
      {
        ...piece,
        locationId: piece.initialLocationId,
        status: 'hidden',
        securedBy: null,
      },
    ]),
  );

  const game = {
    version: GAME_VERSION,
    caseSet: CASE_01,
    id: `bh-${Math.floor(seed).toString(36)}-${Date.now().toString(36)}`,
    mode,
    humanCount: safeHumanCount,
    sessionToken: makeToken(seed, 99),
    roleId: players[0]?.characterId || 'protagonist',
    currentPlayerId: players[0]?.id || 'player_1',
    seed: normalizeSeed(seed),
    rngState: normalizeSeed(seed),
    turn: 1,
    phase: 'briefing',
    maxTurns: CASE_01.maxTurns,
    players,
    characters,
    locations,
    pendingCommands: [],
    profileMemos: {},
    threads: createInitialThreads(),
    turnLog: [],
    betrayalOffers: [],
    acceptedBetrayals: [],
    aiSettings: {
      mode: 'local-rule-engine',
      model: 'deepseek-v4-flash:cloud',
      note: '정적 GitHub Pages 빌드에서는 API 키를 저장하지 않습니다. 실서버/프록시에서만 비밀키를 사용하세요.',
    },
    stats: {
      teamTrust: 58,
      orgPressure: 10,
      hostageRisk: 36,
      bossEscape: 18,
      corruptionNoise: 32,
      villainHeat: 22,
      publicAttention: 8,
      evidenceLegality: 10,
      betrayalTemperature: 0,
    },
    flags: {
      protagonistGroupCreated: true,
      cctvC1Manipulated: true,
      policeInfoTainted: true,
      seoCanLie: true,
      victimFamilyMayRage: true,
      bossArrested: false,
      bossRemoved: false,
      redevelopmentBribeExposed: false,
      seoTestimonySecured: false,
      dataDeleted: false,
    },
    knowledge: {
      truth: {
        characters: truthCharacters,
        ledgerPieces,
        hostageLocationId: 'D2',
        bossRoute: ['D3', 'D4'],
        villainPlans: [],
      },
      public: {
        clues: { ...CASE_01.startingClues },
        characterIntel: {
          protagonist: { stage: 'confirmed', locationIds: ['A1'] },
          seo_eunchae: { stage: 'unknown', locationIds: [] },
          boss: { stage: 'rumor', locationIds: ['D3', 'D4'] },
          action_boss: { stage: 'estimated', locationIds: ['B2', 'C2'] },
        },
        ledgerIntel: {
          victim_list: { stage: 'rumor', locationIds: ['B3'] },
          corrupt_wire: { stage: 'unknown', locationIds: [] },
          boss_account: { stage: 'unknown', locationIds: [] },
        },
      },
      villain: {
        characterIntel: {
          protagonist: { stage: 'rumor', locationIds: ['A1'] },
          seo_eunchae: { stage: 'confirmed', locationIds: ['D2'] },
          detective: { stage: 'estimated', locationIds: ['A3'] },
          hacker: { stage: 'unknown', locationIds: [] },
        },
        ledgerIntel: {
          victim_list: { stage: 'confirmed', locationIds: ['B3'] },
          corrupt_wire: { stage: 'estimated', locationIds: ['C4'] },
          boss_account: { stage: 'confirmed', locationIds: ['D3'] },
        },
        knownBetrayals: [],
      },
      players: {},
      npcs: {},
    },
    briefing: '',
    endGame: null,
  };

  for (const player of players) {
    game.knowledge.players[player.id] = makePlayerKnowledge(game, player);
  }
  appendSystemMessage(game, 'system', '서은채 음성 메시지', '“도윤 씨, 저를 믿지 마세요. 저도 좋은 사람은 아니에요. 하지만 이 장부가 공개되지 않으면, 이번엔 정말 사람들이 죽어요.”');
  appendSystemMessage(game, 'group', '시스템', '주인공 단톡방이 열렸습니다. 최대 인원은 인간 플레이어 수와 같습니다. AI 인물 초대는 정보와 위험을 동시에 가져옵니다.');
  game.briefing = makeBriefing(game, ['서은채 위치는 아직 미확인입니다.', '폐공장 C1 목격담, 유리캐피탈 B3 장부 소문, C2 정보상이 공개 단서입니다.']);
  return game;
}

export function getControlledCharacters(game, playerId = game.currentPlayerId) {
  const player = game.players.find((candidate) => candidate.id === playerId) || game.players[0];
  if (!player) return [];
  if (player.isSoloController) return SOLO_CONTROLLED.filter((id) => game.characters[id]);
  return [player.characterId].filter(Boolean);
}

export function getCharacter(game, actorId) {
  return game.characters[actorId] || null;
}

export function generateActionOptions(game, actorId, playerId = game.currentPlayerId) {
  const actor = getCharacter(game, actorId);
  if (!actor) return emptyOptions(`알 수 없는 인물: ${actorId}`);
  const purpose = buildPurposeOptions(game, actor);
  const target = buildTargetOptions(game, actor);
  const location = buildLocationOptions(game, actor);
  const method = buildMethodOptions(actor);
  const resource = buildResourceOptions(game, actor, playerId);
  const cooperator = buildCooperatorOptions(game, actor);
  const risk = [
    option('low', '낮음: 느리지만 안전하게 진행'),
    option('medium', '중간: 흔적을 일부 남기지만 균형 잡힘'),
    option('high', '높음: 빠르지만 역추적·매복 위험'),
  ];
  const disclosure = [
    option('private', '비공개: 내 기록에만 저장'),
    option('group', '주인공 단톡방에 공유'),
    option('public', '팀 전체 브리핑에 공개'),
    option('fake', '일부러 왜곡해 공유'),
  ];
  const fallback = [
    option('hold_position', '대기/방어로 전환'),
    option('withdraw', '즉시 철수'),
    option('ask_hacker', '해커에게 추가 분석 요청'),
    option('ask_police', '경찰/검찰 지원 요청'),
    option('warn_protagonist', '주인공에게 이동 금지 경고'),
    option('do_not_share', '결과를 보류하고 공유하지 않음'),
  ];
  return { purpose, target, location, method, resource, cooperator, risk, disclosure, fallback };
}

export function validateCommand(game, command) {
  const reasons = [];
  const actor = getCharacter(game, command.actorId);
  const playerId = command.playerId || game.currentPlayerId;
  const player = game.players.find((item) => item.id === playerId);
  if (!actor) reasons.push('행동 인물을 찾을 수 없습니다.');
  if (!player) reasons.push('플레이어를 찾을 수 없습니다.');
  if (!command.purpose) reasons.push('행동 목적이 비어 있습니다.');
  if (!command.locationId) reasons.push('장소가 비어 있습니다.');
  if (command.locationId && !game.locations[command.locationId]) reasons.push('존재하지 않는 장소입니다.');

  if (actor && player && !getControlledCharacters(game, player.id).includes(actor.id)) {
    reasons.push('이 플레이어에게 해당 인물 조작 권한이 없습니다.');
  }

  if (actor) {
    const generated = generateActionOptions(game, actor.id, playerId);
    const checks = [
      ['purpose', 'purpose', '행동 목적'],
      ['target', 'target', '대상'],
      ['locationId', 'location', '장소'],
      ['method', 'method', '방법'],
      ['resource', 'resource', '사용 자원'],
      ['cooperator', 'cooperator', '협력 인물'],
      ['risk', 'risk', '위험 감수도'],
      ['disclosure', 'disclosure', '공개 여부'],
      ['fallback', 'fallback', '실패 시 대안'],
    ];
    for (const [commandKey, optionKey, label] of checks) {
      if (!command[commandKey]) continue;
      const selected = generated[optionKey]?.find((item) => item.id === command[commandKey]);
      if (!selected) reasons.push(`현재 이 역할에게 생성되지 않은 ${label}입니다.`);
      if (selected?.locked) reasons.push(selected.reason || `${label}은 현재 조건에서 잠긴 항목입니다.`);
    }
  }

  if (command.purpose === 'raid_boss') {
    const bossIntel = game.knowledge.public.characterIntel.boss || { stage: 'unknown', locationIds: [] };
    if (!stageAtLeast(bossIntel.stage, 'confirmed')) reasons.push('보스 위치가 확인 또는 추적 중이어야 습격할 수 있습니다.');
  }

  if (command.purpose === 'rescue_hostage' || command.purpose === 'locate_hostage') {
    const hostageIntel = game.knowledge.public.characterIntel.seo_eunchae || { stage: 'unknown', locationIds: [] };
    if (!stageAtLeast(hostageIntel.stage, command.purpose === 'rescue_hostage' ? 'estimated' : 'rumor')) {
      reasons.push('인질 관련 위치 단서가 부족합니다. 먼저 목격자 탐문, 통화 기록 확인, 조직원 추적 중 하나가 필요합니다.');
    }
  }

  if (command.purpose === 'query_cctv') {
    const location = game.locations[command.locationId];
    const hasAccess = ['detective', 'hacker', 'prosecutor'].includes(command.actorId) || command.resource === 'hacker_support';
    if (!location || location.attributes.cctv <= 0) reasons.push(`${location?.name || '해당 장소'}에는 조회 가능한 CCTV가 없습니다.`);
    if (!hasAccess) reasons.push('CCTV 기록 접근 권한 또는 해커 협조가 필요합니다.');
  }

  if (command.purpose === 'trace_threat_phone') {
    const clues = game.knowledge.public.clues;
    const hasCondition = clues.threatPhoneNumber && (clues.recentThreatCall || command.resource === 'search_warrant' || command.cooperator === 'hacker');
    if (!hasCondition) reasons.push('범인 전화번호, 최근 통화 기록, 영장 또는 해커 협조가 부족합니다.');
  }

  if (command.resource === 'dirty_money' && player && player.dirtyMoney <= 0) {
    reasons.push('더러운 돈을 보유한 플레이어만 이 자원을 사용할 수 있습니다.');
  }

  return { valid: reasons.length === 0, reasons };
}

export function chooseVillainActions(game) {
  const actions = [];
  const villainKnowledge = game.knowledge.villain;
  const protagonistIntel = villainKnowledge.characterIntel.protagonist || { stage: 'unknown', locationIds: [] };
  if (stageAtLeast(protagonistIntel.stage, 'confirmed')) {
    actions.push({
      type: 'direct_assault',
      actor: 'action_boss',
      target: 'protagonist',
      locationId: protagonistIntel.locationIds[0],
      label: '장태식의 주인공 직접 습격',
      intensity: game.turn >= 6 ? 'high' : 'medium',
    });
  }

  const knownLedgerIntel = Object.values(villainKnowledge.ledgerIntel || {});
  const villainKnowsLedgerRisk = knownLedgerIntel.some((intel) => stageAtLeast(intel.stage, 'confirmed'));
  if ((villainKnowsLedgerRisk && game.turn >= 3) || game.turn >= 5) {
    actions.push({
      type: 'destroy_evidence',
      actor: 'broker',
      target: 'ledger',
      locationId: pickKnownLocation(villainKnowledge.ledgerIntel.victim_list, 'B3'),
      label: '류 실장의 증거 파기 지시',
      intensity: game.turn >= 6 ? 'high' : 'medium',
    });
  }

  if (game.turn >= 2) {
    actions.push({
      type: 'fake_tip',
      actor: 'n33',
      target: 'team',
      locationId: game.turn % 2 ? 'C1' : 'D2',
      label: 'N-33의 가짜 제보 살포',
      intensity: 'medium',
    });
  }

  if (game.turn >= 3 && game.betrayalOffers.length < Math.max(1, game.players.length)) {
    const targetPlayer = game.players.find((player) => player.finalFaction === 'hero' && player.dirtyMoney === 0) || game.players[0];
    actions.push({
      type: 'bribe_offer',
      actor: 'broker',
      target: targetPlayer?.id,
      locationId: 'C2',
      label: '류 실장의 비밀 매수 제안',
      intensity: 'low',
    });
  }

  if (game.turn === 4 || game.stats.hostageRisk > 58) {
    actions.push({
      type: 'move_hostage',
      actor: 'action_boss',
      target: 'seo_eunchae',
      locationId: game.turn % 2 ? 'C3' : 'D2',
      label: '서은채 임시 이동',
      intensity: 'medium',
    });
  }

  return actions.slice(0, 3);
}

export function advanceTurn(game, commands = []) {
  const next = clone(game);
  if (next.endGame) return next;
  const villainActions = chooseVillainActions(next);
  const results = [];
  const acceptedCommands = commands.filter(Boolean);

  if (!acceptedCommands.length) {
    results.push({
      actorId: 'system',
      outcome: '부분 성공',
      title: '자동 대기/방어',
      text: '제출된 명령서가 없어 현재 위치 유지와 은신을 기본 행동으로 처리했습니다.',
      effects: ['팀 신뢰도 -1', '주인공 노출도 변화 없음'],
    });
    next.stats.teamTrust = clamp(next.stats.teamTrust - 1, 0, 100);
  }

  for (const command of acceptedCommands) {
    const verdict = validateCommand(next, command);
    if (!verdict.valid) {
      results.push({
        actorId: command.actorId,
        outcome: '실패',
        title: '명령서 검증 실패',
        text: verdict.reasons.join(' '),
        effects: ['행동 소모', 'AI 반격 위험 +2'],
      });
      next.stats.villainHeat = clamp(next.stats.villainHeat + 2, 0, 100);
      continue;
    }
    results.push(resolveCommand(next, command, villainActions));
  }

  const villainResults = applyVillainActions(next, villainActions);
  const allResultTexts = [...results.map((r) => `${getName(next, r.actorId)}: ${r.outcome} - ${r.title}`), ...villainResults.map((r) => `악역: ${r.title}`)];
  next.turnLog.unshift({
    turn: next.turn,
    commands: acceptedCommands,
    villainActions,
    results,
    villainResults,
    stats: { ...next.stats },
  });
  next.turn += 1;
  next.phase = 'briefing';
  next.pendingCommands = [];
  tickScenario(next);
  next.endGame = evaluateEndGame(next);
  next.briefing = next.endGame ? makeEndingBriefing(next) : makeBriefing(next, allResultTexts);
  appendSystemMessage(next, 'system', `턴 ${next.turn - 1} 결과`, allResultTexts.join('\n'));
  if (!next.endGame) appendSystemMessage(next, 'group', `턴 ${next.turn} 브리핑`, next.briefing);
  return next;
}

export function acceptBetrayalOffer(game, offerId, playerId = game.currentPlayerId) {
  const next = clone(game);
  const offer = next.betrayalOffers.find((item) => item.id === offerId);
  const player = next.players.find((item) => item.id === playerId);
  if (!offer || !player || offer.status !== 'open') return next;
  if (offer.playerId && offer.playerId !== playerId) return next;
  offer.status = 'accepted';
  player.dirtyMoney += offer.reward.dirtyMoney || 0;
  player.blackPrivileges = Array.from(new Set([...player.blackPrivileges, ...(offer.reward.privileges || [])]));
  player.suspicion = clamp(player.suspicion + 14, 0, 100);
  next.stats.betrayalTemperature = clamp(next.stats.betrayalTemperature + 20, 0, 100);
  next.acceptedBetrayals.push({ offerId, playerId, turn: next.turn, stage: '거래' });
  appendSystemMessage(next, 'betrayal', '거래 수락', `${player.name}에게 더러운 돈과 검은 특권이 지급되었습니다. 이 기록은 게임 종료 시 삭제됩니다.`);
  return next;
}

export function refuseBetrayalOffer(game, offerId, playerId = game.currentPlayerId) {
  const next = clone(game);
  const offer = next.betrayalOffers.find((item) => item.id === offerId);
  const player = next.players.find((item) => item.id === playerId);
  if (!offer || !player || offer.status !== 'open') return next;
  if (offer.playerId && offer.playerId !== playerId) return next;
  offer.status = 'refused';
  appendSystemMessage(next, 'betrayal', '거래 거절', '제안을 거절했습니다. 그러나 조직은 거절 기록도 압박 카드로 보관하려 할 수 있습니다.');
  return next;
}

export function finalJoinVillain(game, playerId = game.currentPlayerId, mode = 'accept') {
  const next = clone(game);
  const player = next.players.find((item) => item.id === playerId);
  if (!player) return next;
  const possible = canFinalJoinVillain(next, playerId);
  if (!possible.allowed) return next;
  if (mode === 'fake') {
    player.blackPrivileges = Array.from(new Set([...player.blackPrivileges, 'boss_direct_chat']));
    player.suspicion = clamp(player.suspicion + 8, 0, 100);
    appendSystemMessage(next, 'betrayal', '이중 배신 시도', `${player.name}이 범죄조직에 붙는 척하며 보스 직통 채팅 기록을 노립니다.`);
  } else {
    player.finalFaction = 'villain';
    next.stats.teamTrust = clamp(next.stats.teamTrust - 20, 0, 100);
    appendSystemMessage(next, 'betrayal', '최종 전향', `${player.name}의 승리 조건이 범죄조직 측으로 변경되었습니다.`);
  }
  return next;
}

export function canFinalJoinVillain(game, playerId = game.currentPlayerId) {
  const player = game.players.find((item) => item.id === playerId);
  if (!player) return { allowed: false, reasons: ['플레이어 없음'] };
  const reasons = [];
  if (game.turn < 6) reasons.push('후반 라운드 전에는 최종 합류가 열리지 않습니다.');
  if (game.acceptedBetrayals.filter((item) => item.playerId === playerId).length < 1) reasons.push('악역 AI와 실제 거래 기록이 부족합니다.');
  if (player.dirtyMoney < 2) reasons.push('더러운 돈 보유량이 부족합니다.');
  if (game.stats.teamTrust > 45) reasons.push('팀 신뢰도가 아직 너무 높습니다.');
  if (game.stats.bossEscape < 45) reasons.push('보스가 아직 해당 플레이어를 이용 가치 있다고 판단하지 않습니다.');
  return { allowed: reasons.length === 0, reasons };
}

export function sendChatMessage(game, threadId, senderId, text) {
  const next = clone(game);
  if (!text?.trim()) return next;
  const senderName = getName(next, senderId) || '플레이어';
  appendMessage(next, threadId, senderId, senderName, text.trim());
  const thread = next.threads[threadId];
  if (thread?.kind === 'npc') {
    const npcId = thread.characterId;
    const reply = makeNpcReply(next, npcId, text.trim());
    appendMessage(next, threadId, npcId, getName(next, npcId), reply);
  }
  return next;
}

export function updateProfileMemo(game, characterId, memo, playerId = game.currentPlayerId) {
  const next = clone(game);
  next.profileMemos[playerId] ||= {};
  next.profileMemos[playerId][characterId] = memo;
  return next;
}

export function deleteGameData(game) {
  const next = clone(game);
  next.threads = createInitialThreads(true);
  next.pendingCommands = [];
  next.profileMemos = {};
  next.betrayalOffers = [];
  next.acceptedBetrayals = [];
  next.flags.dataDeleted = true;
  next.endGame ||= { winner: 'deleted', reasons: ['방장이 게임 종료 후 데이터 삭제를 확정했습니다.'] };
  return next;
}

export function serializeGameForStorage(game) {
  const snapshot = clone(game);
  if (snapshot?.knowledge) {
    const { truth, villain, ...viewerAllowedKnowledge } = snapshot.knowledge;
    snapshot.knowledge = { ...viewerAllowedKnowledge, hiddenStateRedacted: true };
  }
  delete snapshot.caseSet;
  delete snapshot.characters;
  if (Array.isArray(snapshot.turnLog)) {
    snapshot.turnLog = snapshot.turnLog.map(({ villainActions, ...entry }) => entry);
  }
  return snapshot;
}

export function hydrateGameFromStorage(snapshot) {
  if (!snapshot || snapshot.version !== GAME_VERSION) return null;
  const base = createGame({
    mode: snapshot.mode,
    humanCount: snapshot.humanCount,
    playerNames: snapshot.players?.map((player) => player.name) || [],
    seed: snapshot.seed || 1,
  });
  const replay = reconstructHiddenStateFromTurnLog(snapshot, base);
  const hydrated = {
    ...base,
    ...snapshot,
    knowledge: {
      ...base.knowledge,
      ...(snapshot.knowledge || {}),
      truth: replay.knowledge.truth,
      villain: replay.knowledge.villain,
    },
  };
  delete hydrated.knowledge.hiddenStateRedacted;
  repairTruthFromPublic(hydrated);
  return hydrated;
}

function reconstructHiddenStateFromTurnLog(snapshot, base) {
  let replay = clone(base);
  const logs = [...(snapshot.turnLog || [])].sort((a, b) => a.turn - b.turn);
  for (const log of logs) {
    replay.players = clone(snapshot.players || replay.players);
    replay.acceptedBetrayals = clone(snapshot.acceptedBetrayals || []);
    replay.currentPlayerId = snapshot.currentPlayerId || replay.currentPlayerId;
    replay = advanceTurn(replay, log.commands || []);
  }
  return replay;
}

function buildPurposeOptions(game, actor) {
  const publicIntel = game.knowledge.public.characterIntel;
  const options = [option('wait_defend', '대기/방어: 현재 위치 유지, 은신, 정보 공유 안 함')];
  switch (actor.id) {
    case 'detective':
      options.push(
        option('trace_threat_phone', '협박 전화번호 위치 추적', !game.knowledge.public.clues.threatPhoneNumber, '범인 전화번호를 확보하지 못했습니다.'),
        option('call_records', '통화 기록 조회'),
        option('check_corrupt_police', '경찰 내부 부패자 확인'),
        option('apply_warrant', '폐공장/유리캐피탈 수색 영장 신청'),
        option('query_cctv', 'CCTV 조회'),
        option('protect_protagonist_request', '주인공 위치 보호 요청'),
      );
      break;
    case 'hacker':
      options.push(
        option('restore_cctv', '폐공장 CCTV 원본 복구'),
        option('counter_trace_n33', '조직 해커 N-33 역추적'),
        option('hide_protagonist_location', '주인공 위치 은폐'),
        option('trace_threat_phone', '협박 전화 발신지 추적'),
        option('verify_fake_tip', '가짜 제보 출처 확인'),
        option('analyze_boss_route', '보스 차량 동선 분석'),
      );
      break;
    case 'special_forces':
      options.push(
        option('scout_factory', '폐공장 정찰'),
        option('guard_protagonist', '주인공 경호'),
        option('clear_ambush', '조직원 매복 제거'),
        option('rescue_hostage', '인질 구출 준비', !stageAtLeast(publicIntel.seo_eunchae?.stage || 'unknown', 'estimated'), '인질 위치가 추정 이상이어야 구출 준비가 가능합니다.'),
        option('secure_entry', '위험 지역 진입로 확보'),
        option('block_escape_route', '보스 도주 경로 차단'),
        option('raid_boss', '보스 습격', !stageAtLeast(publicIntel.boss?.stage || 'unknown', 'confirmed'), '보스 위치가 아직 확인 또는 추적 중이 아닙니다.'),
      );
      break;
    case 'reporter':
      options.push(
        option('interview_victim_family', '피해자 인터뷰 확보'),
        option('prepare_report', '보도 준비'),
        option('publish_report', '보도 강행'),
        option('verify_fake_tip', '가짜 제보 검증'),
        option('investigate_corrupt_police', '부패 경찰 취재'),
        option('profile_seo', '서은채 과거 조사'),
        option('build_public_pressure', '여론 압박 형성'),
      );
      break;
    case 'protagonist':
      options.push(
        option('lie_low', '복싱장 주변 은신'),
        option('protect_gym', '복싱장 방어'),
        option('meet_contact', '서은채 접선 시도', !stageAtLeast(publicIntel.seo_eunchae?.stage || 'unknown', 'rumor'), '서은채 위치 단서가 전혀 없습니다.'),
        option('bait_villain', '주인공을 미끼로 조직원 유인'),
      );
      break;
    case 'prosecutor':
      options.push(
        option('legalize_evidence', '증거 합법화'),
        option('pressure_police', '공권력 압박'),
        option('apply_warrant', '강화 영장 청구'),
        option('freeze_assets', '유리캐피탈 자금 동결', !game.knowledge.public.clues.ledgerRumor, '계좌 또는 장부 단서가 부족합니다.'),
      );
      break;
    default:
      options.push(option('share_info', '확보 정보 공유'));
  }
  return options;
}

function buildTargetOptions(game, actor) {
  const base = [
    option('protagonist', '한도윤 / 주인공'),
    option('seo_eunchae', '서은채 / 내부고발자'),
    option('boss', '백무진 / 보스'),
    option('action_boss', '장태식 / 행동대장'),
    option('broker', '류 실장 / 브로커'),
    option('corrupt_police', '오상문 / 부패 경찰'),
    option('n33', 'N-33 / 조직 해커'),
    option('ledger', '장부 조각'),
    option('team', '주인공팀'),
  ];
  if (actor.id === 'reporter') base.push(option('gang_mira', '강미라 / 피해자 가족 대표'));
  if (actor.id === 'detective') base.push(option('threat_phone', '협박 전화번호'));
  return base;
}

function buildLocationOptions(game) {
  return Object.values(game.locations).map((location) => {
    const trap = location.attributes.trap;
    const gang = location.attributes.gangControl;
    const suffix = trap >= 4 || gang >= 4 ? ' · 위험' : location.attributes.cctv >= 3 ? ' · 기록 많음' : '';
    return option(location.id, `${location.id} ${location.name}${suffix}`);
  });
}

function buildMethodOptions(actor) {
  const common = [
    option('official', '공식 절차'),
    option('covert', '비공식 우회'),
    option('slow_safe', '느리지만 안전하게'),
    option('decoy', '미끼 사용'),
  ];
  const byRole = {
    detective: [option('with_hacker', '해커와 공동 추적'), option('avoid_corrupt_police', '부패 경찰 몰래 우회'), option('prosecutor_request', '검찰 협조 요청')],
    hacker: [option('server_intrusion', '서버 침투'), option('fake_signal', '가짜 위치 정보 생성'), option('honeypot', '미끼 서버 설치'), option('encrypt_team', '팀 통신 암호화')],
    special_forces: [option('stealth_recon', '은밀 정찰'), option('forced_entry', '강행 돌입'), option('long_watch', '원거리 감시'), option('solo_infiltration', '단독 침투')],
    reporter: [option('anonymous_interview', '익명 인터뷰'), option('public_report', '공개 보도'), option('hold_report', '보도 시점 지연'), option('source_protection', '취재원 보호')],
    prosecutor: [option('legal_chain', '증거 연계성 확보'), option('sealed_warrant', '비공개 영장'), option('asset_order', '계좌 동결 명령')],
    protagonist: [option('back_alley', '뒷골목 이동'), option('stay_gym', '복싱장 고수'), option('controlled_bait', '통제된 미끼 작전')],
  };
  return [...common, ...(byRole[actor.id] || [])];
}

function buildResourceOptions(game, actor, playerId = game.currentPlayerId) {
  const player = game.players.find((item) => item.id === playerId);
  const resources = [
    option('none', '사용 안 함'),
    option('police_badge', '경찰 신분', actor.id !== 'detective', '형사 역할만 사용할 수 있습니다.'),
    option('search_warrant', '수색 영장', !['detective', 'prosecutor'].includes(actor.id), '형사 또는 검사가 필요합니다.'),
    option('hacker_support', '해커 협조권'),
    option('encrypted_messenger', '암호화 메신저'),
    option('dirty_money', '더러운 돈', !player || player.dirtyMoney <= 0, '더러운 돈을 아직 보유하지 않았습니다.'),
    option('press_card', '취재원 보호 카드', actor.id !== 'reporter', '기자 역할만 사용할 수 있습니다.'),
    option('tactical_gear', '전술 장비', actor.id !== 'special_forces', '전술 인물이 필요합니다.'),
    option('legal_file', '계약서/법적 문서'),
  ];
  return resources;
}

function buildCooperatorOptions(game, actor) {
  const cooperators = [option('none', '단독 행동')];
  for (const character of Object.values(game.characters)) {
    if (character.id !== actor.id && ['hero', 'neutral'].includes(character.faction)) {
      cooperators.push(option(character.id, `${character.name} / ${character.roleName}`));
    }
  }
  return cooperators;
}

function emptyOptions(reason) {
  const locked = [option('none', reason, true, reason)];
  return { purpose: locked, target: locked, location: locked, method: locked, resource: locked, cooperator: locked, risk: locked, disclosure: locked, fallback: locked };
}

function resolveCommand(game, command, villainActions) {
  const actor = getCharacter(game, command.actorId);
  const location = game.locations[command.locationId];
  const risk = command.risk || 'medium';
  const riskMod = risk === 'low' ? -4 : risk === 'high' ? 9 : 2;
  const memoMod = command.memo && command.memo.trim().length >= 12 ? 5 : 0;
  const cooperatorMod = command.cooperator && command.cooperator !== 'none' ? 5 : 0;
  const resourceMod = command.resource && command.resource !== 'none' ? 4 : 0;
  const roleMod = roleScore(actor, command.purpose);
  const locationPenalty = Math.max(0, (location?.attributes.trap || 2) + (location?.attributes.gangControl || 2) - 5) * 4;
  const villainPenalty = villainActions.some((action) => action.locationId === command.locationId) ? 6 : 0;
  const random = nextRandom(game) * 24;
  const score = 45 + roleMod + riskMod + memoMod + cooperatorMod + resourceMod + random - locationPenalty - villainPenalty;
  let outcome = score >= 86 ? '대성공' : score >= 68 ? '성공' : score >= 50 ? '부분 성공' : score >= 32 ? '실패' : '역공';
  if (['wait_defend', 'lie_low'].includes(command.purpose) && ['실패', '역공'].includes(outcome)) {
    outcome = '부분 성공';
  }
  const result = {
    actorId: actor.id,
    outcome,
    title: labelPurpose(command.purpose),
    text: '',
    effects: [],
    score: Math.round(score),
  };

  const succeeded = ['대성공', '성공', '부분 성공'].includes(outcome);
  const cleanSuccess = ['대성공', '성공'].includes(outcome);
  switch (command.purpose) {
    case 'hide_protagonist_location':
      if (succeeded) {
        game.knowledge.villain.characterIntel.protagonist = { stage: cleanSuccess ? 'unknown' : 'rumor', locationIds: cleanSuccess ? [] : ['A1', 'C3'] };
        game.stats.villainHeat = clamp(game.stats.villainHeat - (cleanSuccess ? 8 : 3), 0, 100);
        result.text = cleanSuccess ? '주인공 위치 신호를 여러 더미 경로로 분산했습니다.' : '위치 은폐는 됐지만 N-33에게 일부 패턴을 남겼습니다.';
        result.effects.push('악역의 주인공 위치 정보 단계 하락');
      } else {
        game.knowledge.villain.characterIntel.protagonist = { stage: 'confirmed', locationIds: [game.knowledge.truth.characters.protagonist.locationId] };
        result.text = 'N-33이 은폐 시도를 역추적했습니다.';
        result.effects.push('주인공 위치가 악역에게 확인됨');
      }
      break;
    case 'trace_threat_phone':
    case 'call_records':
      if (succeeded) {
        const stage = cleanSuccess ? 'confirmed' : 'estimated';
        game.knowledge.public.characterIntel.action_boss = { stage, locationIds: cleanSuccess ? ['B2'] : ['B2', 'C2'] };
        result.text = `장태식 위치 정보가 ${LOCATION_STAGE_LABEL[stage]} 단계로 상승했습니다.`;
        result.effects.push('행동대장 추적 가능', '폐공장 제보의 신뢰도 재평가');
      } else {
        game.stats.corruptionNoise = clamp(game.stats.corruptionNoise + 6, 0, 100);
        result.text = '휴대폰이 꺼져 있거나 경찰 내부 기록이 지연되었습니다.';
        result.effects.push('경찰 정보 오염 +6');
      }
      break;
    case 'restore_cctv':
    case 'query_cctv':
      if (succeeded) {
        game.flags.cctvC1Manipulated = !cleanSuccess;
        game.knowledge.public.characterIntel.seo_eunchae = { stage: cleanSuccess ? 'estimated' : 'rumor', locationIds: cleanSuccess ? ['C1', 'D2'] : ['C1'] };
        result.text = cleanSuccess ? '조작 전 원본 일부를 복구해 서은채 후보 위치가 좁혀졌습니다.' : '영상은 복구했지만 조작 흔적 때문에 신뢰도가 낮습니다.';
        result.effects.push('인질 위치 단서 확보');
      } else {
        game.knowledge.villain.characterIntel.hacker = { stage: 'estimated', locationIds: [game.knowledge.truth.characters.hacker.locationId] };
        result.text = '조직 해커가 분석 흔적을 되밟았습니다.';
        result.effects.push('해커 위치 노출 위험');
      }
      break;
    case 'scout_factory':
    case 'locate_hostage':
      if (succeeded) {
        game.knowledge.public.characterIntel.seo_eunchae = { stage: cleanSuccess ? 'estimated' : 'rumor', locationIds: cleanSuccess ? ['C1', 'D2'] : ['C1'] };
        game.stats.hostageRisk = clamp(game.stats.hostageRisk + (risk === 'high' ? 5 : -2), 0, 100);
        result.text = '폐공장과 일반 창고 사이에 최근 이동 흔적이 발견되었습니다.';
        result.effects.push('서은채 후보 위치 갱신');
      } else {
        game.stats.hostageRisk = clamp(game.stats.hostageRisk + 8, 0, 100);
        result.text = '매복 흔적 때문에 진입하지 못했습니다.';
        result.effects.push('인질 위험 +8');
      }
      break;
    case 'rescue_hostage':
      if (cleanSuccess) {
        game.knowledge.truth.characters.seo_eunchae.captured = false;
        game.knowledge.truth.characters.seo_eunchae.locationId = 'B1';
        game.knowledge.public.characterIntel.seo_eunchae = { stage: 'confirmed', locationIds: ['B1'] };
        game.flags.seoTestimonySecured = true;
        game.stats.hostageRisk = clamp(game.stats.hostageRisk - 25, 0, 100);
        result.text = '서은채를 병원으로 이동시키고 증언 루트를 열었습니다.';
        result.effects.push('서은채 생존/증언 확보');
      } else if (succeeded) {
        game.knowledge.public.characterIntel.seo_eunchae = { stage: 'tracking', locationIds: ['D2'] };
        result.text = '구출은 실패했지만 이동 경로를 추적 중입니다.';
        result.effects.push('서은채 위치 추적 중');
      } else {
        game.stats.hostageRisk = clamp(game.stats.hostageRisk + 14, 0, 100);
        result.text = '구출 진입로가 함정이었습니다.';
        result.effects.push('인질 위험 +14');
      }
      break;
    case 'guard_protagonist':
    case 'protect_protagonist_request':
    case 'protect_gym':
      game.knowledge.truth.characters.protagonist.protected = succeeded;
      game.stats.teamTrust = clamp(game.stats.teamTrust + (succeeded ? 5 : -2), 0, 100);
      result.text = succeeded ? '주인공 보호 태세가 강화되었습니다.' : '보호 동선이 노출될 뻔했습니다.';
      result.effects.push(succeeded ? '주인공 보호 상태' : '보호 실패');
      break;
    case 'interview_victim_family':
    case 'build_public_pressure':
    case 'prepare_report':
      if (succeeded) {
        game.stats.publicAttention = clamp(game.stats.publicAttention + 12, 0, 100);
        game.stats.orgPressure = clamp(game.stats.orgPressure + 10, 0, 100);
        game.stats.hostageRisk = clamp(game.stats.hostageRisk + (command.purpose === 'prepare_report' ? 3 : 5), 0, 100);
        result.text = '피해자 네트워크와 여론이 움직이기 시작했습니다.';
        result.effects.push('조직 압박 상승', '인질 위험 소폭 상승');
      } else {
        game.stats.teamTrust = clamp(game.stats.teamTrust - 4, 0, 100);
        result.text = '피해자 가족이 보도 타이밍을 불신합니다.';
        result.effects.push('팀 신뢰도 -4');
      }
      break;
    case 'publish_report':
      if (succeeded) {
        game.stats.publicAttention = clamp(game.stats.publicAttention + 22, 0, 100);
        game.stats.orgPressure = clamp(game.stats.orgPressure + 18, 0, 100);
        game.stats.hostageRisk = clamp(game.stats.hostageRisk + 12, 0, 100);
        result.text = '속보가 터졌습니다. 조직 압박은 커졌지만 인질 위험도 함께 상승했습니다.';
        result.effects.push('조직 압박 대폭 상승', '인질 위험 상승');
      } else {
        game.stats.publicAttention = clamp(game.stats.publicAttention + 4, 0, 100);
        game.stats.hostageRisk = clamp(game.stats.hostageRisk + 10, 0, 100);
        result.text = '증거 부족으로 보도가 역공 프레임에 걸렸습니다.';
        result.effects.push('신뢰도 하락 위험');
      }
      break;
    case 'apply_warrant':
    case 'legalize_evidence':
    case 'pressure_police':
      if (succeeded) {
        game.stats.evidenceLegality = clamp(game.stats.evidenceLegality + 18, 0, 100);
        game.stats.corruptionNoise = clamp(game.stats.corruptionNoise - 8, 0, 100);
        result.text = '증거의 법적 통로가 확보되고 부패 경찰의 개입 여지가 줄었습니다.';
        result.effects.push('증거 합법성 상승');
      } else {
        game.stats.corruptionNoise = clamp(game.stats.corruptionNoise + 8, 0, 100);
        result.text = '영장 라인이 지연되며 오상문에게 냄새가 샜습니다.';
        result.effects.push('경찰 정보 오염 상승');
      }
      break;
    case 'analyze_boss_route':
    case 'block_escape_route':
      if (succeeded) {
        game.knowledge.public.characterIntel.boss = { stage: cleanSuccess ? 'confirmed' : 'estimated', locationIds: cleanSuccess ? ['D3'] : ['D3', 'D4'] };
        game.stats.bossEscape = clamp(game.stats.bossEscape - 10, 0, 100);
        result.text = '백무진의 항구 창고/외곽 도로 동선이 드러났습니다.';
        result.effects.push('보스 위치 정보 상승', '도주 준비도 하락');
      } else {
        game.stats.bossEscape = clamp(game.stats.bossEscape + 8, 0, 100);
        result.text = '보스 차량은 더미 번호판을 바꿔 달았습니다.';
        result.effects.push('보스 도주 준비도 상승');
      }
      break;
    case 'raid_boss':
      if (cleanSuccess) {
        game.flags.bossArrested = true;
        game.knowledge.truth.characters.boss.captured = true;
        result.text = '백무진을 제압하고 보스 체포 루트를 열었습니다.';
        result.effects.push('보스 체포');
      } else if (succeeded) {
        game.knowledge.public.characterIntel.boss = { stage: 'tracking', locationIds: ['D4'] };
        game.stats.bossEscape = clamp(game.stats.bossEscape + 5, 0, 100);
        result.text = '습격은 빗나갔지만 도주 차량을 추적 중입니다.';
        result.effects.push('보스 추적 중');
      } else {
        game.stats.bossEscape = clamp(game.stats.bossEscape + 18, 0, 100);
        result.text = '보스는 이미 빠져나갔고 현장은 역매복이었습니다.';
        result.effects.push('보스 도주 준비도 대폭 상승');
      }
      break;
    case 'freeze_assets':
      if (succeeded) {
        secureLedgerPiece(game, 'boss_account', actor.id);
        game.stats.orgPressure = clamp(game.stats.orgPressure + 12, 0, 100);
        result.text = '실명 계좌의 일부 흐름을 동결하고 장부 조각과 연결했습니다.';
        result.effects.push('보스 실명 계좌 장부 확보');
      } else {
        result.text = '계좌는 대포 법인으로 한 번 더 우회됐습니다.';
        result.effects.push('금융 추적 실패');
      }
      break;
    case 'check_corrupt_police':
    case 'investigate_corrupt_police':
      if (succeeded) {
        secureLedgerPiece(game, 'corrupt_wire', actor.id, cleanSuccess);
        game.stats.corruptionNoise = clamp(game.stats.corruptionNoise - 10, 0, 100);
        result.text = '오상문의 송금 기록 단서가 장부 조각과 연결되었습니다.';
        result.effects.push('부패 경찰 송금 기록 확보/후보화');
      } else {
        result.text = '오상문이 먼저 기록 접근 로그를 지웠습니다.';
        result.effects.push('부패 경찰 경계 상승');
      }
      break;
    case 'profile_seo':
    case 'meet_contact':
      if (succeeded) {
        game.knowledge.public.characterIntel.seo_eunchae = { stage: cleanSuccess ? 'confirmed' : 'estimated', locationIds: cleanSuccess ? ['D2'] : ['C1', 'D2'] };
        result.text = '서은채가 공범이면서도 장부 공개를 원한다는 모순이 드러났습니다.';
        result.effects.push('서은채 신뢰도 메모 갱신');
      } else {
        result.text = '서은채가 일부러 거짓 흔적을 남긴 것 같습니다.';
        result.effects.push('서은채 관련 의심 증가');
      }
      break;
    case 'wait_defend':
    case 'lie_low':
      game.knowledge.truth.characters[actor.id].protected = true;
      game.stats.villainHeat = clamp(game.stats.villainHeat - 4, 0, 100);
      result.text = '공격적 행동 없이 위치 노출을 줄였습니다.';
      result.effects.push('방어 태세');
      break;
    default:
      if (command.locationId === 'B3' && succeeded) {
        secureLedgerPiece(game, 'victim_list', actor.id, cleanSuccess);
        result.text = '유리캐피탈 사무실에서 피해자 명단 장부 조각을 확보했습니다.';
        result.effects.push('피해자 명단 확보');
      } else if (succeeded) {
        result.text = '명령서가 부분적으로 상황을 개선했습니다.';
        result.effects.push('작전 흐름 개선');
      } else {
        result.text = '별다른 성과를 얻지 못했습니다.';
        result.effects.push('행동 소모');
      }
  }

  if (outcome === '역공') {
    game.stats.teamTrust = clamp(game.stats.teamTrust - 6, 0, 100);
    game.stats.villainHeat = clamp(game.stats.villainHeat + 10, 0, 100);
    result.effects.push('역공: 팀 신뢰도 하락, 악역 반격 기회');
  }

  maybeShareResult(game, command, result);
  return result;
}

function applyVillainActions(game, actions) {
  const results = [];
  for (const action of actions) {
    switch (action.type) {
      case 'direct_assault': {
        const protagonist = game.knowledge.truth.characters.protagonist;
        const protectedNow = protagonist.protected;
        if (protectedNow) {
          game.stats.hostageRisk = clamp(game.stats.hostageRisk + 4, 0, 100);
          game.stats.villainHeat = clamp(game.stats.villainHeat + 4, 0, 100);
          results.push({ title: '주인공 습격 저지', text: '보호 태세가 있어 장태식의 직접 습격을 막았습니다.' });
        } else {
          protagonist.captured = game.turn >= 6;
          protagonist.alive = game.turn < 7;
          game.stats.teamTrust = clamp(game.stats.teamTrust - 18, 0, 100);
          results.push({ title: '주인공 직접 습격', text: protagonist.captured ? '한도윤이 납치되었습니다.' : '한도윤이 치명적인 압박을 받았습니다.' });
        }
        protagonist.protected = false;
        break;
      }
      case 'destroy_evidence': {
        const hidden = Object.values(game.knowledge.truth.ledgerPieces).find((piece) => piece.status === 'hidden');
        if (hidden && nextRandom(game) > 0.45) {
          hidden.status = 'destroyed';
          game.stats.orgPressure = clamp(game.stats.orgPressure - 8, 0, 100);
          results.push({ title: '장부 파기 성공', text: `${hidden.name} 조각이 조직 손에 파기되었습니다.` });
        } else {
          game.stats.bossEscape = clamp(game.stats.bossEscape + 6, 0, 100);
          results.push({ title: '증거 파기 시도', text: '증거 파기 시도가 감지되었지만 확정 피해는 없습니다.' });
        }
        break;
      }
      case 'fake_tip':
        game.stats.teamTrust = clamp(game.stats.teamTrust - 3, 0, 100);
        appendSystemMessage(game, 'system', '익명 제보', `${game.locations[action.locationId]?.name || action.locationId}에 인질이 있다는 제보가 들어왔습니다. 진위는 불명입니다.`);
        results.push({ title: '가짜 제보', text: '팀 채팅에 확인되지 않은 위치 정보가 섞였습니다.' });
        break;
      case 'bribe_offer': {
        const offer = makeBetrayalOffer(game, action.target);
        game.betrayalOffers.push(offer);
        game.stats.betrayalTemperature = clamp(game.stats.betrayalTemperature + 8, 0, 100);
        appendSystemMessage(game, 'betrayal', '비밀 제안', offer.message);
        results.push({ title: '매수 제안', text: '류 실장이 플레이어 한 명에게 비밀 거래를 보냈습니다.' });
        break;
      }
      case 'move_hostage':
        game.knowledge.truth.characters.seo_eunchae.locationId = action.locationId;
        game.knowledge.truth.hostageLocationId = action.locationId;
        if (game.knowledge.public.characterIntel.seo_eunchae?.stage === 'tracking') {
          game.knowledge.public.characterIntel.seo_eunchae.locationIds = [action.locationId];
        }
        game.stats.hostageRisk = clamp(game.stats.hostageRisk + 7, 0, 100);
        results.push({ title: '인질 이동', text: '서은채가 다른 임시 장소로 이동했습니다.' });
        break;
      default:
        results.push({ title: action.label, text: '악역 행동이 긴장을 높였습니다.' });
    }
  }
  return results;
}

function tickScenario(game) {
  if (game.turn === 2) {
    game.knowledge.public.characterIntel.seo_eunchae ||= { stage: 'unknown', locationIds: [] };
  }
  if (game.turn === 5) {
    game.stats.bossEscape = clamp(game.stats.bossEscape + 10, 0, 100);
  }
  if (game.turn === 7) {
    game.stats.bossEscape = clamp(game.stats.bossEscape + 16, 0, 100);
    if (!stageAtLeast(game.knowledge.public.characterIntel.boss?.stage || 'unknown', 'estimated')) {
      game.knowledge.public.characterIntel.boss = { stage: 'rumor', locationIds: ['D3', 'D4'] };
    }
  }
}

function evaluateEndGame(game) {
  const protagonist = game.knowledge.truth.characters.protagonist;
  const seo = game.knowledge.truth.characters.seo_eunchae;
  const securedLedgers = Object.values(game.knowledge.truth.ledgerPieces).filter((piece) => piece.status === 'secured').length;
  const destroyedLedgers = Object.values(game.knowledge.truth.ledgerPieces).filter((piece) => piece.status === 'destroyed').length;
  const villainPlayers = game.players.filter((player) => player.finalFaction === 'villain').length;
  const villainReasons = [];
  if (!protagonist.alive || protagonist.captured) villainReasons.push('주인공 사망 또는 납치');
  if (!seo.alive || seo.captured && game.stats.hostageRisk >= 80) villainReasons.push('서은채 제거 또는 회유');
  if (destroyedLedgers >= 2) villainReasons.push('장부 조각 2개 이상 파기');
  if (game.stats.bossEscape >= 100) villainReasons.push('보스 도주 성공');
  if (game.stats.teamTrust <= 10) villainReasons.push('플레이어 팀 신뢰도 붕괴');
  if (villainPlayers >= 2) villainReasons.push('플레이어 2명 이상 범죄조직 측 최종 전향');
  if (villainReasons.length) return { winner: 'villain', reasons: villainReasons };

  const heroReasons = [];
  if (protagonist.alive && !protagonist.captured) heroReasons.push('주인공 한도윤 생존');
  if ((seo.alive && !seo.captured) || game.flags.seoTestimonySecured) heroReasons.push('서은채 생존 또는 증언 확보');
  if (securedLedgers >= 2) heroReasons.push('장부 조각 2개 이상 확보');
  if (stageAtLeast(game.knowledge.public.characterIntel.boss?.stage || 'unknown', 'confirmed')) heroReasons.push('보스 위치 확인');
  if (game.flags.bossArrested || game.flags.bossRemoved) heroReasons.push('보스 체포 또는 제거');
  if (game.flags.redevelopmentBribeExposed || game.stats.publicAttention >= 70) heroReasons.push('재개발 뇌물 증거 공개');
  if (heroReasons.length >= 3 && (game.turn > game.maxTurns || game.flags.bossArrested || securedLedgers >= 3)) return { winner: 'hero', reasons: heroReasons };

  if (game.turn > game.maxTurns) {
    return heroReasons.length >= 3 ? { winner: 'hero', reasons: heroReasons } : { winner: 'villain', reasons: ['최종 라운드 종료까지 승리 조건 3개 미달성', ...villainReasons] };
  }
  return null;
}

function makeEndingBriefing(game) {
  const side = game.endGame?.winner === 'hero' ? '주인공팀 승리' : game.endGame?.winner === 'villain' ? '범죄조직 승리' : '게임 종료';
  return `${side}\n${(game.endGame?.reasons || []).map((item) => `- ${item}`).join('\n')}\n\n엔딩 화면 이후 방장이 종료를 확정하면 채팅, 메모, 명령서, 배신 계약, AI 임시 판단 데이터는 삭제해야 합니다.`;
}

function makeBriefing(game, highlights = []) {
  const publicIntel = game.knowledge.public.characterIntel;
  const ledgerSecured = Object.values(game.knowledge.truth.ledgerPieces).filter((piece) => piece.status === 'secured').length;
  const ledgerDestroyed = Object.values(game.knowledge.truth.ledgerPieces).filter((piece) => piece.status === 'destroyed').length;
  const lines = [
    `턴 ${game.turn} / ${game.maxTurns} · ${game.caseSet.displayTitle}`,
    `주인공 위치: ${formatIntel(publicIntel.protagonist)} · 서은채 위치: ${formatIntel(publicIntel.seo_eunchae)} · 보스 위치: ${formatIntel(publicIntel.boss)}`,
    `팀 신뢰도 ${game.stats.teamTrust} · 인질 위험도 ${game.stats.hostageRisk} · 조직 압박도 ${game.stats.orgPressure} · 보스 도주 준비도 ${game.stats.bossEscape}`,
    `장부: 확보 ${ledgerSecured}/3 · 파기 ${ledgerDestroyed}/3`,
  ];
  if (highlights.length) lines.push('이번 턴 핵심:', ...highlights.slice(0, 5).map((item) => `- ${item}`));
  lines.push('AI는 브리핑·제안·악역 전략을 만들지만, 행동 가능 여부와 결과 적용은 규칙 엔진이 판정합니다.');
  return lines.join('\n');
}

function formatIntel(intel = { stage: 'unknown', locationIds: [] }) {
  const label = LOCATION_STAGE_LABEL[intel.stage] || '미확인';
  const locations = intel.locationIds?.length ? intel.locationIds.join('/') : '없음';
  return `${label}(${locations})`;
}

function maybeShareResult(game, command, result) {
  if (command.disclosure === 'group' || command.disclosure === 'public') {
    appendSystemMessage(game, command.disclosure === 'group' ? 'group' : 'system', `${getName(game, command.actorId)} 명령 결과`, `${result.outcome}: ${result.text}`);
  }
}

function makeBetrayalOffer(game, playerId) {
  const player = game.players.find((item) => item.id === playerId) || game.players[0];
  const reward = game.turn >= 5
    ? { dirtyMoney: 3, privileges: ['extra_action', 'boss_direct_chat', 'evidence_tamper'] }
    : { dirtyMoney: 2, privileges: ['secret_move', 'hide_location'] };
  return {
    id: `offer_${game.turn}_${game.betrayalOffers.length + 1}_${Math.floor(nextRandom(game) * 1000)}`,
    turn: game.turn,
    playerId: player?.id,
    from: 'broker',
    status: 'open',
    reward,
    demand: game.turn >= 5 ? '장부 확보를 한 턴 늦추고 보스 도주 루트를 공유하지 말 것' : '이번 턴 폐공장 수색을 늦출 것',
    message: `류 실장: “${player?.name || '당신'}, 이번 턴만 늦춰. 대가로 더러운 돈 ${reward.dirtyMoney}과 ${reward.privileges.join(', ')}을 주지.”`,
  };
}

function makeNpcReply(game, npcId, text) {
  const lowered = text.toLowerCase();
  const npc = game.characters[npcId];
  if (!npc) return '기록되지 않은 상대입니다.';
  if (npcId === 'seo_eunchae') {
    if (lowered.includes('장부') || text.includes('장부')) return '장부는 한 조각이 아니에요. 하나만 공개하면 저도, 도윤 씨도 못 버텨요.';
    return '저를 완전히 믿지 마세요. 하지만 백무진이 도망치면 더 많은 사람이 사라져요.';
  }
  if (npcId === 'boss') return '백무진: “이 게임은 정의가 아니라 손익이야. 네가 살 길을 고르면 된다.”';
  if (npcId === 'broker') return '류 실장: “돈은 배신을 만들지 않습니다. 이미 있던 배신을 드러낼 뿐이죠.”';
  if (npcId === 'gang_mira') return '강미라: “법대로요? 그 법이 우리 가족을 지켜준 적이 있나요?”';
  if (npc.faction === 'villain') return `${npc.name}: “그 말, 정말 팀에도 그대로 말할 수 있습니까?”`;
  return `${npc.name}: “좋아요. 다만 명령서는 규칙 엔진이 받아들일 수 있게 구체적으로 정리해 주세요.”`;
}

function createInitialThreads(empty = false) {
  const now = new Date().toISOString();
  const threads = {
    system: { id: 'system', name: '시스템 브리핑', kind: 'system', messages: [] },
    group: { id: 'group', name: '주인공 단톡방', kind: 'group', messages: [] },
    betrayal: { id: 'betrayal', name: '비밀 제안/배신 계약', kind: 'secret', messages: [] },
  };
  for (const character of CASE_01.characters) {
    threads[`npc:${character.id}`] = { id: `npc:${character.id}`, name: `${character.name} 1:1`, kind: 'npc', characterId: character.id, messages: [] };
  }
  if (!empty) {
    threads.system.messages.push({ id: `m-${now}-0`, turn: 1, senderId: 'system', senderName: '시스템', text: 'Case 01이 시작되었습니다.', at: now });
  }
  return threads;
}

function appendSystemMessage(game, threadId, title, text) {
  appendMessage(game, threadId, 'system', title, text);
}

function appendMessage(game, threadId, senderId, senderName, text) {
  game.threads[threadId] ||= { id: threadId, name: threadId, kind: 'custom', messages: [] };
  game.threads[threadId].messages.push({
    id: `${threadId}-${Date.now()}-${Math.floor((game.rngState || 1) % 100000)}-${game.threads[threadId].messages.length}`,
    turn: game.turn,
    senderId,
    senderName,
    text,
    at: new Date().toISOString(),
  });
}

function makePlayerKnowledge(game, player) {
  const controlled = player.isSoloController ? SOLO_CONTROLLED : [player.characterId];
  return {
    controlled,
    characterIntel: clone(game.knowledge?.public?.characterIntel || {}),
    notes: {},
  };
}

function roleScore(actor, purpose) {
  const skill = actor.skills || {};
  if (['trace_threat_phone', 'call_records', 'query_cctv', 'check_corrupt_police', 'profile_seo'].includes(purpose)) return (skill.investigation || 0) * 5 + (skill.tech || 0) * 2;
  if (['restore_cctv', 'counter_trace_n33', 'hide_protagonist_location', 'verify_fake_tip', 'analyze_boss_route'].includes(purpose)) return (skill.tech || 0) * 6 + (skill.investigation || 0) * 2;
  if (['scout_factory', 'guard_protagonist', 'clear_ambush', 'rescue_hostage', 'raid_boss', 'block_escape_route'].includes(purpose)) return (skill.combat || 0) * 5 + (skill.stealth || 0) * 3;
  if (['interview_victim_family', 'prepare_report', 'publish_report', 'build_public_pressure'].includes(purpose)) return (skill.social || 0) * 5 + (skill.investigation || 0) * 2;
  if (['apply_warrant', 'legalize_evidence', 'pressure_police', 'freeze_assets'].includes(purpose)) return (skill.law || 0) * 6 + (skill.investigation || 0) * 2;
  return 8;
}

function secureLedgerPiece(game, pieceId, actorId, confirmed = true) {
  const piece = game.knowledge.truth.ledgerPieces[pieceId];
  if (!piece || piece.status === 'destroyed') return;
  piece.status = confirmed ? 'secured' : 'located';
  piece.securedBy = actorId;
  game.knowledge.public.ledgerIntel[pieceId] = { stage: confirmed ? 'confirmed' : 'estimated', locationIds: [piece.locationId] };
  if (confirmed) game.stats.orgPressure = clamp(game.stats.orgPressure + 10, 0, 100);
}

function repairTruthFromPublic(game) {
  const truth = game.knowledge?.truth;
  if (!truth) return game;
  for (const [pieceId, intel] of Object.entries(game.knowledge.public?.ledgerIntel || {})) {
    const piece = truth.ledgerPieces?.[pieceId];
    if (!piece) continue;
    if (intel.locationIds?.[0]) piece.locationId = intel.locationIds[0];
    if (stageAtLeast(intel.stage, 'confirmed')) {
      piece.status = 'secured';
      piece.securedBy ||= 'restored_public_knowledge';
    } else if (stageAtLeast(intel.stage, 'estimated') && piece.status === 'hidden') {
      piece.status = 'located';
    }
  }
  for (const [characterId, intel] of Object.entries(game.knowledge.public?.characterIntel || {})) {
    const character = truth.characters?.[characterId];
    if (!character || !stageAtLeast(intel.stage, 'confirmed') || !intel.locationIds?.[0]) continue;
    character.locationId = intel.locationIds[0];
    if (characterId === 'seo_eunchae') truth.hostageLocationId = intel.locationIds[0];
  }
  if (game.flags?.bossArrested && truth.characters?.boss) truth.characters.boss.captured = true;
  return game;
}

function labelPurpose(id) {
  const labels = {
    wait_defend: '대기/방어',
    trace_threat_phone: '협박 전화번호 위치 추적',
    call_records: '통화 기록 조회',
    check_corrupt_police: '경찰 내부 부패자 확인',
    apply_warrant: '수색 영장 신청',
    query_cctv: 'CCTV 조회',
    protect_protagonist_request: '주인공 보호 요청',
    restore_cctv: 'CCTV 원본 복구',
    counter_trace_n33: 'N-33 역추적',
    hide_protagonist_location: '주인공 위치 은폐',
    verify_fake_tip: '가짜 제보 검증',
    analyze_boss_route: '보스 차량 동선 분석',
    scout_factory: '폐공장 정찰',
    guard_protagonist: '주인공 경호',
    clear_ambush: '매복 제거',
    rescue_hostage: '인질 구출 준비',
    secure_entry: '진입로 확보',
    block_escape_route: '도주 경로 차단',
    raid_boss: '보스 습격',
    interview_victim_family: '피해자 인터뷰',
    prepare_report: '보도 준비',
    publish_report: '보도 강행',
    investigate_corrupt_police: '부패 경찰 취재',
    profile_seo: '서은채 과거 조사',
    build_public_pressure: '여론 압박 형성',
    legalize_evidence: '증거 합법화',
    pressure_police: '공권력 압박',
    freeze_assets: '자금 동결',
    lie_low: '은신',
    protect_gym: '복싱장 방어',
    meet_contact: '서은채 접선 시도',
    bait_villain: '미끼 작전',
  };
  return labels[id] || id;
}

function getName(game, id) {
  if (id === 'system') return '시스템';
  return game.characters[id]?.name || game.players.find((player) => player.id === id)?.name || id;
}

function option(id, label, locked = false, reason = '') {
  return { id, label, locked, reason };
}

function stageAtLeast(stage, minimum) {
  return (LOCATION_STAGE[stage] ?? 0) >= (LOCATION_STAGE[minimum] ?? 0);
}

function pickKnownLocation(intel, fallback) {
  return intel?.locationIds?.[0] || fallback;
}

function nextRandom(game) {
  game.rngState = (game.rngState * 1664525 + 1013904223) >>> 0;
  return game.rngState / 4294967296;
}

function normalizeSeed(seed) {
  const numeric = Number(seed);
  if (Number.isFinite(numeric)) return (numeric >>> 0) || 1;
  return Array.from(String(seed)).reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, 1) || 1;
}

function makeToken(seed, index) {
  return `rk_${normalizeSeed(seed).toString(36)}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export const internals = {
  stageAtLeast,
  formatIntel,
  makeBriefing,
};
