import type { Readable } from 'node:stream';

export interface AudioStream {
  readonly body: Readable;
  readonly contentType: string;
  readonly contentLength?: number;
}
