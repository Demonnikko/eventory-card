import test from 'node:test';
import assert from 'node:assert/strict';

import { cardForOffer, renderOfferBlock, renderOfferGone } from '../src/partner-offer.js';

const card = {
  name: 'Дмитрий',
  phone: '+79990000000',
  email: 'artist@example.com',
  telegram: 'artist',
  vk: 'artist',
  max: 'artist',
  website: 'https://artist.example'
};

const offer = {
  offerId: 'a'.repeat(20),
  artistSlug: 'kostyuk',
  items: [{ title: 'Шоу 30 минут', qty: 1, description: '' }],
  total: 18000,
  eventDate: '2026-12-14',
  partner: { name: 'Иван', phone: '+78880000000' },
  status: 'sent'
};

test('в КП партнёра визитка — витрина: ни контактов артиста, ни телефона партнёра', () => {
  const view = cardForOffer(card, offer);
  const text = JSON.stringify(view);
  assert.equal(view.name, 'Дмитрий');
  assert.equal(view.phone, '');
  assert.doesNotMatch(text, /\+7999|\+7888|artist@|"artist"|artist\.example/);
});

test('устаревшая ссылка КП тоже прячет контакты артиста', () => {
  const view = cardForOffer(card, { partner: {} });
  assert.equal(view.phone, '');
  assert.equal(view.telegram, '');
});

test('блок КП: итог, предоплата 50%, имя партнёра без телефона, кнопка «Согласен»; устаревшее — без кнопки', () => {
  const html = renderOfferBlock(offer);
  assert.match(html, /18\s000\s₽/);
  assert.match(html, /Предоплата 50%/);
  assert.match(html, /9\s000\s₽/);
  assert.match(html, /Иван/);
  assert.doesNotMatch(html, /\+7888|tel:/, 'телефона партнёра на странице нет');
  assert.match(html, /data-offer-agree/);
  assert.doesNotMatch(renderOfferBlock({ ...offer, status: 'agreed' }), /data-offer-agree/);
  assert.doesNotMatch(renderOfferGone(), /data-offer-agree/);
});
