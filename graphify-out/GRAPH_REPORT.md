# Graph Report - .  (2026-07-18)

## Corpus Check
- 221 files · ~76,527 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1429 nodes · 3262 edges · 95 communities (68 shown, 27 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.66)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Voice Effects Voiceeffectspanel
- Creative Assets Recipeshelf
- Studio Studioapp Recording
- Prompts Draft Validation
- Media Session Sessioncomposer
- Assets Creative Userecipeshelfcontroller
- Voice Processing Adapters
- Api Package Dependencies
- Primitives Segmentedcontrol Button
- Adapters Session Decart
- E2E Spec Successful
- Session Image Modes
- Tsconfig Base Compileroptions
- Api Voices Routes
- Recording Recordingcontrols Live
- Session Orchestration Realtimesnapshot
- Api Providers Decart
- Package Dependencies React
- Contracts Voices Voice
- Prompt Authoring Charactertransformfields
- Api Providers Elevenlabs
- Orchestration Session Media
- Prompt Authoring Characterpromptworkshop
- Assets Operations Context
- Session Recording Live
- Recording Orchestration Recordingartifacts
- Recording Orchestration Recordingattempt
- Api Voices Voice
- Package Devdependencies Json
- Assets Sanitize Count
- Contracts Realtime Capabilities
- Assets Creative Repository
- Api Config Environment
- Api Http Errors
- Tsconfig Api Json
- Tsconfig Compileroptions Ref
- Package Scripts Build
- Api Voices Routes
- Session Orchestration Usemodelsessionactions
- Contracts Package Scripts
- Assets Creativeassetsearchresults Recentprompt
- Api Providers Provider
- Recording Recordinghelpers Mime
- Api Providers Elevenlabs
- Recording Mime Format
- Api Http Security
- Api Providers Provider
- Statusnotice Promptfeedback Primitives
- Primitives Formcontrols Fieldrootstyles
- Package Engines Ref
- Package Scripts Exports
- Testing Package Scripts
- Tsconfig Testing Json
- Prompt Authoring Promptworkshopheader
- Contracts Common Api
- Tsconfig Contracts Compileroptions
- Tsconfig Compileroptions Json
- Characterpresetpicker Prompt Authoring
- Tsconfig Contracts Build
- Tsconfig Build Json
- Generatedpromptpreview Prompt Authoring
- Errors Safe Error
- Promptworkshopactions Prompt Authoring
- Docs Lightframe Architecture
- Creative Assets Sanitation
- Recording Orchestration Userecording
- Recording Recordinghelpers Fakemediastream
- Vite Config Development
- Prettierrc Printwidth Semi
- Favicon Public Gold
- Vitest Setup Blockedwebsocket
- Tsconfig Files References
- Graphify Agents Project
- Browser Window
- Axe Core Playwright
- Docs And Privacy
- Eslint Package Devdependencies
- Eslint Plugin Jsx
- Eslint Plugin React
- Globals Package Devdependencies
- Jsdom Package Devdependencies
- Msw Package Devdependencies
- Playwright Package Devdependencies
- Testing Library React
- Testing Library User
- Package Tsx Devdependencies
- React Package Devdependencies
- React Dom Package
- Package Typescript Devdependencies
- Typescript Eslint Package
- Vitejs Plugin React
- Vitest Coverage Package
- Vitest Config Rootpath

## God Nodes (most connected - your core abstractions)
1. `StudioExperience()` - 21 edges
2. `normalizeWhitespace()` - 21 edges
3. `createCreativeAssetRepository()` - 20 edges
4. `FakeElevenLabsProvider` - 19 edges
5. `PromptBuilderDraft` - 19 edges
6. `useRecording()` - 19 edges
7. `compilerOptions` - 18 edges
8. `AudioStream` - 17 edges
9. `ElevenLabsProvider` - 17 edges
10. `StudioMode` - 17 edges

## Surprising Connections (you probably didn't know these)
- `createCreativeAssetRepository()` --indirect_call--> `context()`  [INFERRED]
  apps/web/src/features/creative-assets/repository.ts → packages/domain/src/assets/assets.test.ts
