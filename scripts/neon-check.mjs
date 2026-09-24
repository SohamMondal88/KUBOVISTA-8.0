import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

export function createVersionHandler(queryVersion) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.url !== '/') {
      res.writeHead(404).end('Not found');
      return;
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.writeHead(405).end('Method not allowed');
      return;
    }
    try {
      const result = await queryVersion();
      const version = result[0]?.version;
      if (typeof version !== 'string' || !version) throw new Error('Missing version');
      res.writeHead(200).end(version);
    } catch {
      // Never send credentials or raw provider errors to the browser or logs.
      res.writeHead(503).end('Database connection failed. Check DATABASE_URL and Neon availability.');
    }
  };
}

function start() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('Set DATABASE_URL in your environment, .env or .env.local before running db:check.');
  }
  const port = Number(process.env.NEON_CHECK_PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('NEON_CHECK_PORT must be an integer between 1 and 65535.');
  }
  let sql;
  try { sql = neon(process.env.DATABASE_URL); }
  catch { throw new Error('DATABASE_URL is not a valid Neon PostgreSQL connection string.'); }
  const server = createServer(createVersionHandler(() => sql.query('SELECT version()', [], {
    fetchOptions: { signal: AbortSignal.timeout(10_000) },
  })));
  server.on('error', () => {
    console.error('Cannot start the local connection check. Stop the other server or change NEON_CHECK_PORT.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Neon connection check: http://127.0.0.1:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { start(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
