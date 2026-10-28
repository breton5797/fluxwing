// Builds about/index.html, the landing page at https://swishby.com/about/, from the game's own data so the page can
// never drift from the game: the unit roster (BIRDS), the 12 translation tables (I18N / I18N_B), the zones, the
// rank tiers (PTIERS) and the season rewards (supabase/schema.sql). Page-only copy lives in COPY below.
//   node scripts/about-build.mjs        writes about/index.html
// tests/about.test.js fails while the committed page differs from a fresh build.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadI18N } from '../tests/helpers/i18n.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
export const LANGS = ['ko', 'en', 'ja', 'zh', 'es', 'pt', 'fr', 'de', 'id', 'vi', 'th', 'hi'];

// ---------- page-only copy, every language ----------
const COPY = {
  sub: { ko: '설치 없이 브라우저에서 바로. 휴대폰이면 충분합니다.', en: 'No install. It runs in the browser, a phone is enough.', ja: 'インストール不要、ブラウザですぐ。スマホがあれば十分です。', zh: '无需安装，浏览器直接玩。有手机就够了。', es: 'Sin instalar nada. Se juega en el navegador; con el móvil basta.', pt: 'Sem instalar nada. Roda no navegador; um celular basta.', fr: 'Rien à installer. Ça tourne dans le navigateur, un téléphone suffit.', de: 'Nichts installieren. Läuft im Browser, ein Handy reicht.', id: 'Tanpa instal. Jalan di browser, cukup pakai ponsel.', vi: 'Không cần cài đặt. Chơi ngay trên trình duyệt, chỉ cần điện thoại.', th: 'ไม่ต้องติดตั้ง เล่นในเบราว์เซอร์ได้เลย มีแค่มือถือก็พอ', hi: 'कुछ इंस्टॉल नहीं। ब्राउज़र में ही चलता है, फ़ोन काफ़ी है।' },
  h_run: { ko: '한 판은 이렇게 흘러갑니다', en: 'How one run goes', ja: '1プレイの流れ', zh: '一局是这样进行的', es: 'Así va una partida', pt: 'Como vai uma corrida', fr: "Le déroulé d'une partie", de: 'So läuft eine Runde', id: 'Begini jalannya satu putaran', vi: 'Một lượt bay diễn ra thế này', th: 'หนึ่งรอบเป็นแบบนี้', hi: 'एक रन ऐसे चलता है' },
  s1: { ko: '탭하면 날개를 칩니다. 조작은 그게 전부입니다.', en: 'Tap to flap. That is the whole control scheme.', ja: 'タップで羽ばたく。操作はそれだけ。', zh: '点一下就振翅。操作只有这一个。', es: 'Toca para batir las alas. Ese es todo el control.', pt: 'Toque para bater as asas. É só isso.', fr: "Touchez pour battre des ailes. C'est toute la commande.", de: 'Tippen heißt Flügelschlag. Mehr Steuerung gibt es nicht.', id: 'Ketuk untuk mengepak. Cuma itu kontrolnya.', vi: 'Chạm để vỗ cánh. Điều khiển chỉ có vậy.', th: 'แตะเพื่อกระพือปีก แค่นั้นคือการควบคุมทั้งหมด', hi: 'टैप करो, पंख फड़फड़ाओ। बस यही कंट्रोल है।' },
  s2: { ko: '게이트 끝을 아슬아슬하게 스치면 PERFECT. 이어가면 콤보가 쌓입니다.', en: 'Skim the edge of a gate for a PERFECT. Chain them and the combo climbs.', ja: 'ゲートの端ギリギリでPERFECT。続ければコンボが積み上がる。', zh: '擦着门边飞过就是PERFECT，连续就能叠连击。', es: 'Roza el borde de una puerta: PERFECT. Encadénalos y sube el combo.', pt: 'Raspe a borda do portão: PERFECT. Emende e o combo sobe.', fr: "Frôlez le bord d'une porte : PERFECT. Enchaînez et le combo grimpe.", de: 'Streif die Kante eines Tors: PERFECT. Reihe sie aneinander und die Combo wächst.', id: 'Lewati tepi gerbang setipis mungkin: PERFECT. Sambung terus, kombo naik.', vi: 'Lướt sát mép cổng: PERFECT. Nối liên tiếp, combo tăng dần.', th: 'เฉียดขอบเกต = PERFECT ทำต่อเนื่องคอมโบจะสะสม', hi: 'गेट के किनारे से सटकर निकलो: PERFECT। लगातार करो, कॉम्बो बढ़ेगा।' },
  s3: { ko: '게이지가 차면 대시. 벽을 뚫고 지나갑니다.', en: 'Fill the gauge, then dash straight through the walls.', ja: 'ゲージが満タンになったらダッシュ。壁を突き抜ける。', zh: '能量满了就冲刺，直接穿墙。', es: 'Llena la barra y haz un dash a través de las paredes.', pt: 'Encha a barra e dê um dash através das paredes.', fr: 'Remplissez la jauge, puis foncez à travers les murs.', de: 'Füll die Leiste und dash geradewegs durch die Wände.', id: 'Isi meternya, lalu dash menembus dinding.', vi: 'Đầy thanh năng lượng thì dash xuyên qua tường.', th: 'เกจเต็มเมื่อไหร่ก็แดชทะลุกำแพงได้เลย', hi: 'मीटर भरते ही डैश मारो, दीवारों के आर-पार।' },
  s4: { ko: '코스에 떨어진 파워업 4종을 주워 쓰세요.', en: 'Four kinds of power-ups lie along the course. Grab them.', ja: 'コースに落ちている4種のパワーアップを拾おう。', zh: '路上有4种道具，捡起来用。', es: 'Hay 4 potenciadores por el camino. Recógelos.', pt: 'Há 4 power-ups pelo caminho. Pegue-os.', fr: 'Quatre bonus jalonnent le parcours. Ramassez-les.', de: 'Vier Power-ups liegen auf der Strecke. Sammle sie ein.', id: 'Ada 4 power-up di sepanjang jalur. Ambil.', vi: 'Có 4 loại sức mạnh rải trên đường. Nhặt lấy.', th: 'มีพาวเวอร์อัป 4 แบบกระจายอยู่บนเส้นทาง เก็บมาใช้', hi: 'रास्ते में 4 तरह के पावर-अप पड़े हैं। उठा लो।' },
  s5: { ko: '존이 바뀔 때마다 하늘과 게이트의 규칙이 달라집니다. 50스테이지, 4개 존.', en: 'Every zone changes the sky and the gate rules. 50 stages across 4 zones.', ja: 'ゾーンが変わるたび空とゲートのルールが変わる。50ステージ、4ゾーン。', zh: '每换一个区域，天空和关卡规则都会变。50关，4个区域。', es: 'Cada zona cambia el cielo y las reglas de las puertas. 50 fases en 4 zonas.', pt: 'Cada zona muda o céu e as regras dos portões. 50 fases em 4 zonas.', fr: 'Chaque zone change le ciel et les règles des portes. 50 niveaux, 4 zones.', de: 'Jede Zone ändert Himmel und Torregeln. 50 Stufen in 4 Zonen.', id: 'Tiap zona mengubah langit dan aturan gerbang. 50 stage di 4 zona.', vi: 'Mỗi vùng đổi bầu trời và luật cổng. 50 màn, 4 vùng.', th: 'ทุกโซนเปลี่ยนท้องฟ้าและกติกาเกต 50 สเตจ 4 โซน', hi: 'हर ज़ोन में आसमान और गेट के नियम बदलते हैं। 4 ज़ोन में 50 स्टेज।' },
  h_modes: { ko: '세 가지 비행', en: 'Three ways to fly', ja: '3つの飛び方', zh: '三种飞法', es: 'Tres formas de volar', pt: 'Três jeitos de voar', fr: 'Trois façons de voler', de: 'Drei Arten zu fliegen', id: 'Tiga cara terbang', vi: 'Ba cách bay', th: 'บินได้สามแบบ', hi: 'उड़ने के तीन तरीके' },
  m_endless_d: { ko: '50개 스테이지, 4개 존. 끝까지 가면 무엇이 있을까요.', en: '50 stages across 4 zones. See what waits at the end.', ja: '50ステージ、4ゾーン。最後に何があるか確かめよう。', zh: '50关、4个区域。看看终点有什么。', es: '50 fases en 4 zonas. Descubre qué hay al final.', pt: '50 fases em 4 zonas. Veja o que espera no fim.', fr: '50 niveaux, 4 zones. Voyez ce qui vous attend au bout.', de: '50 Stufen in 4 Zonen. Finde heraus, was am Ende wartet.', id: '50 stage di 4 zona. Lihat apa yang menunggu di ujung.', vi: '50 màn, 4 vùng. Xem cuối đường có gì.', th: '50 สเตจ 4 โซน ไปดูว่าปลายทางมีอะไร', hi: '4 ज़ोन में 50 स्टेज। देखो आख़िर में क्या है।' },
  m_daily_d: { ko: '전 세계가 오늘 같은 코스를 납니다. 내일은 새 코스.', en: 'The whole world flies the same course today. Tomorrow, a new one.', ja: '今日は世界中が同じコースを飛ぶ。明日はまた新しいコース。', zh: '今天全世界飞同一条赛道，明天换新的。', es: 'Todo el mundo vuela hoy el mismo recorrido. Mañana, uno nuevo.', pt: 'O mundo inteiro voa o mesmo percurso hoje. Amanhã, outro.', fr: "Le monde entier vole le même parcours aujourd'hui. Demain, un nouveau.", de: 'Heute fliegt die ganze Welt denselben Kurs. Morgen einen neuen.', id: 'Seluruh dunia terbang di jalur yang sama hari ini. Besok, jalur baru.', vi: 'Hôm nay cả thế giới bay cùng một đường. Mai lại đường mới.', th: 'วันนี้ทั้งโลกบินคอร์สเดียวกัน พรุ่งนี้คอร์สใหม่', hi: 'आज पूरी दुनिया एक ही कोर्स उड़ती है। कल नया कोर्स।' },
  m_vs_d: { ko: '1v1, 2v2, 4인 난투. 랭크전 RP는 상대 실력에 따라 이기면 +20~+80, 지면 −20~−80. 시즌은 한 달.', en: '1v1, 2v2 and 4-player free-for-all. Ranked RP depends on the rival: win +20 to +80, lose −20 to −80. Seasons last a month.', ja: '1v1、2v2、4人乱闘。ランク戦のRPは相手の強さ次第で、勝てば+20〜+80、負ければ−20〜−80。シーズンは1か月。', zh: '1v1、2v2、4人混战。排位RP取决于对手实力：赢+20~+80，输−20~−80。赛季为期一个月。', es: '1v1, 2v2 y todos contra todos a 4. El RP clasificatorio depende del rival: gana de +20 a +80, pierde de −20 a −80. Temporadas de un mes.', pt: '1v1, 2v2 e todos contra todos a 4. O RP ranqueado depende do rival: vitória de +20 a +80, derrota de −20 a −80. Temporadas de um mês.', fr: "1v1, 2v2 et mêlée à 4. Le RP classé dépend de l'adversaire : victoire de +20 à +80, défaite de −20 à −80. Saisons d'un mois.", de: '1v1, 2v2 und 4er-Free-for-all. Ranked-RP hängt vom Gegner ab: Sieg +20 bis +80, Niederlage −20 bis −80. Saisons dauern einen Monat.', id: '1v1, 2v2, dan FFA 4 pemain. RP ranked tergantung lawan: menang +20 sampai +80, kalah −20 sampai −80. Musim berlangsung sebulan.', vi: '1v1, 2v2 và hỗn chiến 4 người. RP xếp hạng tùy đối thủ: thắng +20 đến +80, thua −20 đến −80. Mùa kéo dài một tháng.', th: '1v1, 2v2 และรุมสี่คน RP แรงก์ขึ้นกับคู่แข่ง ชนะ +20 ถึง +80 แพ้ −20 ถึง −80 ซีซันยาวหนึ่งเดือน', hi: '1v1, 2v2 और 4 खिलाड़ियों का FFA। रैंक्ड RP प्रतिद्वंद्वी पर निर्भर: जीत +20 से +80, हार −20 से −80। सीज़न एक महीने का।' },
  h_units: { ko: '격납고', en: 'The hangar', ja: '格納庫', zh: '机库', es: 'El hangar', pt: 'O hangar', fr: 'Le hangar', de: 'Der Hangar', id: 'Hanggar', vi: 'Nhà chứa máy bay', th: 'โรงเก็บเครื่องบิน', hi: 'हैंगर' },
  units_d: { ko: '유닛 20종. 능력치와 고유 스킬이 모두 다릅니다. 코인, 다이아, 젬으로 영입합니다.', en: '20 units, each with its own stats and skill. Recruit them with coins, diamonds and gems.', ja: '20種のユニット。能力値と固有スキルはすべて違う。コイン、ダイヤ、ジェムで迎えよう。', zh: '20种机体，属性和专属技能各不相同。用金币、钻石和宝石招募。', es: '20 unidades, cada una con sus stats y su habilidad. Recluta con monedas, diamantes y gemas.', pt: '20 unidades, cada uma com stats e habilidade próprias. Recrute com moedas, diamantes e gemas.', fr: '20 unités, chacune avec ses stats et son talent. Recrutez-les avec pièces, diamants et gemmes.', de: '20 Einheiten, jede mit eigenen Werten und eigenem Skill. Anheuern mit Münzen, Diamanten und Edelsteinen.', id: '20 unit, tiap unit punya stat dan skill sendiri. Rekrut dengan koin, berlian, dan permata.', vi: '20 đơn vị, mỗi con có chỉ số và kỹ năng riêng. Chiêu mộ bằng xu, kim cương và ngọc.', th: 'ยูนิต 20 แบบ ค่าพลังและสกิลต่างกันหมด เกณฑ์ด้วยเหรียญ เพชร และอัญมณี', hi: '20 यूनिट, हर एक के अपने स्टैट और स्किल। सिक्कों, हीरों और रत्नों से भर्ती करो।' },
  h_season: { ko: '시즌과 보상', en: 'Seasons and rewards', ja: 'シーズンと報酬', zh: '赛季与奖励', es: 'Temporadas y recompensas', pt: 'Temporadas e recompensas', fr: 'Saisons et récompenses', de: 'Saisons und Belohnungen', id: 'Musim dan hadiah', vi: 'Mùa giải và phần thưởng', th: 'ซีซันและรางวัล', hi: 'सीज़न और इनाम' },
  season_d: { ko: '시즌이 끝나면 티어에 따라 다이아와 젬을 받습니다. 상위 10명은 시즌 전용 유닛 MONARCH를 얻습니다.', en: 'When a season ends, every tier earns diamonds and gems. The top 10 also get MONARCH, the season-only unit.', ja: 'シーズン終了時、ティアに応じてダイヤとジェムがもらえる。上位10名はシーズン限定ユニットMONARCHを獲得。', zh: '赛季结束后按段位发放钻石和宝石。前10名还能获得赛季限定机体MONARCH。', es: 'Al terminar la temporada, cada nivel recibe diamantes y gemas. El top 10 gana además MONARCH, la unidad de temporada.', pt: 'No fim da temporada, cada tier recebe diamantes e gemas. O top 10 ainda ganha MONARCH, a unidade da temporada.', fr: "À la fin de la saison, chaque palier reçoit diamants et gemmes. Le top 10 gagne en plus MONARCH, l'unité de saison.", de: 'Am Saisonende erhält jede Stufe Diamanten und Edelsteine. Die Top 10 bekommen zusätzlich MONARCH, die Saison-Einheit.', id: 'Saat musim berakhir, tiap tier dapat berlian dan permata. 10 besar juga dapat MONARCH, unit khusus musim.', vi: 'Hết mùa, mỗi bậc nhận kim cương và ngọc. Top 10 còn nhận MONARCH, đơn vị chỉ có trong mùa.', th: 'เมื่อจบซีซัน ทุกระดับได้เพชรและอัญมณี 10 อันดับแรกได้ MONARCH ยูนิตเฉพาะซีซันด้วย', hi: 'सीज़न ख़त्म होने पर हर टियर को हीरे और रत्न मिलते हैं। टॉप 10 को सीज़न-ओनली यूनिट MONARCH भी।' },
  next_season: { ko: '다음 시즌까지', en: 'Next season in', ja: '次のシーズンまで', zh: '距下个赛季', es: 'Próxima temporada en', pt: 'Próxima temporada em', fr: 'Prochaine saison dans', de: 'Nächste Saison in', id: 'Musim berikutnya dalam', vi: 'Mùa tiếp theo sau', th: 'ซีซันถัดไปในอีก', hi: 'अगला सीज़न' },
  rule_cap: { ko: '같은 상대와는 하루 5판까지만 랭크에 반영', en: '5 ranked matches a day against the same rival', ja: '同じ相手とのランク反映は1日5回まで', zh: '同一对手每天只计5局', es: '5 partidas clasificatorias al día contra el mismo rival', pt: '5 partidas ranqueadas por dia contra o mesmo rival', fr: '5 matchs classés par jour contre le même rival', de: '5 gewertete Matches pro Tag gegen denselben Gegner', id: '5 pertandingan ranked sehari melawan lawan yang sama', vi: '5 trận xếp hạng mỗi ngày với cùng một đối thủ', th: 'นับแรงก์กับคู่แข่งเดิมได้วันละ 5 แมตช์', hi: 'एक ही विरोधी के साथ दिन में 5 रैंक्ड मैच' },
  rule_min: { ko: '10판 이상이면 순위와 보상', en: '10 matches to get a rank and a reward', ja: '10試合以上で順位と報酬', zh: '打满10局才有排名和奖励', es: '10 partidas para tener rango y recompensa', pt: '10 partidas para ter rank e recompensa', fr: '10 matchs pour un rang et une récompense', de: '10 Matches für Rang und Belohnung', id: '10 pertandingan untuk peringkat dan hadiah', vi: '10 trận để có hạng và phần thưởng', th: 'ครบ 10 แมตช์จึงมีอันดับและรางวัล', hi: 'रैंक और इनाम के लिए 10 मैच' },
  lang_label: { ko: '언어', en: 'Language', ja: '言語', zh: '语言', es: 'Idioma', pt: 'Idioma', fr: 'Langue', de: 'Sprache', id: 'Bahasa', vi: 'Ngôn ngữ', th: 'ภาษา', hi: 'भाषा' },
  cta2: { ko: '지금 날아보기', en: 'Take off now', ja: '今すぐ飛ぶ', zh: '现在就飞', es: 'Despega ahora', pt: 'Decole agora', fr: 'Décollez maintenant', de: 'Jetzt abheben', id: 'Terbang sekarang', vi: 'Cất cánh ngay', th: 'ออกบินเลย', hi: 'अभी उड़ान भरो' },
  top10: { ko: '상위 10명', en: 'Top 10', ja: '上位10名', zh: '前10名', es: 'Top 10', pt: 'Top 10', fr: 'Top 10', de: 'Top 10', id: '10 besar', vi: 'Top 10', th: '10 อันดับแรก', hi: 'टॉप 10' },
  rp_floor: { ko: 'RP 이상', en: 'RP and up', ja: 'RP以上', zh: 'RP以上', es: 'RP o más', pt: 'RP ou mais', fr: 'RP et plus', de: 'RP und mehr', id: 'RP ke atas', vi: 'RP trở lên', th: 'RP ขึ้นไป', hi: 'RP से ऊपर' },
  dia: { ko: '다이아', en: 'diamonds', ja: 'ダイヤ', zh: '钻石', es: 'diamantes', pt: 'diamantes', fr: 'diamants', de: 'Diamanten', id: 'berlian', vi: 'kim cương', th: 'เพชร', hi: 'हीरे' },
  gems: { ko: '젬', en: 'gems', ja: 'ジェム', zh: '宝石', es: 'gemas', pt: 'gemas', fr: 'gemmes', de: 'Edelsteine', id: 'permata', vi: 'ngọc', th: 'อัญมณี', hi: 'रत्न' },
  season_unit: { ko: '시즌 보상 유닛', en: 'Season reward unit', ja: 'シーズン報酬ユニット', zh: '赛季奖励机体', es: 'Unidad de recompensa de temporada', pt: 'Unidade de recompensa da temporada', fr: 'Unité de récompense de saison', de: 'Saison-Belohnungseinheit', id: 'Unit hadiah musim', vi: 'Đơn vị thưởng mùa', th: 'ยูนิตรางวัลซีซัน', hi: 'सीज़न इनाम यूनिट' },
  made_by: { ko: '만든 곳', en: 'Made by', ja: '制作', zh: '制作', es: 'Hecho por', pt: 'Feito por', fr: 'Créé par', de: 'Gemacht von', id: 'Dibuat oleh', vi: 'Thực hiện bởi', th: 'สร้างโดย', hi: 'निर्माता' },
};
// countdown units: [days, hours, minutes]
const DHM = { ko: ['일', '시간', '분'], en: ['d', 'h', 'm'], ja: ['日', '時間', '分'], zh: ['天', '小时', '分'], es: ['d', 'h', 'min'], pt: ['d', 'h', 'min'], fr: ['j', 'h', 'min'], de: ['T', 'Std', 'Min'], id: ['h', 'j', 'm'], vi: ['ngày', 'giờ', 'phút'], th: ['วัน', 'ชม.', 'นาที'], hi: ['दिन', 'घं', 'मि'] };

