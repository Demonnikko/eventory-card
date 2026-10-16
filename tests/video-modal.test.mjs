import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoEmbed } from '../src/shared/lib/video-embed.js';

test('parseVideoEmbed разбирает ссылки VK Видео в iframe c video_ext.php', () => {
  const parsed1 = parseVideoEmbed('https://vkvideo.ru/video196783025_456239830');
  assert.equal(parsed1.type, 'iframe');
  assert.equal(parsed1.src, 'https://vkvideo.ru/video_ext.php?oid=196783025&id=456239830&autoplay=1');

  const parsed2 = parseVideoEmbed('https://vk.com/video196783025_456239830');
  assert.equal(parsed2.type, 'iframe');
  assert.equal(parsed2.src, 'https://vkvideo.ru/video_ext.php?oid=196783025&id=456239830&autoplay=1');

  const parsed3 = parseVideoEmbed('https://vkvideo.ru/video_ext.php?oid=196783025&id=456239830');
  assert.equal(parsed3.type, 'iframe');
  assert.match(parsed3.src, /oid=196783025/);
  assert.match(parsed3.src, /id=456239830/);
  assert.match(parsed3.src, /autoplay=1/);
});

test('parseVideoEmbed разбирает ссылки YouTube', () => {
  const p1 = parseVideoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(p1.type, 'iframe');
  assert.equal(p1.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1&rel=0');

  const p2 = parseVideoEmbed('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(p2.type, 'iframe');
  assert.equal(p2.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1&rel=0');

  const p3 = parseVideoEmbed('https://www.youtube.com/shorts/dQw4w9WgXcQ');
  assert.equal(p3.type, 'iframe');
  assert.equal(p3.src, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1&rel=0');
});

test('parseVideoEmbed разбирает ссылки Rutube и прямые mp4/webm', () => {
  const rutube = parseVideoEmbed('https://rutube.ru/video/1a2b3c4d5e/');
  assert.equal(rutube.type, 'iframe');
  assert.equal(rutube.src, 'https://rutube.ru/play/embed/1a2b3c4d5e/?autoStart=true');

  const direct = parseVideoEmbed('https://cdn.example.com/show.mp4');
  assert.equal(direct.type, 'video');
  assert.equal(direct.src, 'https://cdn.example.com/show.mp4');

  const unknown = parseVideoEmbed('https://example.com/page');
  assert.equal(unknown, null);

  assert.equal(parseVideoEmbed(''), null);
  assert.equal(parseVideoEmbed(null), null);
});
