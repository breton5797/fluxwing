# 최종 판정 — 100게이트 캡 이후 전체 랭킹 (2026-10-31)

## 최종 권고
**1안(지금, 11-07 동결 전): 랭킹 전용 모드는 만들지 않는다. 전체 랭킹 = "역대 데일리 최고"로 재정의.** 데일리 점수만 전체 best에 들어가고 스테이지 런은 빠진다. 서버 한 줄 + 출시일 리셋 + Game Center 표시명 변경. (41/50)

**2안(출시 후, 11-30 판정): 가-1 주간 랭크런.** 데이터가 "데일리 코스별 운 편차가 크다"를 보여줄 때만. 문제가 "상위 고착"이면 나-5 월간 시즌화.

한 줄 이유: 공정하고 상한 없는 랭킹 전용 모드는 이미 있다 — 데일리. 문제는 전체 보드에 스테이지 런이 섞여 생긴 구멍이며, **서버 한 줄로 막히고 빌드 8도 필요 없다.**

## 핵심 비교
| | A. 전체 = 역대 데일리 최고 | 혼합 유지(현상) | B. 데일리 분리 + 전용 모드 |
|---|---|---|---|
| 출시일 전체 보드 | 공정 모드, 상한 없음, 유닛·진화 배수 없음 | 데일리·스테이지 혼합 | 100게이트 상한 동점 + SOLARIS·PULSAR 편향(전용 모드까지 2~6주) |
| L7855 syncLocal 'endless' 재전송 | 서버가 endless를 best에 반영 안 함 → **무력화** | 구멍 | 클라 수정 + 빌드 8 |
| L4756 데일리→로컬 best | 무해(메뉴 표시만) | 구멍 | 클라 수정, 클라우드에 섞인 fw27_best 구분 불가 |
| 위조 상한(400G, 계산) | daily g²+5g = 162,000(올퍼펙트에 가까운 빡빡한 상한) | endless 0.4×(3g²+75g)×mul ≈ 204,000×mul까지 숨김 없이 노출 | ≤100 줄 별도 필요 |
| 출시일 리셋 | **SQL만으로 안전**(부활 경로가 'endless'라 무시) | 부활 | 신 클라 보급 후에만 |
| 빌드 8 | 불필요 | 불필요 | 필요 |
| 남는 결함 | 데일리 코스 날마다 난이도 차 → 실험 1 | 1~8 전부 | 동점·유닛 편향 |

## 채점(해결도·출시안전·난이도·악용저항·검증비용, 해결도 6 미만은 단독 권고 불가)
A 8/9/9/6/9 = **41** · 나-2 리셋(A 부속) 36 · 현상 유지 35(해결도 3 탈락) · 마-1 GC 35 · 라-1 축소 32 · 나-5 시즌 28 · 가-1 주간 27 · B 나-1 분리 26 · 라-2 c_soft 25 · 다-1 23 · 다-2 23 · 가-2 ∞ 20 · 가-3 19 · 라-4 19 · 나-3 17 · 나-4 16 · 다-3 16 · 가-4 13. 출시 후 재채점(/40): 가-1 26 = 나-5 26 > 가-2 19 → 데이터로 판정.

## 탈락 요지
B(데일리 분리): 전체가 상한 동점+유닛 편향 보드로 악화, 빌드 8 필요. 현상 유지: endless 위조·옛 161게이트 기록 남음. 라-1 축소: A에선 불필요, lbReject 부작용만. 라-2: 숨김 문제 실재 미확인(fw_bound_mul). 다-1: 상한 동점 사라짐, 테스터 고착. 다-2: 공정 모드라 대상 감소. 다-3: 클라 계산 위조, 스킬이 플레이를 바꿈. 가-2: 유닛 편향 유지·시간 예산 위험. 가-3·가-4: 서버 검증 수단 없음. 나-3·나-4: 스테이지 자기신고 위조 표면 50곳. 라-4: 가변 서브스텝으로 결정론 재생 불가(장기). 나-5: 2안의 대안 분기.

## 출시 전 확정안
- **서버 한 줄**(schema.sql fw_submit_score, "best only ever goes up"):
  ```sql
  -- best only ever goes up — from launch (2026-11) the all-time board is fair daily runs only; stage runs are capped at 100 gates
  if p_mode = 'daily' and p_score > v_row.best then
  ```
  시그니처·grant 불변(`create or replace`, 오버로드 없음). endless 제출은 계속 받음(시간 예산·속도 제한·소프트 숨김 그대로).
- **클라 변경 0, 빌드 8 불필요.** 메뉴 BEST(로컬 혼합)·전체 탭 부제 "데일리 기준"은 v1.0.1.
- **진단 SQL(읽기 전용, 대표님, 11-01 일)**:
  ```sql
  select count(*) total,
    count(*) filter (where best > 0) with_best,
    count(*) filter (where gates > 100) gates_over_100,
    count(*) filter (where best > 0 and best = daily_score) best_is_daily,
    count(*) filter (where hidden) hidden_rows,
    count(*) filter (where exists (select 1 from private.fw_testers t where t.player_id = s.player_id)) testers
  from public.fw_scores s;

  select s.nick, s.best, s.gates, s.bird, s.daily_key, s.daily_score, s.hidden,
    exists (select 1 from private.fw_testers t where t.player_id = s.player_id) tester
  from public.fw_scores s where s.best > 0 order by s.best desc limit 50;
  ```