- `useSessionDraftState()` --indirect_call--> `image()`  [INFERRED]
  apps/web/src/orchestration/session/useSessionDraftState.ts → packages/domain/src/session/session.test.ts
- `Lightframe Web Shell` --conceptually_related_to--> `Lightframe Studio`  [INFERRED]
  apps/web/index.html → README.md
- `registerVoiceRoutes()` --indirect_call--> `signal()`  [INFERRED]
  apps/api/src/features/voices/routes.ts → apps/api/src/providers/elevenlabs/http-provider.test.ts
- `createCreativeAssetRepository()` --calls--> `recordSuccessfulPromptUse()`  [EXTRACTED]
  apps/web/src/features/creative-assets/repository.ts → packages/domain/src/assets/operations.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Composite Application Mark** — apps_web_public_favicon_teal_frame, apps_web_public_favicon_gold_l_glyph, apps_web_public_favicon_gold_dot [EXTRACTED 1.00]

## Communities (95 total, 27 thin omitted)

### Community 0 - "Voice Effects Voiceeffectspanel"
Cohesion: 0.05
Nodes (63): ApiClientError, apiFetch(), fetchProviderAvailability(), readError(), requestRealtimeToken(), convertRecordingVoice(), importPublicVoice(), invalidResponse() (+55 more)

### Community 1 - "Creative Assets Recipeshelf"
Cohesion: 0.10
Nodes (54): CharacterRecipeList(), updateCharacterRecipe(), RecentRecipeList(), CharacterPromptCard(), EmptyShelf(), formatDate(), modeName(), RecentPromptCard() (+46 more)

### Community 2 - "Studio Studioapp Recording"
Cohesion: 0.07
Nodes (41): detectBrowserCapabilities(), BrowserCapabilities, ProviderAvailability, RecordingLifecycle, root, installRecorderHarness(), streamEvents, FakeMediaStream (+33 more)

### Community 3 - "Prompts Draft Validation"
Cohesion: 0.10
Nodes (44): canonicalPrompt(), normalizeWhitespace(), trimText(), createPromptBuilderDraft(), isAdultAge(), isCharacterGender(), isIntent(), isRecord() (+36 more)

### Community 4 - "Media Session Sessioncomposer"
Cohesion: 0.11
Nodes (31): StudioMode, confirmModeReplacement(), hasDraftContent(), ALLOWED_IMAGE_TYPES, ImageValidation, loadDimensions(), validateReferenceImage(), ModelRecipeFields() (+23 more)

### Community 5 - "Assets Creative Userecipeshelfcontroller"
Cohesion: 0.13
Nodes (32): EditAction, ShelfCategory, RecipeSelection, RecipeShelfProps, CreativeAssetError, CreativeAssetErrorCode, CreativeAssetRepositoryOptions, AssetSource (+24 more)

### Community 6 - "Voice Processing Adapters"
Cohesion: 0.11
Nodes (29): connectClearEffect(), connectRobotEffect(), connectWarmEffect(), decodeAudioBlob(), getAudioContext(), getOfflineContext(), renderLocalEffect(), isMp4() (+21 more)

### Community 7 - "Api Package Dependencies"
Cohesion: 0.05
Nodes (36): dependencies, @decartai/sdk, dotenv, fastify, @fastify/helmet, @fastify/static, @studio/contracts, zod (+28 more)

### Community 8 - "Primitives Segmentedcontrol Button"
Cohesion: 0.12
Nodes (23): ButtonProps, ButtonSize, buttonStyles(), ButtonVariant, controlStyles(), fullLabelStyles(), groupStyles(), SegmentedControl() (+15 more)

### Community 9 - "Adapters Session Decart"
Cohesion: 0.09
Nodes (22): connectDecartRealtime(), ConnectRealtimeOptions, DevelopmentRealtimeDriver, getDecartModelRequirements(), ModelRequirements, RealtimeConnectionState, RealtimeSession, RealtimeSnapshot (+14 more)

