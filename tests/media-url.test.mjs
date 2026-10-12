import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mediaUrl, uploadUrl, behindOwnServer } from '../src/shared/lib/media-url.js';
import { publicOriginOf } from '../api/og.js';

const COVER = 'https://abcd1234efgh.public.blob.vercel-storage.com/covers/card1234/0a1b2c3d4e5f6a7b8c.jpg';

test('свой сервер — это любой домен, кроме Vercel и локального', () => {
  assert.equal(behindOwnServer('tadacard.ru'), true);
  assert.equal(behindOwnServer('eventory-card.vercel.app'), false);
  assert.equal(behindOwnServer('eventory-card-h6bqy5tm8-demonnikkos-projects.vercel.app'), false);
  assert.equal(behindOwnServer('localhost'), false);
  assert.equal(behindOwnServer('127.0.0.1'), false);
  assert.equal(behindOwnServer(undefined), false);
});

test('на своём сервере файл Blob показывается через /media/', () => {
  assert.equal(mediaUrl(COVER, true), '/media/abcd1234efgh/covers/card1234/0a1b2c3d4e5f6a7b8c.jpg');
});

test('на Vercel адреса Blob остаются прежними', () => {
  assert.equal(mediaUrl(COVER, false), COVER);
  assert.equal(mediaUrl(COVER), COVER); // в тестах нет location — как на Vercel
});

test('локальные и чужие адреса не трогаем', () => {
  for (const src of ['', 'data:image/jpeg;base64,AAAA', 'blob:https://x/1', '/api/og?slug=a&photo=cover', 'https://example.com/a.jpg']) {
    assert.equal(mediaUrl(src, true), src);
  }
  assert.equal(mediaUrl(undefined, true), '');
  // Хост-подделка с нужной подстрокой не проходит.
  assert.equal(
    mediaUrl('https://evil.com/x.public.blob.vercel-storage.com/a.jpg', true),
    'https://evil.com/x.public.blob.vercel-storage.com/a.jpg'
  );
});

test('адрес загрузки на своём сервере уходит через /blob-api/ с теми же параметрами', () => {
  const signed = 'https://vercel.com/api/blob/?pathname=covers%2Fa.jpg&token=t';
  assert.equal(uploadUrl(signed, true), '/blob-api/?pathname=covers%2Fa.jpg&token=t');
  assert.equal(uploadUrl(signed, false), signed);
  assert.equal(uploadUrl('https://vercel.com/api/blobber/x', true), 'https://vercel.com/api/blobber/x');
  assert.equal(uploadUrl('https://other.example/upload', true), 'https://other.example/upload');
});

test('превью берёт домен гостя только из белого списка', () => {
  const req = (headers) => ({ headers: { host: 'eventory-card.vercel.app', ...headers } });
  assert.equal(publicOriginOf(req({ 'x-card-public-host': 'tadacard.ru' })), 'https://tadacard.ru');
  assert.equal(publicOriginOf(req({ 'x-card-public-host': 'evil.com' })), 'https://eventory-card.vercel.app');
  assert.equal(publicOriginOf(req({})), 'https://eventory-card.vercel.app');
});

test('прямых обращений к заблокированным адресам в клиенте не осталось', async () => {
  for (const file of ['src/referral-card.js', 'src/cover-upload.js', 'src/reviews-data.js']) {
    const code = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.equal(/fetch\(\s*['"`]https:\/\/eventory-mvp\.vercel\.app/.test(code), false, file);
    assert.equal(/fetch\(\s*auth\.uploadUrl/.test(code), false, file);
  }
});
