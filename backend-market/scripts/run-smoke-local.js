/* eslint-disable no-console */
/**
 * End-to-end smoke test:
 * - apply schema to a real libSQL database (file:)
 * - compile TypeScript
 * - start a local HTTP server that executes the compiled Vercel handlers
 * - run API smoke tests
 */

const { spawn } = require('child_process');
const path = require('path');

function run(cmd, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function waitForReady(url, timeoutMs) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${url}`);
    try {
      const res = await fetch(url, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json && json.success === true) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

async function stopProcessTree(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    try {
      await run('cmd.exe', ['/c', 'taskkill', '/PID', String(child.pid), '/T', '/F'], {});
    } catch {
      // ignore
    }
    return;
  }
  child.kill('SIGTERM');
}

async function main() {
  const backendDir = path.resolve(__dirname, '..');
  const baseUrl = 'http://127.0.0.1:3001';
  const localEnv = {
    ...process.env,
    TURSO_DATABASE_URL: 'file:./dev.db',
    TURSO_AUTH_TOKEN: ''
  };

  await run('node', ['scripts/apply-schema.js'], { cwd: backendDir, env: localEnv });
  if (process.platform === 'win32') {
    await run('cmd.exe', ['/c', 'npx', 'tsc', '-p', 'tsconfig.json'], { cwd: backendDir, env: localEnv });
  } else {
    await run('npx', ['tsc', '-p', 'tsconfig.json'], { cwd: backendDir, env: localEnv });
  }

  console.log('Starting local-api-server...');
  const server = spawn('node', ['scripts/local-api-server.js'], {
    cwd: backendDir,
    env: { ...localEnv, PORT: '3001' },
    stdio: 'inherit'
  });

  try {
    await waitForReady(`${baseUrl}/api/wordlist/token`, 20_000);
    await run('node', ['scripts/smoke-test.js'], {
      cwd: backendDir,
      env: { ...localEnv, API_BASE: baseUrl }
    });
  } finally {
    await stopProcessTree(server);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
