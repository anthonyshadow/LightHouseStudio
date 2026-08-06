import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { hash } = require('@node-rs/argon2');

const readSecret = async () => {
  if (!process.stdin.isTTY) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks)
      .toString('utf8')
      .replace(/[\r\n]+$/u, '');
  }
  process.stdout.write('Demo password: ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      resolve(value);
    };
    process.stdin.on('data', (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          process.stdin.setRawMode(false);
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f') value = value.slice(0, -1);
        else value += character;
      }
    });
  });
};

const password = await readSecret();
if (password.length < 8 || password.length > 512) {
  throw new Error('Use a demo password between 8 and 512 characters.');
}
process.stdout.write(
  `${await hash(password, { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 })}\n`,
);
