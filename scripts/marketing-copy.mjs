// Copy and plans for the marketing scripts: short-video hooks, end-card lines, store captions, the clip plan.
// Pure (no browser, no files) so tests/shorts.test.js can cover it.

export const LANGS = ['en', 'ko', 'ja', 'es', 'pt', 'id'];

// Scenes a short can show. units / stages are pools the plan rotates through (stage is 0-based; 12 / 27 / 42 sit in zones 2 / 3 / 4).
// len: seconds of footage before the end card. edge: how tight the autopilot rides a gate's lower edge (px, default 12). want: what a dry run must show before the clip is recorded (see sceneOk).
// offAt: the autopilot lets go at that run time, so a challenge clip ends on a real crash and the result card.
export const SCENES = {
  combo:  { units: ['volt', 'mochi', 'blitz'], stages: [0, 3, 7], len: 10.5, want: { combo: 5 } },
  fever:  { units: ['solaris', 'phoenix'], stages: [2, 12], len: 10.5, want: { fever: 1 } },
  dash:   { units: ['zero', 'titan'], stages: [5, 14, 30], len: 10, want: { dashes: 2 } },
  save:   { units: ['aegis', 'titan'], stages: [8, 13], len: 10.5, edge: 4, want: { saves: 1 } },
  record: { units: ['neko', 'pixel', 'buzz'], stages: [1, 9], len: 10.5, want: { record: 1 } },
  daily:  { units: ['volt', 'kraken', 'specter'], daily: true, len: 10.5, want: { alive: 8 } },
  zone:   { units: ['oracle', 'raijin', 'chrono', 'goliath'], stages: [12, 27, 42], len: 10.5, want: { alive: 8 } },
  skill:  { units: ['raijin', 'goliath', 'kraken', 'chrono'], stages: [4, 16], len: 10.5, want: { casts: 1 } },
  ult:    { units: ['pulsar', 'solaris'], stages: [6, 18], len: 12, want: { ult: 1 } },
  beat:   { units: ['volt', 'blitz', 'zero', 'mochi'], stages: [0, 2, 10], len: 13, edge: 10, offAt: 9, want: { death: [6, 11], score: 15 } },
};
export const SCENE_ORDER = ['combo', 'fever', 'dash', 'save', 'record', 'daily', 'zone', 'skill', 'ult', 'beat'];