### Community 10 - "E2E Spec Successful"
Cohesion: 0.07
Nodes (16): BrowserTestState, MockStudioState, representativeViewports, BrowserJourneyState, ModelId, NetworkJourneyState, SerializedSnapshot, compilerOptions (+8 more)

### Community 11 - "Session Image Modes"
Cohesion: 0.10
Nodes (24): AppliedRealtimeState, createCleanSessionDraft(), DraftValidationCode, DraftValidationIssue, RealtimeStateSnapshot, SessionDraft, EphemeralImageDescriptor, getImageQualityWarnings() (+16 more)

### Community 12 - "Tsconfig Base Compileroptions"
Cohesion: 0.07
Nodes (27): packages/contracts/src/index.ts, packages/domain/src/index.ts, packages/testing/src/index.ts, compilerOptions, baseUrl, exactOptionalPropertyTypes, ignoreDeprecations, isolatedModules (+19 more)

### Community 13 - "Api Voices Routes"
Cohesion: 0.15
Nodes (15): MAX_RECORDING_AUDIO_BYTES, FailingProvider, InvalidAudioProvider, LimitedProvider, originHeaders, ZeroRetentionRejectedProvider, ProviderSharedVoice, ProviderSharedVoicePage (+7 more)

### Community 14 - "Recording Recordingcontrols Live"
Cohesion: 0.13
Nodes (20): badgeStyles(), dotStyles(), emptyStyles(), figureStyles(), lifecycleLabel(), MediaStage(), MediaStageProps, overlayStyles() (+12 more)

### Community 15 - "Session Orchestration Realtimesnapshot"
Cohesion: 0.18
Nodes (23): AppliedRealtimeState, SessionDraft, hasPendingChanges(), imageIdentity(), imageIds, normalizePrompt, revertToAppliedDraft(), toAppliedState() (+15 more)

### Community 16 - "Api Providers Decart"
Cohesion: 0.13
Nodes (18): AppDependencies, createApp(), RuntimeConfig, localOriginHeaders, registerSystemRoutes(), SUPPORTED_AUDIO_CONTENT_TYPES, create(), DecartSdkClient (+10 more)

### Community 17 - "Package Dependencies React"
Cohesion: 0.08
Nodes (24): dependencies, @decartai/sdk, @emotion/react, mediabunny, react, react-dom, @studio/contracts, @studio/domain (+16 more)

### Community 18 - "Contracts Voices Voice"
Cohesion: 0.10
Nodes (23): voice, ImportSharedVoiceRequest, importSharedVoiceRequestSchema, ImportSharedVoiceResponse, PublicVoiceSummary, publicVoiceSummarySchema, SharedVoicePreviewParams, sharedVoicePreviewParamsSchema (+15 more)

### Community 19 - "Prompt Authoring Charactertransformfields"
Cohesion: 0.22
Nodes (19): CharacterPreset, CharacterPromptWorkshopProps, CharacterTransformFields(), CharacterTransformFieldsProps, checkboxLabelStyles(), checkboxStyles(), CharacterGender, CharacterTransformDraft (+11 more)

### Community 20 - "Api Providers Elevenlabs"
Cohesion: 0.12
Nodes (21): ALLOWED_PREVIEW_HOSTS, audioExtension(), classifyProviderFailure(), FEATURE_UNAVAILABLE_CODES, importResponseSchema, INVALID_AUDIO_CODES, isAllowedPreviewUrl(), labelsSchema (+13 more)

### Community 21 - "Orchestration Session Media"
Cohesion: 0.20
Nodes (15): acquireLocalMedia(), hasLiveAudio(), hasLiveTrack(), hasLiveVideo(), MediaRequirements, stopOwnedStream(), SessionLifecycle, LOCAL_MEDIA_REQUIREMENTS (+7 more)

### Community 22 - "Prompt Authoring Characterpromptworkshop"
Cohesion: 0.24
Nodes (17): CharacterPromptWorkshop(), createDraftMap(), customFieldStyles(), PromptWorkshopAction, referenceContext(), SavePromptWorkshopAction, workshopStyles(), AdultAge (+9 more)