// ---------- the game's data ----------
function slice(h, head, tail) { const a = h.indexOf(head); if (a < 0) throw new Error(head + ' not found in index.html'); const b = h.indexOf(tail, a); return h.slice(a, b + tail.length); }
function gameData(){
  const h = read('index.html');
  const BIRDS = new Function(slice(h, 'const BIRDS = [', '];') + ' return BIRDS;')();
  const I18N_B = new Function(slice(h, 'const I18N_B = {', '\n};') + ' return I18N_B;')();
  const ZONES = new Function(slice(h, 'const ZONES = [', '];') + ' return ZONES;')();
  const PTIERS = new Function(slice(h, 'const PTIERS = [', '];') + ' return PTIERS;')();
  const RARITY_KEY = new Function(slice(h, 'const RARITY_KEY = [', '];') + ' return RARITY_KEY;')();
  const RARITY_COL = new Function(slice(h, 'const RARITY_COL = [', '];') + ' return RARITY_COL;')();
  // the numbers the hangar prints into "{n}" of a skill / ultra description: SK[id].dur ?? SK[id].n, ULT[id].dur ?? ULT[id].n
  const SK = new Function(slice(h, 'const SK = {', '\n};') + ' return SK;')();
  const ULT = new Function(slice(h, 'const ULT = {', '} };') + ' return ULT;')();
  // stage layout per zone: ST_FIRST (0-based first stage of each zone) and ST_CNT (stages in it)
  const ST = new Function(slice(h, 'const ST_N = ', ';') + ' return { ST_N, ST_FIRST, ST_CNT };')();
  const sql = read('supabase/schema.sql');
  const m = sql.match(/select 'Asia\/Seoul', (\d+), array\[([^\]]+)\], array\[([^\]]+)\], array\[([^\]]+)\], (\d+), '([a-z]+)', (\d+);/);
  if (!m) throw new Error('fw_vs_season_cfg row not found in schema.sql');
  const nums = s => s.split(',').map(x => Number(x.trim()));
  const season = { min_matches: Number(m[1]), tier_rp: nums(m[2]), tier_dia: nums(m[3]), tier_gems: nums(m[4]), top_n: Number(m[5]), top_unit: m[6], unit_gems: Number(m[7]) };
  const I = loadI18N();
  return { BIRDS, I18N_B, ZONES, PTIERS, RARITY_KEY, RARITY_COL, SK, ULT, ST, season, I };
}