// Hook lines shown over the first seconds. {n}: the clip's final score · {z}: zone number. No made-up statistics.
export const HOOKS = {
  en: {
    combo: ['Skim the edge. Keep the combo.', 'How close can you cut it?', 'Every near miss pays'],
    fever: ['Chain it and it catches FIRE', 'FEVER = double points'],
    dash: ['Meter full? Go straight through.', 'Walls are optional'],
    save: ['That was WAY too close', 'One shield. One second.'],
    record: ['Watch the record fall', 'New best incoming...'],
    daily: ['Same course for the whole world today', 'Today\'s daily run. Your move.'],
    zone: ['Zone {z}. It only gets faster.', 'Welcome to zone {z}'],
    skill: ['Every unit has its own trick', 'Wait for the skill...'],
    ult: ['Ultimate ready. Watch this.', 'This is what an ULT looks like'],
    beat: ['Can you beat {n}?', 'Beat {n}. I dare you.'],
  },
  ko: {
    combo: ['아슬아슬하게 스쳐서 콤보 유지', '얼마나 가깝게 스칠 수 있어?', '니어미스 하나하나가 점수'],
    fever: ['콤보를 이으면 불이 붙는다', '피버 = 점수 2배'],
    dash: ['게이지 꽉 찼다? 그대로 뚫어', '벽은 장식일 뿐'],
    save: ['방금 진짜 위험했다', '실드 하나로 살았다'],
    record: ['기록 깨지는 순간', '최고 기록 갱신 각...'],
    daily: ['오늘은 전 세계가 같은 코스', '오늘의 챌린지, 네 차례'],
    zone: ['존 {z}. 점점 빨라진다', '존 {z}에 온 걸 환영해'],
    skill: ['유닛마다 고유 스킬이 있다', '스킬 터지는 거 봐...'],
    ult: ['궁극기 준비 완료. 봐봐', '궁극기는 이렇게 쓰는 것'],
    beat: ['{n}점, 이길 수 있어?', '{n}점 넘기면 인정'],
  },
  ja: {
    combo: ['ギリギリをかすめてコンボ継続', 'どこまで攻められる?', 'ニアミスがそのままスコアに'],
    fever: ['つなげ続けるとフィーバー', 'フィーバー中はスコア2倍'],
    dash: ['ゲージ満タン? そのまま突き抜けろ', '壁なんて関係ない'],
    save: ['今のはマジで危なかった', 'シールド1枚で生還'],
    record: ['記録が塗り替わる瞬間', 'ハイスコア更新の予感...'],
    daily: ['今日は全世界が同じコース', '今日のデイリー、君の番'],
    zone: ['ゾーン{z}。ここから加速する', 'ゾーン{z}へようこそ'],
    skill: ['ユニットごとに固有スキル', 'スキル発動を見逃すな...'],
    ult: ['必殺技チャージ完了。見てて', 'これが必殺技だ'],
    beat: ['{n}点、超えられる?', '{n}点を超えてみな'],
  },
  es: {
    combo: ['Roza el borde. Mantén el combo.', '¿Hasta dónde te atreves a rozar?', 'Cada roce suma'],
    fever: ['Encadénalo y se prende FUEGO', 'FIEBRE = puntos dobles'],
    dash: ['¿Barra llena? Atraviésalo.', 'Las paredes son opcionales'],
    save: ['Eso estuvo DEMASIADO cerca', 'Un escudo. Un segundo.'],
    record: ['Mira cómo cae el récord', 'Nuevo récord en camino...'],
    daily: ['Hoy, el mismo recorrido para todo el mundo', 'El reto diario de hoy. Te toca.'],
    zone: ['Zona {z}. Solo va más rápido.', 'Bienvenido a la zona {z}'],
    skill: ['Cada unidad tiene su truco', 'Espera la habilidad...'],
    ult: ['Definitiva lista. Mira esto.', 'Así se ve una DEFINITIVA'],
    beat: ['¿Puedes superar {n}?', 'Supera {n}. Te reto.'],
  },
  pt: {
    combo: ['Raspe a borda. Segure o combo.', 'Até onde você tem coragem de raspar?', 'Cada quase-batida vale ponto'],
    fever: ['Encadeie e pega FOGO', 'FEBRE = pontos em dobro'],
    dash: ['Barra cheia? Atravesse direto.', 'Paredes são opcionais'],
    save: ['Essa foi PERTO DEMAIS', 'Um escudo. Um segundo.'],
    record: ['Olha o recorde caindo', 'Novo recorde chegando...'],
    daily: ['Hoje é o mesmo percurso pro mundo todo', 'O desafio de hoje. Sua vez.'],
    zone: ['Zona {z}. Só fica mais rápido.', 'Bem-vindo à zona {z}'],
    skill: ['Cada unidade tem seu truque', 'Espera a habilidade...'],
    ult: ['Ultimate pronta. Olha isso.', 'É assim que se usa uma ULT'],
    beat: ['Consegue passar de {n}?', 'Passe de {n}. Duvido.'],
  },
  id: {
    combo: ['Lewati setipis mungkin. Jaga combo.', 'Seberapa tipis kamu berani?', 'Tiap nyaris kena = poin'],
    fever: ['Sambung terus sampai TERBAKAR', 'FEVER = poin dobel'],
    dash: ['Meteran penuh? Tembus saja.', 'Tembok itu opsional'],
    save: ['Barusan itu TIPIS banget', 'Satu perisai. Satu detik.'],
    record: ['Lihat rekornya pecah', 'Rekor baru sebentar lagi...'],
    daily: ['Hari ini satu dunia, satu rute', 'Tantangan harian. Giliranmu.'],
    zone: ['Zona {z}. Makin lama makin cepat.', 'Selamat datang di zona {z}'],
    skill: ['Tiap unit punya jurus sendiri', 'Tunggu skill-nya...'],
    ult: ['Ultimate siap. Lihat ini.', 'Begini rasanya ULT'],
    beat: ['Bisa kalahkan {n}?', 'Kalahkan {n}. Berani?'],
  },
};

