# SWISHBY 관리자 페이지 (admin.html)

운영자가 swishby.com을 SQL 편집기 없이 관리하는 페이지. 지금까지 `supabase/schema.sql` 주석에 적힌 "데이터베이스 소유자로 직접 실행" SQL(숨기기, 신고 정리, 테스터, 오류 로그, 추천 보류 해제, 시즌 확인, 계정 삭제 요청 처리)을 관리자 전용 서버 함수와 화면으로 옮긴다.

## 1. 보안 모델

- 페이지는 정적 파일(`/admin.html`, GitHub Pages)이다. 화면을 숨기는 것은 보안이 아니다: **모든 권한 판단은 서버 함수 안에서** 한다. 페이지 코드와 공개 키(anon/publishable key)는 누구나 볼 수 있다는 전제로 설계한다.
- 관리자 목록 `private.fw_admins (user_id uuid pk → auth.users on delete cascade, role text check in ('owner','mod'), note text, added_at timestamptz)`. RLS on, 정책 없음, API 역할에서 revoke. **API로는 추가·삭제할 수 없고** 데이터베이스 소유자가 SQL로만 넣는다:
  `insert into private.fw_admins (user_id, role, note) values ('<auth.users id>', 'owner', '대표');`
- `private.fw_admin_gate(p_role text) returns uuid`: 호출자가 (1) 로그인했고 (2) 게스트(익명) 계정이 아니며 (`auth.jwt()->>'is_anonymous'`가 true면 거부) (3) `fw_admins`에 있고 (4) `p_role = 'owner'`이면 role도 owner일 때만 `auth.uid()`를 돌려준다. 아니면 `raise exception 'fw_admin: not allowed' using errcode = '42501'`. (5) `p_role = 'owner'`이면 2단계 인증(Supabase MFA)으로 로그인한 세션이어야 한다: `auth.jwt()->>'aal'`이 `aal2`가 아니면 `raise exception 'fw_admin_mfa: second factor required' using errcode = '42501'`. 모든 관리 함수가 **첫 줄에서** 이것을 부른다.
- 역할: `mod` = 읽기 + 숨기기·닉네임 초기화·신고 정리 (관리자 계정은 대상으로 삼을 수 없음: `fw_bad_input`). `owner` = 전부(테스터, 추천 보류 해제, 시즌 정산 실행, 계정 삭제, 이메일·관리자 역할 보기, 관리자 숨기기·닉네임 초기화, 감사 로그). aal1인 owner 세션은 mod 권한만 가진다(이메일·admin_role은 null). mod 함수는 aal1로 충분하다.
- 감사 로그 `private.fw_admin_log (id bigserial, at timestamptz default now(), admin_id uuid, action text, target uuid, detail jsonb)`. **쓰기 함수는 전부 기록**하고, owner가 `admin_player`(이메일 포함)를 읽을 때도 `view_player`로 기록한다. service_role은 읽기(select)만 가능(쓰기는 관리 함수만, 수정·삭제는 아무도 못 함). admin_id는 on delete set null(관리자 계정이 지워져도 기록은 남음), target은 FK 없음(삭제된 계정도 기록에 남게).
- 함수 형식은 기존 규칙 그대로: `private.fw_admin_*` = `security definer set search_path = ''`, `public.admin_*` = `security invoker` 래퍼. private은 `revoke all … from public, anon` 후 `grant execute … to authenticated, service_role`, public은 `revoke … from public, anon` 후 `grant execute … to authenticated`. anon은 절대 못 부른다.
- 입력 검증: uuid는 타입으로, 문자열 길이·limit 상한(최대 200), 알 수 없는 값은 `fw_bad_input` (errcode `22023`).
- 화면: 사용자 데이터(닉네임, 오류 메시지, 이벤트 props)는 **`textContent`로만** 넣는다(`innerHTML` 금지). `<meta name="robots" content="noindex, nofollow">`. Supabase SDK는 게임과 같은 버전·SRI. 같은 출처라 게임에서 로그인한 세션을 그대로 쓴다.
- 파괴적 작업(계정 삭제)은 화면에서 대상 id를 다시 입력해야 하고, 서버도 `p_confirm = p_id::text`를 확인한다.

## 2. RPC 계약 (프론트·백엔드가 지키는 약속)

모두 `supabase.rpc('<이름>', {인자})`로 부른다. 반환은 jsonb. 시각은 ISO 문자열(timestamptz 그대로), 날짜는 `YYYY-MM-DD`.

