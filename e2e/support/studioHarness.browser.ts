import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type {
  BrowserJourneyState,
  SerializedSnapshot,
  StudioHarnessOptions,
} from './studioHarness.types.js';

// A 320×180 mint VP8/Opus WebM used by the deterministic MediaRecorder. Keeping a
// real media container here lets the stable main-stage playback exercise the
// browser's recorded-source path instead of relying on an invalid text blob.
export const FIXED_WEBM_BASE64 =
  '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';

const FIXED_MP4_BASE64 = readFileSync(
  new URL('../fixtures/deterministic-recording-mp4.base64', import.meta.url),
  'utf8',
).trim();

export const installSyntheticBrowserMedia = async (
  page: Page,
  options: StudioHarnessOptions,
): Promise<void> => {
  await page.addInitScript(
    ({ fixedWebmBase64, fixedMp4Base64, stubMediaPlayback, realtimeProvidesVideo }) => {
      type TestModel = 'lucy-latest' | 'lucy-vton-latest';
      type TestSnapshot = { prompt: string; image: File | null; enhance: boolean };
      type TestConnectionOptions = {
        model: TestModel;
        initial: TestSnapshot;
        onRemoteStream(stream: MediaStream): void;
        onConnectionChange(state: string): void;
        onGenerationTick(event: { elapsedSeconds: number }): void;
        onGenerationEnded(event: { elapsedSeconds: number }): void;
      };

      const state: BrowserJourneyState & {
        activeConnection: TestConnectionOptions | null;
      } = {
        cameraCalls: 0,
        requirementModels: [],
        connections: [],
        applies: [],
        disconnectCalls: 0,
        recorderStarts: 0,
        recorderStops: 0,
        lifecycleEvents: [],
        createdObjectUrls: [],
        revokedObjectUrls: [],
        activeConnection: null,
      };
      const mediaResources: Array<{
        canvas: HTMLCanvasElement;
        audioContext: AudioContext;
        oscillator: OscillatorNode;
      }> = [];

      const serialize = (snapshot: TestSnapshot): SerializedSnapshot => ({
        prompt: snapshot.prompt,
        imageName: snapshot.image?.name ?? null,
        enhance: snapshot.enhance,
      });
      const fixedWebm = Uint8Array.from(atob(fixedWebmBase64), (character) =>
        character.charCodeAt(0),
      );
      const fixedMp4 = Uint8Array.from(atob(fixedMp4Base64), (character) =>
        character.charCodeAt(0),
      );
      const useMp4Recorder =
        /AppleWebKit/u.test(navigator.userAgent) && !/(Chrome|Chromium)/u.test(navigator.userAgent);

      const createSyntheticStream = (owner: 'local' | 'provider'): MediaStream => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Synthetic canvas context is unavailable.');
        context.fillStyle = '#35d0a0';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const video = canvas.captureStream(5);
        const videoTrack = video.getVideoTracks()[0];
        if (videoTrack) {
          Object.defineProperty(videoTrack, 'label', {
            configurable: true,
            value: 'Synthetic camera',
          });
          const stop = videoTrack.stop.bind(videoTrack);
          videoTrack.stop = () => {
            if (videoTrack.readyState === 'ended') return;
            state.lifecycleEvents.push(`${owner}-video-stopped`);
            stop();
          };
        }

        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        const oscillator = audioContext.createOscillator();
        oscillator.frequency.value = 220;
        oscillator.connect(destination);
        oscillator.start();
        mediaResources.push({ canvas, audioContext, oscillator });
        const audioTrack = destination.stream.getAudioTracks()[0];
        if (audioTrack) {
          Object.defineProperty(audioTrack, 'label', {
            configurable: true,
            value: 'Synthetic microphone',
          });
          const stop = audioTrack.stop.bind(audioTrack);
          audioTrack.stop = () => {
            if (audioTrack.readyState === 'ended') return;
            state.lifecycleEvents.push(`${owner}-audio-stopped`);
            stop();
          };
        }

        return new MediaStream([...video.getVideoTracks(), ...destination.stream.getAudioTracks()]);
      };

      class DeterministicMediaRecorder extends EventTarget {
        static isTypeSupported(mimeType: string): boolean {
          return useMp4Recorder ? mimeType.includes('mp4') : mimeType.includes('webm');
        }

        readonly mimeType: string;
        state: RecordingState = 'inactive';

        constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
          super();
          this.mimeType = options?.mimeType ?? (useMp4Recorder ? 'video/mp4' : 'video/webm');
        }

        start(): void {
          this.state = 'recording';
          state.recorderStarts += 1;
        }

        stop(): void {
          if (this.state === 'inactive') return;
          this.state = 'inactive';
          state.recorderStops += 1;
          const dataEvent = new Event('dataavailable');
          Object.defineProperty(dataEvent, 'data', {
            value: new Blob([useMp4Recorder ? fixedMp4 : fixedWebm], { type: this.mimeType }),
          });
          this.dispatchEvent(dataEvent);
          this.dispatchEvent(new Event('stop'));
          state.lifecycleEvents.push('recorder-finalized');
        }
      }

      const developmentDriver = {
        getModelRequirements(model: TestModel) {
          state.requirementModels.push(model);
          return Promise.resolve({ width: 1_280, height: 720, frameRate: 30 });
        },
        connect(options: TestConnectionOptions) {
          const remote = createSyntheticStream('provider');
          let disconnected = false;
          state.connections.push({ model: options.model, initial: serialize(options.initial) });
          state.activeConnection = options;
          queueMicrotask(() => {
            if (disconnected) return;
            options.onConnectionChange('connected');
            if (realtimeProvidesVideo) options.onRemoteStream(remote);
            options.onConnectionChange('generating');
          });
          return Promise.resolve({
            apply(snapshot: TestSnapshot) {
              state.applies.push(serialize(snapshot));
              options.onConnectionChange('generating');
              return Promise.resolve();
            },
            disconnect() {
              if (disconnected) return;
              disconnected = true;
              state.disconnectCalls += 1;
              state.lifecycleEvents.push('provider-disconnected');
              if (state.activeConnection === options) state.activeConnection = null;
              remote.getTracks().forEach((track) => track.stop());
            },
          });
        },
        triggerProviderDisconnect() {
          state.activeConnection?.onConnectionChange('disconnected');
        },
        triggerGenerationTick(elapsedSeconds: number) {
          state.activeConnection?.onGenerationTick({ elapsedSeconds });
        },
        triggerGenerationEnded(elapsedSeconds: number) {
          state.activeConnection?.onGenerationEnded({ elapsedSeconds });
        },
      };

      Object.defineProperty(window, '__lightframeE2EJourneyState', {
        configurable: true,
        value: state,
      });
      Object.defineProperty(window, '__lightframeDevelopmentRealtimeDriver', {
        configurable: true,
        value: developmentDriver,
      });
      Object.defineProperty(window, 'MediaRecorder', {
        configurable: true,
        value: DeterministicMediaRecorder,
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: Object.assign(new EventTarget(), {
          getUserMedia: () => {
            state.cameraCalls += 1;
            return Promise.resolve(createSyntheticStream('local'));
          },
          enumerateDevices: () => Promise.resolve([]),
        }),
      });
      Object.defineProperty(window, 'createImageBitmap', {
        configurable: true,
        value: (source: Blob) => {
          const persistedReference =
            source instanceof File && /^reference-[0-9a-f-]+\./u.test(source.name);
          return Promise.resolve({
            width: persistedReference ? 1_536 : 1_024,
            height: 1_024,
            close: () => undefined,
          });
        },
      });
      if (stubMediaPlayback) {
        Object.defineProperty(HTMLMediaElement.prototype, 'play', {
          configurable: true,
          value: () => Promise.resolve(),
        });
      }
      Object.defineProperty(window, 'confirm', {
        configurable: true,
        value: () => true,
      });
      const createObjectUrl = URL.createObjectURL.bind(URL);
      const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: (blob: Blob) => {
          const objectUrl = createObjectUrl(blob);
          state.createdObjectUrls.push(objectUrl);
          return objectUrl;
        },
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: (objectUrl: string) => {
          state.revokedObjectUrls.push(objectUrl);
          revokeObjectUrl(objectUrl);
        },
      });
    },
    {
      fixedWebmBase64: FIXED_WEBM_BASE64,
      fixedMp4Base64: FIXED_MP4_BASE64,
      stubMediaPlayback: options.stubMediaPlayback ?? true,
      realtimeProvidesVideo: options.realtimeProvidesVideo ?? true,
    },
  );
};

