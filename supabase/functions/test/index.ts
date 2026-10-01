import { applyCors, fail, json } from '../_lib/utils.ts';

Deno.serve(async (req: Request) => {
  const init = applyCors(req);
  if (req.method === 'OPTIONS') return new Response('', init);

  try {
    const url = new URL(req.url);
    const path = url.pathname.split('/').pop() ?? '';

    if (path === 'test') {
      const raw = await req.text();
      return json({ 
        method: req.method, 
        bodyLength: raw.length,
        bodyPreview: raw.slice(0, 100),
        hasBody: !!req.body
      });
    }

    return fail(404, 'not_found', 'No such test endpoint.');
  } catch (error) {
    return fail(500, 'internal_error', String(error));
  }
});