import {
  acceptBetrayalOffer,
  advanceTurn,
  canFinalJoinVillain,
  createGame,
  deleteGameData,
  finalJoinVillain,
  generateActionOptions,
  getControlledCharacters,
  hydrateGameFromStorage,
  refuseBetrayalOffer,
  sendChatMessage,
  serializeGameForStorage,
  updateProfileMemo,
} from './engine.js';
import { LOCATION_STAGE_LABEL } from './data/case01.js';

const STORAGE_KEY = 'blind-hound-state-v1';
const TABS = [
  ['map', '맵'],
  ['people', '인물'],
  ['chat', '채팅'],
  ['command', '명령서'],
  ['secret', '비밀'],
  ['board', '사건보드'],
];

let game = loadGame();
let activeTab = 'map';
let activeActorId = game ? getControlledCharacters(game)[0] : 'protagonist';
let activeThreadId = 'group';
let currentPlayerId = game?.currentPlayerId || 'player_1';
let selectedHumanCount = 1;

const root = document.getElementById('app-root');

render();

root.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'start') {
    const count = Number(document.querySelector('[name="humanCount"]')?.value || selectedHumanCount || 1);
    const mode = count === 1 ? 'solo' : 'hotseat';
    const names = Array.from({ length: count }, (_, index) => document.querySelector(`[name="playerName${index}"]`)?.value || (index === 0 ? '건우' : `플레이어 ${index + 1}`));
    game = createGame({ mode, humanCount: count, playerNames: names, seed: Date.now() % 1000000 });
    currentPlayerId = game.players[0].id;
    game.currentPlayerId = currentPlayerId;
    activeActorId = getControlledCharacters(game, currentPlayerId)[0] || 'protagonist';
    activeThreadId = 'group';
    activeTab = 'map';
    saveGame();
    render();
  }
  if (!game) return;
  if (action === 'tab') {
    activeTab = target.dataset.tab;
    render();
  }
  if (action === 'set-thread') {
    activeThreadId = target.dataset.thread;
    activeTab = 'chat';
    render();
  }
  if (action === 'set-actor') {
    activeActorId = target.dataset.actor;
    activeTab = 'command';
    render();
  }
  if (action === 'queue-command') queueCommand();
  if (action === 'remove-command') {
    const index = Number(target.dataset.index);
    game.pendingCommands.splice(index, 1);
    saveGame();
    render();
  }
  if (action === 'resolve-turn') {
    game = advanceTurn(game, game.pendingCommands);
    activeActorId = getControlledCharacters(game, currentPlayerId)[0] || activeActorId;
    saveGame();
    render();
  }
  if (action === 'send-chat') sendChat();
  if (action === 'accept-offer') {
    game = acceptBetrayalOffer(game, target.dataset.offer, currentPlayerId);
    saveGame();
    render();
  }
  if (action === 'refuse-offer') {
    game = refuseBetrayalOffer(game, target.dataset.offer, currentPlayerId);
    saveGame();
    render();
  }
  if (action === 'join-villain') {
    game = finalJoinVillain(game, currentPlayerId, 'accept');
    saveGame();
    render();
  }
  if (action === 'fake-join') {
    game = finalJoinVillain(game, currentPlayerId, 'fake');
    saveGame();
    render();
  }
  if (action === 'delete-game') {
    game = deleteGameData(game);
    localStorage.removeItem(STORAGE_KEY);
    activeTab = 'map';
    render();
  }
  if (action === 'new-game') {
    localStorage.removeItem(STORAGE_KEY);
    game = null;
    activeTab = 'map';
    render();
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  if (target.name === 'humanCount') {
    selectedHumanCount = Number(target.value);
    render();
  }
  if (!game) return;
  if (target.name === 'currentPlayer') {
    currentPlayerId = target.value;
    game.currentPlayerId = currentPlayerId;
    activeActorId = getControlledCharacters(game, currentPlayerId)[0] || activeActorId;
    saveGame();
    render();
  }
  if (target.name === 'actorId') {
    activeActorId = target.value;
    render();
  }
  if (target.name === 'purpose') updatePurposeHelp();
});

root.addEventListener('input', debounce((event) => {
  const target = event.target;
  if (!game) return;
  if (target.matches('[data-memo-for]')) {
    game = updateProfileMemo(game, target.dataset.memoFor, target.value, currentPlayerId);
    saveGame(false);
  }
}, 250));