### Community 23 - "Assets Operations Context"
Cohesion: 0.24
Nodes (19): context(), timestamp(), assertTimestamp(), capByUpdated(), createSavedCharacterPrompt(), createSavedPrompt(), deleteSavedCharacterPrompt(), deleteSavedPrompt() (+11 more)

### Community 24 - "Session Recording Live"
Cohesion: 0.17
Nodes (16): SafeError, ModelRecordingStopAction, AudioSidecar, RecordingArtifact, RecordingLifecycle, RecordingLifecycleStatus, RecordingReleaseReason, RecordingSourceAvailability (+8 more)

### Community 25 - "Recording Orchestration Recordingartifacts"
Cohesion: 0.18
Nodes (17): revokeArtifactUrl(), AutomaticRecordingStopEvent, AutomaticRecordingStopReason, RecordingArtifact, RecordingAudioSidecar, UseRecordingOptions, VoiceProcessingState, createOriginalRecordingArtifact() (+9 more)

### Community 26 - "Recording Orchestration Recordingattempt"
Cohesion: 0.22
Nodes (17): attachRecordingAttemptListeners(), cleanupRecordingAttempt(), createRecordingAttempt(), liveTrack(), RecordingAttempt, RecordingAttemptEvents, RecordingAttemptListeners, RecordingAttemptSetup (+9 more)

### Community 27 - "Api Voices Voice"
Cohesion: 0.23
Nodes (8): isModelCompatible(), isProfessionalVoice(), summarizePublicVoice(), summarizeVoice(), VoiceService, ElevenLabsModel, SharedVoicesResponse, WorkspaceVoicesResponse

### Community 28 - "Package Devdependencies Json"
Cohesion: 0.11
Nodes (19): concurrently, @eslint/js, fast-check, devDependencies, concurrently, @eslint/js, fast-check, prettier (+11 more)

### Community 29 - "Assets Sanitize Count"
Cohesion: 0.29
Nodes (18): count(), isRecord(), normalizedId(), nullableDate(), promptIntent(), readTags(), referenceStatus(), sanitizeArray() (+10 more)

### Community 30 - "Contracts Realtime Capabilities"
Cohesion: 0.14
Nodes (13): CapabilityAvailability, CapabilitiesResponse, capabilitiesResponseSchema, HealthResponse, healthResponseSchema, DEFAULT_CHARACTER_MODEL_ID, RealtimeTokenConstraints, realtimeTokenConstraintsSchema (+5 more)

### Community 31 - "Assets Creative Repository"
Cohesion: 0.15
Nodes (12): createRepository(), browserStorage(), createCreativeAssetRepository(), defaultIdFactory(), loadInitialState(), mapDomainError(), storageNotice(), MemoryStorage (+4 more)

### Community 32 - "Api Config Environment"
Cohesion: 0.16
Nodes (10): environmentSchema, EnvironmentValidationError, optionalModelSchema, optionalSecretSchema, parseEnvironment(), portSchema, strictBooleanSchema, app (+2 more)

### Community 33 - "Api Http Errors"
Cohesion: 0.21
Nodes (11): VoiceServiceError, VoiceServiceFailureReason, ApiErrorBody, AppError, errorBody(), installErrorHandling(), isFastifyError(), mapProviderError() (+3 more)

### Community 34 - "Tsconfig Api Json"
Cohesion: 0.13
Nodes (14): compilerOptions, composite, lib, noEmit, types, extends, include, DOM (+6 more)

### Community 35 - "Tsconfig Compileroptions Ref"
Cohesion: 0.13
Nodes (14): compilerOptions, composite, jsx, jsxImportSource, noEmit, types, extends, include (+6 more)

### Community 36 - "Package Scripts Build"
Cohesion: 0.13
Nodes (15): scripts, build, build:packages, dev, format, format:check, lint, quality (+7 more)

### Community 37 - "Api Voices Routes"
Cohesion: 0.25
Nodes (11): contentTypeEssence(), registerVoiceRoutes(), requireVoiceService(), streamProviderAudio(), validationError(), verifyProviderOrigin(), createRequestLifetime(), RequestLifetime (+3 more)

