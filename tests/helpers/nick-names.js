// The names tests/nick.test.js runs through the browser filter, and scripts/nick-rehearsal.mjs prints into
// supabase/rehearsal/nick.sql to run through private.fw_nick_bad on Postgres.
// one name per line of defence
export const REFUSED = [
  // English, plain and dressed up
  'fuck', 'FUCK', 'fuuuuck', 'f.u.c.k', 'f u c k', 'xXfuckXx', 'fvck', 'phuck', 'sh1t', '5hit', 'b!tch', 'bitch99',
  'a$$hole', 'nigger', 'n1gga', 'faggot', 'cunt', 'whore', 'slut', 'retard', 'ass', 'a.s.s', 'a55', 'x_ass_x', 'ass123',
  'Sex', '5ex', 'porn', 'dickhead', 'cock', 'rape', 'nazi', 'hitler88', 'pedo', 'kys', 'fuk', 'bullshit', 'Shithead',
  'ｆｕｃｋ', 'ＦＵＣＫ',          // full-width letters
  'fu​ck', 'fück',                                        // zero-width space, accent
  // Korean
  '씨발', '시발', '시벌', '씨벌', '시1발', '시 발', '시.발', '씨이발', '씨팔', '병신', '븅신', '지랄', '개새끼', '좆같네', '씹새',
  'ㅅㅂ', 'ㅆㅂ', 'ㅄ', 'ㅂㅅ', 'ㅈㄹ', 'ㅅ발', '창녀', '섹스', '보지', '자지', '보지12', '한남충', '짱깨', '쪽바리',
  '시발',                                 // 시발 as separate (decomposed) jamo
  'sibal', 'ssibal', 'shibal', 'tlqkf', 'Tlqkf', 'qudtls',
  // Japanese, Chinese
  '死ね', 'ちんぽ', 'まんこ', 'チンポ', 'キチガイ', 'ファック', 'セックス', 'レイプ',
  '操你妈', '操你媽', '草泥马', '傻逼', '他妈的', '婊子', '鸡巴', '干你娘', '强奸', '支那', '你妈的', '去你媽', 'cnm', 'wcnm', 'nmsl',
  // Spanish, Portuguese, French, German, Indonesian, Vietnamese
  'puta', 'Puto', 'hijodeputa', 'hijo de puta', 'mierda', 'pendejo', 'cabrón', 'maricón', 'verga', 'culo',
  'caralho', 'merda', 'buceta', 'porra', 'cuzão', 'viado', 'filho da puta',
  'putain', 'merde', 'salope', 'connard', 'enculé', 'pute', 'bâtard',
  'scheiße', 'Scheisse', 'arschloch', 'fotze', 'hurensohn', 'wichser', 'fick dich', 'arsch',
  'anjing', 'bangsat', 'kontol', 'memek', 'ngentot', 'jancok', 'goblok',
  'địt', 'ĐỊT', 'địt mẹ', 'cặc', 'đéo', 'buồi', 'đụ má', 'ditme', 'vcl',
  'ḍit'.replace('d', 'đ').replace('̣i', 'ị'),   // địt typed with a combining dot below
  // Thai, Hindi (and Hindi in Latin letters)
  'ไอ้เหี้ย', 'ควย', 'เย็ดแม่', 'กะหรี่', 'หี',
  'चूतिया', 'चुतिया', 'मादरचोद', 'बहनचोद', 'भोसड़ी', 'रंडी',
  'chutiya', 'Madarchod', 'behenchod', 'bhenchod', 'bhosdi', 'gandu', 'randi',
  // world launch: Russian, Arabic, Hebrew, Traditional Chinese (Taiwan)
  'хуй', 'ХУЙ', 'нахуй', 'пиздец', 'Пизда', 'ёбаный', 'заебал', 'уебан', 'мудак', 'блядь', 'блять', 'пидор', 'гандон', 'шлюха', 'жопа', 'сука', 'Сука', 'с у к а', 'педик',
  'كسمك', 'كس امك', 'شرموطة', 'قحبة', 'منيوك', 'معرص', 'ابن الكلب', 'طيز', 'كس', 'زب', 'نيك', 'خول', 'سكس',
  'בן זונה', 'זונה', 'כוס אמק', 'שרמוטה', 'מניאק', 'מזדיין', 'כוס', 'זין', 'חרא', 'סקס',
  '幹你娘', '幹林娘', '靠北', '機掰', '雞掰', '雞巴', '草泥馬', '賤人', '黑鬼', '他媽的',
  // Turkish, Polish, Italian, Dutch, Finnish, Norwegian, Malay
  'orospu', 'orospu çocuğu', 'amına koyayım', 'aminakoyim', 'amcık', 'siktir', 'sikerim', 'pezevenk', 'yarrak', 'kahpe', 'yavşak', 'amk', 'ibne',
  'kurwa', 'Kurwa mać', 'skurwysyn', 'chuj', 'pierdolę', 'spierdalaj', 'jebać', 'zajebisty', 'pizda', 'cipa', 'dupa', 'cwel',
  'cazzo', 'vaffanculo', 'stronzo', 'puttana', 'coglione', 'minchia', 'frocio', 'porco dio', 'zoccola',
  'kanker', 'klootzak', 'kut', 'lul', 'hoer', 'hoerenzoon', 'tering', 'kankerlijer', 'godverdomme', 'flikker', 'kutwijf',
  'vittu', 'perkele vittu', 'kusipää', 'mulkku', 'kyrpä', 'paska', 'huora', 'neekeri',
  'faen', 'fitte', 'hore', 'horunge', 'pakkis',
  'pukimak', 'kimak', 'pelacur', 'haram jadah', 'cibai', 'lancau'
];