function render() {
  if (!game) {
    root.innerHTML = renderStartScreen();
    return;
  }
  root.innerHTML = `
    ${renderHeader()}
    ${renderTabs()}
    <main class="screen shell">${renderActiveTab()}</main>
    ${renderBottomActions()}
  `;
  updatePurposeHelp();
}

function renderStartScreen() {
  const nameInputs = Array.from({ length: selectedHumanCount }, (_, index) => `
    <label class="field">
      <span>플레이어 ${index + 1} 이름</span>
      <input name="playerName${index}" value="${index === 0 ? '건우' : `플레이어 ${index + 1}`}" maxlength="16" />
    </label>
  `).join('');
  return `
    <main class="start-screen">
      <section class="hero-card">
        <p class="eyebrow">AI 범죄조직 전략 정치 보드게임</p>
        <h1>블라인드 하운드</h1>
        <p class="lead">채팅으로 거짓말하고, 드롭다운 명령서로 실제 행동을 제출하며, 유리캐피탈 AI가 매수·협박·가짜 제보로 팀을 찢어놓는 모바일 웹앱입니다.</p>
        <div class="mode-grid">
          <div><strong>1인 테스트 가능</strong><span>혼자서 핵심 선역 6명을 조작</span></div>
          <div><strong>2~6인 핫시트</strong><span>같은 기기에서 역할별 명령서 제출</span></div>
          <div><strong>규칙 엔진 판정</strong><span>AI 연출과 판정 로직 분리</span></div>
        </div>
      </section>
      <section class="panel start-panel">
        <h2>새 게임 만들기</h2>
        <label class="field">
          <span>인간 플레이어 수</span>
          <select name="humanCount">
            ${[1,2,3,4,5,6].map((n) => `<option value="${n}" ${n === selectedHumanCount ? 'selected' : ''}>${n}명${n === 1 ? ' · 테스트 모드' : ''}</option>`).join('')}
          </select>
        </label>
        <div class="names-grid">${nameInputs}</div>
        <button class="primary wide" data-action="start">Case 01 《유리성의 채무》 시작</button>
        <p class="hint">정적 GitHub Pages 빌드입니다. API 키는 저장·커밋하지 않았고, 실제 원격 멀티플레이/서버 AI는 보안 프록시 서버가 필요합니다.</p>
      </section>
    </main>
  `;
}

function renderHeader() {
  const end = game.endGame ? `<span class="badge danger">${game.endGame.winner === 'hero' ? '주인공팀 승리' : game.endGame.winner === 'villain' ? '범죄조직 승리' : '종료'}</span>` : '';
  return `
    <header class="topbar shell">
      <div>
        <p class="eyebrow">${escapeHtml(game.caseSet.displayTitle)} · 턴 ${game.turn}/${game.maxTurns}</p>
        <h1>블라인드 하운드</h1>
      </div>
      <div class="top-actions">
        ${end}
        <label class="player-switch">
          <span>현재</span>
          <select name="currentPlayer">
            ${game.players.map((player) => `<option value="${player.id}" ${player.id === currentPlayerId ? 'selected' : ''}>${escapeHtml(player.name)}</option>`).join('')}
          </select>
        </label>
      </div>
    </header>
    <section class="briefing shell">
      <pre>${escapeHtml(game.briefing)}</pre>
    </section>
  `;
}

function renderTabs() {
  return `<nav class="tabs shell">${TABS.map(([id, label]) => `<button data-action="tab" data-tab="${id}" class="${activeTab === id ? 'active' : ''}">${label}</button>`).join('')}</nav>`;
}

function renderActiveTab() {
  if (game.endGame && activeTab !== 'board') return renderEnding();
  switch (activeTab) {
    case 'map': return renderMap();
    case 'people': return renderPeople();
    case 'chat': return renderChat();
    case 'command': return renderCommand();
    case 'secret': return renderSecret();
    case 'board': return renderBoard();
    default: return renderMap();
  }
}

