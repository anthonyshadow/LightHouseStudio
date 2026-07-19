import type {
  CharacterPromptOptimizationResult,
  OptimizeCharacterReferencePromptRequest,
} from '@studio/contracts';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { characterPromptOptimizationResultSchema } from '@studio/contracts';
import { CHARACTER_REFERENCE_OPTIMIZER_PROMPT } from './character-prompt-optimizer-prompt.js';

export type PromptOptimizerReasoningEffort =
  'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface CharacterPromptOptimizer {
  readonly model: string;
  readonly version: string;
  optimize(
    input: OptimizeCharacterReferencePromptRequest,
  ): Promise<CharacterPromptOptimizationResult>;
}

export type CharacterPromptOptimizerFailureReason =
  'authentication' | 'failure' | 'invalid-response' | 'rate-limit' | 'refusal' | 'timeout';

export class CharacterPromptOptimizerError extends Error {
  readonly reason: CharacterPromptOptimizerFailureReason;
  readonly upstreamStatus?: number;

  constructor(
    reason: CharacterPromptOptimizerFailureReason,
    options?: { readonly upstreamStatus?: number; readonly cause?: unknown },
  ) {
    super(`OpenAI character prompt optimization failed: ${reason}`, {
      cause: options?.cause,
    });
    this.name = 'CharacterPromptOptimizerError';
    this.reason = reason;
    if (options?.upstreamStatus !== undefined) this.upstreamStatus = options.upstreamStatus;
  }
}

const outputFormat = zodTextFormat(
  characterPromptOptimizationResultSchema,
  'character_prompt_optimization',
);

export interface OpenAICharacterPromptOptimizerParameters {
  readonly model: string;
  readonly store: false;
  readonly input: readonly [
    { readonly role: 'developer'; readonly content: string },
    { readonly role: 'user'; readonly content: string },
  ];
  readonly reasoning: { readonly effort: PromptOptimizerReasoningEffort };
  readonly text: { readonly format: typeof outputFormat };
}

interface PromptOptimizerResponse {
  readonly output_parsed: CharacterPromptOptimizationResult | null;
  readonly output?: readonly {
    readonly type?: string;
    readonly content?: readonly { readonly type?: string }[];
  }[];
}

interface OpenAIResponsesClient {
  readonly responses: {
    parse(parameters: OpenAICharacterPromptOptimizerParameters): Promise<PromptOptimizerResponse>;
  };
}

type OpenAIClientFactory = (options: {
  readonly apiKey: string;
  readonly maxRetries: 0;
  readonly timeout: number;
}) => OpenAIResponsesClient;

const isOpenAIError = (
  error: unknown,
): error is Error & { readonly status?: number; readonly code?: string | null } =>
  error instanceof Error;

const normalizeOpenAIError = (error: unknown): CharacterPromptOptimizerError => {
  if (error instanceof CharacterPromptOptimizerError) return error;
  if (!isOpenAIError(error)) return new CharacterPromptOptimizerError('failure', { cause: error });

  const status = typeof error.status === 'number' ? error.status : undefined;
  const options =
    status === undefined ? { cause: error } : { cause: error, upstreamStatus: status };
  if (error.name === 'APIConnectionTimeoutError' || error.name === 'AbortError') {
    return new CharacterPromptOptimizerError('timeout', options);
  }
  if (status === 401) return new CharacterPromptOptimizerError('authentication', options);
  if (status === 429) return new CharacterPromptOptimizerError('rate-limit', options);
  if (error.name === 'ZodError' || error instanceof SyntaxError) {
    return new CharacterPromptOptimizerError('invalid-response', options);
  }
  return new CharacterPromptOptimizerError('failure', options);
};

const containsRefusal = (response: PromptOptimizerResponse): boolean =>
  response.output?.some(
    (item) =>
      item.type === 'message' && item.content?.some((content) => content.type === 'refusal'),
  ) === true;

const defaultClientFactory: OpenAIClientFactory = (options) =>
  new OpenAI(options) as OpenAIResponsesClient;

export class OpenAICharacterPromptOptimizer implements CharacterPromptOptimizer {
  readonly model: string;
  readonly version: string;
  readonly #reasoning: PromptOptimizerReasoningEffort;
  readonly #client: OpenAIResponsesClient;

  constructor(
    apiKey: string,
    options: {
      readonly model: string;
      readonly reasoning: PromptOptimizerReasoningEffort;
      readonly version: string;
      readonly timeoutMs: number;
    },
    clientFactory: OpenAIClientFactory = defaultClientFactory,
  ) {
    this.model = options.model;
    this.version = options.version;
    this.#reasoning = options.reasoning;
    this.#client = clientFactory({ apiKey, maxRetries: 0, timeout: options.timeoutMs });
  }

  async optimize(
    input: OptimizeCharacterReferencePromptRequest,
  ): Promise<CharacterPromptOptimizationResult> {
    try {
      const response = await this.#client.responses.parse({
        model: this.model,
        store: false,
        input: [
          { role: 'developer', content: CHARACTER_REFERENCE_OPTIMIZER_PROMPT },
          { role: 'user', content: JSON.stringify(input) },
        ],
        reasoning: { effort: this.#reasoning },
        text: { format: outputFormat },
      });
      if (response.output_parsed === null) {
        throw new CharacterPromptOptimizerError(
          containsRefusal(response) ? 'refusal' : 'invalid-response',
        );
      }
      return characterPromptOptimizationResultSchema.parse(response.output_parsed);
    } catch (error) {
      throw normalizeOpenAIError(error);
    }
  }
}
