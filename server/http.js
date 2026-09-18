export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function methodNotAllowed(res, methods) {
  res.setHeader('Allow', methods.join(', '));
  return json(res, 405, { error: 'Method not allowed.' });
}

export function publicError(error) {
  console.error(error);
  if (error?.code === '23505') return { status: 409, message: 'That record already exists.' };
  if (error?.code === '23503') return { status: 400, message: 'A related record could not be found.' };
  return { status: 500, message: 'Something went wrong. Please try again.' };
}

export function cleanText(value, max = 500) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

export function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export async function readRawBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
