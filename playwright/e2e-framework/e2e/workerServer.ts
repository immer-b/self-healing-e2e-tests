import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

const SERVER_DIR = resolve(import.meta.dirname, '../../../server-in-test');
const STARTUP_TIMEOUT_MS = 60_000;

/** Resolves with the URL the server prints once it is listening (it picks a free port itself). */
function waitForListening(child: ChildProcess): Promise<string> {
  return new Promise((resolveUrl, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`test server did not start within ${STARTUP_TIMEOUT_MS} ms`)), STARTUP_TIMEOUT_MS);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const match = buffer.match(/listening on (http:\/\/localhost:\d+)/);
      if (match) {
        clearTimeout(timer);
        child.stdout!.off('data', onData);
        child.stdout!.resume(); // keep draining request logs so the pipe never fills up
        resolveUrl(match[1]);
      }
    };
    child.stdout!.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`test server exited with code ${code} before listening`));
    });
  });
}

/**
 * One private sample server per Playwright worker, so workers never share data, the UI version
 * or the hotel clock and tests can run in parallel. The server asks the OS for a free port
 * (PORT=0), so nothing else listening on a fixed port can interfere. It serves the client build
 * made by the `webServer` step in playwright.config.ts and keeps hotel data in memory.
 * Use as a worker fixture: `workerServer: [startWorkerServer, { scope: 'worker' }]`.
 */
export async function startWorkerServer({}, use: (url: string) => Promise<void>) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts', '--test-routes'], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: '0', HOTEL_STORAGE: 'memory', NODE_NO_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const stop = () => child.kill();
  process.once('exit', stop); // also when the worker process ends abruptly
  try {
    await use(await waitForListening(child));
  } finally {
    process.off('exit', stop);
    stop();
  }
}

/** Points `baseURL` (and so `page.goto('/...')` and `request`) at this worker's server. */
export const useWorkerServerAsBaseURL = async ({ workerServer }: { workerServer: string }, use: (url: string) => Promise<void>) => use(workerServer);
