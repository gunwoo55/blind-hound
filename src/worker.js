import {
  acceptBetrayalOffer,
  advanceTurn,
  createGame,
  deleteGameData,
  finalJoinVillain,
  refuseBetrayalOffer,
  sendChatMessage,
  updateProfileMemo,
} from './engine.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        app: 'blind-hound',
        backend: 'cloudflare-worker-durable-object',
        aiConfigured: Boolean(env.OLLAMA_API_KEY),
        model: env.OLLAMA_MODEL || 'deepseek-v4-flash:cloud',
      });
    }

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const body = await readJson(request);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const code = makeRoomCode();
        const id = env.ROOMS.idFromName(code);
        const stub = env.ROOMS.get(id);
        const initRequest = new Request(new URL(`/room/${code}/init`, url.origin), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, code }),
        });
        const response = await stub.fetch(initRequest);
        if (response.status !== 409) return withCors(response);
      }
      return json({ ok: false, error: 'room_code_collision' }, 503);
    }

    const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{4,8})(\/.*)?$/i);
    if (roomMatch) {
      const code = roomMatch[1].toUpperCase();
      const rest = roomMatch[2] || '/state';
      const id = env.ROOMS.idFromName(code);
      const stub = env.ROOMS.get(id);
      const forwarded = new Request(new URL(`/room/${code}${rest}${url.search}`, url.origin), request);
      return withCors(await stub.fetch(forwarded));
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    return env.ASSETS.fetch(request);
  },
};

