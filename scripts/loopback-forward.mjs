import net from 'node:net';
import process from 'node:process';

/**
 * Republishes the Docker host's dev server on this container's loopback, for the Linux capture.
 *
 * The e2e harness blocks every request whose host is not `127.0.0.1` or `localhost` — that guard is
 * how the suite proves it contacts no provider. Inside the capture container the dev server lives
 * on the Docker host, so rather than widen the guard, the server is republished here and the suite
 * sees the origin it expects.
 *
 * The port is passed in by `playwright.visual.linux.config.ts`, which reads it from the one place
 * that owns the suite's origin. Both ends of the forward use it: the same port, two interfaces.
 */
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port <= 0) {
  throw new Error('Usage: node scripts/loopback-forward.mjs <port>');
}

net
  .createServer((incoming) => {
    const upstream = net.connect(port, 'host.docker.internal');
    incoming.pipe(upstream);
    upstream.pipe(incoming);
    upstream.on('error', () => incoming.destroy());
    incoming.on('error', () => upstream.destroy());
  })
  .listen(port, '127.0.0.1');