export const readBrowserState = (page: Page): Promise<BrowserJourneyState> =>
  page.evaluate(() => {
    const state = (
      window as typeof window & {
        __lightframeE2EJourneyState: BrowserJourneyState;
      }
    ).__lightframeE2EJourneyState;
    return {
      cameraCalls: state.cameraCalls,
      requirementModels: state.requirementModels,
      connections: state.connections,
      applies: state.applies,
      disconnectCalls: state.disconnectCalls,
      recorderStarts: state.recorderStarts,
      recorderStops: state.recorderStops,
      lifecycleEvents: state.lifecycleEvents,
      createdObjectUrls: state.createdObjectUrls,
      revokedObjectUrls: state.revokedObjectUrls,
    };
  });

export const triggerProviderDisconnect = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const driver = (
      window as typeof window & {
        __lightframeDevelopmentRealtimeDriver: { triggerProviderDisconnect(): void };
      }
    ).__lightframeDevelopmentRealtimeDriver;
    driver.triggerProviderDisconnect();
  });

export const triggerGenerationTick = (page: Page, elapsedSeconds: number): Promise<void> =>
  page.evaluate((seconds) => {
    const driver = (
      window as typeof window & {
        __lightframeDevelopmentRealtimeDriver: {
          triggerGenerationTick(value: number): void;
        };
      }
    ).__lightframeDevelopmentRealtimeDriver;
    driver.triggerGenerationTick(seconds);
  }, elapsedSeconds);

export const triggerGenerationEnded = (page: Page, elapsedSeconds: number): Promise<void> =>
  page.evaluate((seconds) => {
    const driver = (
      window as typeof window & {
        __lightframeDevelopmentRealtimeDriver: {
          triggerGenerationEnded(value: number): void;
        };
      }
    ).__lightframeDevelopmentRealtimeDriver;
    driver.triggerGenerationEnded(seconds);
  }, elapsedSeconds);
