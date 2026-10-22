// Copy and plans for the marketing scripts: short-video hooks, end-card lines, store captions, the clip plan.
// Pure (no browser, no files) so tests/shorts.test.js can cover it.

export const LANGS = ['en', 'ko', 'ja', 'es', 'pt', 'id', 'fr', 'de', 'vi', 'th', 'hi', 'zh'];

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
  fr: {
    combo: ['Frôlez le bord. Gardez le combo.', 'Jusqu\'où oserez-vous frôler ?', 'Chaque frôlement rapporte'],
    fever: ['Enchaînez et tout PREND FEU', 'FIÈVRE = points doublés'],
    dash: ['Jauge pleine ? Traversez tout.', 'Les murs sont facultatifs'],
    save: ['C\'était BEAUCOUP trop juste', 'Un bouclier. Une seconde.'],
    record: ['Regardez le record tomber', 'Nouveau record en approche...'],
    daily: ['Le même parcours pour le monde entier', 'Le défi du jour. À vous.'],
    zone: ['Zone {z}. Ça ne fait qu\'accélérer.', 'Bienvenue en zone {z}'],
    skill: ['Chaque unité a sa botte secrète', 'Attendez la compétence...'],
    ult: ['Ultime prête. Regardez ça.', 'Voilà à quoi ressemble un ULTIME'],
    beat: ['Vous battez {n} ?', 'Battez {n}. Chiche ?'],
  },
  de: {
    combo: ['Kante streifen. Combo halten.', 'Wie knapp traust du dich?', 'Jeder Beinahe-Treffer zählt'],
    fever: ['Ketten, bis es BRENNT', 'FIEBER = doppelte Punkte'],
    dash: ['Leiste voll? Einfach durch.', 'Wände sind optional'],
    save: ['Das war VIEL zu knapp', 'Ein Schild. Eine Sekunde.'],
    record: ['Gleich fällt der Rekord', 'Neuer Bestwert im Anflug...'],
    daily: ['Heute fliegt die ganze Welt dieselbe Strecke', 'Die Tages-Challenge. Du bist dran.'],
    zone: ['Zone {z}. Ab hier wird es schneller.', 'Willkommen in Zone {z}'],
    skill: ['Jede Einheit hat ihren eigenen Trick', 'Warte auf den Skill...'],
    ult: ['Ultimate bereit. Schau her.', 'So sieht ein ULT aus'],
    beat: ['Schaffst du mehr als {n}?', 'Schlag {n}. Trau dich.'],
  },
  vi: {
    combo: ['Bay sát mép. Giữ combo.', 'Bạn dám bay sát đến mức nào?', 'Mỗi lần suýt chạm là có điểm'],
    fever: ['Nối chuỗi là BÙNG CHÁY', 'CƠN SỐT = nhân đôi điểm'],
    dash: ['Đầy thanh? Lướt thẳng qua.', 'Tường chỉ để trang trí'],
    save: ['Vừa rồi SUÝT nữa thì toang', 'Một khiên. Một giây.'],
    record: ['Xem kỷ lục bị phá', 'Sắp có kỷ lục mới...'],
    daily: ['Hôm nay cả thế giới chung một đường bay', 'Thử thách hôm nay. Đến lượt bạn.'],
    zone: ['Khu {z}. Càng lúc càng nhanh.', 'Chào mừng đến khu {z}'],
    skill: ['Mỗi chiến cơ một chiêu riêng', 'Chờ kỹ năng nhé...'],
    ult: ['Tuyệt chiêu sẵn sàng. Xem này.', 'Tuyệt chiêu trông thế này đây'],
    beat: ['Vượt được {n} không?', 'Vượt {n} đi. Dám không?'],
  },
  th: {
    combo: ['เฉียดขอบ รักษาคอมโบ', 'กล้าเฉียดได้แค่ไหน?', 'เฉียดทุกครั้งได้แต้ม'],
    fever: ['ต่อคอมโบจนไฟลุก', 'FEVER = แต้มคูณสอง'],
    dash: ['เกจเต็มแล้ว? ทะลุไปเลย', 'กำแพงไม่ใช่ปัญหา'],
    save: ['เมื่อกี้เฉียดฉิวสุดๆ', 'โล่เดียว รอดในวินาทีเดียว'],
    record: ['มาดูการทำลายสถิติ', 'สถิติใหม่กำลังมา...'],
    daily: ['วันนี้ทั้งโลกบินด่านเดียวกัน', 'ชาเลนจ์วันนี้ ตาคุณแล้ว'],
    zone: ['โซน {z} ยิ่งไปยิ่งเร็ว', 'ยินดีต้อนรับสู่โซน {z}'],
    skill: ['ทุกยูนิตมีไม้ตายของตัวเอง', 'รอดูสกิล...'],
    ult: ['อัลติพร้อมแล้ว ดูนี่', 'นี่แหละอัลติเมต'],
    beat: ['ทำได้เกิน {n} ไหม?', 'เกิน {n} ให้ได้ กล้าไหม?'],
  },
  hi: {
    combo: ['किनारे से सटकर निकलें, कॉम्बो बनाए रखें', 'कितने करीब से निकल सकते हैं?', 'हर नियर-मिस पर पॉइंट'],
    fever: ['कॉम्बो जोड़ते जाएँ और आग लगा दें', 'FEVER = डबल पॉइंट'],
    dash: ['मीटर फुल? सीधे पार निकलें', 'दीवारें बस नाम की हैं'],
    save: ['ये तो बाल-बाल बचे', 'एक शील्ड। एक सेकंड।'],
    record: ['देखिए रिकॉर्ड टूटते हुए', 'नया बेस्ट आने वाला है...'],
    daily: ['आज पूरी दुनिया का एक ही कोर्स', 'आज का डेली चैलेंज। आपकी बारी।'],
    zone: ['ज़ोन {z}। यहाँ से रफ़्तार और तेज़।', 'ज़ोन {z} में स्वागत है'],
    skill: ['हर यूनिट की अपनी खास चाल', 'स्किल का इंतज़ार करें...'],
    ult: ['अल्टीमेट तैयार। ये देखिए।', 'ऐसा दिखता है ULT'],
    beat: ['क्या आप {n} से आगे जा सकते हैं?', '{n} को हराकर दिखाइए'],
  },
  zh: {
    combo: ['擦边飞过，连击不断', '你敢贴多近？', '每次擦边都有分'],
    fever: ['连击不断，直接燃起来', '狂热时刻 = 双倍得分'],
    dash: ['能量满了？直接冲过去', '墙壁只是摆设'],
    save: ['刚才真的太险了', '一面护盾，一秒生还'],
    record: ['看纪录被刷新', '新纪录马上就来...'],
    daily: ['今天全世界同一条赛道', '今日挑战，轮到你了'],
    zone: ['区域{z}，越飞越快', '欢迎来到区域{z}'],
    skill: ['每台机体都有独门绝技', '等技能放出来...'],
    ult: ['大招就绪，看好了', '这就是大招'],
    beat: ['你能超过{n}分吗？', '超过{n}分，敢来吗？'],
  },
};

