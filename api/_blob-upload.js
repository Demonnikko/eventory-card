// Разрешение на прямую загрузку файла в Vercel Blob.
//
// Файл не проходит через Function: сервер проверяет, кто и что грузит, и
// отдаёт короткоживущий адрес для PUT, а браузер отправляет файл сам.
// Общий кусок для видеоотзывов и обложек праздников.
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { blobAuth } from './_reviews-store.js';

const UPLOAD_WINDOW_MS = 5 * 60 * 1000;

export async function presignBlobUpload({ pathname, contentType, maxBytes }) {
  const validUntil = Date.now() + UPLOAD_WINDOW_MS;
  const signedToken = await issueSignedToken({
    pathname,
    operations: ['put'],
    allowedContentTypes: [contentType],
    maximumSizeInBytes: maxBytes,
    validUntil,
    ...blobAuth()
  });
  const { presignedUrl } = await presignUrl(signedToken, {
    operation: 'put',
    pathname,
    allowedContentTypes: [contentType],
    maximumSizeInBytes: maxBytes,
    validUntil,
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: 31536000
  });
  return presignedUrl;
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}