| 함수 | 역할 | 인자 | 반환 |
| --- | --- | --- | --- |
| `admin_me` | 누구나(로그인) | — | `{admin: bool, role: 'owner'\|'mod'\|null, aal: 'aal1'\|'aal2'\|null}`. 예외 없이 답한다 (화면 분기용). owner인데 aal이 `aal2`가 아니면 화면이 2단계 인증을 요청한다 |
| `admin_overview` | mod | — | `{users:{total, guests, signed_in, new_1d, new_7d}, players:{scores, versus, hidden}, season:{season, prev, rolled_at}, reports:{open_targets, last_1d}, errors:{last_1d}, push:{devices}, testers:{count}, admins:{count}, cron:[{job, schedule, active, last_status, last_at}] }` — cron은 pg_cron이 없으면 `[]` |
| `admin_kpi` | mod | `p_days int` (1..120, 기본 30) | `{installs:[{day, installs}], retention:[{day, installs, d1, d7, d30}], daily:[{day, dau, runs_per_dau, share_rate, purchase_conversion, ad_views, daily_runs}], sessions:[{day, sessions, avg_min, median_min}]}` — `supabase/checks/kpi.sql`과 같은 정의(Asia/Seoul 날짜, 끝나지 않은 날의 D-n은 null), 최근 p_days일, 날짜 내림차순 |
| `admin_players` | mod | `p_q text` (닉네임 부분일치, 또는 uuid 정확히), `p_limit int` (1..200, 기본 50), `p_offset int` (≥0) | `{total, rows:[{id, nick, cc, best, rp, hidden, guest, provider, created_at, last_sign_in_at, reports}]}` — p_q가 비면 최근 가입순. `reports` = 이 플레이어가 받은 신고 수 |
| `admin_player` | mod | `p_id uuid` | `{id, guest, provider, email (owner만, mod는 null), created_at, last_sign_in_at, tester, admin_role, scores:{nick, cc, best, gates, bird, daily_key, daily_score, hidden, last_submit_at}\|null, versus:{nick, rp, wins, losses, draws, hidden}\|null, standings:[{season, rank, rp, tier, claimed_at}], save:{rev, updated_at}\|null, reports_received:[{reason, place, nick, seen, at}], reports_sent: int, referrals:{invited: int, held: int}, push_devices: int, events:[{at, kind, props}] (최근 20), errors:[{at, build, msg}] (최근 10)}`. 없는 id는 `fw_bad_input` |
| `admin_set_hidden` | mod | `p_id uuid, p_hidden bool` | `{id, hidden}` — fw_scores, fw_versus 둘 다. 로그 `hide`/`unhide` |
| `admin_reset_nick` | mod | `p_id uuid` | `{id, nick:'Pilot'}` — fw_scores, fw_versus, 현재 시즌 fw_vs_standing의 nick을 `Pilot`으로. 임의 이름 지정은 없음. 로그 `reset_nick` (detail에 이전 이름) |
| `admin_reports` | mod | `p_limit int` (1..200, 기본 100) | `[{target, nick, reason, n, counted, last, places:[..], hidden}]` — target·reason별 묶음, 최근순. `counted` = 자동 숨김에 세는 신고 수(fw_report와 같은 조건) |
| `admin_reports_clear` | mod | `p_target uuid, p_reason text` ('name'\|'cheat'\|'other'\|'all') | `{deleted: int}`. 로그 `reports_clear` |
| `admin_testers` | owner | — | `[{id, nick, note, added_at}]` |
| `admin_tester_set` | owner | `p_id uuid, p_on bool, p_note text` (≤100) | `{id, tester: bool}`. 로그 `tester_on`/`tester_off` |
| `admin_errors` | mod | `p_limit int` (1..200, 기본 50) | `[{id, at, player_id, build, msg, stack(앞 500자), url, ua}]` 최근순 |
| `admin_referrals_held` | owner | — | `[{invitee, inviter, inviter_nick, invitee_nick, invitee_best, linked_at, days, stage}]` (held = true) |
| `admin_referral_release` | owner | `p_inviter uuid` | `{released: int}` — 그 초대자의 held 해제. 로그 `ref_release` |
| `admin_season` | mod | — | `{season, prev, rolled_at, top:[{rank, nick, rp, tier, claimed_at}] (지난 시즌 상위 10), live:[{nick, rp, wins, losses}] (이번 시즌 RP 상위 10, 숨김 제외)}` |
| `admin_season_tick` | owner | — | `{season}` — `private.fw_vs_tick()` 호출(정산이 필요하면 실행, 아니면 아무 일 없음). 로그 `season_tick` |
| `admin_delete_player` | owner | `p_id uuid, p_confirm text` | `{deleted: bool}` — `p_confirm <> p_id::text`면 `fw_bad_input`. 자기 자신·다른 관리자는 삭제 불가(`fw_bad_input`). `auth.users` 삭제(연결 데이터는 cascade). 로그 `delete_player` (detail에 닉네임) |
| `admin_log` | owner | `p_limit int` (1..200, 기본 100) | `[{at, admin_id, admin_nick, action, target, detail}]` 최근순 |