export class RoomObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    const url = new URL(request.url);
    const [, code, action = '/state'] = url.pathname.match(/^\/room\/([A-Z0-9]{4,8})(\/.*)?$/i) || [];
    if (!code) return json({ ok: false, error: 'bad_room_route' }, 404);

    if (action === '/init' && request.method === 'POST') return this.initRoom(request, code.toUpperCase());
    if (action === '/join' && request.method === 'POST') return this.joinRoom(request, code.toUpperCase());

    const room = await this.getRoom();
    if (!room) return json({ ok: false, error: 'room_not_found' }, 404);
    const playerId = getAuthedPlayerId(request, room);
    if (!playerId) return json({ ok: false, error: 'unauthorized' }, 401);

    if (action === '/state' && request.method === 'GET') return json({ ok: true, ...makeRoomView(room, playerId) });
    if (action === '/chat' && request.method === 'POST') return this.chat(request, room, playerId);
    if (action === '/command' && request.method === 'POST') return this.command(request, room, playerId);
    if (action === '/command/remove' && request.method === 'POST') return this.removeCommand(request, room, playerId);
    if (action === '/turn/resolve' && request.method === 'POST') return this.resolveTurn(room, playerId);
    if (action === '/memo' && request.method === 'POST') return this.memo(request, room, playerId);
    if (action === '/offer' && request.method === 'POST') return this.offer(request, room, playerId);
    if (action === '/join-villain' && request.method === 'POST') return this.joinVillain(request, room, playerId);
    if (action === '/end' && request.method === 'POST') return this.endRoom(room, playerId);

    return json({ ok: false, error: 'unknown_room_action' }, 404);
  }

  async initRoom(request, code) {
    const existing = await this.getRoom();
    if (existing) return json({ ok: false, error: 'room_exists' }, 409);
    const body = await readJson(request);
    const maxPlayers = clamp(Number(body.maxPlayers || body.humanCount || 1), 1, 6);
    const hostName = cleanName(body.hostName || body.playerName || '방장');
    const seed = Date.now() % 100000000;
    const game = createGame({
      mode: maxPlayers === 1 ? 'solo' : 'multiplayer',
      humanCount: maxPlayers,
      playerNames: Array.from({ length: maxPlayers }, (_, index) => (index === 0 ? hostName : `플레이어 ${index + 1}`)),
      seed,
    });
    const hostToken = makeToken();
    game.roomCode = code;
    game.currentPlayerId = 'player_1';
    game.players = game.players.map((player, index) => ({
      ...player,
      name: index === 0 ? hostName : player.name,
      joined: index === 0,
      isHost: index === 0,
      online: index === 0,
      sessionToken: undefined,
    }));
    game.briefing = `${game.briefing}\n\n방코드 ${code}: 다른 휴대폰에서 이 코드로 입장할 수 있습니다. 명령서는 자기 인물 행동만 제출하고, AI/NPC에게 시키고 싶은 일은 1:1 채팅으로 설득해야 합니다.`;
    const room = {
      code,
      maxPlayers,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hostPlayerId: 'player_1',
      sessions: { [hostToken]: 'player_1' },
      game,
    };
    await this.saveRoom(room);
    return json({ ok: true, session: { roomCode: code, playerId: 'player_1', sessionToken: hostToken }, ...makeRoomView(room, 'player_1') });
  }

  async joinRoom(request, code) {
    const room = await this.getRoom();
    if (!room) return json({ ok: false, error: 'room_not_found' }, 404);
    const body = await readJson(request);
    const reconnectToken = body.sessionToken;
    if (reconnectToken && room.sessions[reconnectToken]) {
      const playerId = room.sessions[reconnectToken];
      return json({ ok: true, session: { roomCode: code, playerId, sessionToken: reconnectToken }, ...makeRoomView(room, playerId) });
    }
    const slot = room.game.players.find((player) => !player.joined);
    if (!slot) return json({ ok: false, error: 'room_full' }, 409);
    slot.name = cleanName(body.playerName || body.name || slot.name);
    slot.joined = true;
    slot.online = true;
    const token = makeToken();
    room.sessions[token] = slot.id;
    room.updatedAt = new Date().toISOString();
    room.game.currentPlayerId = slot.id;
    await this.saveRoom(room);
    return json({ ok: true, session: { roomCode: code, playerId: slot.id, sessionToken: token }, ...makeRoomView(room, slot.id) });
  }

  async chat(request, room, playerId) {
    const body = await readJson(request);
    const threadId = String(body.threadId || 'group');
    const text = String(body.text || '').slice(0, 800);
    if (!text.trim()) return json({ ok: false, error: 'empty_message' }, 400);
    let nextGame = sendChatMessage(room.game, threadId, playerId, text);
    if (threadId.startsWith('npc:')) {
      const thread = nextGame.threads[threadId];
      const lastReply = thread?.messages?.at(-1);
      if (lastReply && lastReply.senderId !== playerId && this.env.OLLAMA_API_KEY) {
        const aiText = await makeAiNpcReply(this.env, nextGame, thread.characterId, playerId, text, lastReply);
        if (aiText) lastReply.text = aiText;
      }
    }
    room.game = nextGame;
    room.updatedAt = new Date().toISOString();
    await this.saveRoom(room);
    return json({ ok: true, ...makeRoomView(room, playerId) });
  }

  async command(request, room, playerId) {
    const body = await readJson(request);
    const command = { ...body.command, playerId };
    room.game.pendingCommands = room.game.pendingCommands.filter((item) => !(item.playerId === playerId && item.actorId === command.actorId));
    room.game.pendingCommands.push(command);
    room.game.currentPlayerId = playerId;
    room.updatedAt = new Date().toISOString();
    await this.saveRoom(room);
    return json({ ok: true, ...makeRoomView(room, playerId) });
  }

  async removeCommand(request, room, playerId) {
    const body = await readJson(request);
    const index = Number(body.index);
    const ownCommands = room.game.pendingCommands.map((command, commandIndex) => ({ command, commandIndex })).filter(({ command }) => command.playerId === playerId);
    const selected = ownCommands[index];
    if (selected) room.game.pendingCommands.splice(selected.commandIndex, 1);
    room.updatedAt = new Date().toISOString();
    await this.saveRoom(room);
    return json({ ok: true, ...makeRoomView(room, playerId) });
  }

  async resolveTurn(room, playerId) {
    room.game.currentPlayerId = playerId;
    room.game = advanceTurn(room.game, room.game.pendingCommands || []);
    room.updatedAt = new Date().toISOString();
    await this.saveRoom(room);
    return json({ ok: true, ...makeRoomView(room, playerId) });
  }

  async memo(request, room, playerId) {
    const body = await readJson(request);
    room.game = updateProfileMemo(room.game, String(body.characterId || ''), String(body.memo || '').slice(0, 600), playerId);
    room.updatedAt = new Date().toISOString();
    await this.saveRoom(room);
    return json({ ok: true, ...makeRoomView(room, playerId) });
  }

  async offer(request, room, playerId) {
    const body = await readJson(request);
    const offerId = String(body.offerId || '');
    room.game = body.choice === 'accept'
      ? acceptBetrayalOffer(room.game, offerId, playerId)
      : refuseBetrayalOffer(room.game, offerId, playerId);
    room.updatedAt = new Date().toISOString();
    await this.saveRoom(room);
    return json({ ok: true, ...makeRoomView(room, playerId) });
  }

  async joinVillain(request, room, playerId) {
    const body = await readJson(request);
    room.game = finalJoinVillain(room.game, playerId, body.mode === 'fake' ? 'fake' : 'accept');
    room.updatedAt = new Date().toISOString();
    await this.saveRoom(room);
    return json({ ok: true, ...makeRoomView(room, playerId) });
  }

  async endRoom(room, playerId) {
    if (room.hostPlayerId !== playerId) return json({ ok: false, error: 'host_only' }, 403);
    room.game = deleteGameData(room.game);
    await this.state.storage.deleteAll();
    return json({ ok: true, deleted: true });
  }

  async getRoom() {
    return this.state.storage.get('room');
  }

  async saveRoom(room) {
    await this.state.storage.put('room', room);
  }
}