// End card (last 1.5 s): the line under the logo, and the challenge line on a "beat" clip.
export const END_LINE = { en: 'Play free at swishby.com', ko: '무료로 플레이 · swishby.com', ja: '無料でプレイ · swishby.com', es: 'Juega gratis en swishby.com', pt: 'Jogue grátis em swishby.com', id: 'Main gratis di swishby.com' };
export const END_BEAT = { en: 'Your turn: beat {n}', ko: '이제 네 차례: {n}점', ja: '次は君の番: {n}点', es: 'Te toca: supera {n}', pt: 'Sua vez: passe de {n}', id: 'Giliranmu: kalahkan {n}' };

// Store screenshots: six shots in this order, each with a big caption line and a short sub line.
export const SHOTS = ['title', 'combo', 'dash', 'roster', 'daily', 'versus'];
export const CAPTIONS = {
  en: {
    title: ['One tap. Pure flow.', 'Free to play, right in your browser'],
    combo: ['Skim the gates. Chain the combo.', 'Near misses score the most'],
    dash: ['Fill the meter. Dash through walls.', 'Hit FEVER for double points'],
    roster: ['20 units, 20 skills', 'Find the one that fits your style'],
    daily: ['A new course every day', 'Same run for the whole world'],
    versus: ['Race your friends live', '1v1, 2v2 and 4-player free-for-all'],
  },
  ko: {
    title: ['탭 한 번, 끝없는 몰입', '설치 없이 바로 무료 플레이'],
    combo: ['아슬아슬 스치고, 콤보를 이어라', '가깝게 스칠수록 점수가 커진다'],
    dash: ['게이지를 채우고 벽을 뚫어라', '피버 타임엔 점수 2배'],
    roster: ['20개 유닛, 20가지 스킬', '내 플레이에 맞는 기체를 찾아라'],
    daily: ['매일 새로운 코스', '전 세계가 같은 코스로 겨룬다'],
    versus: ['친구와 실시간 레이스', '1:1, 2:2, 4인 난투'],
  },
  ja: {
    title: ['ワンタップで、極上の爽快感', 'ブラウザですぐ無料プレイ'],
    combo: ['ギリギリをかすめて、コンボをつなげ', 'ニアミスほど高得点'],
    dash: ['ゲージをためて、壁をぶち抜け', 'フィーバー中はスコア2倍'],
    roster: ['20機のユニット、20のスキル', '自分に合う機体を見つけよう'],
    daily: ['毎日、新しいコース', '全世界が同じコースで勝負'],
    versus: ['フレンドとリアルタイム対戦', '1対1、2対2、4人バトル'],
  },
  es: {
    title: ['Un toque. Flujo total.', 'Gratis y al instante en tu navegador'],
    combo: ['Roza las puertas. Encadena el combo.', 'Cuanto más cerca, más puntos'],
    dash: ['Llena la barra. Atraviesa muros.', 'Entra en FIEBRE: puntos dobles'],
    roster: ['20 unidades, 20 habilidades', 'Encuentra la que va con tu estilo'],
    daily: ['Un recorrido nuevo cada día', 'El mismo reto para todo el mundo'],
    versus: ['Compite con amigos en vivo', '1 contra 1, 2 contra 2 y todos contra todos'],
  },
  pt: {
    title: ['Um toque. Puro fluxo.', 'Grátis e na hora, no navegador'],
    combo: ['Raspe os portões. Encadeie o combo.', 'Quanto mais perto, mais pontos'],
    dash: ['Encha a barra. Atravesse paredes.', 'Entre na FEBRE: pontos em dobro'],
    roster: ['20 unidades, 20 habilidades', 'Ache a que combina com seu estilo'],
    daily: ['Um percurso novo todo dia', 'O mesmo desafio pro mundo inteiro'],
    versus: ['Corra contra amigos ao vivo', '1x1, 2x2 e todos contra todos'],
  },
  id: {
    title: ['Satu ketuk. Langsung asyik.', 'Gratis, langsung main di browser'],
    combo: ['Lewati gerbang setipis mungkin. Sambung combo.', 'Makin tipis, makin besar poinnya'],
    dash: ['Isi meteran. Tembus tembok.', 'Masuk FEVER untuk poin dobel'],
    roster: ['20 unit, 20 skill', 'Temukan yang cocok dengan gayamu'],
    daily: ['Rute baru setiap hari', 'Satu tantangan untuk seluruh dunia'],
    versus: ['Balapan langsung dengan teman', '1v1, 2v2, dan 4 pemain bebas'],
  },
};