export function buildAbout(){
  const { BIRDS, I18N_B, ZONES, PTIERS, RARITY_KEY, RARITY_COL, SK, ULT, ST, season, I } = gameData();
  if (ST.ST_FIRST.length !== ZONES.length || ST.ST_FIRST.at(-1) + ST.ST_CNT.at(-1) !== ST.ST_N) throw new Error('stage layout and zones disagree');
  const num = (t, id) => String((t[id] && (t[id].dur ?? t[id].n)) ?? '');
  const mul = (t, id) => String((t[id] && t[id].mul) ?? '');   // {m}: a skill's / ultimate's Perfect multiple
  if (season.tier_rp.join() !== PTIERS.map(p => p[1]).join()) throw new Error('server tier_rp and client PTIERS disagree');
  const GAME_KEYS = ['_n', 'tag', 'startSub', 'c1', 'c2', 'c3', 'c4', 'c5', 'endless', 'daily', 'ranking', 'vs', 'start', 'legalTerms', 'legalPrivacy',
    ...PTIERS.map(p => 'pt_' + p[0]), ...RARITY_KEY, 'r_season'];
  const unitKeys = id => ['r_' + id, 'p_' + id, 'sk_' + id, 'sd_' + id, 'ul_' + id, 'ud_' + id];
  const units = BIRDS.filter(b => !b.hidden).map(b => ({ id: b.id, name: b.name, rarity: b.rarity || 0, season: !!b.season,
    col: b.col, wing: b.wingCol, ui: b.uiCol || b.col, stats: b.stats, rk: b.season ? 'r_season' : RARITY_KEY[b.rarity || 0], rc: b.season ? [222, 90, 66] : RARITY_COL[b.rarity || 0] }));
  const langs = {};
  for (const l of LANGS){
    const L = {};
    for (const k of GAME_KEYS) L[k] = I[l][k] ?? I.en[k];
    for (const u of units) for (const k of unitKeys(u.id)) {
      let v = I[l][k] ?? I.en[k]; if (!v) continue;
      if (k.startsWith('sd_')) v = v.replace(/\{n\}/g, num(SK, u.id)).replace(/\{m\}/g, mul(SK, u.id));
      if (k.startsWith('ud_')) v = v.replace(/\{n\}/g, num(ULT, u.id)).replace(/\{m\}/g, mul(ULT, u.id));
      L[k] = v;
    }
    for (const k of Object.keys(COPY)) L[k] = COPY[k][l];
    const B = I18N_B[l] || I18N_B.en;
    L.st = [B[1], B[2], B[3], B[4]];
    L.dhm = DHM[l];
    langs[l] = L;
  }
  const tiers = PTIERS.map((p, i) => ({ id: p[0], rp: p[1], dia: season.tier_dia[i], gems: season.tier_gems[i] }));
  const zones = ZONES.map(z => ({ name: z.name, sky: z.sky, a: z.a, b: z.b, gate: z.gate }));
  const stages = ZONES.map((z, i) => ({ from: ST.ST_FIRST[i] + 1, to: ST.ST_FIRST[i] + ST.ST_CNT[i] }));
  const data = { langs, units, tiers, zones, stages, season: { top_n: season.top_n, top_unit: season.top_unit, min_matches: season.min_matches } };
  return page(data);
}