function renderMap() {
  const publicIntel = game.knowledge.public.characterIntel;
  return `
    <section class="section-head">
      <h2>4x4 작전 맵</h2>
      <p>일반 장소도 은신, 접선, 증거 은닉, 가짜 제보, 위치 추적 끊기에 사용됩니다.</p>
    </section>
    <div class="map-grid">
      ${Object.values(game.locations).map((loc) => {
        const chars = Object.entries(publicIntel)
          .filter(([id, intel]) => shouldShowCharacterOnMap(id) && intel.locationIds?.includes(loc.id))
          .map(([id]) => game.characters[id]?.name)
          .filter(Boolean);
        const risk = Math.max(loc.attributes.trap, loc.attributes.gangControl);
        return `<article class="map-cell risk-${risk}" data-location="${loc.id}">
          <div class="cell-top"><strong>${loc.id}</strong><span>${escapeHtml(loc.name)}</span></div>
          <p>${escapeHtml(loc.functionText)}</p>
          <div class="chips">
            <span>조직 ${loc.attributes.gangControl}</span><span>CCTV ${loc.attributes.cctv}</span><span>함정 ${loc.attributes.trap}</span>
          </div>
          <small>${chars.length ? `공개 인물: ${escapeHtml(chars.join(', '))}` : '숨겨진 정보가 있을 수 있음'}</small>
        </article>`;
      }).join('')}
    </div>
    <section class="panel two-col">
      <div><h3>위치 정보 단계</h3>${renderIntelList(publicIntel)}</div>
      <div><h3>장소 속성 설명</h3><p class="muted">공개성, 조직 장악도, 경찰 영향력, CCTV, 은신성, 이동성, 증거 밀도, 함정 위험, 민간인 위험, 탈출성을 1~5로 관리합니다.</p></div>
    </section>
  `;
}

function renderPeople() {
  const controlled = new Set(getControlledCharacters(game, currentPlayerId));
  return `
    <section class="section-head">
      <h2>인물 목록과 개인 메모</h2>
      <p>1대1 채팅 상대가 인간인지 AI인지 모드에 따라 명확하지 않을 수 있습니다. 이 테스트 빌드의 NPC 응답은 로컬 규칙 기반입니다.</p>
    </section>
    <div class="people-grid">
      ${Object.values(game.characters).map((character) => renderCharacterCard(character, controlled.has(character.id))).join('')}
    </div>
  `;
}

function renderCharacterCard(character, controlled) {
  const intel = game.knowledge.public.characterIntel[character.id];
  const memo = game.profileMemos[currentPlayerId]?.[character.id] || '';
  const status = character.publicStatus;
  return `<article class="person-card ${character.faction} ${controlled ? 'controlled' : ''}">
    <div class="portrait tone-${character.portraitTone}">${escapeHtml(character.name.slice(0, 1))}</div>
    <div class="person-main">
      <div class="person-title"><h3>${escapeHtml(character.name)}</h3><span>${escapeHtml(character.roleName)}</span></div>
      <p>${escapeHtml(status)}</p>
      <small>위치 정보: ${intel ? formatIntel(intel) : '비공개'} · 성향: ${character.faction}</small>
      <p class="personality">${escapeHtml(character.personality)}</p>
      <textarea data-memo-for="${character.id}" placeholder="내 개인 메모: 의심, 신뢰도, 거짓말 패턴...">${escapeHtml(memo)}</textarea>
      <div class="card-actions">
        <button data-action="set-thread" data-thread="npc:${character.id}">1대1 채팅</button>
        ${controlled ? `<button data-action="set-actor" data-actor="${character.id}" class="accent">명령서 작성</button>` : ''}
      </div>
    </div>
  </article>`;
}

function renderChat() {
  const threads = Object.values(game.threads).filter((item) => item.kind !== 'secret');
  const thread = threads.find((item) => item.id === activeThreadId) || game.threads.group;
  return `
    <section class="chat-layout">
      <aside class="thread-list">
        ${threads.map((item) => `<button data-action="set-thread" data-thread="${item.id}" class="${item.id === activeThreadId ? 'active' : ''}">${escapeHtml(item.name)}<small>${item.messages.length}</small></button>`).join('')}
      </aside>
      <section class="chat-panel panel">
        <h2>${escapeHtml(thread.name)}</h2>
        <div class="messages">
          ${(thread.messages.length ? thread.messages : [{ senderName: '시스템', text: '아직 메시지가 없습니다.', at: '' }]).map((message) => `<div class="message ${message.senderId === 'system' ? 'system' : ''}">
            <strong>${escapeHtml(message.senderName)}</strong>
            <p>${escapeHtml(message.text)}</p>
            <small>${message.turn ? `턴 ${message.turn}` : ''}</small>
          </div>`).join('')}
        </div>
        <div class="chat-input">
          <input name="chatText" placeholder="채팅 입력: 설득, 거짓말, 협상, 매수 제안 공유..." />
          <button data-action="send-chat" class="primary">전송</button>
        </div>
      </section>
    </section>
  `;
}

