# 블라인드 하운드

《블라인드 하운드》는 2~6명의 인간 플레이어가 AI 범죄조직과 싸우거나, 때로는 범죄조직에 붙어 살아남는 모바일 웹 전략 정치 보드게임입니다.

이 저장소의 현재 버전은 **GitHub Pages에서 바로 실행되는 정적 플레이어블 MVP**입니다.

## 포함된 것

- Case 01 《유리성의 채무》 데이터
- 4x4 맵, 위치 정보 단계, 장소 속성
- 1인 테스트 모드: 혼자서 주인공팀 핵심 인물 여러 명을 조작
- 2~6인 핫시트 모드: 같은 기기에서 플레이어별 역할 전환
- 인물별 1대1 채팅 UI와 주인공 단톡방
- 개인 프로필 메모
- AI가 생성한 것처럼 표시되는 동적 드롭다운 명령서
- 규칙 엔진 기반 명령서 검증/판정
- 악역 AI 로컬 전략: 가짜 제보, 매수, 인질 이동, 증거 파기, 직접 습격
- 배신 제안, 더러운 돈, 검은 특권, 최종 전향/이중 배신 선택
- TruthState, PublicKnowledge, VillainKnowledge 분리
- 새로고침 후 localStorage 기반 재접속
- 엔딩 후 게임 데이터 삭제 버튼

## 보안과 AI 키

사용자가 제공한 비밀키는 저장소와 배포 파일에 넣지 않았습니다.
정적 GitHub Pages 앱은 런타임 비밀키를 숨길 수 없기 때문에, 실제 Ollama/LLM 호출은 별도 서버 프록시나 Cloudflare Worker/Durable Object 같은 백엔드에서 secret으로 넣어야 합니다.

현재 MVP는 로컬 규칙 엔진과 템플릿 NPC 응답으로 플레이됩니다.

## 개발

```bash
npm install
npm test
npm run build
```

## 배포

`main` 브랜치에 push되면 `.github/workflows/pages.yml`이 테스트와 빌드를 실행하고 GitHub Pages에 배포합니다.

## 다음 단계 후보

- WebSocket/Durable Object 기반 진짜 원격 멀티플레이
- 서버 저장소와 방 코드/PIN 재입장
- 종료 시 서버 데이터 완전 삭제
- Ollama API를 서버 프록시에서 호출하는 GM/NPC 대화
- 사전 제작 이미지/음성 에셋 업로드 파이프라인
