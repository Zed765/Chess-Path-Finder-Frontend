import { access } from 'node:fs/promises';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 10000);
const ENGINE_TIMEOUT_MS = Number(process.env.ENGINE_TIMEOUT_MS ?? 25000);
const ENGINE_MAX_NODES = Number(process.env.ENGINE_MAX_NODES ?? 200000);
const BODY_LIMIT_BYTES = 64 * 1024;

const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsOrigin(requestOrigin) {
  if (allowedOrigins.includes('*')) {
    return '*';
  }

  return requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0];
}

function sendJson(response, statusCode, payload, requestOrigin) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': corsOrigin(requestOrigin),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > BODY_LIMIT_BYTES) {
        rejectBody(new Error('Request body is too large'));
        request.destroy();
      }
    });

    request.on('end', () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        rejectBody(new Error('Request body must be valid JSON'));
      }
    });

    request.on('error', rejectBody);
  });
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveEnginePath() {
  if (process.env.ENGINE_BINARY_PATH) {
    return resolve(process.env.ENGINE_BINARY_PATH);
  }

  const candidates = [
    join(__dirname, process.platform === 'win32' ? 'engine.exe' : 'engine'),
    join(__dirname, '..', process.platform === 'win32' ? 'engine.exe' : 'engine'),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function runEngine(enginePath, startFen, targetFen, maxNodes) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(enginePath, [startFen, targetFen, String(maxNodes)], {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, ENGINE_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      rejectRun(error);
    });

    child.on('close', () => {
      clearTimeout(timer);

      if (timedOut) {
        rejectRun(new Error('Engine timed out before returning a path'));
        return;
      }

      try {
        resolveRun(JSON.parse(stdout));
      } catch {
        rejectRun(new Error(stderr || stdout || 'Engine did not return JSON'));
      }
    });
  });
}

async function handleComputePath(request, response, requestOrigin) {
  try {
    const body = await readJsonBody(request);
    const { startFen, targetFen } = body;
    const maxNodes = Math.min(Number(body.maxNodes ?? ENGINE_MAX_NODES), ENGINE_MAX_NODES);

    if (typeof startFen !== 'string' || typeof targetFen !== 'string') {
      sendJson(response, 400, { error: 'startFen and targetFen are required strings' }, requestOrigin);
      return;
    }

    const enginePath = await resolveEnginePath();
    const result = await runEngine(enginePath, startFen, targetFen, maxNodes);
    sendJson(response, 200, result, requestOrigin);
  } catch (error) {
    sendJson(
      response,
      500,
      { found: false, error: error instanceof Error ? error.message : 'Engine request failed' },
      requestOrigin,
    );
  }
}

const server = http.createServer(async (request, response) => {
  const requestOrigin = request.headers.origin;

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': corsOrigin(requestOrigin),
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    response.end();
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { ok: true }, requestOrigin);
    return;
  }

  if (request.method === 'POST' && request.url === '/compute-path') {
    await handleComputePath(request, response, requestOrigin);
    return;
  }

  sendJson(response, 404, { error: 'Not found' }, requestOrigin);
});

server.listen(PORT, () => {
  console.log(`Engine API listening on port ${PORT}`);
});