/** mulberry32: the same small seeded generator the game uses. */
export function mulberry32(a) {
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** `--key=value` / `--flag` arguments over defaults; numbers stay numbers. */
export function parseArgs(argv, defaults) {
  const out = { ...defaults };
  for (const a of argv) {
    const m = /^--([\w-]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    const [, k, v] = m, d = defaults[k];
    out[k] = v == null ? true : typeof d === 'number' ? Number(v) : v;
  }
  return out;
}

export const fill = (s, vars = {}) => s.replace(/\{(\w+)\}/g, (all, k) => (vars[k] != null ? String(vars[k]) : all));

/** The hook for clip i of a scene, in lang (English when the language or scene has none). */
export function hookFor(lang, scene, i, vars) {
  const list = (HOOKS[lang] && HOOKS[lang][scene]) || HOOKS.en[scene];
  if (!list) throw new Error(`no hook for scene ${scene}`);
  return fill(list[i % list.length], vars);
}

/**
 * The clip plan: count clips cycling through SCENE_ORDER, each with a unit and stage from its scene's pools.
 * The seed shuffles which pool entry each clip takes and gives every clip its own run seed.
 */
export function scenePlan(count, seed) {
  const r = mulberry32(seed >>> 0), plan = [];
  for (let i = 0; i < count; i++) {
    const scene = SCENE_ORDER[i % SCENE_ORDER.length], s = SCENES[scene], round = Math.floor(i / SCENE_ORDER.length);
    const pick = list => list[(round + Math.floor(r() * list.length)) % list.length];
    plan.push({ i, scene, unit: pick(s.units), stage: s.daily ? null : pick(s.stages), daily: !!s.daily, len: s.len, runSeed: (seed * 1000 + i * 37 + 1) >>> 0, hook: round });
  }
  return plan;
}

export const zoneOf = stage => (stage == null ? 1 : stage < 10 ? 1 : stage < 25 ? 2 : stage < 40 ? 3 : 4);

/**
 * Did a dry run show what the scene wants? trace: one entry per video frame {t, state, score, combo, tier, shields, dash, ultLive, skill, best}.
 * Returns {ok, stats}: stats are what the manifest and the hook use.
 */
export function sceneOk(want, trace, fps = 30) {
  const st = { deathAt: null, maxCombo: 0, fever: 0, dashes: 0, saves: 0, casts: 0, ult: 0, record: 0, score: 0 };
  for (let k = 0; k < trace.length; k++) {
    const f = trace[k], p = trace[k - 1];
    if (st.deathAt == null && f.state !== 'play') st.deathAt = k / fps;
    if (st.deathAt != null) continue;
    st.score = f.score; st.maxCombo = Math.max(st.maxCombo, f.combo);
    if (f.tier === 2) st.fever = 1;
    if (f.ultLive) st.ult = 1;
    if (f.record) st.record = 1;
    if (p && p.state === 'play') {
      if (f.dash < p.dash - .5) st.dashes++;   // a frame is two sim ticks: a full meter can fill and be spent inside one, so read the drop
      if (f.shields < p.shields) st.saves++;
      if (f.skill < p.skill - .25) st.casts++;
    }
  }
  if (st.deathAt == null) st.score = trace.length ? trace[trace.length - 1].score : 0;
  const alive = st.deathAt == null ? trace.length / fps : st.deathAt;
  const ok = (want.combo == null || st.maxCombo >= want.combo) && (want.fever == null || st.fever) && (want.dashes == null || st.dashes >= want.dashes)
    && (want.saves == null || st.saves >= want.saves) && (want.casts == null || st.casts >= want.casts) && (want.ult == null || st.ult)
    && (want.record == null || st.record) && (want.alive == null || alive >= want.alive) && (want.score == null || st.score >= want.score)
    && (want.death == null ? alive >= 6 : st.deathAt != null && st.deathAt >= want.death[0] && st.deathAt <= want.death[1]);
  return { ok, stats: { ...st, alive } };
}

/** Footage length in seconds: the scene length, cut 2.5 s after a death (the result card), never under 6.5 s. */
export function clipLen(len, deathAt) {
  return Math.max(6.5, deathAt == null ? len : Math.min(len, deathAt + 2.5));
}
