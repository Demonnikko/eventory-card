import test from 'node:test';
import assert from 'node:assert/strict';
import { getActData } from '../src/shared/lib/act-data.js';
import { normalizeBusinessCard, publicCardPayload } from '../src/shared/data/businessCard.js';

test('getActData формирует данные номера с обязательным префиксом «от» для длительности', () => {
  const card1 = {
    galleryPhotos: ['data:image/jpeg;base64,123'],
    galleryCaptions: ['Юбилей'],
    galleryDurations: ['20'],
    galleryTexts: ['Незабываемое шоу для гостей юбилея'],
    galleryIncludes: ['Реквизит\nИнтерактив с гостями\nМузыкальное сопровождение']
  };

  const act1 = getActData(card1, 0);
  assert.equal(act1.title, 'Юбилей');
  assert.equal(act1.duration, 'от 20 минут');
  assert.equal(act1.whatYouGet, 'Незабываемое шоу для гостей юбилея');
  assert.deepEqual(act1.includes, [
    'Реквизит',
    'Интерактив с гостями',
    'Музыкальное сопровождение'
  ]);
  // Проверка: цена нигде не фигурирует
  assert.equal(act1.price, undefined);
  assert.doesNotMatch(JSON.stringify(act1), /₽|руб|цена|стоимость/i);
});

test('getActData сохраняет префикс «от», если пользователь уже ввёл «от 30» или «от 30 минут»', () => {
  const card2 = {
    galleryPhotos: ['photo1', 'photo2'],
    galleryCaptions: ['Микромагия', 'Сценический блок'],
    galleryDurations: ['от 30', 'от 45 минут'],
    galleryTexts: ['', '']
  };

  const act1 = getActData(card2, 0);
  assert.equal(act1.duration, 'от 30 минут');

  const act2 = getActData(card2, 1);
  assert.equal(act2.duration, 'от 45 минут');
});

test('getActData использует форматы и card.included при отсутствии полей номера', () => {
  const card3 = {
    galleryPhotos: ['photo1'],
    galleryCaptions: ['Шоу для взрослых'],
    galleryDurations: [''],
    galleryTexts: [''],
    galleryIncludes: [''],
    formats: [{ minutes: 'от 20', title: 'Шоу для взрослых', description: 'Сценический интерактив' }],
    included: [{ text: 'Авторский реквизит' }, { text: 'Собственный звук' }]
  };

  const act = getActData(card3, 0);
  assert.equal(act.title, 'Шоу для взрослых');
  assert.equal(act.duration, 'от 20 минут');
  assert.equal(act.whatYouGet, 'Сценический интерактив');
  assert.deepEqual(act.includes, ['Авторский реквизит', 'Собственный звук']);
});

test('cleanBusinessCard и publicCardPayload сохраняют galleryDurations и galleryIncludes', () => {
  const normalized = normalizeBusinessCard({
    galleryPhotos: [],
    galleryCaptions: ['Номер 1'],
    galleryDurations: [' от 30 мин '],
    galleryIncludes: [' Пункт 1\nПункт 2 ']
  });

  assert.equal(normalized.galleryDurations[0], 'от 30 мин');
  assert.equal(normalized.galleryIncludes[0], 'Пункт 1\nПункт 2');

  const payload = publicCardPayload(normalized);
  assert.equal(payload.galleryDurations[0], 'от 30 мин');
  assert.equal(payload.galleryIncludes[0], 'Пункт 1\nПункт 2');
});
