export interface StudioViewedEvent {
  readonly type: 'studio-viewed';
  readonly canonicalPath: '/';
  readonly canonicalizedLegacyEntry: boolean;
  readonly initialOverlay: 'legacy-projects' | null;
  readonly timestamp: string;
}

export interface StudioTelemetry {
  track(event: StudioViewedEvent): void;
}

export const createNoopStudioTelemetry = (): StudioTelemetry => ({
  track: () => undefined,
});

export interface RecordingStudioTelemetry extends StudioTelemetry {
  readonly events: readonly StudioViewedEvent[];
  clear(): void;
}

/** In-memory test/development recorder. It never persists or sends events. */
export const createRecordingStudioTelemetry = (): RecordingStudioTelemetry => {
  const events: StudioViewedEvent[] = [];
  return {
    track: (event) => events.push(structuredClone(event)),
    get events() {
      return events.map((event) => structuredClone(event));
    },
    clear: () => events.splice(0),
  };
};
