/**
 * Нормализует данные конкретного номера для модального окна («окошечка»).
 * Приоритет:
 *   1) Прямые поля номера из визитки (galleryCaptions, galleryDurations, galleryTexts, galleryIncludes)
 *   2) Умные фолбэки: форматы шоу (formats) и состав (included)
 *   3) Профессиональный дефолт
 *
 * Главные правила:
 *   - Длительность всегда со словом «от» («от 20 минут», «от 30 минут»).
 *   - ЦЕНА СТРОГО НЕ УКАЗЫВАЕТСЯ.
 */
export function getActData(card, index) {
  const i = Math.max(0, Number(index) || 0);
  const photo = Array.isArray(card?.galleryPhotos) ? (card.galleryPhotos[i] || '') : '';
  const title = (Array.isArray(card?.galleryCaptions) && card.galleryCaptions[i])
    ? card.galleryCaptions[i]
    : `Номер ${i + 1}`;

  // 1. Длительность: строго префикс «от»
  let rawDuration = String(card?.galleryDurations?.[i] || '').trim();
  if (!rawDuration) {
    const fmt = card?.formats?.[i];
    if (fmt?.minutes) rawDuration = String(fmt.minutes).trim();
  }

  let duration = '';
  if (rawDuration) {
    if (!/^от\s+/i.test(rawDuration)) {
      const numMatch = rawDuration.match(/\d+/);
      if (numMatch) {
        duration = `от ${numMatch[0]} минут`;
      } else {
        duration = `от ${rawDuration}`;
      }
    } else {
      duration = rawDuration;
      if (/^от\s*\d+$/i.test(duration)) {
        duration = `${duration} минут`;
      }
    }
  } else {
    duration = 'от 20 минут';
  }

  // 2. «Что вы получаете» (эмоциональный результат, как в Eventory)
  let whatYouGet = String(card?.galleryTexts?.[i] || '').trim();
  if (!whatYouGet) {
    whatYouGet = String(card?.galleryHeadlines?.[i] || '').trim();
  }
  if (!whatYouGet) {
    const fmt = card?.formats?.[i];
    if (fmt?.description) whatYouGet = String(fmt.description).trim();
  }
  if (!whatYouGet) {
    whatYouGet = 'Интерактивный сценический номер с тонким юмором и живым участием гостей. Зал замирает от восторга и становится частью магии.';
  }

  // 3. «Что входит» (состав номера списком)
  let includes = [];
  const rawIncludes = card?.galleryIncludes?.[i];
  if (Array.isArray(rawIncludes)) {
    includes = rawIncludes.map((s) => String(s || '').trim()).filter(Boolean);
  } else if (typeof rawIncludes === 'string' && rawIncludes.trim()) {
    includes = rawIncludes
      .split(/\r?\n/)
      .map((line) => line.replace(/^[\s•\-–—✓*]+/, '').trim())
      .filter(Boolean);
  }

  if (!includes.length) {
    const cardInc = Array.isArray(card?.included)
      ? card.included.map((item) => (typeof item === 'string' ? item : item?.text)).filter(Boolean)
      : [];
    if (cardInc.length) {
      includes = cardInc;
    } else {
      includes = [
        'Интерактивная программа с живым участием гостей',
        'Современный авторский реквизит без бутафории',
        'Интеллигентный юмор без неловких пауз',
        'Собственное звуковое оформление'
      ];
    }
  }

  return {
    index: i,
    photo,
    title,
    duration,
    whatYouGet,
    includes
  };
}
