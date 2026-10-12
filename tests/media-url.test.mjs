import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mediaUrl, uploadUrl } from '../src/shared/lib/media-url.js';
import { publicOriginOf } from '../api/og.js';

test('файл Blob показывается через свой домен /media/', () => {
  assert.equal(
    mediaUrl('https://abcd1234efgh.public.blob.vercel-storage.com/covers/card1234/0a1b2c3d4e5f6a7b8c.jpg'),
    '/media/abcd1234efgh/covers/card1234/0a1b2c3d4e5f6a7b8c.jpg'
  );
});

test('локальные и чужие адреса не трогаем', () => {
  for (const src of ['', 'data:image/jpeg;base64,AAAA', 'blob:https://x/1', '/api/og?slug=a&photo=cover', 'https://example.com/a.jpg']) {
    assert.equal(mediaUrl(src), src);
  }
  assert.equal(mediaUrl(undefined), '');
  // Хост-подделка с нужной подстрокой не проходит.
  assert.equal(
    mediaUrl('https://evil.com/x.public.blob.vercel-storage.com/a.jpg'),
    'https://evil.com/x.public.blob.vercel-storage.com/a.jpg'
  );
});

test('адрес загрузки уходит через /blob-api/ с теми же параметрами', () => {
  assert.equal(
    uploadUrl('https://vercel.com/api/blob/?pathname=covers%2Fa.jpg&token=t'),
    '/blob-api/?pathname=covers%2Fa.jpg&token=t'
  );
  assert.equal(uploadUrl('https://vercel.com/api/blobber/x'), 'https://vercel.com/api/blobber/x');
  assert.equal(uploadUrl('https://other.example/upload'), 'https://other.example/upload');
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
