import test from 'node:test';
import assert from 'node:assert/strict';
import { isOwnerBypassSlug, leadKeyMatches, normalizeSlug, normalizeLeadKey } from '../api/_card-access.js';

test('isOwnerBypassSlug правильно определяет владельца визитки', () => {
  assert.equal(isOwnerBypassSlug('-lqf7xvp'), true);
  assert.equal(isOwnerBypassSlug('dmitrykostiuk'), true);
  assert.equal(isOwnerBypassSlug('kostyuk'), true);
  assert.equal(isOwnerBypassSlug('random-guest'), false);
  assert.equal(isOwnerBypassSlug(''), false);
});

test('leadKeyMatches разрешает доступ владельцу с любым ключом', () => {
  const dmitryCard = { slug: '-lqf7xvp', leadKey: '0123456789abcdef0123456789abcdef' };
  // Любой ключ клиента
  assert.equal(leadKeyMatches(dmitryCard, 'fedcba9876543210fedcba9876543210', '-lqf7xvp'), true);
  // Даже пустой ключ
  assert.equal(leadKeyMatches(dmitryCard, '', '-lqf7xvp'), true);
  // Автоматически по data.slug
  assert.equal(leadKeyMatches(dmitryCard, 'wrong-key'), true);
});

test('leadKeyMatches требует точного совпадения для обычных пользователей', () => {
  const regularCard = { slug: 'guestcard', leadKey: '0123456789abcdef0123456789abcdef' };
  assert.equal(leadKeyMatches(regularCard, '0123456789abcdef0123456789abcdef'), true);
  assert.equal(leadKeyMatches(regularCard, '0123456789abcdef0123456789ABCDEF'), true);
  assert.equal(leadKeyMatches(regularCard, 'wrong-key'), false);
  assert.equal(leadKeyMatches(regularCard, ''), false);
});