const hsl = c => `hsl(${c[0]} ${c[1]}% ${c[2]}%)`;

function page(data){
  const { langs, units, tiers, zones } = data;
  const en = langs.en, ko = langs.ko;
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const opts = LANGS.map(l => `<option value="${l}">${langs[l]._n}</option>`).join('');
  const unitCards = units.map(u => `
      <li class="unit" style="--u:${hsl(u.ui)};--w:${hsl(u.wing)};--r:${hsl(u.rc)}" data-id="${u.id}">
        <div class="uhead"><span class="uname">${u.name}</span><span class="urar" data-t="${u.rk}"></span></div>
        <div class="urole" data-t="r_${u.id}"></div>
        <ol class="ustats" aria-label="stats">${u.stats.map((s, i) => `<li><span class="sl" data-st="${i}"></span><span class="sb"><i style="width:${Math.round(s / 5 * 100)}%"></i></span></li>`).join('')}</ol>
        <p class="uperk" data-t="p_${u.id}"></p>
        ${langs.en['sk_' + u.id] ? `<p class="uskill"><b data-t="sk_${u.id}"></b> <span data-t="sd_${u.id}"></span></p>` : ''}
        ${u.season ? `<p class="useason" data-t="season_unit"></p>` : ''}
      </li>`).join('');
  const tierRows = tiers.map((t, i) => `
      <li class="tier" style="--i:${i}">
        <span class="tname" data-t="pt_${t.id}"></span>
        <span class="trp">${t.rp.toLocaleString('en')} <small data-t="rp_floor"></small></span>
        <span class="treward">${t.dia.toLocaleString('en')} <small data-t="dia"></small>${t.gems ? ` + ${t.gems} <small data-t="gems"></small>` : ''}</span>
      </li>`).reverse().join('');
  const zoneStyles = zones.map((z, i) => `[data-zone="${i}"]{--sky0:${hsl(z.sky[0])};--sky1:${hsl(z.sky[1])};--a:${hsl(z.a)};--b:${hsl(z.b)};--gate:${hsl(z.gate)}}`).join('\n');
  const lift = (c, k) => [c[0], c[1], Math.min(48, c[2] + k)];
  const skyLayers = zones.map((z, i) => `<i style="background:radial-gradient(90% 60% at 50% 0%, ${hsl(lift(z.sky[1], 14))} 0%, ${hsl(lift(z.sky[0], 6))} 52%, #07050f 100%),radial-gradient(55% 45% at 88% 100%, color-mix(in srgb, ${hsl(z.b)} 26%, transparent) 0%, transparent 70%),radial-gradient(45% 40% at 8% 70%, color-mix(in srgb, ${hsl(z.a)} 18%, transparent) 0%, transparent 70%)"></i>`).join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>SWISHBY – ${ko.tag}</title>
<meta name="description" content="${en.tag}">
<meta property="og:title" content="SWISHBY">
<meta property="og:description" content="${en.tag}">
<meta property="og:url" content="https://swishby.com/about/">
<meta property="og:image" content="https://swishby.com/og-swishby.png">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://swishby.com/og-swishby.png">
<link rel="icon" href="../icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bungee&family=Chakra+Petch:wght@400;600;700&display=swap">
<style>
:root{color-scheme:dark;--bg:#07050f;--ink:#f3eefb;--dim:#a9a4bd;--line:rgba(255,255,255,.12);--display:"Bungee","Chakra Petch","Apple SD Gothic Neo","Noto Sans KR",sans-serif;--body:"Chakra Petch","Apple SD Gothic Neo","Noto Sans KR","Noto Sans Thai","Noto Sans Devanagari",system-ui,sans-serif;--sky0:#1b0d2b;--sky1:#3c1240;--a:hsl(338 100% 62%);--b:hsl(190 100% 62%);--gate:hsl(300 80% 58%)}
${zoneStyles}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
html,body{margin:0;background:var(--bg);color:var(--ink)}
body{font:16px/1.6 var(--body);overflow-x:hidden;-webkit-text-size-adjust:100%}
.sky{position:fixed;inset:0;z-index:-2;background:var(--bg)}
.sky i{position:absolute;inset:0;opacity:0;transition:opacity 1.4s ease}
${zones.map((z, i) => `[data-zone="${i}"] .sky i:nth-child(${i + 1}){opacity:1}`).join('\n')}
.grid{position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:48px 48px;mask-image:linear-gradient(#000 20%,transparent 100%);-webkit-mask-image:linear-gradient(#000 20%,transparent 100%)}
a{color:inherit}
.top{position:absolute;top:0;left:0;right:0;z-index:3;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;gap:12px}
.top .home{font:700 14px var(--body);letter-spacing:.04em;text-decoration:none;color:var(--dim)}
.top .home:hover{color:var(--ink)}
.langbox{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dim)}
select{appearance:none;-webkit-appearance:none;background:rgba(7,5,15,.6);color:var(--ink);border:1px solid var(--line);border-radius:999px;padding:7px 30px 7px 12px;font:600 13px var(--body);background-image:linear-gradient(45deg,transparent 50%,var(--dim) 50%),linear-gradient(135deg,var(--dim) 50%,transparent 50%);background-position:calc(100% - 16px) 15px,calc(100% - 11px) 15px;background-size:5px 5px;background-repeat:no-repeat}
select:focus-visible,a:focus-visible,button:focus-visible{outline:2px solid var(--b);outline-offset:3px}
.hero{position:relative;min-height:100svh;display:grid;place-items:center;padding:96px 16px 72px;isolation:isolate}
#attract{position:absolute;inset:0;width:100%;height:100%;z-index:-1;opacity:.62}
.hero .inner{text-align:center;max-width:720px;padding:28px 18px;border-radius:40px;background:radial-gradient(closest-side,rgba(7,5,15,.82),rgba(7,5,15,.55) 70%,transparent)}
.hero h1{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.logo{width:min(560px,86vw);height:auto;display:block;margin:0 auto 22px;filter:drop-shadow(0 0 24px rgba(255,61,138,.35))}
.tag{font-size:clamp(17px,2.4vw,22px);line-height:1.5;margin:0 auto 10px;max-width:34em;text-wrap:balance}
.sub{color:var(--dim);margin:0 auto 28px;font-size:15px}
.play{display:inline-block;font:24px/1 var(--display);letter-spacing:.04em;color:#07050f;background:var(--a);padding:18px 34px 16px;border-radius:999px;text-decoration:none;box-shadow:0 0 0 2px rgba(255,255,255,.15) inset,0 0 36px color-mix(in srgb,var(--a) 55%,transparent);transition:transform .15s ease,box-shadow .2s ease;position:relative}
.play:hover,.play:focus-visible{transform:translateY(-2px) scale(1.03);box-shadow:0 0 0 2px rgba(255,255,255,.25) inset,0 0 56px color-mix(in srgb,var(--a) 75%,transparent)}
.play:active{transform:translateY(1px) scale(.99)}
.play::after{content:"";position:absolute;inset:-6px;border-radius:inherit;border:2px solid var(--b);opacity:0;pointer-events:none}
.play:hover::after{animation:burst .5s ease-out}
@keyframes burst{0%{opacity:.9;transform:scale(.92)}100%{opacity:0;transform:scale(1.25)}}
.zone{padding:clamp(72px,11vh,128px) 16px}
.wrap{max-width:1040px;margin:0 auto}
h2{font:clamp(26px,4.2vw,44px)/1.1 var(--display);letter-spacing:.01em;margin:0 0 14px;text-shadow:3px 3px 0 color-mix(in srgb,var(--a) 70%,transparent),-3px -3px 0 color-mix(in srgb,var(--b) 55%,transparent)}
.lead{color:var(--dim);max-width:60ch;margin:0 0 36px;font-size:17px}
/* the run: one sequence, numbered because it is one */
.run{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));counter-reset:step;position:relative;list-style:none;margin:0;padding:0}
.run::before{content:"";position:absolute;left:0;right:0;top:34px;border-top:2px dashed color-mix(in srgb,var(--gate) 60%,transparent);opacity:.7}
.step{counter-increment:step;position:relative;padding-top:70px}
.step::before{content:counter(step);position:absolute;top:0;left:0;width:68px;height:68px;border-radius:12px;display:grid;place-items:center;font:34px/1 var(--display);color:var(--bg);background:var(--gate);box-shadow:0 0 28px color-mix(in srgb,var(--gate) 70%,transparent)}
.step h3{font:700 18px/1.3 var(--body);margin:0 0 6px}
.step p{margin:0;color:var(--dim);font-size:15px}
@media (max-width:640px){.run::before{display:none}.run{grid-template-columns:1fr}.step{padding-top:0;padding-left:84px;min-height:68px}}
/* modes: three unequal blocks */
.modes{display:grid;gap:16px;grid-template-columns:1.4fr 1fr}
.mode{border:1px solid var(--line);border-radius:18px;padding:26px 24px;background:rgba(7,5,15,.45);backdrop-filter:blur(6px);position:relative;overflow:hidden}
.mode.endless{grid-row:span 2}
.mode .big{font:clamp(64px,12vw,140px)/.9 var(--display);color:var(--a);text-shadow:4px 4px 0 color-mix(in srgb,var(--b) 60%,transparent);display:block;margin:6px 0 12px}
.mode.daily .big{color:var(--b);text-shadow:4px 4px 0 color-mix(in srgb,var(--a) 60%,transparent);font-size:clamp(34px,6vw,64px)}
.mode.vs .big{font-size:clamp(34px,6vw,64px)}
.mode h3{font:28px/1.1 var(--display);margin:0}
.mode p{color:var(--dim);margin:8px 0 0;max-width:40ch}
.zonelist{list-style:none;margin:26px 0 0;padding:0;display:grid;gap:10px}
.zonelist li{display:flex;align-items:center;gap:12px;font:600 14px var(--body)}
.zonelist li::before{content:"";width:34px;height:10px;border-radius:5px;background:linear-gradient(90deg,var(--za),var(--zb));box-shadow:0 0 12px var(--za)}
.zonelist .zn{font:16px/1 var(--display);letter-spacing:.02em}
.zonelist .zs{color:var(--dim);font-size:13px}
@media (max-width:720px){.modes{grid-template-columns:1fr}.mode.endless{grid-row:auto}}
/* hangar: a strip you scroll through */
.strip{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding:6px 2px 18px;margin:0 -16px;padding-left:16px;padding-right:16px;list-style:none;scrollbar-width:thin}
.unit{flex:0 0 236px;scroll-snap-align:start;border:1px solid color-mix(in srgb,var(--u) 45%,transparent);border-radius:16px;padding:16px 16px 14px;background:linear-gradient(160deg,color-mix(in srgb,var(--u) 16%,rgba(7,5,15,.7)),rgba(7,5,15,.75));position:relative}
.unit::before{content:"";position:absolute;left:16px;right:16px;top:0;height:3px;border-radius:0 0 4px 4px;background:linear-gradient(90deg,var(--u),var(--w))}
.uhead{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.uname{font:22px/1 var(--display);color:var(--u)}
.urar{font-size:11px;font-weight:700;color:var(--r);border:1px solid color-mix(in srgb,var(--r) 60%,transparent);border-radius:999px;padding:2px 8px;white-space:nowrap}
.urole{font-weight:700;margin:6px 0 10px}
.ustats{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:5px}
.ustats li{display:grid;grid-template-columns:64px 1fr;align-items:center;gap:8px;font-size:11.5px;color:var(--dim)}
.sb{height:6px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden}
.sb i{display:block;height:100%;background:linear-gradient(90deg,var(--u),var(--w))}
.uperk,.uskill,.useason{font-size:13px;margin:6px 0 0;color:var(--dim)}
.uskill b{color:var(--ink)}
.useason{color:var(--u);font-weight:700}
/* seasons: a ladder that rises */
.season{display:grid;gap:28px;grid-template-columns:1.1fr .9fr;align-items:start}
.ladder{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.tier{display:grid;grid-template-columns:1.1fr 1fr 1.3fr;gap:10px;align-items:baseline;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:rgba(7,5,15,.5);margin-left:calc((6 - var(--i)) * 2%);font-size:14px}
.tier:first-child{border-color:color-mix(in srgb,var(--a) 70%,transparent);box-shadow:0 0 24px color-mix(in srgb,var(--a) 35%,transparent)}
.tname{font:18px/1 var(--display)}
.trp,.treward{color:var(--dim)}
.trp small,.treward small{font-size:12px}
.crown{border:1px solid color-mix(in srgb,var(--b) 70%,transparent);border-radius:18px;padding:22px}
.crown .top10{font:40px/1 var(--display);color:var(--b)}
.crown .monarch{font:30px/1 var(--display);color:hsl(46 100% 60%);margin:8px 0 4px}
.count{margin-top:22px}
.count .n{font:clamp(30px,5vw,46px)/1 var(--display);color:var(--ink);display:flex;gap:14px;flex-wrap:wrap}
.count .n small{font:600 13px var(--body);color:var(--dim);margin-left:4px}
.rules{list-style:none;padding:0;margin:18px 0 0;color:var(--dim);font-size:14px;display:grid;gap:4px}
.rules li::before{content:"";display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--b);margin-right:10px;vertical-align:1px}
@media (max-width:760px){.season{grid-template-columns:1fr}.tier{grid-template-columns:1fr 1fr;margin-left:0}.treward{grid-column:1/-1}}
.cta{text-align:center}
.cta .play{margin:8px 0 22px}
.langs{display:flex;flex-wrap:wrap;gap:8px 14px;justify-content:center;color:var(--dim);font-size:14px;margin:0;padding:0;list-style:none}
footer{padding:36px 16px 48px;border-top:1px solid var(--line);color:var(--dim);font-size:13px}
footer .wrap{display:flex;flex-wrap:wrap;gap:10px 22px;justify-content:space-between}
footer a{color:var(--dim)}
footer a:hover{color:var(--ink)}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.sky i{transition:none}.play,.play::after{transition:none;animation:none!important}}
</style>
</head>
<body data-zone="0">
<div class="sky" aria-hidden="true">${skyLayers}</div>
<div class="grid" aria-hidden="true"></div>
<header class="top">
  <a class="home" href="../">SWISHBY</a>
  <label class="langbox"><span data-t="lang_label"></span><select id="lang" aria-label="Language">${opts}</select></label>
</header>
<main>
  <section class="hero" data-zone="0">
    <canvas id="attract" aria-hidden="true"></canvas>
    <div class="inner">
      <h1>SWISHBY</h1>
      <img class="logo" src="../logo-swishby.png" alt="SWISHBY 2027" width="800" height="285" decoding="async" fetchpriority="high">
      <p class="tag" data-t="tag"></p>
      <p class="sub" data-t="sub"></p>
      <a class="play" href="../" data-t="start"></a>
    </div>
  </section>

  <section class="zone" data-zone="1" id="run">
    <div class="wrap">
      <h2 data-t="h_run"></h2>
      <ol class="run">
        <li class="step"><h3 data-t="startSub"></h3><p data-t="s1"></p></li>
        <li class="step"><h3 data-t="c1"></h3><p data-t="s2"></p></li>
        <li class="step"><h3 data-t="c2"></h3><p data-t="s3"></p></li>
        <li class="step"><h3 data-t="c4"></h3><p data-t="s4"></p></li>
        <li class="step"><h3 data-t="c5"></h3><p data-t="s5"></p></li>
      </ol>
    </div>
  </section>

  <section class="zone" data-zone="2" id="modes">
    <div class="wrap">
      <h2 data-t="h_modes"></h2>
      <div class="modes">
        <article class="mode endless"><h3 data-t="endless"></h3><span class="big">50</span><p data-t="m_endless_d"></p>
          <ul class="zonelist">${zones.map((z, i) => `<li style="--za:${hsl(z.a)};--zb:${hsl(z.b)}"><span class="zn">${z.name}</span><span class="zs">${data.stages[i].from}–${data.stages[i].to}</span></li>`).join('')}</ul></article>
        <article class="mode daily"><h3 data-t="daily"></h3><span class="big" id="today"></span><p data-t="m_daily_d"></p></article>
        <article class="mode vs"><h3 data-t="vs"></h3><span class="big">+20~80</span><p data-t="m_vs_d"></p></article>
      </div>
    </div>
  </section>

  <section class="zone" data-zone="2" id="units">
    <div class="wrap">
      <h2 data-t="h_units"></h2>
      <p class="lead" data-t="units_d"></p>
      <ul class="strip" id="strip">${unitCards}
      </ul>
    </div>
  </section>

  <section class="zone" data-zone="3" id="season">
    <div class="wrap">
      <h2 data-t="h_season"></h2>
      <p class="lead" data-t="season_d"></p>
      <div class="season">
        <ol class="ladder" reversed>${tierRows}
        </ol>
        <aside class="crown">
          <div class="top10" data-t="top10"></div>
          <div class="monarch">MONARCH</div>
          <div data-t="season_unit"></div>
          <div class="count"><div data-t="next_season"></div><div class="n" id="count" aria-live="polite"></div></div>
          <ul class="rules"><li data-t="rule_min"></li><li data-t="rule_cap"></li></ul>
        </aside>
      </div>
    </div>
  </section>

  <section class="zone cta" data-zone="0">
    <div class="wrap">
      <a class="play" href="../" data-t="cta2"></a>
      <ul class="langs">${LANGS.map(l => `<li lang="${l}">${langs[l]._n}</li>`).join('')}</ul>
    </div>
  </section>
</main>
<footer>
  <div class="wrap">
    <span><span data-t="made_by"></span> 미니멀코리아</span>
    <span><a href="../terms.html" data-t="legalTerms"></a> &nbsp; <a href="../privacy.html" data-t="legalPrivacy"></a></span>
  </div>
</footer>
<script id="about-data" type="application/json">${json}</script>
<script>
(() => {
'use strict';
const D = JSON.parse(document.getElementById('about-data').textContent);
const LANGS = Object.keys(D.langs);
// ---- language: the game's own choice first (same origin, same key), then the browser ----
const pick = () => {
  let s = '';
  try { s = String(localStorage.getItem('fw27_lang') || '').replace(/"/g, ''); } catch (e) {}
  if (LANGS.includes(s)) return s;
  for (const n of (navigator.languages || [navigator.language || 'en'])) { const c = String(n).toLowerCase().slice(0, 2); if (LANGS.includes(c)) return c; }
  return 'en';
};
const sel = document.getElementById('lang');
let lang = pick();
function apply(l){
  lang = l; const L = D.langs[l], E = D.langs.en;
  document.documentElement.lang = l; sel.value = l;
  document.querySelectorAll('[data-t]').forEach(el => { const k = el.dataset.t; el.textContent = L[k] ?? E[k] ?? ''; });
  document.querySelectorAll('[data-st]').forEach(el => { el.textContent = L.st[Number(el.dataset.st)]; });
  document.title = 'SWISHBY – ' + L.tag;
  tick();
}
sel.addEventListener('change', () => { apply(sel.value); try { localStorage.setItem('fw27_lang', sel.value); } catch (e) {} });
// ---- today's course and the next season (seasons turn at 00:00 Asia/Seoul on the 1st) ----
const KST = 9 * 3600e3;
document.getElementById('today').textContent = new Date(Date.now() + KST).toISOString().slice(5, 10).replace('-', '.');
function tick(){
  const k = new Date(Date.now() + KST);
  const next = Date.UTC(k.getUTCFullYear(), k.getUTCMonth() + 1, 1) - KST;
  let s = Math.max(0, Math.floor((next - Date.now()) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60);
  const u = D.langs[lang].dhm;
  document.getElementById('count').innerHTML = [[d, u[0]], [h, u[1]], [m, u[2]]].map(([n, t]) => '<span>' + n + '<small>' + t + '</small></span>').join('');
}
setInterval(tick, 30000);
// ---- the page flies through the four zones as you scroll ----
const body = document.body;
if ('IntersectionObserver' in window){
  const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) body.dataset.zone = e.target.dataset.zone; }, { rootMargin: '-45% 0px -45% 0px' });
  document.querySelectorAll('[data-zone]').forEach(s => { if (s !== body) io.observe(s); });
}
apply(lang);

// ---- attract mode: the game plays itself behind the logo ----
const cv = document.getElementById('attract'), cx = cv.getContext('2d');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let W = 0, H = 0, S = 1, last = 0, run = true, visible = true;
const gates = [], sparks = [], trail = [], texts = [];
const bird = { x: 0, y: 0, vy: 0, flapT: 0, tilt: 0 };
let gateT = 0, n = 0, combo = 0, dashT = 0, gauge = 0;
const hsl = c => 'hsl(' + c[0] + ' ' + c[1] + '% ' + c[2] + '%)';
const zone = () => D.zones[Number(body.dataset.zone) || 0];
function size(){
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = cv.clientWidth; H = cv.clientHeight; S = H / 720;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bird.x = Math.round(W * 0.22); if (!bird.y) bird.y = H * 0.5;
}
function spawn(){
  const gapH = H * (0.22 + Math.random() * 0.06), gapY = H * 0.16 + Math.random() * (H * 0.68 - gapH);
  gates.push({ x: W + 60 * S, gapY, gapH, passed: false, near: Math.random() < 0.6 });
}
function flap(){ bird.vy = -H * 0.62; bird.flapT = 0.18; }
function step(dt){
  gateT -= dt; if (gateT <= 0) { spawn(); gateT = 1.75; }
  const speed = (dashT > 0 ? 2.1 : 1) * W * 0.36 * dt;
  for (const g of gates) g.x -= speed;
  while (gates.length && gates[0].x < -80 * S) gates.shift();
  const g = gates.find(x => !x.passed);
  // autopilot: aim for the middle, or for the edge when a near-miss is due
  const aim = g ? g.gapY + g.gapH * (g.near ? 0.80 : 0.5) : H * 0.5;
  const grav = H * 2.0;
  const yp = bird.y + bird.vy * 0.28 + 0.5 * grav * 0.28 * 0.28;
  if (yp > aim && bird.flapT <= 0) flap();
  bird.vy += grav * dt; bird.y += bird.vy * dt; bird.flapT -= dt;
  if (g) { const lo = g.gapY + 10 * S, hi = g.gapY + g.gapH - 10 * S; if (bird.y < lo) { bird.y = lo; bird.vy = Math.max(bird.vy, 0); } if (bird.y > hi) { bird.y = hi; bird.vy = Math.min(bird.vy, 0); } }
  bird.y = Math.max(20 * S, Math.min(H - 20 * S, bird.y));
  bird.tilt = Math.max(-0.5, Math.min(0.7, bird.vy / (H * 0.9)));
  if (g && g.x < bird.x) {
    g.passed = true; n++;
    const edge = Math.min(bird.y - g.gapY, g.gapY + g.gapH - bird.y);
    if (edge < H * 0.075) { combo++; burst(bird.x, bird.y, 18); texts.push({ x: bird.x + 24 * S, y: bird.y - 26 * S, t: 0, s: combo > 1 ? 'PERFECT x' + combo : 'PERFECT' }); gauge = Math.min(1, gauge + 0.34); }
    else combo = 0;
    gauge = Math.min(1, gauge + 0.12);
    if (gauge >= 1 && dashT <= 0) { dashT = 0.9; gauge = 0; texts.push({ x: bird.x + 24 * S, y: bird.y + 30 * S, t: 0, s: 'DASH' }); }
  }
  if (dashT > 0) { dashT -= dt; trail.push({ x: bird.x, y: bird.y, t: 0 }); }
  for (const t of trail) t.t += dt; while (trail.length && trail[0].t > 0.35) trail.shift();
  for (const t of texts) t.t += dt; while (texts.length && texts[0].t > 0.9) texts.shift();
  for (const p of sparks) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += H * 0.9 * dt; }
  while (sparks.length && sparks[0].t > 0.6) sparks.shift();
  for (const t of trail) t.x -= speed; for (const t of texts) t.x -= speed * 0.4;
}
function burst(x, y, k){ for (let i = 0; i < k; i++) { const a = Math.random() * Math.PI * 2, v = (60 + Math.random() * 180) * S; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0 }); } }
function draw(){
  const z = zone(), ga = hsl(z.gate), ca = hsl(z.a), cb = hsl(z.b);
  cx.clearRect(0, 0, W, H);
  cx.save(); cx.globalAlpha = 0.9;
  for (const g of gates) {
    const w = 26 * S;
    cx.shadowColor = ga; cx.shadowBlur = 22 * S; cx.fillStyle = ga;
    cx.fillRect(g.x - w / 2, 0, w, g.gapY); cx.fillRect(g.x - w / 2, g.gapY + g.gapH, w, H - g.gapY - g.gapH);
    cx.shadowBlur = 0; cx.fillStyle = 'rgba(255,255,255,.35)';
    cx.fillRect(g.x - w / 2, g.gapY - 3 * S, w, 3 * S); cx.fillRect(g.x - w / 2, g.gapY + g.gapH, w, 3 * S);
  }
  cx.restore();
  for (const t of trail) { const a = 1 - t.t / 0.35; cx.globalAlpha = a * 0.45; cx.fillStyle = cb; cx.beginPath(); cx.ellipse(t.x, t.y, 15 * S * a, 10 * S * a, 0, 0, Math.PI * 2); cx.fill(); }
  cx.globalAlpha = 1;
  // the bird: VOLT's colours, a body and a wing
  cx.save(); cx.translate(bird.x, bird.y); cx.rotate(bird.tilt);
  cx.shadowColor = ca; cx.shadowBlur = 24 * S; cx.fillStyle = ca;
  cx.beginPath(); cx.ellipse(0, 0, 16 * S, 11 * S, 0, 0, Math.PI * 2); cx.fill();
  cx.shadowBlur = 0; cx.fillStyle = cb;
  const wy = bird.flapT > 0 ? -9 * S : 4 * S;
  cx.beginPath(); cx.moveTo(-6 * S, 0); cx.lineTo(-20 * S, wy); cx.lineTo(4 * S, 2 * S); cx.closePath(); cx.fill();
  cx.fillStyle = '#07050f'; cx.beginPath(); cx.arc(7 * S, -3 * S, 2.6 * S, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = cb; cx.beginPath(); cx.moveTo(16 * S, -2 * S); cx.lineTo(24 * S, 1 * S); cx.lineTo(16 * S, 4 * S); cx.closePath(); cx.fill();
  cx.restore();
  for (const p of sparks) { cx.globalAlpha = 1 - p.t / 0.6; cx.fillStyle = Math.random() < 0.5 ? ca : cb; cx.fillRect(p.x, p.y, 3 * S, 3 * S); }
  cx.globalAlpha = 1; cx.textAlign = 'left'; cx.font = (20 * S) + 'px Bungee, "Chakra Petch", sans-serif';
  for (const t of texts) { const a = 1 - t.t / 0.9; cx.globalAlpha = a; cx.fillStyle = t.s === 'DASH' ? cb : ca; cx.fillText(t.s, t.x, t.y - t.t * 40 * S); }
  cx.globalAlpha = 1;
  // the dash gauge, bottom left, like the game's
  const gw = Math.min(220 * S, W * 0.4), gx = 16, gy = H - 22 * S;
  cx.fillStyle = 'rgba(255,255,255,.12)'; cx.fillRect(gx, gy, gw, 6 * S);
  cx.fillStyle = cb; cx.fillRect(gx, gy, gw * gauge, 6 * S);
}
function frame(ts){
  if (!run) return;
  const dt = Math.min(0.033, (ts - last) / 1000 || 0.016); last = ts;
  if (visible && !document.hidden) { step(dt); draw(); }
  requestAnimationFrame(frame);
}
size(); addEventListener('resize', size, { passive: true });
if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(cv);
for (let i = 0; i < 3; i++) { spawn(); for (const g of gates) g.x -= i * 0; }
gates.forEach((g, i) => { g.x = W * (0.55 + i * 0.5); });
if (reduce) { step(0.016); draw(); run = false; } else requestAnimationFrame(frame);
})();
</script>
</body>
</html>
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(new URL('about/', root), { recursive: true });
  const out = buildAbout();
  writeFileSync(new URL('about/index.html', root), out);
  console.log('about/index.html written:', out.length, 'chars');
}
