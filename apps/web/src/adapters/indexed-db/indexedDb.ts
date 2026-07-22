export const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener(
      'error',
      () => reject(request.error ?? new Error('IndexedDB request failed.')),
      { once: true },
    );
  });

export const transactionComplete = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.')),
      { once: true },
    );
    transaction.addEventListener(
      'error',
      () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')),
      { once: true },
    );
  });

export const abortTransaction = (transaction: IDBTransaction): void => {
  try {
    transaction.abort();
  } catch {
    // A completed or already-aborted transaction needs no further cleanup.
  }
};

export type UpgradeIndexedDatabase = (
  database: IDBDatabase,
  transaction: IDBTransaction | null,
  oldVersion: number,
  newVersion: number | null,
) => void;

export const openIndexedDatabase = (
  factory: IDBFactory,
  databaseName: string,
  version: number,
  upgrade: UpgradeIndexedDatabase,
): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = factory.open(databaseName, version);
    let settled = false;

    request.addEventListener('upgradeneeded', (event) => {
      upgrade(request.result, request.transaction, event.oldVersion, event.newVersion);
    });
    request.addEventListener('success', () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error('IndexedDB could not be opened.'));
    });
    request.addEventListener('blocked', () => {
      if (settled) return;
      settled = true;
      reject(new Error('IndexedDB is blocked by another open version.'));
    });
  });

export const browserIndexedDb = (): IDBFactory | null => {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB;
  } catch {
    return null;
  }
};