### Community 38 - "Session Orchestration Usemodelsessionactions"
Cohesion: 0.22
Nodes (12): namedMessage(), SafeMediaError, toSafeMediaError(), isModelMode(), stream(), track(), disconnectError(), ModelSessionActions (+4 more)

### Community 39 - "Contracts Package Scripts"
Cohesion: 0.14
Nodes (13): dependencies, zod, exports, zod, main, name, private, scripts (+5 more)

### Community 40 - "Assets Creativeassetsearchresults Recentprompt"
Cohesion: 0.20
Nodes (13): CreativeAssetSearchResults, RecentPrompt, ReferenceImageStatus, SanitizeCreativeAssetResult, SavedCharacterPrompt, SavedCharacterPromptInput, SavedCharacterPromptSource, SavedPrompt (+5 more)

### Community 42 - "Recording Recordinghelpers Mime"
Cohesion: 0.29
Nodes (11): AUDIO_MIME_CANDIDATES, composeRecordingSource(), hasSameRecordingTracks(), live(), selectAudioMime(), selectedLiveTracks(), selectSupportedMime(), selectVideoMime() (+3 more)

### Community 44 - "Recording Mime Format"
Cohesion: 0.23
Nodes (10): createRecordingFilename(), filenameMode, formatDuration(), formatFileSize(), timestampForFilename(), isAudioMimeType(), isSupportedVoiceSidecarMimeType(), MimeSupportTest (+2 more)

### Community 45 - "Api Http Security"
Cohesion: 0.38
Nodes (9): registerRealtimeRoutes(), verifyProviderOrigin(), canonicalLoopbackOrigin(), installLocalSecurityBoundary(), isLoopbackHostname(), LOOPBACK_HOSTS, parseHostHeader(), requireTrustedOrigin() (+1 more)

### Community 46 - "Api Providers Provider"
Cohesion: 0.22
Nodes (4): sdkMocks, signal(), ProviderError, ProviderFailureReason

### Community 47 - "Statusnotice Promptfeedback Primitives"
Cohesion: 0.25
Nodes (9): feedbackRootStyles(), issueListStyles(), PromptFeedback(), PromptFeedbackProps, noticeStyles(), noticeTitleStyles(), NoticeTone, StatusNotice() (+1 more)

### Community 48 - "Primitives Formcontrols Fieldrootstyles"
Cohesion: 0.24
Nodes (5): SelectField, SelectFieldProps, SharedFieldProps, TextAreaFieldProps, TextFieldProps

### Community 49 - "Package Engines Ref"
Cohesion: 0.18
Nodes (10): engines, node, npm, name, private, type, version, workspaces (+2 more)

### Community 50 - "Package Scripts Exports"
Cohesion: 0.18
Nodes (10): exports, main, name, private, scripts, build, typecheck, type (+2 more)

### Community 51 - "Testing Package Scripts"
Cohesion: 0.18
Nodes (10): exports, main, name, private, scripts, build, typecheck, type (+2 more)

### Community 52 - "Tsconfig Testing Json"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, noEmit, types, extends, include, node, src (+2 more)

### Community 53 - "Prompt Authoring Promptworkshopheader"
Cohesion: 0.33
Nodes (9): PromptIntent, eyebrowStyles(), headerStyles(), intentHintStyles(), intentOptions, introStyles(), PromptWorkshopHeader(), PromptWorkshopHeaderProps (+1 more)

### Community 54 - "Contracts Common Api"
Cohesion: 0.20
Nodes (9): API_ERROR_CODES, apiErrorCodeSchema, ApiErrorDetail, apiErrorDetailSchema, ApiErrorResponse, apiErrorResponseSchema, boundedSearchSchema, opaquePageTokenSchema (+1 more)

### Community 55 - "Tsconfig Contracts Compileroptions"
Cohesion: 0.20
Nodes (9): compilerOptions, composite, noEmit, types, extends, include, src, ../../tsconfig.base.json (+1 more)