// End card (last 1.5 s): the line under the logo, and the challenge line on a "beat" clip.
export const END_LINE = { en: 'Play free at swishby.com', ko: '무료로 플레이 · swishby.com', ja: '無料でプレイ · swishby.com', es: 'Juega gratis en swishby.com', pt: 'Jogue grátis em swishby.com', id: 'Main gratis di swishby.com',
  fr: 'Jouez gratuitement sur swishby.com', de: 'Kostenlos spielen auf swishby.com', vi: 'Chơi miễn phí tại swishby.com', th: 'เล่นฟรีที่ swishby.com', hi: 'swishby.com पर मुफ़्त खेलें', zh: '免费畅玩 · swishby.com' };
export const END_BEAT = { en: 'Your turn: beat {n}', ko: '이제 네 차례: {n}점', ja: '次は君の番: {n}点', es: 'Te toca: supera {n}', pt: 'Sua vez: passe de {n}', id: 'Giliranmu: kalahkan {n}',
  fr: 'À vous : battez {n}', de: 'Du bist dran: schlag {n}', vi: 'Đến lượt bạn: vượt {n}', th: 'ตาคุณแล้ว: ทำให้ได้เกิน {n}', hi: 'अब आपकी बारी: {n} को हराएँ', zh: '轮到你了：超过{n}分' };

