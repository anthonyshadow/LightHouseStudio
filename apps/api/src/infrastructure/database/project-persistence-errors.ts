export type ProjectPersistenceErrorCode =
  'invalid-aggregate' | 'asset-not-ready' | 'version-not-ready' | 'output-not-linked';

export class ProjectPersistenceError extends Error {
  constructor(
    readonly code: ProjectPersistenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectPersistenceError';
  }
}
