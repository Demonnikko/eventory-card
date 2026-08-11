// Склонение русских имён в родительный падеж: «Видеоотзыв для Дмитрия
// Костюка», а не «для Дмитрий Костюк». Полноценная морфология здесь была бы
// избыточна — берём правила, покрывающие подавляющее большинство имён и
// фамилий, и сознательно оставляем слово без изменений там, где не уверены:
// невнятно склонённое имя выглядит хуже, чем несклонённое.

// Женские имена на -а/-я неотличимы от мужских по окончанию (Никита, Илья),
// поэтому список тех, кто на самом деле мужчина, важен для отчеств и фамилий.
const MALE_NAMES_ON_A = new Set([
  'никита', 'илья', 'кузьма', 'фома', 'савва', 'лука', 'данила', 'гаврила',
  'вавила', 'сила', 'юра', 'дима', 'миша', 'саша', 'паша', 'гоша', 'лёша',
  'алёша', 'серёжа', 'ваня', 'коля', 'толя', 'петя', 'витя', 'костя', 'вася'
]);

// Имена и фамилии, которые не склоняются вовсе.
const INDECLINABLE_ENDINGS = ['их', 'ых', 'ко', 'енко', 'аго', 'ово', 'у', 'ю', 'э', 'и', 'о'];

function isFemaleByName(name) {
  const lower = name.toLowerCase();
  if (MALE_NAMES_ON_A.has(lower)) return false;
  return /[ая]$/.test(lower);
}

// Мягкий знак и шипящие меняют окончание: Игорь → Игоря, но Пётр → Петра.
function genitiveFirstName(name) {
  const lower = name.toLowerCase();

  if (/[ая]$/.test(lower)) {
    // Мария → Марии, Илья → Ильи, Анна → Анны, Никита → Никиты
    if (/[ия]я$/.test(lower)) return name.slice(0, -2) + 'ии';
    if (/я$/.test(lower)) return name.slice(0, -1) + 'и';
    if (/[гкхжчшщ]а$/.test(lower)) return name.slice(0, -1) + 'и';
    return name.slice(0, -1) + 'ы';
  }

  // Женские имена на согласную и на -ь не склоняются так же, как мужские:
  // Любовь → Любови, но Юдифь → Юдифи; мужское Игорь → Игоря.
  if (/ь$/.test(lower)) {
    if (isFemaleName(name)) return name.slice(0, -1) + 'и';
    return name.slice(0, -1) + 'я';
  }
  if (/й$/.test(lower)) return name.slice(0, -1) + 'я';

  if (/[бвгдзклмнпрстфхцчшщ]$/.test(lower)) {
    // Беглая гласная и чередование ё/е: Пётр → Петра, Лев → Льва.
    if (lower === 'пётр' || lower === 'петр') return name[0] + 'етра';
    if (lower === 'лев') return name[0] + 'ьва';
    if (lower === 'павел') return name.slice(0, -2) + 'ла';
    return name + 'а';
  }

  return name;
}

const FEMALE_NAMES_ON_SOFT = new Set(['любовь', 'нинель', 'рахиль', 'юдифь', 'эсфирь', 'адель']);

function isFemaleName(name) {
  return FEMALE_NAMES_ON_SOFT.has(name.toLowerCase());
}

// Фамилия зависит от пола носителя: Костюк → Костюка, но у женщины не меняется.
function genitiveLastName(name, female) {
  const lower = name.toLowerCase();

  if (INDECLINABLE_ENDINGS.some((end) => lower.endsWith(end))) return name;

  // Иванов/Петрова, Пушкин/Пушкина
  if (/(ов|ев|ёв|ин|ын)$/.test(lower)) return female ? name + 'ой' : name + 'а';
  if (/(ова|ева|ёва|ина|ына)$/.test(lower)) return name.slice(0, -1) + 'ой';

  // Прилагательные: Толстой → Толстого, Толстая → Толстой
  if (/(ый|ий|ой)$/.test(lower)) return name.slice(0, -2) + 'ого';
  if (/(ая|яя)$/.test(lower)) return name.slice(0, -2) + 'ой';

  // Женские фамилии на согласную (Костюк, Шмидт) не склоняются.
  if (female) return name;

  if (/[ая]$/.test(lower)) {
    if (/я$/.test(lower)) return name.slice(0, -1) + 'и';
    if (/[гкхжчшщ]а$/.test(lower)) return name.slice(0, -1) + 'и';
    return name.slice(0, -1) + 'ы';
  }
  if (/ь$/.test(lower)) return name.slice(0, -1) + 'я';
  if (/й$/.test(lower)) return name.slice(0, -1) + 'я';
  if (/[бвгдзклмнпрстфхцчшщж]$/.test(lower)) return name + 'а';

  return name;
}

