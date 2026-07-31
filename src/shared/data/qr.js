import qrcode from 'qrcode-generator';

const ERROR_CORRECTION_LEVEL = 'M';
const QUIET_ZONE = 4;

function escapeAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// qrcode-generator implements the QR standard and selects the smallest version
// that can safely hold the current public URL. This stays synchronous so the
// card can render immediately, including offline.
export function qrMatrix(value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('empty_qr_value');

  const code = qrcode(0, ERROR_CORRECTION_LEVEL);
  code.addData(text, 'Byte');
  code.make();

  const size = code.getModuleCount();
  const modules = Array.from({ length: size }, (_, row) => (
    Array.from({ length: size }, (_, column) => code.isDark(row, column))
  ));

  return { modules, size, quiet: QUIET_ZONE };
}

export function qrSvg(value, { className = 'qr-svg', title = 'QR' } = {}) {
  const { modules, size: matrixSize, quiet } = qrMatrix(value);
  const size = matrixSize + quiet * 2;
  const path = [];

  // One path per horizontal run avoids hairline gaps between SVG modules.
  for (let y = 0; y < matrixSize; y += 1) {
    let runStart = -1;
    for (let x = 0; x < matrixSize; x += 1) {
      if (modules[y][x]) {
        if (runStart === -1) runStart = x;
      } else if (runStart !== -1) {
        const width = x - runStart;
        path.push(`M${runStart + quiet},${y + quiet}h${width}v1h${-width}z`);
        runStart = -1;
      }
    }
    if (runStart !== -1) {
      const width = matrixSize - runStart;
      path.push(`M${runStart + quiet},${y + quiet}h${width}v1h${-width}z`);
    }
  }

  return `
    <svg class="${escapeAttribute(className)}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeAttribute(title)}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
      <rect width="${size}" height="${size}" fill="#fff" />
      <path fill="#000" d="${path.join('')}" />
    </svg>
  `;
}

// Network PNG fallback for surfaces that explicitly need an image URL.
export function qrImgSrc(value) {
  return `https://quickchart.io/qr?text=${encodeURIComponent(value)}&size=400&margin=4&ecLevel=M`;
}

export function qrHtml(value) {
  const { modules, size, quiet } = qrMatrix(value);
  const total = size + quiet * 2;
  let html = '<div class="qr-grid"><div class="qr-grid-inner">';

  for (let y = 0; y < total; y += 1) {
    for (let x = 0; x < total; x += 1) {
      const moduleX = x - quiet;
      const moduleY = y - quiet;
      const dark = moduleX >= 0
        && moduleY >= 0
        && moduleX < size
        && moduleY < size
        && modules[moduleY][moduleX];
      html += `<i class="qr-module${dark ? ' is-dark' : ''}"></i>`;
    }
  }

  html += '</div></div>';
  return html;
}
