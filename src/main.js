import './card-app.css';
import { mountApp } from './app.js';

mountApp();

// Регистрация Service Worker — офлайн и установка на домашний экран.
// Обновление тихое: у бесплатной визитки нет данных, ради которых стоило бы
// показывать пользователю баннер и просить перезагрузиться.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* без SW приложение работает как обычный сайт */
    });
  });
}
