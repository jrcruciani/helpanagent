export async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function authenticateAgent(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Missing or invalid Authorization header', status: 401 };
  }

  const apiKey = authHeader.slice(7).trim();
  if (!apiKey) {
    return { error: 'Empty API key', status: 401 };
  }

  const keyHash = await sha256(apiKey);
  const agentData = await env.KV.get(`apikey:${keyHash}`, { type: 'json' });

  if (!agentData) {
    return { error: 'Invalid API key', status: 401 };
  }

  return { agent: agentData };
}

export async function createApiKey(env, agentId) {
  const apiKey = `hp_${crypto.randomUUID().replace(/-/g, '')}`;
  const keyHash = await sha256(apiKey);

  await env.KV.put(`apikey:${keyHash}`, JSON.stringify({
    agent_id: agentId,
    created_at: new Date().toISOString()
  }));

  return apiKey;
}
