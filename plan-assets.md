# Plan: Swishby 에셋 품질 업그레이드 (프리미엄 유닛·이벤트 에셋 + 코드 이펙트)

## 요구사항 재정리
- Scenario 커스텀 모델(SCENARIO_MODEL_ID, 에폭 19)로만 유닛 원화 생성. 공통 접미사/네거티브 프롬프트 고정.
- 유닛당 4장 → 실루엣 가독성·외곽선 두께 기준 자동 선별 1장, 탈락분 `assets/_rejected/`.
- 스펙: 유닛 512² 투명 PNG→WebP(+256/128), Ludo 애니메이션(idle 6f/flap 8f/hit 4f, 시트+JSON 아틀라스), 아이콘 256²(등급 테두리: 회/파/보/금), `assets/manifest.json`에 id·등급·경로·프롬프트 기록.
- 1차 대상: 프리미엄 유닛 6종(컨셉 사전 승인), 일일 챌린지 배너 3종, 랭킹 1~3위 뱃지, 상점 아이콘 전체.
- 이펙트는 이미지 금지, `/arcade-core/fx/` 공용 코드 모듈: 실드 회전 오라+육각 파편(겹 수만큼 링), XP 가속 트레일+숫자 팝업, 공통 주스(쉐이크·히트스톱 60ms·플래시·코인 바운스), 60fps, 저사양 모드 파티클 50%.
- QA: 전 유닛 비교 시트, 밝은/어두운 스테이지 가독성 테스트, 번들 용량 리포트.

