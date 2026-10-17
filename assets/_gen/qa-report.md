# QA 리포트 — 프리미엄 에셋 1차 (2026-10-17)

## 비교 시트
- `assets/_gen/qa-compare-sheet.png` — 전 29 유닛 동일 렌더러 캡처.
- 화풍 관찰: 일러스트 6종(bulwark/catalyst/mirage/tempo/magnet/prime)은 셀셰이딩 윤곽이 기존 플랫 벡터보다 디테일이 높음. 동일 팔레트(네온+새 실루엣)라 한 화면에서 이질감은 낮으나, **mirage**가 가장 연함(워치 항목).
- 방향 교정: catalyst/magnet/prime 좌향 → 우향 반전 완료.

## 가독성 (밝은/어두운 스테이지)
- `qa-readability-bright.png`(z0 석양), `qa-readability-dark.png`(z3 다크) — 6종 모두 실루엣 판독 가능.
- 워치: mirage(반투명 보라)가 마젠타 배경에서 대비 최저. 필요 시 외곽선 1px 강화 후보.

## 번들 용량
- index.html: 620,101 → 625,861 bytes (+5,760, fx 블록+유닛 행+이미지 로더)
- 신규 에셋: units 4.5MB(512/256/128 PNG+WebP), icons 844KB, events 428KB
- 초기 로드 증가분: 프리미엄 6종 256.webp 프리로드 = **102KB** (나머지는 비사용 시 미로드)
