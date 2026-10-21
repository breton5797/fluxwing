// delete-account.html: the account-deletion page Google Play links from the store listing (Data safety → delete account URL).
// Play asks that it names the app and the developer, shows the steps prominently, and says what is deleted or kept and for how long.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');

test('delete-account.html exists, Korean then English, names the app, the developer and the contact', () => {
  assert.ok(existsSync(new URL('delete-account.html', root)), 'delete-account.html missing');
  const h = read('delete-account.html');
  assert.match(h, /^<!doctype html>/i);
  assert.match(h, /<html lang="ko">/);
  assert.match(h, /<meta name="viewport"/);
  for (const s of ['SWISHBY', 'MINIMALKOREA', '미니멀코리아', 'minimalkorea@naver.com']) assert.ok(h.includes(s), s);
  assert.match(h, /<section id="ko"/);
  assert.match(h, /<section id="en" lang="en"/);
});

test('delete-account.html gives the steps and what is deleted or kept, in both languages', () => {
  const h = read('delete-account.html');
  assert.match(h, /<ol>/, 'numbered steps');
  assert.ok(h.includes('계정 삭제') && h.includes('Delete account'), 'the in-game button in both languages');
  assert.ok(/30일/.test(h) && /30 days/.test(h), 'deadline for email requests');
  assert.ok(/삭제되는 정보/.test(h) && /What is deleted/.test(h), 'deleted data');
  assert.ok(/남는 정보/.test(h) && /What is kept/.test(h), 'kept data');
});

test('delete-account.html loads nothing from a third party and is linked from the privacy policy', () => {
  const h = read('delete-account.html');
  assert.ok(!/<script/i.test(h), 'no script');
  assert.ok(!/https?:\/\/(fonts\.|cdn\.|www\.googletagmanager|sdk\.)/.test(h), 'no third-party loads');
  assert.ok(read('privacy.html').includes('delete-account.html'), 'privacy.html links the page');
});