## 전제와 제약 (이 코드베이스의 현실)
1. **SWISHBY는 단일 파일 게임** — 모든 아트가 index.html 안 캔버스 프로시저럴 드로잉. 현재 런타임에 이미지 에셋이 0장이며, 이미지 유닛을 넣으려면 로더·atlas 렌더 경로를 신설해야 함 (아키텍처 변경 → 이 계획의 핵심 결정 D1).
2. **Scenario 모델은 '게임 전체 장면'으로 학습**됨 — 투명 배경 단일 캐릭터는 학습 분포 밖. 생성 후 Scenario/Ludo **remove-background**로 누끼 따는 2단 파이프라인 필요(품질 리스크 M).
3. **Flux 2 LoRA는 공개 API 추론 불가(500)** — 생성은 제어 Chrome UI 자동화로, 다운로드·후처리는 API/CLI로. 1회 16 CU.
4. 현재 브랜치는 feat/account-login(PR #30 열림) — **main에서 새 브랜치 `feat/premium-assets`** 생성 후 작업.
5. `/arcade-core/`는 저장소에 없음 — 신설 디렉터리. 게임은 단일 파일 원칙이므로 fx 모듈은 **소스는 arcade-core/fx/*.js(테스트 가능) + 빌드 스텝 없이 index.html에 cloud-block 방식 마커로 인라인 동기화** 또는 **<script> 분리 로드** 중 택1 (결정 D2).

## 사용자 결정 필요 (승인 전 확정)
- **D1 유닛 렌더링**: ✅ (a) 인게임 교체 — 이미지 로더+스프라이트 렌더 경로 신설, 프리미엄 6종 이미지 렌더, 실패 시 프로시저럴 폴백 (2026-10-17 확정).
- **D2 fx 모듈 배치**: ✅ (a) arcade-core/fx/ 소스 + index.html 인라인 마커 동기화, cloud 블록 방식 (확정).
- **D3 유닛 컨셉**: ✅ 6종 모두 승인, "이대로 생성 진행" (확정).

## 프리미엄 유닛 컨셉 제안 (승인 대상)
1. **Bulwark(불워크)** — 실드 다중장착형: 거북+기사 하이브리드, 등갑이 육각 패널, 기본 실드 2겹 시작·최대 4겹.
2. **Catalyst(카탈리스트)** — 경험치 가속형: 비커 모양 몸통의 연금술 새, XP 획득 +50%, 레벨업 시 주변 번쩍.
3. **Mirage(미라주)** — 유령 여우-새: 3초마다 0.5초 무적 페이즈(통과), 잔상 트레일.
4. **Tempo(템포)** — 메트로놈 벌새: 게이트 퍼펙트 통과마다 속도·점수 배율 스택.
5. **Magnet(마그넷)** — 자석 부리 로봇새: 코인 흡인 반경 2배, 전기 스파크.
6. **Phoenix Prime(피닉스 프라임)** — 전설 등급: 사망 1회 부활(화염 폭발), 금색+진홍.

## Phases
### Phase 0 — 브랜치/골격 (S)
- main에서 `feat/premium-assets` 분기. `assets/units|icons|events/, assets/_rejected/` 생성, `.gitignore`에 `_rejected/`만 제외 추가(승인 에셋은 커밋).
- `tools/asset-pipeline/` 에 파이프라인 스크립트 골격(Python): download, remove-bg, select, resize, webp, manifest.

### Phase 1 — 생성 파이프라인 + 유닛 6종 (M)
- 브라우저 자동화(UI)로 유닛당 4장 생성(공통 접미사·네거티브 적용), API로 다운로드.
- remove-background(Ludo CLI `image remove-background`, 0.5cr/장) → 자동 선별(알파 실루엣 면적비·외곽선 평균 두께·중앙 정렬 점수) → 선별 1장, 나머지 `_rejected/`.
- 512 PNG + 256/128 + WebP(cwebp 또는 Pillow), manifest.json 기록. **TDD**: 선별 함수·manifest 스키마 단위 테스트(tests/asset-pipeline.test.*).

### Phase 2 — Ludo 애니메이션 (M)
- 선별 원화당 `ludo sprite animate` (idle/flap/hit) → 스프라이트 시트 + JSON 아틀라스 생성(프레임 수 맞춰 재배열 스크립트). 크레딧: 유닛당 ~3모션×9~12cr ≈ 200cr 내외(잔여 1,029cr).

### Phase 3 — 배너·뱃지·상점 아이콘 (S)
- 배너 3종(가로 16:9, Scenario UI), 랭킹 뱃지 3종 + 상점 아이콘: 기존 유닛은 프로시저럴 캔버스 → PNG 캡처(capture.mjs 재활용), 신규 6종은 원화 다운스케일. 등급 테두리는 Python 합성.

### Phase 4 — fx 모듈 (M, TDD)
- `arcade-core/fx/`: particles.js(풀·저사양 50% 옵션), shield.js(오라 링 N겹+육각 파편), xp.js(트레일+숫자 팝업), juice.js(쉐이크·히트스톱 60ms·플래시·코인 바운스). 순수 로직은 Node 테스트, 렌더는 캔버스 어댑터 주입.
- D2 결정 방식으로 index.html 연결, 기존 이펙트와 충돌 없이 교체.

### Phase 5 — 게임 반영 (M~L, D1에 따라)
- D1(a)면: index.html에 이미지 로더+atlas 렌더 경로, 프리미엄 유닛 6종 등록(스킨 상점·등급 포함), 폴백은 프로시저럴.
- 실드 다중장착·XP 가속 스탯 훅 연결.

### Phase 6 — QA + 커밋/PR (S)
- 비교 시트 PNG(전 유닛 나열, 화풍 불일치 수동 마킹), 밝은/어두운 스테이지 위 가독성 스크린샷, 번들 용량 before/after 리포트.
- 전체 테스트 스위트 그린 → conventional commits → PR(테스트 플랜 포함).

## 리스크
- HIGH: Scenario 모델이 단일 캐릭터+투명 배경에 약할 수 있음 → remove-bg 2단계로 완화, 실패 시 유닛 원화만 Ludo `generate-with-style`(기존 캡처 스타일 참조)로 대체 제안.
- MED: D1(a) 선택 시 index.html 렌더 경로 변경이 기존 60fps·판정에 영향 → 폴백 유지 + hitloop 테스트.
- MED: UI 자동화 불안정(세션 만료·레이아웃 변경) → 단계별 재시도, 생성물은 즉시 다운로드.
- LOW: 크레딧 소모(Scenario ~600 CU, Ludo ~250cr) — 잔여분 내.

## 복잡도: HIGH (총 1~2일 분량, 생성 대기 포함)
