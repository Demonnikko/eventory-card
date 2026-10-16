// Распознавание ссылок на видео (VK Видео, YouTube, Rutube, mp4)
// для безопасного встраивания во встроенный модальный плеер.

export function parseVideoEmbed(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const urlStr = rawUrl.trim();
  if (!urlStr) return null;

  // 1. VK Видео / VK.com
  if (/vkvideo\.ru|vk\.com/i.test(urlStr)) {
    if (/video_ext\.php/i.test(urlStr)) {
      try {
        const u = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
        if (!u.searchParams.has('autoplay')) u.searchParams.set('autoplay', '1');
        return {
          type: 'iframe',
          src: u.toString(),
          allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock'
        };
      } catch {
        return {
          type: 'iframe',
          src: urlStr,
          allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock'
        };
      }
    }
    const match = urlStr.match(/video(-?\d+)_(\d+)/i);
    if (match) {
      const oid = match[1];
      const id = match[2];
      let hash = '';
      try {
        const u = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
        hash = u.searchParams.get('hash') || '';
      } catch {
        // ignore url parse error
      }
      const hashParam = hash ? `&hash=${encodeURIComponent(hash)}` : '';
      return {
        type: 'iframe',
        src: `https://vkvideo.ru/video_ext.php?oid=${oid}&id=${id}${hashParam}&autoplay=1`,
        allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock'
      };
    }
  }

  // 2. YouTube
  if (/youtube\.com|youtu\.be/i.test(urlStr)) {
    let videoId = '';
    const shortMatch = urlStr.match(/youtu\.be\/([a-zA-Z0-9_-]+)/i);
    const shortsMatch = urlStr.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/i);
    const embedMatch = urlStr.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/i);
    if (shortMatch) videoId = shortMatch[1];
    else if (shortsMatch) videoId = shortsMatch[1];
    else if (embedMatch) videoId = embedMatch[1];
    else {
      try {
        const u = new URL(urlStr.startsWith('http') ? urlStr : `https://${urlStr}`);
        videoId = u.searchParams.get('v') || '';
      } catch {
        // ignore
      }
    }
    if (videoId) {
      return {
        type: 'iframe',
        src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&playsinline=1&rel=0`,
        allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
      };
    }
  }

  // 3. Rutube
  if (/rutube\.ru/i.test(urlStr)) {
    const match = urlStr.match(/rutube\.ru\/(?:video|play\/embed)\/([a-zA-Z0-9]+)/i);
    if (match) {
      const id = match[1];
      return {
        type: 'iframe',
        src: `https://rutube.ru/play/embed/${id}/?autoStart=true`,
        allow: 'clipboard-write; autoplay; fullscreen'
      };
    }
  }

  // 4. Прямой видеофайл (.mp4, .webm, .mov)
  if (/\.(mp4|webm|mov|ogg)(\?.*)?$/i.test(urlStr)) {
    return {
      type: 'video',
      src: urlStr
    };
  }

  return null;
}