### Community 56 - "Tsconfig Compileroptions Json"
Cohesion: 0.20
Nodes (9): compilerOptions, composite, noEmit, types, extends, include, src, ../../tsconfig.base.json (+1 more)

### Community 57 - "Characterpresetpicker Prompt Authoring"
Cohesion: 0.36
Nodes (8): CharacterPresetPicker(), CharacterPresetPickerProps, characterPresets, presetButtonStyles(), presetDescriptionStyles(), presetLabelStyles(), presetListStyles(), presetRootStyles()

### Community 58 - "Tsconfig Contracts Build"
Cohesion: 0.22
Nodes (8): compilerOptions, types, exclude, extends, include, src/**/*.test.ts, src/**/*.ts, ../../tsconfig.base.json

### Community 59 - "Tsconfig Build Json"
Cohesion: 0.22
Nodes (8): compilerOptions, types, exclude, extends, include, src/**/*.test.ts, src/**/*.ts, ../../tsconfig.base.json

### Community 60 - "Generatedpromptpreview Prompt Authoring"
Cohesion: 0.43
Nodes (7): GeneratedPromptPreview(), GeneratedPromptPreviewProps, previewCountStyles(), previewHeaderStyles(), previewLabelStyles(), previewStyles(), previewTextStyles()

### Community 61 - "Errors Safe Error"
Cohesion: 0.36
Nodes (5): browserErrorMap, classifyBrowserError(), createSafeError(), DomainRuleError, SafeErrorCode

### Community 62 - "Promptworkshopactions Prompt Authoring"
Cohesion: 0.38
Nodes (6): actionRowStyles(), PromptSaveState, PromptWorkshopActions(), PromptWorkshopActionsProps, saveFormStyles(), TextField

### Community 63 - "Docs Lightframe Architecture"
Cohesion: 0.33
Nodes (6): Lightframe Web Shell, Architecture and Ownership, Browser Support, Live Provider Smoke Test, Manual QA Checklist, Lightframe Studio

### Community 64 - "Creative Assets Sanitation"
Cohesion: 0.47
Nodes (5): normalizeAssetName(), normalizeAssetNotes(), normalizeAssetText(), normalizePromptText(), normalizeTags()

### Community 65 - "Recording Orchestration Userecording"
Cohesion: 0.40
Nodes (5): RecordingSource, createSource(), createTrack(), RecorderHarness, RecorderListener

### Community 68 - "Prettierrc Printwidth Semi"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 69 - "Favicon Public Gold"
Cohesion: 0.50
Nodes (4): Dark Rounded-Square Application Favicon, Gold Circular Accent, Gold L-Shaped Glyph, Teal Rounded-Square Frame

## Knowledge Gaps
- **357 isolated node(s):** `semi`, `singleQuote`, `trailingComma`, `printWidth`, `name` (+352 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ModelModeId` connect `Assets Creativeassetsearchresults Recentprompt` to `Voice Effects Voiceeffectspanel`, `Assets Creative Userecipeshelfcontroller`, `Session Image Modes`, `Assets Operations Context`, `Assets Sanitize Count`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `ModelMode` connect `Adapters Session Decart` to `Voice Effects Voiceeffectspanel`, `Media Session Sessioncomposer`, `Session Orchestration Realtimesnapshot`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `ElevenLabsProvider` connect `Api Providers Elevenlabs` to `Api Providers Provider`, `Api Voices Routes`, `Api Providers Decart`, `Api Providers Elevenlabs`, `Api Voices Voice`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `semi`, `singleQuote`, `trailingComma` to the rest of the system?**
  _357 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Voice Effects Voiceeffectspanel` be split into smaller, more focused modules?**
  _Cohesion score 0.05063291139240506 - nodes in this community are weakly interconnected._
- **Should `Creative Assets Recipeshelf` be split into smaller, more focused modules?**
  _Cohesion score 0.10153358011634056 - nodes in this community are weakly interconnected._
- **Should `Studio Studioapp Recording` be split into smaller, more focused modules?**
  _Cohesion score 0.06779661016949153 - nodes in this community are weakly interconnected._