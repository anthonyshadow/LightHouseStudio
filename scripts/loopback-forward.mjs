import net from 'node:net';
import process from 'node:process';

/**
 * Forwards this machine's loopback port to another host, for the Linux visual capture.
 *
 * The e2e harness blocks every request whose host is not `127.0.0.1` or `localhost` — that guard is
 * how the suite proves it contacts no provider. Inside the capture container the dev server lives
 * on the Docker host, so rather than widen the guard, the server is republished on the container's
 * own loopback and the suite sees the origin it expects.
 */
const port = Number(process.env.LOOPBACK_FORWARD_PORT ?? 4173);
const upstreamHost = process.env.LOOPBACK_FORWARD_HOST ?? 'host.docker.internal';

net
  .createServer((incoming) => {
    const upstream = net.connect(port, upstreamHost);
    incoming.pipe(upstream);
    upstream.pipe(incoming);
    upstream.on('error', () => incoming.destroy());
    incoming.on('error', () => upstream.destroy());
  })
  .listen(port, '127.0.0.1');
