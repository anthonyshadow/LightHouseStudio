import type {
  GuidedReferenceMode,
  GuidedStage,
  ProjectStorageHealth,
  VisualProfile,
} from './types';

interface GuidedFlowEventBase {
  readonly projectRevision: number;
  readonly timestamp: string;
}

export type GuidedFlowTelemetryEvent =
  | (GuidedFlowEventBase & {
      readonly type: 'guided-flow-entered';
      readonly entry: 'default' | 'resume' | 'explicit';
    })
  | (GuidedFlowEventBase & {
      readonly type: 'guided-stage-viewed';
      readonly stage: GuidedStage;
    })
  | (GuidedFlowEventBase & {
      readonly type: 'character-reference-mode-selected';
      readonly mode: GuidedReferenceMode;
      readonly profile: VisualProfile;
      readonly hasCustomChoices: boolean;
    })
  | (GuidedFlowEventBase & {
      readonly type: 'guided-operation-failed';
      readonly stage: GuidedStage;
      readonly operation:
        | 'character-save'
        | 'reference-generation'
        | 'live-session'
        | 'recording'
        | 'voice-processing'
        | 'project-save'
        | 'download';
      readonly reason:
        | 'permission-denied'
        | 'unsupported'
        | 'provider-unavailable'
        | 'network'
        | 'quota'
        | 'storage'
        | 'media'
        | 'unknown';
    })
  | (GuidedFlowEventBase & {
      readonly type: 'guided-checkpoint-saved';
      readonly checkpoint:
        | 'character-design'
        | 'character-ready'
        | 'review-take'
        | 'accepted-take'
        | 'selected-voice'
        | 'processed-voice'
        | 'delivery-ready'
        | 'complete';
      readonly storageHealth: ProjectStorageHealth;
    })
  | (GuidedFlowEventBase & {
      readonly type: 'guided-download-dispatched';
      readonly artifact: 'original' | 'processed';
    });

export interface GuidedFlowTelemetry {
  track(event: GuidedFlowTelemetryEvent): void;
}

export const createNoopGuidedFlowTelemetry = (): GuidedFlowTelemetry => ({
  track: () => undefined,
});

export interface RecordingGuidedFlowTelemetry extends GuidedFlowTelemetry {
  readonly events: readonly GuidedFlowTelemetryEvent[];
  clear(): void;
}

/** In-memory test/development recorder. It never persists or sends events. */
export const createRecordingGuidedFlowTelemetry = (): RecordingGuidedFlowTelemetry => {
  const events: GuidedFlowTelemetryEvent[] = [];
  return {
    track: (event) => events.push(structuredClone(event)),
    get events() {
      return events.map((event) => structuredClone(event));
    },
    clear: () => events.splice(0),
  };
};
