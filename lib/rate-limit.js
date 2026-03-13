const MAX_REQUESTS = 10;
const WINDOW_SECONDS = 3600;

export async function checkRateLimit(kv, agentId) {
  const key = `rate:${agentId}`;
  const current = await kv.get(key, { type: 'json' });

  if (!current) {
    await kv.put(key, JSON.stringify({ count: 1, window_start: Date.now() }), {
      expirationTtl: WINDOW_SECONDS
    });
    return { allowed: true, remaining: MAX_REQUESTS - 1 };
  }

  if (current.count >= MAX_REQUESTS) {
    const resetAt = current.window_start + WINDOW_SECONDS * 1000;
    return { allowed: false, remaining: 0, resetAt };
  }

  current.count++;
  const ttl = Math.ceil((current.window_start + WINDOW_SECONDS * 1000 - Date.now()) / 1000);
  await kv.put(key, JSON.stringify(current), { expirationTtl: Math.max(ttl, 1) });
  return { allowed: true, remaining: MAX_REQUESTS - current.count };
}
