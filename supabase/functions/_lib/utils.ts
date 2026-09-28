import { createClient } from 'https://esm.sh/@supabase/supabase-js@2/dist/esm/index.js';

export const CURRENCY = 'GHS';
export const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

export function createSupabase(req: Request) {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

export function applyCors(req: Request, init: ResponseInit = {}): ResponseInit {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'Content-Type, X-Ops-Token, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
  }
  init.headers = headers;
  return init;
}

export function json(data: unknown, status = 200, init: ResponseInit = {}): Response {
  const response = applyCors(new Request(''), init);
  return new Response(JSON.stringify(data), { ...response, status });
}

export function fail(status: number, code: string, message: string): Response {
  return json({ error: code, message }, status);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function generateId(prefix = 'AQ'): string {
  const hex = Array.from({ length: 10 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
  return `${prefix}-${hex.toUpperCase()}`;
}
