import { connect } from 'node:net';
import { ApplicationRuntime } from '../application/application-runtime.js';

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

export interface BunSignalShutdownProbeResult {
  readonly signal: ShutdownSignal;
  readonly healthStatus: number;
  readonly closeUsesOnePromise: boolean;
  readonly listenerStoppedBeforeHooks: boolean;
  readonly closeSequence: readonly string[];
  readonly firstHookCalls: number;
  readonly secondHookCalls: number;
  readonly rebindSucceeded: boolean;
}

const parseSignal = (value: string | undefined): ShutdownSignal => {
  if (value === 'SIGINT' || value === 'SIGTERM') return value;
  throw new Error('The Bun signal probe requires SIGINT or SIGTERM.');
};

const canConnect = async (port: number): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const socket = connect(port, '127.0.0.1');
    let settled = false;
    const finish = (connected: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(connected);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });

export const runBunSignalShutdownProbe = async (
  signal: ShutdownSignal,
): Promise<BunSignalShutdownProbeResult> => {
  const application = new ApplicationRuntime({ logger: false });
  const closeSequence: string[] = [];
  let firstHookCalls = 0;
  let secondHookCalls = 0;
  let listenerStoppedBeforeHooks = false;

  application.get('/api/health', (_request, reply) => reply.send({ ok: true }));
  application.addHook('onClose', async () => {
    firstHookCalls += 1;
    closeSequence.push('first:start');
    const address = application.server.address();
    if (address === null || typeof address === 'string') {
      listenerStoppedBeforeHooks = true;
    } else {
      listenerStoppedBeforeHooks = !(await canConnect(address.port));
    }
    closeSequence.push(
      listenerStoppedBeforeHooks ? 'first:listener-stopped' : 'first:listener-active',
    );
    await Promise.resolve();
    closeSequence.push('first:end');
  });
  application.addHook('onClose', () => {
    secondHookCalls += 1;
    closeSequence.push('second:start', 'second:end');
  });

  await application.listen({ host: '127.0.0.1', port: 0 });
  const address = application.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The Bun signal probe did not receive a bound listener address.');
  }
  const healthStatus = (
    await fetch(`http://127.0.0.1:${address.port}/api/health`, {
      headers: { connection: 'close' },
    })
  ).status;

  let closeUsesOnePromise = false;
  const shutdownComplete = new Promise<void>((resolve, reject) => {
    process.once(signal, () => {
      closeSequence.push(`signal:${signal}`);
      const firstClose = application.close();
      const repeatedClose = application.close();
      closeUsesOnePromise = firstClose === repeatedClose;
      void firstClose.then(resolve, reject);
    });
  });

  process.kill(process.pid, signal);
  await shutdownComplete;
  closeUsesOnePromise = closeUsesOnePromise && application.close() === application.close();

  const replacement = new ApplicationRuntime({ logger: false });
  let rebindSucceeded = false;
  try {
    await replacement.listen({ host: '127.0.0.1', port: address.port });
    rebindSucceeded = true;
  } finally {
    await replacement.close();
  }

  return {
    signal,
    healthStatus,
    closeUsesOnePromise,
    listenerStoppedBeforeHooks,
    closeSequence,
    firstHookCalls,
    secondHookCalls,
    rebindSucceeded,
  };
};

if (import.meta.main) {
  const signal = parseSignal(process.argv[2]);
  process.stdout.write(`${JSON.stringify(await runBunSignalShutdownProbe(signal))}\n`);
}