function renderCommand() {
  const controlled = getControlledCharacters(game, currentPlayerId);
  if (!controlled.includes(activeActorId)) activeActorId = controlled[0] || 'protagonist';
  const actor = game.characters[activeActorId];
  const options = generateActionOptions(game, activeActorId);
  return `
    <section class="section-head">
      <h2>드롭다운 명령서</h2>
      <p>드롭다운은 규칙, 작전 메모는 세부 전략입니다. 불가능한 행동은 잠금 사유와 함께 표시됩니다.</p>
    </section>
    <section class="panel command-panel">
      <label class="field">
        <span>행동 인물</span>
        <select name="actorId">${controlled.map((id) => `<option value="${id}" ${id === activeActorId ? 'selected' : ''}>${escapeHtml(game.characters[id]?.name || id)} / ${escapeHtml(game.characters[id]?.roleName || '')}</option>`).join('')}</select>
      </label>
      <div class="actor-summary">
        <div class="portrait tone-${actor?.portraitTone || 'steel'}">${escapeHtml(actor?.name?.slice(0,1) || '?')}</div>
        <div><strong>${escapeHtml(actor?.name || '')}</strong><p>${escapeHtml(actor?.personality || '')}</p></div>
      </div>
      <form id="commandForm" class="command-form">
        ${renderSelect('행동 목적', 'purpose', options.purpose)}
        <div id="purposeHelp" class="purpose-help"></div>
        ${renderSelect('대상', 'target', options.target)}
        ${renderSelect('장소', 'locationId', options.location)}
        ${renderSelect('방법', 'method', options.method)}
        ${renderSelect('사용 자원', 'resource', options.resource)}
        ${renderSelect('협력 인물', 'cooperator', options.cooperator)}
        ${renderSelect('위험 감수도', 'risk', options.risk)}
        ${renderSelect('공개 여부', 'disclosure', options.disclosure)}
        ${renderSelect('실패 시 대안', 'fallback', options.fallback)}
        <label class="field toggle"><span>비밀 행동 여부</span><input type="checkbox" name="secret" /></label>
        <label class="field full"><span>작전 메모</span><textarea name="memo" placeholder="예: 정문 대신 뒤쪽 하수구로 접근. 사람을 보면 교전하지 않고 사진만 찍고 빠진다."></textarea></label>
      </form>
      <button class="primary wide" data-action="queue-command">명령서 임시 제출</button>
    </section>
    <section class="panel">
      <h3>이번 턴 제출 명령서</h3>
      ${game.pendingCommands.length ? game.pendingCommands.map((command, index) => renderPendingCommand(command, index)).join('') : '<p class="muted">아직 제출된 명령서가 없습니다. 접속 끊김/미제출 시 기본 행동은 대기·방어입니다.</p>'}
      <button class="danger wide" data-action="resolve-turn" ${game.pendingCommands.length ? '' : ''}>턴 종료 / AI 악역 행동 및 규칙 엔진 판정</button>
    </section>
  `;
}

