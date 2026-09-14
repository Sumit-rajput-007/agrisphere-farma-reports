import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { createStore } from './lib/store.js';
import {
  fail,
  str,
  date,
  profileInput,
  recordInput,
  analytics,
  reportHTML,
  reportCSV
} from './lib/core.js';

const root = dirname(fileURLToPath(import.meta.url));

async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) {
    fail('Send application/json.', 415);
  }

  let raw = '';

  for await (const chunk of req) {
    raw += chunk;

    if (Buffer.byteLength(raw) > 100000) {
      fail('Request too large.', 413);
    }
  }

  try {
    const value = JSON.parse(raw);

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail('Expected an object.');
    }

    return value;
  } catch {
    fail('Invalid JSON object.');
  }
}

export function createApp({
  directory = process.env.DATA_DIR || join(root, 'data'),
  config = {},
  fetcher = fetch
} = {}) {
  const store = createStore(directory);
  const mode = 'disabled';
  const publicOrigin = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).origin : null;
  const password = process.env.APP_PASSWORD;
  if (process.env.NODE_ENV === 'production' && (!password || password.length < 12)) throw new Error('Set APP_PASSWORD to at least 12 characters.');

  const server = http.createServer(async (req, res) => {
    const send = (
      status,
      value,
      type = 'application/json; charset=utf-8'
    ) => {
      res.writeHead(status, { 'Content-Type': type });

      res.end(
        type.startsWith('application/json')
          ? JSON.stringify(value)
          : value
      );
    };

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');

    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    );

    try {
      if (req.url === '/healthz' && req.method === 'GET') return send(200, {ok:true});
      if (password) {
        const supplied = Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString();
        const expected = `sumit:${password}`;
        const digest = v => createHash('sha256').update(v).digest();
        if (!timingSafeEqual(digest(supplied), digest(expected))) {
          res.setHeader('WWW-Authenticate', 'Basic realm="Agrisphere"');
          return send(401, {error:'Sign in with your demo credentials.'});
        }
      }
      const expectedOrigin = publicOrigin || `http://${req.headers.host}`;
      if (!['GET','HEAD'].includes(req.method) &&
          ((req.headers.origin && req.headers.origin !== expectedOrigin) || req.headers['sec-fetch-site'] === 'cross-site')) {
        fail('Cross-origin request rejected.',403);
      }
      const url = new URL(req.url, `http://${req.headers.host}`);
      const path = url.pathname;
      const method = req.method;

      if (
        method === 'GET' &&
        ['/', '/app.js', '/styles.css'].includes(path)
      ) {
        const file = path === '/' ? 'index.html' : path.slice(1);

        return send(
          200,
          readFileSync(join(root, 'public', file)),
          file.endsWith('.js')
            ? 'text/javascript; charset=utf-8'
            : file.endsWith('.css')
              ? 'text/css; charset=utf-8'
              : 'text/html; charset=utf-8'
        );
      }

      if (method === 'GET' && path === '/api/state') {
        const s = store.read();

        return send(200, {
          ...s,
          analytics: analytics(s.records),
          mode
        });
      }

      if (method === 'PUT' && path === '/api/profile') {
        const p = profileInput(await body(req));
        p.aiConsent = false;

        store.update(s => {
          s.profile = p;
        });

        return send(200, p);
      }

      if (method === 'POST' && path === '/api/records') {
        const r = recordInput(await body(req));

        store.update(s => {
          if (s.records.length >= 10000) {
            fail('Local record limit reached.');
          }

          s.records.push(r);
        });

        return send(201, r);
      }

      if (method === 'DELETE' && path.startsWith('/api/records/')) {
        const id = path.split('/')[3];

        store.update(s => {
          if (!s.records.some(x => x.id === id)) {
            fail('Record not found.', 404);
          }

          s.records = s.records.filter(x => x.id !== id);
        });

        return send(200, { ok: true });
      }

      if (method === 'POST' && path === '/api/reminders') {
        const b = await body(req);

        const r = {
          id: randomUUID(),
          title: str(b.title, 'Title', 200),
          dueDate: date(b.dueDate),
          done: false
        };

        store.update(s => {
          if (s.reminders.length >= 1000) {
            fail('Reminder limit reached.');
          }

          s.reminders.push(r);
        });

        return send(201, r);
      }

      if (method === 'PATCH' && path.startsWith('/api/reminders/')) {
        const b = await body(req);

        if (typeof b.done !== 'boolean') {
          fail('done must be boolean.');
        }

        store.update(s => {
          const r = s.reminders.find(
            x => x.id === path.split('/')[3]
          );

          if (!r) {
            fail('Reminder not found.', 404);
          }

          r.done = b.done;
        });

        return send(200, { ok: true });
      }

      if (path === '/api/chat') return send(403, {error:'AI assistant is disabled in this deployment.'});

      if (
        method === 'DELETE' &&
        path.startsWith('/api/conversations/')
      ) {
        store.update(s => {
          const id = path.split('/')[3];

          if (!s.conversations.some(c => c.id === id)) {
            fail('Conversation not found.', 404);
          }

          s.conversations = s.conversations.filter(
            c => c.id !== id
          );
        });

        return send(200, { ok: true });
      }

      if (method === 'POST' && path === '/api/reports') {
        const b = await body(req);
        const from = date(b.from);
        const to = date(b.to);

        if (from > to) {
          fail('Start date must precede end date.');
        }

        const s = store.read();

        const records = s.records.filter(
          r => r.date >= from && r.date <= to
        );

        const a = analytics(records);

        const r = {
          id: randomUUID(),
          from,
          to,
          createdAt: new Date().toISOString(),
          profile: s.profile,
          records,
          analytics: a,
          summary: records.length
            ? `${a.count} records in this period. Recorded cash balance is INR ${a.balance.toFixed(2)}. This excludes unrecorded transactions and is not audited profit. Review missing costs and revenue before making decisions.`
            : 'No records exist in this period. Zero totals mean no recorded activity, not necessarily no farm activity.'
        };

        store.update(s => {
          if (s.reports.length >= 200) {
            fail('Delete an old report first.');
          }

          s.reports.push(r);
        });

        return send(201, r);
      }

      if (path.startsWith('/api/reports/')) {
        const [, , , id, format] = path.split('/');

        const r = store
          .read()
          .reports.find(x => x.id === id);

        if (!r) {
          fail('Report not found.', 404);
        }

        if (method === 'DELETE' && !format) {
          store.update(s => {
            s.reports = s.reports.filter(x => x.id !== id);
          });

          return send(200, { ok: true });
        }

        if (
          method === 'GET' &&
          ['html', 'csv'].includes(format)
        ) {
          if (
            format === 'csv' ||
            url.searchParams.has('download')
          ) {
            res.setHeader(
              'Content-Disposition',
              `attachment; filename="agrisphere-report-${id}.${format}"`
            );
          }

          return send(
            200,
            format === 'csv' ? reportCSV(r) : reportHTML(r),
            format === 'csv'
              ? 'text/csv; charset=utf-8'
              : 'text/html; charset=utf-8'
          );
        }
      }

      fail('Not found.', 404);
    } catch (error) {
      send(error.status || 500, {
        error: error.status
          ? error.message
          : 'An internal error occurred. Check local data permissions and restart.'
      });
    }
  });

  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.PORT || 3000);

  const app = createApp();

  app.on('error', e => {
    console.error(
      e.code === 'EADDRINUSE'
        ? 'Port is busy. Stop the existing server or change PORT in .env.'
        : e.message
    );

    process.exitCode = 1;
  });

  app.listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log(`Agrisphere listening on port ${app.address().port}; AI disabled`);
  });
}
