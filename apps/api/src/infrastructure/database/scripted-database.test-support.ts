import type { LightframeDatabase } from './client.js';

export const scriptedDatabase = (...script: readonly unknown[]) => {
  const remaining = [...script];
  const calls: { operation: string; arguments: readonly unknown[] }[] = [];
  const query = (): object => {
    const target = {
      then: (fulfilled?: (value: unknown) => unknown, rejected?: (reason: unknown) => unknown) => {
        if (remaining.length === 0) return Promise.reject(new Error('Database script exhausted.'));
        const value = remaining.shift();
        return (value instanceof Error ? Promise.reject(value) : Promise.resolve(value)).then(
          fulfilled,
          rejected,
        );
      },
    };
    const proxy: object = new Proxy(target, {
      get(current, property, receiver) {
        if (property === 'then') return current.then.bind(receiver);
        return (...arguments_: readonly unknown[]) => {
          calls.push({ operation: String(property), arguments: arguments_ });
          return proxy;
        };
      },
    });
    return proxy;
  };
  const database: object = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'transaction') {
          return (callback: (tx: LightframeDatabase) => unknown) =>
            callback(database as LightframeDatabase);
        }
        return (...arguments_: readonly unknown[]) => {
          calls.push({ operation: String(property), arguments: arguments_ });
          return query();
        };
      },
    },
  );
  return {
    db: database as LightframeDatabase,
    calls,
    remaining: () => remaining.length,
  };
};