## 3. 화면 (admin.html)

- 로그인 전: "관리자 로그인" — Google, Apple, 이메일 코드(`signInWithOtp` + `verifyOtp`, `shouldCreateUser: false`). 게스트 로그인 없음. 게임에서 이미 로그인했다면 바로 진행.
- 로그인 후 `admin_me`가 false면 "권한 없음"과 로그아웃 버튼만.
- 탭: 개요 · 지표 · 플레이어 · 신고 · 시즌 · 오류 · 테스터(owner) · 추천(owner) · 기록(owner). owner 전용 탭은 mod에게 보이지 않는다(서버도 막음).
- 플레이어: 검색 → 목록 → 상세(위 `admin_player` 전부) → 숨기기/해제, 닉네임 초기화, (owner) 테스터 지정, (owner) 계정 삭제(id 재입력).
- 신고: 묶음 목록 → 대상 상세로 이동, 숨기기, 신고 정리.
- 한국어 UI, 모바일 폭(360px)에서도 쓸 수 있게.
- 순수 로직은 `/* admin:start */ … /* admin:end */` 블록(입력 검증, 표시 형식, 탭 권한)으로 분리해 node 테스트.

## 4. 검증

- `tests/admin-sql.test.js`: 모든 `private.fw_admin_*`가 security definer + `search_path = ''` + 첫 문장에서 `fw_admin_gate` 호출(admin_me 제외), revoke/grant 형식, `fw_admins`·`fw_admin_log` RLS·revoke, 쓰기 함수마다 `fw_admin_log` insert.
- `supabase/rehearsal/admin.sql`: 비로그인·게스트·일반 사용자·mod·owner 각각으로 모든 함수 호출 → 허용/거부가 표와 같은지, 쓰기 결과와 로그 행, 삭제 확인 문자열, 자기 삭제 거부.
- `tests/admin.test.js`: 순수 블록, noindex, SRI, innerHTML 미사용, owner 탭 분기, CSP 해시. admin.html의 인라인 스크립트를 고치면 `node scripts/admin-csp.mjs admin.html`로 CSP 해시를 다시 넣는다.
- `tests/e2e/admin-smoke.mjs`: 가짜 백엔드로 로그인 상태 → 각 탭 렌더, `<img src=x onerror=…>` 닉네임이 글자로만 보이는지, 권한 없음 화면.
- 운영 적용: 마이그레이션(MCP) → 대표 계정을 owner로 등록 → 실제 페이지에서 확인.

## 5. 운영 적용 순서 (2단계 인증)

1. `schema.sql`의 ADMIN 부분을 운영 DB에 적용.
2. owner 등록: `insert into private.fw_admins (user_id, role, note) values ('<auth.users id>', 'owner', '대표');`
3. **바로** owner가 https://swishby.com/admin.html 에 로그인해 인증 앱(Google Authenticator 등)으로 2단계 인증을 등록한다. 등록 전에는 owner의 메일함을 가진 사람이 먼저 자기 인증기를 등록할 수 있으므로 미루지 않는다.
4. 확인: `select status from auth.mfa_factors where user_id = '<owner id>';` → verified 1개.
5. 인증기를 잃어버리면: 데이터베이스 소유자가 `delete from auth.mfa_factors where user_id = '<owner id>';` 후 3번을 다시 한다.

Supabase 설정: Authentication › Multi-Factor에서 TOTP가 켜져 있어야 하고(2026-10-22 켜짐 확인), Redirect URLs에 `https://swishby.com/**`가 있어야 한다(있음). "AAL1 세션 제한"은 게임 플레이어 세션에도 걸리므로 켜지 않는다.
