# 전체 랭킹 전환 런북 — "역대 데일리 최고" (2026-10-31 결정)

결정(오너, 2026-10-31, 판정자 권고 수용 — `docs/plans/2026-10-31-ranking/03-judge-final.md`):
1. 전체(All-time) 랭킹 = 역대 **데일리** 최고. 스테이지 런은 전체 best에 들어가지 않는다(스테이지는 100게이트 상한). 스테이지 경쟁은 Game Center "스테이지 최고"(`swishby.best`)에 남는다.
2. 11-17(화) 09:05 KST에 베타 기록을 비공개 테이블에 보관하고 전체 best를 0으로 리셋.
3. 추천 완료 조건(스테이지 10 도달 + best ≥ 30)은 그대로 → 이제 "데일리 30점 이상"이 된다.
4. 랭킹 전용 모드(주간 랭크런 / 월간 시즌 / 만들지 않음)는 11-30(월) 데이터로 판정.

클라이언트 변경 없음 → iOS 빌드 7 그대로 11-10 제출. 모든 SQL은 Supabase SQL Editor(운영)에서 **대표님이 실행**한다.

## 진행 상황 · 자동화 (2026-10-31, 오너 지시 "스케줄표에 남기고 그 날짜에 자동 실행·보고")
| 단계 | 상태 |
|---|---|
| 1 진단 | **완료** 10-31(Claude, MCP): 47행 전부 베타 — gates>100 9행, 테스터 7, hidden 4 |
| 2 함수 교체 | **완료** 10-31(Claude, `apply_migration`) — 적용 전 운영 함수가 schema.sql과 일치함을 확인 |
| 3 확인 | **완료** 10-31: applied=true, 오버로드 1, authenticated 실행 유지·anon 없음; 롤백 블록 동작 시험(QA-C3: endless 900/60 → best 3 유지, daily 300 → best 300) |
| 4 보관+리셋 | **자동 예약**: 운영 pg_cron `fw_launch_reset` `5 0 17 11 *`(11-17 09:05 KST) → `private.fw_launch_reset()` — 2026-11-17에만, 1회만(재호출은 건너뜀), 실행 후 예약 자동 삭제. `supabase/migrations-pending/launch-reset-cron.sql` |
| 5 부활 점검 | **자동 예약**: pg_cron `fw_launch_check` `0 0 18 11 *`(11-18 09:00 KST) → `private.fw_launch_check()` — 2026-11-18에만, 되살아난 best를 0으로, 실행 후 예약 삭제 |
| 보고 | 클라우드 루틴이 공개 키로 읽기 전용 `public.fw_launch_status()`(집계만, 개인정보 없음; `launch-status-rpc.sql`)를 불러 Gmail로 보고: 11-17 09:30, 11-18 09:30, 11-30 09:00 KST(실험 2·3 판정 권고) |
| 일정표 | Google 캘린더: 11-09 10:00 GC 이름 변경, 11-17 09:05, 11-18 09:00, 11-30 09:00 |

10-31 드라이런(롤백): 다른 날짜 → 건너뜀, 11-17 → 47행 보관·리셋, 같은 날 재실행 → 건너뜀, 11-18 → 되살아난 1행 원복, 다른 날짜 → 건너뜀. 실행 기록은 `private.fw_launch_log`.
보고 메일이 안 오거나 "확인 필요"면 Claude Code에서 "리셋 실행해"(4단계) 또는 "점검 실행해"(5단계)라고 하면 수동으로 같은 함수를 실행한다. 예약 취소: `select cron.unschedule('fw_launch_reset'); select cron.unschedule('fw_launch_check');`

## 1. 진단 (읽기 전용, 11-01 일)
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
결과를 Claude에게 붙여 주면 리셋 대상과 hidden 행을 검토한다.

## 2. 서버 함수 교체 (11-07 전, 1회)
`supabase/migrations-pending/alltime-daily-best.sql` 전체를 붙여 넣고 실행. 시그니처가 같아 `create or replace`로 덮어쓰며, 기존 grant가 유지되고 오버로드가 생기지 않는다. 바뀌는 것은 한 줄:
```sql
if p_mode = 'daily' and p_score > v_row.best then
```

## 3. 적용 확인 (2 직후, 읽기 전용)
```sql
select position('p_mode = ''daily'' and p_score > v_row.best' in pg_get_functiondef('private.fw_submit_score(integer,integer,text,text,text,text,text,text)'::regprocedure)) > 0 as applied;
```
`applied = true`면 성공. 이후 테스터 계정으로 확인: 스테이지 런 후 랭킹 "전체"의 내 점수 **불변**, 데일리 런 후 데일리 점수가 더 높으면 **갱신**.

## 4. 보관 + 리셋 (11-17 화 09:05 KST = 00:05 UTC, 2 적용 후에만)
리허설(11-16까지, 읽기 전용): `select count(*) from public.fw_scores where best > 0;`
```sql
begin;
create table if not exists private.fw_scores_beta as
  select player_id, nick, best, gates, bird, daily_key, daily_score, hidden, now() as archived_at from public.fw_scores;
update public.fw_scores set best = 0 where best > 0;
commit;
```
- hidden은 일괄 해제하지 않는다(관리자 화면에서 개별 판단).
- 보관 테이블은 private 스키마라 앱(anon)에 노출되지 않는다.

## 5. 부활 점검 (11-18 수 09:00 KST, 결과 0이어야 정상)
```sql
select count(*) from public.fw_scores
where best > 0 and (daily_key is distinct from date '2026-11-17' or best > daily_score);
```
0이 아니면 해당 행만 `update public.fw_scores set best = 0 where …`(같은 조건). 반복되면 Claude에게 알려 서버 줄에 `and v_day >= date '2026-11-17'`을 추가한다.

## 6. 출시 후
- 주 1회 상위 10행 수동 검토(gates 200 초과, 짧은 간격 제출) → 이상 시 hidden.
- 11-30(월) 실험 1~3 종합 판정(판정 문서 참조). 실험 1(데일리 시드 운 편차)은 출시 전 봇으로 측정 중.
- v1.0.1: 전체 탭 부제 "데일리 기준", 메뉴 BEST 정의 정리(로컬 best는 아직 스테이지·데일리 혼합 표시).