// Отчество склоняется как обычное мужское/женское имя на -ич/-на.
function genitivePatronymic(name) {
  const lower = name.toLowerCase();
  if (/(ич)$/.test(lower)) return name + 'а';
  if (/(на)$/.test(lower)) return name.slice(0, -1) + 'ы';
  return name;
}

// «Дмитрий Костюк» → «Дмитрия Костюка». Порядок слов сохраняем как есть:
// человек сам решил, писать ли фамилию первой.
export function genitiveFullName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const parts = raw.split(/\s+/);
  // Одно слово — скорее всего имя.
  if (parts.length === 1) return genitiveFirstName(parts[0]);

  const female = isFemaleByName(parts[0]) || isFemaleName(parts[0])
    || parts.some((p) => /(на|ова|ева|ёва|ина|ына|ская|цкая)$/i.test(p));

  return parts.map((part, i) => {
    if (i === 0) return genitiveFirstName(part);
    if (/(ович|евич|ьич|овна|евна|ична|инична)$/i.test(part)) return genitivePatronymic(part);
    return genitiveLastName(part, female);
  }).join(' ');
}

// Дательный падеж: «Отзыв отправлен Дмитрию Костюку».
function dativeWord(word, female, isFirst) {
  const lower = word.toLowerCase();

  if (INDECLINABLE_ENDINGS.some((end) => lower.endsWith(end))) return word;

  // Фамилии-прилагательные проверяем первыми: «Толстая» иначе попадёт
  // в общее правило слов на -а и превратится в «Толстае».
  if (!isFirst) {
    if (/(ая|яя)$/.test(lower)) return word.slice(0, -2) + 'ой';    // Толстая → Толстой
    if (/(ый|ий|ой)$/.test(lower)) return word.slice(0, -2) + 'ому'; // Толстой → Толстому
    if (female && /(ова|ева|ёва|ина|ына)$/.test(lower)) return word.slice(0, -1) + 'ой';
  }

  // Слова на -а/-я (Никита, Мария, Анна) — у обоих полов одинаково: -е/-и.
  if (/[ая]$/.test(lower)) {
    if (/[ия]я$/.test(lower)) return word.slice(0, -2) + 'ии';
    if (/ья$/.test(lower)) return word.slice(0, -2) + 'ье';   // Илья → Илье
    return word.slice(0, -1) + 'е';
  }

  if (female) {
    if (/ь$/.test(lower)) return word.slice(0, -1) + 'и';     // Любовь → Любови
    return word;                                              // Костюк, Шмидт
  }

  // Беглая гласная — до общих правил на согласную.
  if (lower === 'пётр' || lower === 'петр') return word[0] + 'етру';
  if (lower === 'лев') return word[0] + 'ьву';
  if (lower === 'павел') return word.slice(0, -2) + 'лу';

  if (/(ов|ев|ёв|ин|ын)$/.test(lower)) return word + 'у';           // Иванов → Иванову
  if (/ь$/.test(lower)) return word.slice(0, -1) + 'ю';             // Игорь → Игорю
  if (/й$/.test(lower)) return word.slice(0, -1) + 'ю';             // Дмитрий → Дмитрию
  if (/[бвгдзклмнпрстфхцчшщж]$/.test(lower)) return word + 'у';

  return word;
}

export function dativeFullName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const parts = raw.split(/\s+/);
  const female = isFemaleByName(parts[0]) || isFemaleName(parts[0])
    || parts.some((p) => /(на|ова|ева|ёва|ина|ына|ская|цкая)$/i.test(p));

  return parts.map((part, i) => {
    // Отчество: Сергеевич → Сергеевичу, Владимировна → Владимировне
    if (/(ович|евич|ьич)$/i.test(part)) return part + 'у';
    if (/(овна|евна|ична|инична)$/i.test(part)) return part.slice(0, -1) + 'е';
    return dativeWord(part, female, i === 0);
  }).join(' ');
}