function renderSecret() {
  const player = game.players.find((item) => item.id === currentPlayerId) || game.players[0];
  const finalJoin = canFinalJoinVillain(game, currentPlayerId);
  const openOffers = game.betrayalOffers.filter((offer) => offer.status === 'open' && (!offer.playerId || offer.playerId === currentPlayerId));
  return `
    <section class="section-head">
      <h2>개인 비밀 화면</h2>
      <p>배신은 엔딩 분기가 아니라 게임 중 권력과 자원을 얻는 위험한 성장 루트입니다.</p>
    </section>
    <section class="secret-grid">
      <article class="panel stat-card"><span>더러운 돈</span><strong>${player.dirtyMoney}</strong></article>
      <article class="panel stat-card"><span>의심도</span><strong>${player.suspicion}</strong></article>
      <article class="panel stat-card"><span>검은 특권</span><strong>${player.blackPrivileges.length || 0}</strong><small>${escapeHtml(player.blackPrivileges.join(', ') || '없음')}</small></article>
      <article class="panel stat-card"><span>최종 진영</span><strong>${player.finalFaction === 'villain' ? '범죄조직' : '주인공팀'}</strong></article>
    </section>
    <section class="panel">
      <h3>AI 매수 제안</h3>
      ${openOffers.length ? openOffers.map((offer) => `<div class="offer">
        <p>${escapeHtml(offer.message)}</p>
        <small>요구: ${escapeHtml(offer.demand)} · 보상: 돈 ${offer.reward.dirtyMoney}, ${escapeHtml(offer.reward.privileges.join(', '))}</small>
        <div class="card-actions"><button data-action="accept-offer" data-offer="${offer.id}" class="danger">수락</button><button data-action="refuse-offer" data-offer="${offer.id}">거절</button></div>
      </div>`).join('') : '<p class="muted">현재 열린 제안이 없습니다. 보통 턴 3 이후 류 실장이 접근합니다.</p>'}
    </section>
    <section class="panel">
      <h3>범죄조직 최종 합류</h3>
      <p>${finalJoin.allowed ? '보스가 마지막 제안을 보낼 수 있는 조건입니다.' : '아직 최종 합류 조건이 부족합니다.'}</p>
      ${finalJoin.allowed ? '<div class="card-actions"><button data-action="join-villain" class="danger">범죄조직 편으로 최종 전향</button><button data-action="fake-join">수락하는 척하기</button></div>' : `<ul>${finalJoin.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>`}
      <p class="hint">최종 전향은 강하지만 안전하지 않습니다. 보스가 약속을 지키지 않거나, 팀이 역전하면 첫 제거 대상이 될 수 있습니다.</p>
    </section>
    <section class="panel">
      <h3>AI 연결 보안 메모</h3>
      <p class="muted">모델명은 앱 설정 설명에만 남겼고, 사용자가 준 비밀키 원문은 코드·저장소·배포 파일에 넣지 않았습니다. 정적 페이지에서 비밀키를 직접 호출하면 노출되므로 실제 AI 호출은 서버 프록시에서만 붙이는 구조가 맞습니다.</p>
    </section>
  `;
}

function renderBoard() {
  const pieces = game.caseSet.ledgerPieces;
  const publicIntel = game.knowledge.public.characterIntel;
  return `
    <section class="section-head">
      <h2>사건 보드</h2>
      <p>진실 상태와 공개 지식은 분리되어 있습니다. 악역 AI는 VillainKnowledge 안에서만 전략을 짭니다.</p>
    </section>
    <section class="board-grid">
      ${renderMeter('팀 신뢰도', game.stats.teamTrust, 'good')}
      ${renderMeter('인질 위험도', game.stats.hostageRisk, 'bad')}
      ${renderMeter('조직 압박도', game.stats.orgPressure, 'good')}
      ${renderMeter('보스 도주 준비도', game.stats.bossEscape, 'bad')}
      ${renderMeter('경찰 정보 오염', game.stats.corruptionNoise, 'bad')}
      ${renderMeter('증거 합법성', game.stats.evidenceLegality, 'good')}
    </section>
    <section class="panel">
      <h3>장부 세 조각</h3>
      <div class="evidence-list">${pieces.map((piece) => {
        const intel = game.knowledge.public.ledgerIntel[piece.id];
        const status = derivePublicLedgerStatus(intel);
        return `<div><strong>${escapeHtml(piece.name)}</strong><span class="badge ${status}">${translateStatus(status)}</span><small>공개 정보: ${formatIntel(intel)}</small></div>`;
      }).join('')}</div>
    </section>
    <section class="panel two-col">
      <div><h3>플레이어 팀 승리 조건</h3><ul>${game.caseSet.victoryConditions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
      <div><h3>범죄조직 승리 조건</h3><ul>${game.caseSet.villainWinConditions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
    </section>
    <section class="panel">
      <h3>최근 턴 로그</h3>
      ${game.turnLog.length ? game.turnLog.slice(0, 4).map((log) => {
        const commandCount = log.commands?.length ?? 0;
        const villainActionCount = log.villainActions?.length ?? log.villainResults?.length ?? 0;
        const results = log.results || [];
        const villainResults = log.villainResults || [];
        return `<details><summary>턴 ${log.turn} 결과 · 명령 ${commandCount}개 · 악역 ${villainActionCount}개</summary>${results.map((result) => `<p><strong>${escapeHtml(result.outcome)}</strong> ${escapeHtml(result.title)} — ${escapeHtml(result.text)}</p>`).join('')}${villainResults.map((result) => `<p><strong>악역</strong> ${escapeHtml(result.title)} — ${escapeHtml(result.text)}</p>`).join('')}</details>`;
      }).join('') : '<p class="muted">아직 턴 결과가 없습니다.</p>'}
    </section>
  `;
}

function renderEnding() {
  return `
    <section class="panel ending">
      <h2>${game.endGame.winner === 'hero' ? '주인공팀 승리' : game.endGame.winner === 'villain' ? '범죄조직 승리' : '게임 종료'}</h2>
      <ul>${game.endGame.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
      <p>엔딩 확인 후 방장이 종료를 확정하면 채팅, 메모, 명령서, 배신 계약, 임시 판단 데이터는 삭제됩니다.</p>
      <div class="card-actions"><button data-action="delete-game" class="danger">게임 데이터 삭제</button><button data-action="new-game">새 게임</button><button data-action="tab" data-tab="board">사건 보드 보기</button></div>
    </section>
  `;
}

function renderBottomActions() {
  return `<footer class="footer shell"><button data-action="tab" data-tab="command" class="primary">명령서</button><button data-action="tab" data-tab="chat">채팅</button><button data-action="new-game">초기화</button></footer>`;
}

function renderSelect(label, name, options) {
  return `<label class="field"><span>${label}</span><select name="${name}">${options.map((item) => `<option value="${item.id}" ${item.locked ? 'disabled' : ''} data-reason="${escapeHtml(item.reason || '')}">${escapeHtml(item.label)}${item.locked ? ' - 잠김' : ''}</option>`).join('')}</select></label>`;
}

function renderPendingCommand(command, index) {
  return `<div class="pending-command"><div><strong>${escapeHtml(game.characters[command.actorId]?.name || command.actorId)}</strong><p>${escapeHtml(command.purpose)} → ${escapeHtml(command.target)} @ ${escapeHtml(command.locationId)}</p><small>${escapeHtml(command.memo || '메모 없음')}</small></div><button data-action="remove-command" data-index="${index}">삭제</button></div>`;
}

function renderIntelList(intelMap) {
  return `<div class="intel-list">${Object.entries(intelMap).map(([id, intel]) => `<div><span>${escapeHtml(game.characters[id]?.name || id)}</span><strong>${formatIntel(intel)}</strong></div>`).join('')}</div>`;
}

function renderMeter(label, value, tone) {
  return `<article class="panel meter ${tone}"><div><span>${label}</span><strong>${value}</strong></div><i style="--value:${value}%"></i></article>`;
}

function queueCommand() {
  const form = document.getElementById('commandForm');
  if (!form) return;
  const data = new FormData(form);
  const command = {
    actorId: activeActorId,
    playerId: currentPlayerId,
    purpose: data.get('purpose'),
    target: data.get('target'),
    locationId: data.get('locationId'),
    method: data.get('method'),
    resource: data.get('resource'),
    cooperator: data.get('cooperator'),
    risk: data.get('risk'),
    disclosure: data.get('disclosure'),
    fallback: data.get('fallback'),
    secret: Boolean(data.get('secret')),
    memo: data.get('memo') || '',
  };
  game.pendingCommands.push(command);
  saveGame();
  render();
}

function sendChat() {
  const input = document.querySelector('[name="chatText"]');
  const text = input?.value || '';
  if (!text.trim()) return;
  game = sendChatMessage(game, activeThreadId, currentPlayerId, text);
  saveGame();
  render();
}

function updatePurposeHelp() {
  const select = document.querySelector('[name="purpose"]');
  const help = document.getElementById('purposeHelp');
  if (!select || !help) return;
  const option = select.selectedOptions[0];
  const reason = option?.dataset.reason;
  help.textContent = reason ? `잠금 사유: ${reason}` : '가능 행동입니다. 세부 작전 메모로 판정 보정을 노릴 수 있습니다.';
}

function shouldShowCharacterOnMap(id) {
  const intel = game.knowledge.public.characterIntel[id];
  return intel && ['confirmed', 'tracking'].includes(intel.stage);
}

function formatIntel(intel = { stage: 'unknown', locationIds: [] }) {
  const label = LOCATION_STAGE_LABEL[intel.stage] || '미확인';
  const locations = intel.locationIds?.length ? intel.locationIds.join('/') : '없음';
  return `${label}(${locations})`;
}

function translateStatus(status) {
  return { hidden: '숨김', located: '후보', secured: '확보', destroyed: '파기' }[status] || status;
}

function derivePublicLedgerStatus(intel = { stage: 'unknown' }) {
  if (intel.stage === 'confirmed' || intel.stage === 'tracking') return 'secured';
  if (intel.stage === 'estimated' || intel.stage === 'rumor') return 'located';
  return 'hidden';
}

function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return hydrateGameFromStorage(parsed);
  } catch {
    return null;
  }
}

function saveGame(write = true) {
  if (!write || !game) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeGameForStorage(game)));
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