export const ALLOWED = [
  // refused by the first draft, found in review: laughter, number suffixes, initials, short forms, surnames, bird names
  'kkkkk', 'Jo\u00E3o kkkk', '455', '717', '민수455', 'たろう455', 'Kim 455', 'Mr 717', 'Ana L', 'As U', 'Kike', 'Marica', 'Porras', 'Negre', 'Polla',
  'Blue Tit', "P'tit Loup", 'T\u00EDt', 'Maine Coon', 'Van Dyke', 'Moby Dick', 'Cum Laude', 'DMM', 'Babi', 'Asu', 'Siriporn', 'Romanko', 'Retardataire',
  'パチンコ', 'ぱちんこ', 'Pachinko', '妈妈的宝贝', '媽媽的愛', '아저씨바보', '한강간다',
  'Pilot', 'Pilot-7175', 'Pilot-4552', 'AI 1', 'AI', '—', 'Flux Wing', 'Swishby', 'SWISHBY', 'xX_Ace_Xx', 'Player1', 'b1g b1rd', 'N0va',
  // innocent words that hold a refused one
  'class', 'bass', 'assassin', 'Cockpit', 'peacock', 'Hancock', 'Dickens', 'grape', 'Essex', 'sexy', 'spicy',
  'cucumber', 'analog', 'raccoon', 'torpedo', 'nightwatch', 'Nazir', 'therapist', 'Matsushita', 'Yamashita',
  'Fukuoka', 'Niger', 'Nigeria', 'count', 'account', 'popcorn', 'title', 'hello', 'shiba', 'London', 'video',
  'computer', 'dispute', 'unique', 'reputation', 'cálculo', 'enviado', 'Vergara', 'Maricarmen', 'icono',
  'Marsch', 'negeri', 'kasus', 'volonté', 'pollo', 'Montenegro',
  '고양이', '시바견', '날보지마', '자지마', '새끼고양이', '무지개새', '성교육', '비행기', '불사조',
  'たのしい', 'さくら', 'がいじん', 'ガイジン', 'パイロット', '中国', '飞行员', '日本', '妈妈',
  'Nguyễn', 'lồng đèn', 'đĩa bay', 'buổi sáng', 'Việt Nam',
  'สมชาย', 'นักบิน', 'หีบสมบัติ', 'ประเทศไทย', 'ราหุล', 'प्रिया', 'पायलट', 'भारत', 'Randip', 'Gandalf', 'Rahul', 'Priya', 'Lund',
  // world launch: ordinary words that hold a refused stem
  'небанальный', 'колебать', 'застраховать', 'Сукачев', 'педикюр', 'мандарин', 'Пилот', 'Наташа', 'Москва', 'суки-суки',
  'دخول', 'عكس', 'كسر', 'تكنيك', 'نيكول', 'فرصة', 'طيار', 'محمد', 'ساكسفون',
  'אחראי', 'כוסית', 'סקסופון', 'מזל טוב', 'טייס', 'ישראל',
  '台灣', '飛行員', '媽媽的愛', '黑色', '機器人',
  'şikayet', 'Sıkıcı', 'klasik', 'müzik', 'Amasya', 'Kahraman', 'İstanbul',
  'principal', 'Cipangu', 'kurtka', 'dupla', 'Kraków', 'Łukasz',
  'Troia', 'figata', 'Francesca', 'cazzuola',
  'catering', 'steering', 'hoera', 'kutje', 'Lulu',
  'Kapteeni', 'paskal', 'Huoranen',
  'fittest', 'Horten', 'faena', 'Pukka', 'Babi', 'sundal', 'Keeling', 'Kuk', 'Puki', 'figa'
];