function makeRoomView(room, playerId) {
  const view = redactGameForPlayer(room.game, playerId);
  view.currentPlayerId = playerId;
  view.roomCode = room.code;
  view.players = view.players.map((player) => ({
    ...player,
    sessionToken: undefined,
    reconnectKey: undefined,
  }));
  view.betrayalOffers = (view.betrayalOffers || []).filter((offer) => !offer.playerId || offer.playerId === playerId);
  view.threads = filterThreadsForPlayer(view.threads || {}, playerId);
  return {
    room: {
      code: room.code,
      maxPlayers: room.maxPlayers,
      joinedCount: room.game.players.filter((player) => player.joined).length,
      updatedAt: room.updatedAt,
      hostPlayerId: room.hostPlayerId,
    },
    game: view,
  };
}

function redactGameForPlayer(game, playerId) {
  const view = JSON.parse(JSON.stringify(game));
  if (view.knowledge) {
    delete view.knowledge.truth;
    delete view.knowledge.villain;
    view.knowledge.hiddenStateRedacted = true;
  }
  view.pendingCommands = (view.pendingCommands || []).map((command) => {
    if (!command.secret || command.playerId === playerId) return command;
    return {
      playerId: command.playerId,
      actorId: command.actorId,
      secret: true,
      purpose: '비밀 행동 제출됨',
      target: '비공개',
      locationId: '비공개',
      method: '비공개',
      memo: '비밀 행동',
    };
  });
  return view;
}

function filterThreadsForPlayer(threads, playerId) {
  return Object.fromEntries(Object.entries(threads).map(([threadId, thread]) => {
    if (thread.kind === 'npc') {
      return [threadId, {
        ...thread,
        messages: (thread.messages || []).filter((message) => {
          if (Array.isArray(message.participants)) return message.participants.includes(playerId);
          return !message.viewerId || message.viewerId === playerId;
        }),
      }];
    }
    if (thread.kind === 'secret') {
      return [threadId, {
        ...thread,
        messages: (thread.messages || []).filter((message) => message.viewerId === playerId || message.senderId === playerId),
      }];
    }
    return [threadId, thread];
  }));
}

async function makeAiNpcReply(env, game, npcId, playerId, playerText, mechanicalReply) {
  const npc = game.characters[npcId];
  const player = game.players.find((item) => item.id === playerId);
  if (!npc || !env.OLLAMA_API_KEY) return '';
  const acceptedState = mechanicalReply.npcAccepted ? '이번 요청은 규칙 엔진상 협력 수락됨' : mechanicalReply.npcRefused ? '이번 요청은 규칙 엔진상 거절됨' : '이번 메시지는 일반 대화';
  const system = [
    '너는 모바일 전략 정치 보드게임 《블라인드 하운드》의 NPC다.',
    '한국어로 짧고 인물 성격에 맞게 답한다.',
    '규칙 엔진 상태를 뒤집지 마라. 수락됨이면 협력하겠다고 말하고, 거절됨이면 조건을 더 요구해라.',
    '실제 숨겨진 TruthState를 노출하지 말고 공개 단서/협상 분위기만 말한다.',
  ].join('\n');
  const prompt = `NPC: ${npc.name} / ${npc.roleName} / ${npc.personality}\n플레이어: ${player?.name || playerId}\n기계 판정: ${acceptedState}\n현재 턴: ${game.turn}\n팀 신뢰도 ${game.stats.teamTrust}, 인질 위험도 ${game.stats.hostageRisk}, 조직 압박도 ${game.stats.orgPressure}\n플레이어 메시지: ${playerText}\n기본 응답: ${mechanicalReply.text}\n최종 NPC 답변만 작성.`;
  try {
    const endpoint = env.OLLAMA_BASE_URL || env.OLLAMA_ENDPOINT || 'https://ollama.com/api/chat';
    const isOpenAi = /\/v1\/chat\/completions\/?$/.test(endpoint);
    const payload = isOpenAi
      ? { model: env.OLLAMA_MODEL || 'deepseek-v4-flash:cloud', messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }
      : { model: env.OLLAMA_MODEL || 'deepseek-v4-flash:cloud', stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.OLLAMA_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return '';
    const data = await response.json();
    const text = data?.message?.content || data?.choices?.[0]?.message?.content || '';
    return String(text).trim().slice(0, 500);
  } catch {
    return '';
  }
}

function getAuthedPlayerId(request, room) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : request.headers.get('x-session-token');
  return token ? room.sessions[token] : '';
}

async function readJson(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...corsHeaders() } });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-session-token',
  };
}

function makeRoomCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join('');
}

function makeToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cleanName(value) {
  return String(value || '플레이어').trim().slice(0, 16) || '플레이어';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}