- **보관 + 리셋(11-17 화 09:05 KST = 00:05 UTC, 데일리 리셋 직후, 서버 한 줄 적용 후)**:
  ```sql
  begin;
  create table if not exists private.fw_scores_beta as
    select player_id, nick, best, gates, bird, daily_key, daily_score, hidden, now() as archived_at from public.fw_scores;
  update public.fw_scores set best = 0 where best > 0;
  commit;
  ```
  hidden은 일괄 해제하지 않고 관리자 화면에서 개별 판단. 보관 테이블은 private(anon 비노출).
- **부활 점검(11-18 수 09:00 KST, 0이어야 정상)**:
  ```sql
  select count(*) from public.fw_scores
  where best > 0 and (daily_key is distinct from date '2026-11-17' or best > daily_score);
  ```
  0이 아니면 해당 행만 best=0. 반복되면 서버 줄에 `and v_day >= date '2026-11-17'` 추가.
- **순서**: 진단 → 추천 조건 확인 → 서버 한 줄 → 테스터 검증(데일리 런은 best 변경, 스테이지 런은 불변) → 11-10 빌드 7 그대로 제출 → 11-17 리셋 → 11-18 점검.

## 첫 30일
| 주차 | 액션 |
|---|---|
| 1주(10-31~11-07) | 대표님 진단 SQL 2개(11-01) / Claude: 추천 조건(S2542 best≥30)·데일리 재전송(day 키 ±1) 확인, 서버 한 줄 PR → 대표님 `create or replace` 실행 / 테스터 검증 2건 / 실험 1 |
| 2주(11-08~11-16) | ASC에서 GC `swishby.best` 표시명 "스테이지 최고 / Stage Best", TestFlight 점수 잔존 확인 / 빌드 7 그대로 11-10 제출 / 리셋 리허설(count만) |
| 3주(11-17~11-23) | 11-17 09:05 보관+리셋 / 11-18 부활 점검 / 실험 2·3 측정 시작 |
| 4주(11-24~11-30) | 상위 10행 수동 검토 / 11-30(월) 실험 1~3 종합 → v1.2 분기(가-1 / 나-5 / 만들지 않음) |

## 검증 실험
1. **데일리 시드 운 편차**(출시 전, 봇, 0원): 같은 봇·유닛으로 데일리 시드 30개 사망 게이트·점수 CV. CV ≤25% → A 영구 유지, 가-1은 선택 / CV >40% → 가-1 1순위 / 25~40%는 실험 2·3과 합산. (25% 검증가, 40% 판정자 판단)
2. **전체 보드 고착**(11-17~11-30): 주별 상위 50 신규 진입자 수, 첫 주 기록 비율. 2주차 신규 ≥10 → 영구 유지 / <5 또는 첫 주 비율 ≥70% → 나-5 월간 시즌화(RP 시즌 경계).
3. **전용 모드 수요**(11-17~11-30, run_end): 데일리 플레이어 중 하루 3런+ 비율, 데일리 런 비중. ≥30% & 실험 1 CV >25% → 가-1 착수(v1.2) / <15% → 전용 모드 안 만듦(문제는 유입). DAU <100이면 2주 연기(추정).

## 리스크 & 헤지
- 추천 완료 조건(best≥30)이 "데일리 30점 이상"으로 바뀜 → 서버 줄 적용 전 확인, 결정 질문 3.
- 데일리 위조(400G, ~93초 대기) 여전히 통과 → 주 1회 상위 10 수동 검토.
- day 키 ±1로 11-16 데일리 재전송 부활 → 11-18 점검, 반복 시 날짜 조건.
- 시드 운으로 "쉬운 날" 기록 고착 → 실험 1·2로 가-1/나-5 전환.
- 메뉴 BEST와 전체 탭 숫자 불일치 → v1.0.1, 그전엔 GC 표시명으로 구분.
- endless 소프트 숨김이 행 전체를 가림 → 실런 ≤0.27(S217)이라 드묾, 개별 해제.
- TestFlight GC 점수 잔존 → 11-10 전 ASC 확인.

## 대표님 결정 요청
1. 전체 랭킹을 "역대 데일리 최고(공정 모드)"로 정의하고 스테이지 런을 전체에서 빼도 되나? 스테이지 경쟁은 Game Center "스테이지 최고"에만 남는다.
2. 11-17 09:05 KST에 베타 기록을 비공개 테이블에 보관한 뒤 전체 best를 0으로 리셋해도 되나?
3. 추천 완료 조건(best≥30)이 "데일리 30점 이상"으로 바뀐다. 그대로 둘까, 같은 SQL에서 조건을 바꿀까(예: 아무 런 1회 제출)?
4. 출시 후 전용 모드(가-1 주간 / 나-5 시즌 / 안 만듦)를 11-30 데이터로 판정하는 데 동의하나?

## 근거와 한계
수치는 브리프·검증가 코드 감사와 판정자의 직접 확인(schema.sql L209–334, index.html L4744–4759, L7855). 400G 위조 상한은 식으로 계산한 값. 임계값 25%·30%는 검증가, 나머지는 판정자 판단. 실유저 분포·DAU 데이터 없음. 서버 best 갱신 줄(`if p_score > v_row.best then`)은 MC가 origin/main에서 직접 확인.
