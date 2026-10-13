import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadNickFilter, nickFilterSql } from '../scripts/nick-filter-sql.mjs';

const { nickBad } = loadNickFilter();
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

// one name per line of defence; the same lists are run against the SQL function by hand (see the PR)
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
  'ḍit'.replace('d', 'đ').replace('̣i', 'ị')    // địt typed with a combining dot below
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
  'Nguyễn', 'lồng đèn', 'đĩa bay', 'buổi sáng', 'Việt Nam'
];

test('nickname filter refuses the listed names', () => {
  const passed = REFUSED.filter(n => !nickBad(n));
  assert.deepEqual(passed, []);
});

test('nickname filter lets ordinary names through', () => {
  const blocked = ALLOWED.filter(n => nickBad(n));
  assert.deepEqual(blocked, []);
});

test('no default Pilot-NNNN name is ever refused', () => {
  const blocked = [];
  for (let i = 1000; i < 10000; i++) if (nickBad('Pilot-' + i)) blocked.push(i);
  assert.deepEqual(blocked, []);
});

test('nickname filter copes with odd input', () => {
  for (const v of ['', ' ', null, undefined, 0, 'a'.repeat(5000), '\u0000', '😀😀', '+++', '(((', '\\']) assert.equal(nickBad(v), false);
});

test('schema.sql holds the function generated from the lists in index.html', () => {
  assert.ok(schema.includes(nickFilterSql()), 'run: node scripts/nick-filter-sql.mjs and paste it over private.fw_nick_bad in supabase/schema.sql');
});

test('both server paths that store a name run the filter', () => {
  const body = name => { const i = schema.indexOf('create or replace function ' + name); return schema.slice(i, schema.indexOf('$$;', i)); };
  assert.match(body('private.fw_submit_score'), /private\.fw_nick_bad\(v_nick\)/);
  assert.match(body('private.fw_vs_nick'), /private\.fw_nick_bad\(n\)/);
  assert.ok(schema.indexOf('function private.fw_nick_bad') < schema.indexOf('function private.fw_vs_nick'), 'fw_nick_bad must be created before the SQL function that calls it');
  assert.match(schema, /revoke all on function private\.fw_nick_bad\(text\)\s+from public, anon, authenticated;/);
  assert.match(schema, /fw_nick_bad self-test/, 'the paste must stop if the function misjudges');
  assert.doesNotMatch(schema, /^update [a-z_.]+\s+set nick/m, 'renaming stored names is a by-hand step (after reading the preview), never part of the paste');
});
