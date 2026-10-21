import test from 'node:test';
import assert from 'node:assert/strict';
import { leadKeyMatches, normalizeSlug } from '../api/_card-access.js';

const KEY = '0123456789abcdef0123456789abcdef';

test('красивые адреса ведут на исходную визитку', () => {
  assert.equal(normalizeSlug('dmitrykostiuk'), 'kostyuk');
  assert.equal(normalizeSlug('-lqf7xvp'), 'kostyuk');
  assert.equal(normalizeSlug('kostyuk'), 'kostyuk');
  assert.equal(normalizeSlug('guestcard'), 'guestcard');
  assert.equal(normalizeSlug('ab'), '');
});

test('владелец любой визитки доказывает права только своим ключом', () => {
  for (const slug of ['kostyuk', 'guestcard']) {
    const card = { slug, leadKey: KEY };
    assert.equal(leadKeyMatches(card, KEY), true);
    assert.equal(leadKeyMatches(card, KEY.toUpperCase()), true);
    assert.equal(leadKeyMatches(card, 'fedcba9876543210fedcba9876543210'), false, `${slug}: чужой ключ`);
    assert.equal(leadKeyMatches(card, ''), false, `${slug}: пустой ключ`);
    assert.equal(leadKeyMatches(card, 'wrong-key'), false, `${slug}: мусор вместо ключа`);
  }
});

test('визитка без ключа на сервере не открывается никому', () => {
  assert.equal(leadKeyMatches({ slug: 'guestcard' }, KEY), false);
});
