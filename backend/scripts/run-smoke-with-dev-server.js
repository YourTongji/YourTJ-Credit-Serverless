/* eslint-disable no-console */
/**
 * Starts `vercel dev`, runs smoke tests, then stops the server.
 *
 * Usage:
 *  node scripts/run-smoke-with-dev-server.js
 */

const { spawn } = require('child_process');
const path = require('path');

async function waitForReady(url, timeoutMs) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${url}`);
    }
    try {
      const res = await fetch(url, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json && json.success === true) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}

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

  console.log('Starting vercel dev...');
  const devCommand =
    process.platform === 'win32'
      ? { cmd: 'cmd.exe', args: ['/c', 'npx', 'vercel', 'dev', '--listen', '127.0.0.1:3001'] }
      : { cmd: 'npx', args: ['vercel', 'dev', '--listen', '127.0.0.1:3001'] };

  const dev = spawn(devCommand.cmd, devCommand.args, {
    cwd: backendDir,
    env: process.env,
    stdio: 'inherit'
  });

  try {
    await waitForReady(`${baseUrl}/api/wordlist/token`, 60_000);
    console.log('Backend ready. Running smoke tests...');
    await run('node', ['scripts/smoke-test.js'], {
      cwd: backendDir,
      env: { ...process.env, API_BASE: baseUrl }
    });
  } finally {
    console.log('Stopping vercel dev...');
    await stopProcessTree(dev);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