// Store screenshots: six shots in this order, each with a big caption line and a short sub line.
export const SHOTS = ['title', 'combo', 'dash', 'roster', 'daily', 'versus'];
export const CAPTIONS = {
  en: {
    title: ['One tap. Pure flow.', 'Free to play. Tap and go.'],
    combo: ['Skim the gates. Chain the combo.', 'Near misses score the most'],
    dash: ['Fill the meter. Dash through walls.', 'Hit FEVER for double points'],
    roster: ['20 units, 20 skills', 'Find the one that fits your style'],
    daily: ['A new course every day', 'Same run for the whole world'],
    versus: ['Race your friends live', '1v1, 2v2 and 4-player free-for-all'],
  },
  ko: {
    title: ['탭 한 번, 끝없는 몰입', '무료, 탭 한 번이면 바로 시작'],
    combo: ['아슬아슬 스치고, 콤보를 이어라', '가깝게 스칠수록 점수가 커진다'],
    dash: ['게이지를 채우고 벽을 뚫어라', '피버 타임엔 점수 2배'],
    roster: ['20개 유닛, 20가지 스킬', '내 플레이에 맞는 기체를 찾아라'],
    daily: ['매일 새로운 코스', '전 세계가 같은 코스로 겨룬다'],
    versus: ['친구와 실시간 레이스', '1:1, 2:2, 4인 난투'],
  },
  ja: {
    title: ['ワンタップで、極上の爽快感', '無料、タップですぐプレイ'],
    combo: ['ギリギリをかすめて、コンボをつなげ', 'ニアミスほど高得点'],
    dash: ['ゲージをためて、壁をぶち抜け', 'フィーバー中はスコア2倍'],
    roster: ['20機のユニット、20のスキル', '自分に合う機体を見つけよう'],
    daily: ['毎日、新しいコース', '全世界が同じコースで勝負'],
    versus: ['フレンドとリアルタイム対戦', '1対1、2対2、4人バトル'],
  },
  es: {
    title: ['Un toque. Flujo total.', 'Gratis. Toca y a jugar.'],
    combo: ['Roza las puertas. Encadena el combo.', 'Cuanto más cerca, más puntos'],
    dash: ['Llena la barra. Atraviesa muros.', 'Entra en FIEBRE: puntos dobles'],
    roster: ['20 unidades, 20 habilidades', 'Encuentra la que va con tu estilo'],
    daily: ['Un recorrido nuevo cada día', 'El mismo reto para todo el mundo'],
    versus: ['Compite con amigos en vivo', '1 contra 1, 2 contra 2 y todos contra todos'],
  },
  pt: {
    title: ['Um toque. Puro fluxo.', 'Grátis. Toque e jogue.'],
    combo: ['Raspe os portões. Encadeie o combo.', 'Quanto mais perto, mais pontos'],
    dash: ['Encha a barra. Atravesse paredes.', 'Entre na FEBRE: pontos em dobro'],
    roster: ['20 unidades, 20 habilidades', 'Ache a que combina com seu estilo'],
    daily: ['Um percurso novo todo dia', 'O mesmo desafio pro mundo inteiro'],
    versus: ['Corra contra amigos ao vivo', '1x1, 2x2 e todos contra todos'],
  },
  id: {
    title: ['Satu ketuk. Langsung asyik.', 'Gratis, sekali ketuk langsung main'],
    combo: ['Lewati gerbang setipis mungkin. Sambung combo.', 'Makin tipis, makin besar poinnya'],
    dash: ['Isi meteran. Tembus tembok.', 'Masuk FEVER untuk poin dobel'],
    roster: ['20 unit, 20 skill', 'Temukan yang cocok dengan gayamu'],
    daily: ['Rute baru setiap hari', 'Satu tantangan untuk seluruh dunia'],
    versus: ['Balapan langsung dengan teman', '1v1, 2v2, dan 4 pemain bebas'],
  },
  fr: {
    title: ['Un tap. Fluidité totale.', 'Gratuit. Touchez et jouez.'],
    combo: ['Frôlez les portes. Enchaînez les combos.', 'Plus c\'est juste, plus ça rapporte'],
    dash: ['Remplissez la jauge. Traversez les murs.', 'Passez en FIÈVRE : points doublés'],
    roster: ['20 unités, 20 compétences', 'Trouvez celle qui colle à votre style'],
    daily: ['Un nouveau parcours chaque jour', 'Le même défi pour le monde entier'],
    versus: ['Affrontez vos amis en direct', '1v1, 2v2 et chacun pour soi à 4'],
  },
  de: {
    title: ['Ein Tipp. Purer Flow.', 'Kostenlos. Antippen und los.'],
    combo: ['Tore streifen. Combos ketten.', 'Je knapper, desto mehr Punkte'],
    dash: ['Leiste füllen. Durch Wände dashen.', 'Im FIEBER gibt es doppelte Punkte'],
    roster: ['20 Einheiten, 20 Skills', 'Finde die, die zu deinem Stil passt'],
    daily: ['Jeden Tag eine neue Strecke', 'Dieselbe Strecke für die ganze Welt'],
    versus: ['Tritt live gegen Freunde an', '1v1, 2v2 und Jeder gegen jeden zu viert'],
  },
  vi: {
    title: ['Một chạm. Bay thật mượt.', 'Miễn phí, chạm là chơi ngay'],
    combo: ['Bay sát cổng. Nối dài combo.', 'Càng sát, điểm càng cao'],
    dash: ['Nạp đầy thanh. Lướt xuyên tường.', 'Vào CƠN SỐT để nhân đôi điểm'],
    roster: ['20 chiến cơ, 20 chiêu', 'Tìm chiếc hợp với lối chơi của bạn'],
    daily: ['Mỗi ngày một đường bay mới', 'Cả thế giới cùng một thử thách'],
    versus: ['Đua trực tiếp cùng bạn bè', '1v1, 2v2 và đấu tự do 4 người'],
  },
  th: {
    title: ['แตะเดียว ลื่นไหลสุดๆ', 'เล่นฟรี แตะแล้วเล่นได้ทันที'],
    combo: ['เฉียดเกต ต่อคอมโบ', 'ยิ่งเฉียด ยิ่งได้แต้มเยอะ'],
    dash: ['เติมเกจ แดชทะลุกำแพง', 'เข้า FEVER รับแต้มคูณสอง'],
    roster: ['20 ยูนิต 20 สกิล', 'เลือกตัวที่เข้ากับสไตล์คุณ'],
    daily: ['ด่านใหม่ทุกวัน', 'ทั้งโลกบินด่านเดียวกัน'],
    versus: ['แข่งสดกับเพื่อน', '1v1, 2v2 และตัวใครตัวมัน 4 คน'],
  },
  hi: {
    title: ['एक टैप, पूरा मज़ा।', 'मुफ़्त, बस टैप करें और खेलें'],
    combo: ['गेट से सटकर निकलें, कॉम्बो जोड़ें', 'जितना करीब, उतने ज़्यादा पॉइंट'],
    dash: ['मीटर भरें, दीवार पार करें', 'FEVER में पॉइंट डबल'],
    roster: ['20 यूनिट, 20 स्किल', 'अपने स्टाइल वाली यूनिट चुनें'],
    daily: ['हर दिन नया कोर्स', 'पूरी दुनिया का एक ही कोर्स'],
    versus: ['दोस्तों से लाइव रेस', '1v1, 2v2 और 4 खिलाड़ियों का फ़्री-फ़ॉर-ऑल'],
  },
  zh: {
    title: ['一键操作，畅快飞行', '免费游玩，一点即玩'],
    combo: ['擦边过关，连击不断', '贴得越近，分数越高'],
    dash: ['攒满能量，冲刺破墙', '进入狂热时刻，得分翻倍'],
    roster: ['20台机体，20种技能', '找到最适合你风格的那台'],
    daily: ['每天一条新赛道', '全世界挑战同一条赛道'],
    versus: ['和好友实时对战', '1v1、2v2 和 4 人混战'],
  },
  zh_TW: {
    title: ['一鍵操作，暢快飛行', '免費遊玩，一點就開始'],
    combo: ['擦邊過關，連擊不斷', '貼得越近，分數越高'],
    dash: ['集滿能量，衝刺破牆', '進入狂熱時刻，得分加倍'],
    roster: ['20台機體，20種技能', '找到最適合你風格的那一台'],
    daily: ['每天一條新賽道', '全世界挑戰同一條賽道'],
    versus: ['和好友即時對戰', '1v1、2v2 與 4 人混戰'],
  },
  nl: {
    title: ['Eén tik. Pure flow.', 'Gratis. Tikken en gaan.'],
    combo: ['Scheer langs de poorten. Bouw je combo.', 'Hoe krapper, hoe meer punten'],
    dash: ['Vul de meter. Dash door muren.', 'In FEVER scoor je dubbel'],
    roster: ['20 units, 20 vaardigheden', 'Vind de unit die bij jouw stijl past'],
    daily: ['Elke dag een nieuw parcours', 'Hetzelfde parcours voor de hele wereld'],
    versus: ['Race live tegen je vrienden', '1v1, 2v2 en ieder voor zich met 4'],
  },
  ru: {
    title: ['Одно касание. Чистый драйв.', 'Бесплатно. Коснись и лети.'],
    combo: ['Скользи у края ворот. Копи комбо.', 'Чем ближе, тем больше очков'],
    dash: ['Заполни шкалу. Пробей стену.', 'В режиме FEVER очки удваиваются'],
    roster: ['20 юнитов, 20 навыков', 'Найди того, кто подходит твоему стилю'],
    daily: ['Каждый день новая трасса', 'Одна трасса для всего мира'],
    versus: ['Гонки с друзьями вживую', '1 на 1, 2 на 2 и каждый сам за себя вчетвером'],
  },
  ms: {
    title: ['Satu ketikan. Terus asyik.', 'Percuma. Ketik dan main.'],
    combo: ['Lalu rapat di pintu. Sambung kombo.', 'Makin rapat, makin tinggi mata'],
    dash: ['Penuhkan meter. Rempuh dinding.', 'Masuk FEVER untuk mata berganda'],
    roster: ['20 unit, 20 kemahiran', 'Cari yang sesuai dengan gaya anda'],
    daily: ['Laluan baharu setiap hari', 'Cabaran sama untuk seluruh dunia'],
    versus: ['Berlumba secara langsung dengan rakan', '1v1, 2v2 dan bebas untuk 4 pemain'],
  },
  nb: {
    title: ['Ett trykk. Ren flyt.', 'Gratis. Trykk og fly.'],
    combo: ['Snitt portene. Bygg kombo.', 'Jo nærmere, jo flere poeng'],
    dash: ['Fyll måleren. Dash gjennom vegger.', 'FEVER gir dobbelt poeng'],
    roster: ['20 enheter, 20 ferdigheter', 'Finn den som passer din stil'],
    daily: ['En ny bane hver dag', 'Samme bane for hele verden'],
    versus: ['Konkurrer live mot venner', '1v1, 2v2 og alle mot alle for fire'],
  },
  ar: {
    title: ['لمسة واحدة. متعة بلا توقف.', 'مجانية. المس وانطلق.'],
    combo: ['مُرّ بمحاذاة البوابات. واصل الكومبو.', 'كلما اقتربت، زادت نقاطك'],
    dash: ['املأ العداد. اخترق الجدران.', 'في وضع FEVER تتضاعف النقاط'],
    roster: ['20 وحدة، 20 مهارة', 'اختر ما يناسب أسلوبك'],
    daily: ['مسار جديد كل يوم', 'المسار نفسه للعالم كله'],
    versus: ['سابق أصدقاءك مباشرةً', '1 ضد 1، 2 ضد 2، ومعركة حرة لـ4 لاعبين'],
  },
  it: {
    title: ['Un tocco. Puro flow.', 'Gratis. Tocca e vola.'],
    combo: ['Sfiora i portali. Concatena le combo.', 'Più vai vicino, più punti fai'],
    dash: ['Riempi la barra. Sfonda i muri.', 'In FEVER i punti raddoppiano'],
    roster: ['20 unità, 20 abilità', 'Trova quella adatta al tuo stile'],
    daily: ['Un percorso nuovo ogni giorno', 'Lo stesso percorso per tutto il mondo'],
    versus: ['Sfida i tuoi amici dal vivo', '1v1, 2v2 e tutti contro tutti in 4'],
  },
  tr: {
    title: ['Tek dokunuş. Saf akış.', 'Ücretsiz. Dokun ve uç.'],
    combo: ['Kapıları sıyır. Komboyu sürdür.', 'Ne kadar yakın, o kadar çok puan'],
    dash: ['Göstergeyi doldur. Duvarları del.', 'FEVER modunda puanlar iki katı'],
    roster: ['20 birim, 20 yetenek', 'Tarzına uyanı bul'],
    daily: ['Her gün yeni bir parkur', 'Tüm dünya için aynı parkur'],
    versus: ['Arkadaşlarınla canlı yarış', '1v1, 2v2 ve 4 kişilik herkes birbirine karşı'],
  },
  pl: {
    title: ['Jedno dotknięcie. Czysty flow.', 'Za darmo. Dotknij i leć.'],
    combo: ['Muskaj bramy. Buduj combo.', 'Im bliżej, tym więcej punktów'],
    dash: ['Napełnij pasek. Przebij ściany.', 'W trybie FEVER punkty liczą się podwójnie'],
    roster: ['20 jednostek, 20 umiejętności', 'Znajdź tę, która pasuje do twojego stylu'],
    daily: ['Codziennie nowa trasa', 'Ta sama trasa dla całego świata'],
    versus: ['Ścigaj się ze znajomymi na żywo', '1 na 1, 2 na 2 i każdy na każdego w 4'],
  },
  fi: {
    title: ['Yksi napautus. Puhdas flow.', 'Ilmainen. Napauta ja lennä.'],
    combo: ['Hipaise portteja. Ketjuta komboja.', 'Mitä lähempää, sitä enemmän pisteitä'],
    dash: ['Täytä mittari. Syöksy seinien läpi.', 'FEVER tuplaa pisteet'],
    roster: ['20 yksikköä, 20 taitoa', 'Löydä tyyliisi sopiva'],
    daily: ['Joka päivä uusi rata', 'Sama rata koko maailmalle'],
    versus: ['Kisaa kavereita vastaan livenä', '1v1, 2v2 ja neljän pelaajan kaikki vastaan kaikki'],
  },
  he: {
    title: ['נגיעה אחת. זרימה טהורה.', 'חינם. נוגעים וטסים.'],
    combo: ['לחלוף צמוד לשערים. לשמור על הקומבו.', 'ככל שקרוב יותר, יותר נקודות'],
    dash: ['למלא את המד. לפרוץ דרך קירות.', 'ב-FEVER הנקודות מוכפלות'],
    roster: ['20 יחידות, 20 מיומנויות', 'למצוא את זו שמתאימה לסגנון שלך'],
    daily: ['מסלול חדש בכל יום', 'אותו מסלול לכל העולם'],
    versus: ['מרוץ חי מול חברים', '1 על 1, 2 על 2 וכולם נגד כולם ב-4'],
  },
};
// Game languages that have store screenshots but no short-video hooks yet (each one runs the game in its own language).
export const SHOT_LANGS = [...LANGS, 'zh_TW', 'nl', 'ru', 'ms', 'nb', 'ar', 'it', 'tr', 'pl', 'fi', 'he'];
// Store locales that share the game's language but not its wording: Play lists es-ES and pt-PT next to es-419 and pt-BR.
// Their screenshots run the es / pt game under European captions (tu-forms in pt-PT, "en directo" in Spain).
export const STORE_VARIANTS = { 'es-ES': 'es', 'pt-PT': 'pt' };
export const gameLang = l => STORE_VARIANTS[l] || l;
CAPTIONS['es-ES'] = {
  ...CAPTIONS.es,
  roster: ['20 unidades, 20 habilidades', 'Encuentra la que encaja con tu estilo'],
  versus: ['Compite con tus amigos en directo', '1 contra 1, 2 contra 2 y todos contra todos'],
};
CAPTIONS['pt-PT'] = {
  title: ['Um toque. Fluxo puro.', 'Grátis. Toca e joga.'],
  combo: ['Roça os portões. Encadeia o combo.', 'Quanto mais perto, mais pontos'],
  dash: ['Enche a barra. Atravessa paredes.', 'Entra em FEBRE: pontos a dobrar'],
  roster: ['20 unidades, 20 habilidades', 'Encontra a que combina com o teu estilo'],
  daily: ['Um percurso novo todos os dias', 'O mesmo desafio para o mundo inteiro'],
  versus: ['Corre contra amigos em direto', '1x1, 2x2 e todos contra todos'],
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
