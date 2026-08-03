// Небольшой распределённый rate limit поверх того же Upstash Redis.
// Идентификаторы хэшируются: IP, токен приглашения и ключ владельца не
// попадают в имена Redis-ключей в открытом виде.
import crypto from 'node:crypto';
import { redisCommand } from './_card-access.js';

function digest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 32);
}

export function clientIp(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req?.headers?.['x-real-ip'] || req?.socket?.remoteAddress || 'unknown').trim();
}

export async function checkRateLimit({ scope, identifier, limit, windowSeconds }) {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 1));
  const safeWindow = Math.max(1, Math.floor(Number(windowSeconds) || 60));
  const bucket = Math.floor(Date.now() / (safeWindow * 1000));
  const key = `eventory:ratelimit:${String(scope || 'api').slice(0, 40)}:${digest(`${identifier}:${bucket}`)}`;

  try {
    const count = Number(await redisCommand(['INCR', key]));
    // Если Redis временно недоступен, не блокируем весь продукт.
    if (!Number.isFinite(count) || count < 1) return { allowed: true, count: 0, retryAfter: 0 };
    if (count === 1) await redisCommand(['EXPIRE', key, String(safeWindow + 5)]);
    return {
      allowed: count <= safeLimit,
      count,
      retryAfter: count <= safeLimit ? 0 : safeWindow
    };
  } catch {
    return { allowed: true, count: 0, retryAfter: 0 };
  }
}

export async function enforceRateLimit(req, res, options) {
  const result = await checkRateLimit({
    ...options,
    identifier: `${clientIp(req)}:${options.identifier || ''}`
  });
  if (result.allowed) return true;
  res.setHeader('Retry-After', String(result.retryAfter || 60));
  res.status(429).json({ ok: false, error: 'rate_limited' });
  return false;
}
