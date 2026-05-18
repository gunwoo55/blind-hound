# 블라인드 하운드

《블라인드 하운드》는 1~6명의 인간 플레이어가 각자 다른 휴대폰에서 방코드로 입장해 AI 범죄조직과 싸우거나, 때로는 범죄조직에 붙어 살아남는 모바일 웹 전략 정치 보드게임입니다.

현재 버전은 **Cloudflare Worker + Durable Object 백엔드**와 **모바일 SPA 프론트**를 함께 배포하는 플레이어블 MVP입니다.

## 포함된 것

- Case 01 《유리성의 채무》 데이터
- 4x4 맵, 위치 정보 단계, 장소 속성
- 1인 테스트 모드: 혼자서 주인공팀 핵심 인물 여러 명을 조작
- 2~6인 원격 플레이: 방장이 방 생성 → 다른 휴대폰에서 방코드로 입장
- 서버 저장/동기화되는 실제 채팅
  - 주인공 단톡방
  - 인물별 1대1 채팅
  - 인간 플레이어가 맡은 인물에게 온 DM은 해당 플레이어에게 전달
  - AI/NPC 인물에게 온 DM은 규칙 엔진/서버 AI가 응답
- 개인 프로필 메모
- 드롭다운 명령서
  - 명령서는 “내 인물이 이번 턴 직접 할 행동”을 정하는 화면
  - AI/NPC에게 행동을 시키려면 1대1 채팅에서 설득·회유·협박·거래를 해야 함
  - AI/NPC가 수락한 경우에만 명령서의 협력 인물로 사용 가능
- 규칙 엔진 기반 명령서 검증/판정
- 악역 AI 로컬 전략: 가짜 제보, 매수, 인질 이동, 증거 파기, 직접 습격
- 배신 제안, 더러운 돈, 검은 특권, 최종 전향/이중 배신 선택
- TruthState, PublicKnowledge, VillainKnowledge 분리
- 원격 방 상태 재접속: sessionToken 기반 복구
- 엔딩 후 게임 데이터 삭제 버튼

## 보안과 AI 키

비밀키는 저장소와 배포 파일에 넣지 않습니다.
프론트엔드 정적 번들에서 API 키를 직접 호출하면 노출되므로, Ollama/LLM 호출은 Worker secret으로만 사용합니다.

Cloudflare에 실제 키를 넣을 때:

```bash
printf '%s' "$OLLAMA_API_KEY" | npx wrangler secret put OLLAMA_API_KEY
```

키가 없으면 NPC는 규칙 기반 응답으로 동작합니다.

## 개발

```bash
npm install
npm test
npm run build
```

Worker 포함 로컬 실행:

```bash
npm run build
npx wrangler dev
```

## 배포

```bash
npm run deploy
```

배포 대상은 `wrangler.toml`의 `blind-hound` Worker입니다. 프론트 자산은 `dist/`에서 서빙되고, `/api/*` 요청은 Worker가 처리합니다.
