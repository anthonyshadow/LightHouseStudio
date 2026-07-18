# Graph Report - webrtc2Sol  (2026-07-18)

## Corpus Check
- 238 files · ~1,390,915 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1707 nodes · 3850 edges · 112 communities (83 shown, 29 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.67)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5602877c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

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
- index.ts
- Session Orchestration Usemodelsessionactions
- Contracts Package Scripts
- Assets Creativeassetsearchresults Recentprompt
- useRecording.test.tsx
- Recording Recordinghelpers Mime
- Api Providers Elevenlabs
- Recording Mime Format
- Api Http Security
- Api Providers Provider
- types.ts
- Primitives Formcontrols Fieldrootstyles
- Package Engines Ref
- Package Scripts Exports
- Testing Package Scripts
- Tsconfig Testing Json
- Prompt Authoring Promptworkshopheader
- useVoiceProcessing.test.tsx
- Tsconfig Contracts Compileroptions
- Tsconfig Compileroptions Json
- Characterpresetpicker Prompt Authoring
- Tsconfig Contracts Build
- Tsconfig Build Json
- Generatedpromptpreview Prompt Authoring
- StudioMode
- Promptworkshopactions Prompt Authoring
- Docs Lightframe Architecture
- FakeMediaStream
- RecordingControls.test.tsx
- createCreativeAssetRepository
- Vite Config Development
- Prettierrc Printwidth Semi
- Favicon Public Gold
- Vitest Setup Blockedwebsocket
- Tsconfig Files References
- Graphify Agents Project
- Browser Window
- Axe Core Playwright
- Docs And Privacy
- PromptWorkshopHeader.tsx
- Eslint Plugin Jsx
- Eslint Plugin React
- Globals Package Devdependencies
- Jsdom Package Devdependencies
- Msw Package Devdependencies
- Playwright Package Devdependencies
- CharacterPresetPicker.tsx
- Testing Library User
- Package Tsx Devdependencies
- React Package Devdependencies
- React Dom Package
- Package Typescript Devdependencies
- Typescript Eslint Package
- Vitejs Plugin React
- Vitest Coverage Package
- Vitest Config Rootpath
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- extraction-spec.md
- GeneratedPromptPreview.tsx
- image.ts
- workshopSteps.ts
- @testing-library/react
- @axe-core/playwright
- StudioDesignProvider
- concurrently
- useRecording.test.tsx
- sanitation.ts
- SessionComposer.test.tsx
- @playwright/test

## God Nodes (most connected - your core abstractions)
1. `CharacterPromptWorkshop()` - 31 edges
2. `StudioExperience()` - 25 edges
3. `MediaStage()` - 22 edges
4. `useRecording()` - 21 edges
5. `normalizeWhitespace()` - 21 edges
6. `RecipeShelf()` - 20 edges
7. `createCreativeAssetRepository()` - 20 edges
8. `PromptBuilderDraft` - 20 edges
9. `Button` - 20 edges
10. `FakeElevenLabsProvider` - 19 edges

## Surprising Connections (you probably didn't know these)
- `useSessionDraftState()` --indirect_call--> `image()`  [INFERRED]
  apps/web/src/orchestration/session/useSessionDraftState.ts → packages/domain/src/session/session.test.ts
- `Lightframe Web Shell` --conceptually_related_to--> `Lightframe Studio`  [INFERRED]
  apps/web/index.html → README.md
- `registerVoiceRoutes()` --indirect_call--> `signal()`  [INFERRED]
  apps/api/src/features/voices/routes.ts → apps/api/src/providers/elevenlabs/http-provider.test.ts
- `createCreativeAssetRepository()` --indirect_call--> `context()`  [INFERRED]
  apps/web/src/features/creative-assets/repository.ts → packages/domain/src/assets/assets.test.ts
- `createCreativeAssetRepository()` --calls--> `sanitizeCreativeAssetStore()`  [EXTRACTED]
  apps/web/src/features/creative-assets/repository.ts → packages/domain/src/assets/sanitize.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Composite Application Mark** — apps_web_public_favicon_teal_frame, apps_web_public_favicon_gold_l_glyph, apps_web_public_favicon_gold_dot [EXTRACTED 1.00]

## Communities (112 total, 29 thin omitted)

### Community 0 - "Voice Effects Voiceeffectspanel"
Cohesion: 0.23
Nodes (10): actionRowStyles(), PromptSaveState, PromptWorkshopActions(), PromptWorkshopActionsProps, saveFormStyles(), noticeStyles(), noticeTitleStyles(), NoticeTone (+2 more)

### Community 1 - "Creative Assets Recipeshelf"
Cohesion: 0.09
Nodes (66): CharacterRecipeList(), updateCharacterRecipe(), RecentRecipeList(), CharacterPromptCard(), EmptyShelf(), formatDate(), modeName(), RecentPromptCard() (+58 more)

### Community 2 - "Studio Studioapp Recording"
Cohesion: 0.07
Nodes (48): detectBrowserCapabilities(), stream(), root, FakeMediaStream, FakeTrack, useRecordingSource(), AuxiliaryPanel, CreativePanelContent() (+40 more)

### Community 3 - "Prompts Draft Validation"
Cohesion: 0.21
Nodes (24): CharacterPromptWorkshop(), createDraftMap(), createStepMap(), referenceContext(), accordionStyles(), chevronStyles(), footerStyles(), headerRegionStyles() (+16 more)

### Community 4 - "Media Session Sessioncomposer"
Cohesion: 0.17
Nodes (26): confirmModeReplacement(), hasDraftContent(), ModelRecipeFields(), ModelRecipeFieldsProps, SessionActions(), SessionActionsProps, SessionComposer(), SessionComposerProps (+18 more)

### Community 5 - "Assets Creative Userecipeshelfcontroller"
Cohesion: 0.26
Nodes (20): count(), isRecord(), normalizedId(), nullableDate(), promptIntent(), readTags(), referenceStatus(), sanitizeArray() (+12 more)

### Community 6 - "Voice Processing Adapters"
Cohesion: 0.17
Nodes (18): LOCAL_EFFECTS, LocalVoiceEffectId, VoiceEffectSelection, safeProcessingMessage(), useVoiceProcessing(), beginVoiceProcessing(), completeVoiceProcessing(), createVoiceProcessingState() (+10 more)

### Community 7 - "Api Package Dependencies"
Cohesion: 0.05
Nodes (36): dependencies, @decartai/sdk, dotenv, fastify, @fastify/helmet, @fastify/static, @studio/contracts, zod (+28 more)

### Community 8 - "Primitives Segmentedcontrol Button"
Cohesion: 0.23
Nodes (12): CaptureAudioSettings, CaptureStreamSettings, CaptureVideoSettings, VoiceLibraryKind, VoicePage, VoiceSummary, defaultVoiceLibraryClient, createClient() (+4 more)

### Community 9 - "Adapters Session Decart"
Cohesion: 0.09
Nodes (24): connectDecartRealtime(), ConnectRealtimeOptions, DevelopmentRealtimeDriver, getDecartModelRequirements(), ModelRequirements, RealtimeConnectionState, RealtimeSession, RealtimeSnapshot (+16 more)

### Community 10 - "E2E Spec Successful"
Cohesion: 0.05
Nodes (17): BrowserTestState, MockStudioState, representativeViewports, BrowserJourneyState, exactViewports, ModelId, NetworkJourneyState, SerializedSnapshot (+9 more)

### Community 11 - "Session Image Modes"
Cohesion: 0.11
Nodes (32): EditAction, RecipeSelection, RecipeShelfProps, CreativeAssetError, CreativeAssetRepositoryOptions, MemoryStorage, AssetSource, CreateSavedCharacterPromptInput (+24 more)

### Community 12 - "Tsconfig Base Compileroptions"
Cohesion: 0.07
Nodes (27): packages/contracts/src/index.ts, packages/domain/src/index.ts, packages/testing/src/index.ts, compilerOptions, baseUrl, exactOptionalPropertyTypes, ignoreDeprecations, isolatedModules (+19 more)

### Community 13 - "Api Voices Routes"
Cohesion: 0.12
Nodes (11): MAX_RECORDING_AUDIO_BYTES, FailingProvider, InvalidAudioProvider, LimitedProvider, originHeaders, ZeroRetentionRejectedProvider, VoiceSearchInput, FakeElevenLabsProvider (+3 more)

### Community 14 - "Recording Recordingcontrols Live"
Cohesion: 0.19
Nodes (14): actionRowStyles(), captureSurfaceStyles(), detailsStyles(), disabledReasonStyles(), focusTargetStyles(), headingStyles(), noticeLayerStyles(), recordActionStyles() (+6 more)

### Community 15 - "Session Orchestration Realtimesnapshot"
Cohesion: 0.18
Nodes (24): hasPendingChanges(), imageIdentity(), imageIds, normalizePrompt, revertToAppliedDraft(), toAppliedState(), toDomainApplied(), toDomainDraft() (+16 more)

### Community 16 - "Api Providers Decart"
Cohesion: 0.14
Nodes (13): CapabilityAvailability, CapabilitiesResponse, capabilitiesResponseSchema, HealthResponse, healthResponseSchema, DEFAULT_CHARACTER_MODEL_ID, RealtimeTokenConstraints, realtimeTokenConstraintsSchema (+5 more)

### Community 17 - "Package Dependencies React"
Cohesion: 0.08
Nodes (24): dependencies, @decartai/sdk, @emotion/react, mediabunny, react, react-dom, @studio/contracts, @studio/domain (+16 more)

### Community 18 - "Contracts Voices Voice"
Cohesion: 0.09
Nodes (34): contentTypeEssence(), registerVoiceRoutes(), requireVoiceService(), streamProviderAudio(), validationError(), verifyProviderOrigin(), createRequestLifetime(), RequestLifetime (+26 more)

### Community 19 - "Prompt Authoring Charactertransformfields"
Cohesion: 0.24
Nodes (18): CharacterTransformFields(), CharacterTransformFieldsProps, checkboxLabelStyles(), checkboxStyles(), CharacterGender, PromptIssue, promptFieldGridStyles(), promptFullWidthStyles() (+10 more)

### Community 20 - "Api Providers Elevenlabs"
Cohesion: 0.11
Nodes (23): ALLOWED_PREVIEW_HOSTS, audioExtension(), classifyProviderFailure(), ElevenLabsHttpProvider, FEATURE_UNAVAILABLE_CODES, importResponseSchema, INVALID_AUDIO_CODES, isAllowedPreviewUrl() (+15 more)

### Community 21 - "Orchestration Session Media"
Cohesion: 0.15
Nodes (13): enumerateMediaDevices(), finiteSetting(), readCaptureStreamSettings(), supportsLocal1080pProfile(), originalMediaDevices, CaptureDeviceOption, CapturePreferences, CapturePreferencesController (+5 more)

### Community 22 - "Prompt Authoring Characterpromptworkshop"
Cohesion: 0.06
Nodes (41): AudioLevelMeter(), describeStream(), emptyCopy(), formatFrameRate(), isFinitePositive(), lifecycleLabel(), lifecycleTone(), MediaStage() (+33 more)

### Community 23 - "Assets Operations Context"
Cohesion: 0.12
Nodes (14): create(), DecartSdkClient, DecartSdkModule, DecartSdkTokenProvider, normalizeExpiry(), numericStatusFrom(), sdkTokenSchema, TemporaryToken (+6 more)

### Community 24 - "Session Recording Live"
Cohesion: 0.15
Nodes (19): browserErrorMap, classifyBrowserError(), createSafeError(), SafeError, SafeErrorCode, ModelRecordingStopAction, AudioSidecar, RecordingArtifact (+11 more)

### Community 25 - "Recording Orchestration Recordingartifacts"
Cohesion: 0.29
Nodes (10): AUDIO_MIME_CANDIDATES, composeRecordingSource(), hasSameRecordingTracks(), live(), revokeArtifactUrl(), selectedLiveTracks(), selectSupportedMime(), selectRecordingMimeType() (+2 more)

### Community 26 - "Recording Orchestration Recordingattempt"
Cohesion: 0.13
Nodes (23): StudioMode, AutomaticRecordingStopEvent, AutomaticRecordingStopReason, CaptureDeviceState, RecordingArtifact, RecordingAudioSidecar, RecordingLifecycle, RecordingSource (+15 more)

### Community 27 - "Api Voices Voice"
Cohesion: 0.15
Nodes (12): AudioStream, isModelCompatible(), isProfessionalVoice(), summarizePublicVoice(), summarizeVoice(), VoiceService, ElevenLabsModel, ElevenLabsProvider (+4 more)

### Community 28 - "Package Devdependencies Json"
Cohesion: 0.11
Nodes (19): concurrently, @eslint/js, fast-check, devDependencies, concurrently, @eslint/js, fast-check, prettier (+11 more)

### Community 29 - "Assets Sanitize Count"
Cohesion: 0.10
Nodes (41): normalizeWhitespace(), createPromptBuilderDraft(), isAdultAge(), isCharacterGender(), isIntent(), isRecord(), normalizeField(), normalizePreset() (+33 more)

### Community 31 - "Assets Creative Repository"
Cohesion: 0.19
Nodes (15): PromptWorkshopAction, SavePromptWorkshopAction, AdultAge, createPromptBuilderDraft(), generateStructuredPrompt(), PROMPT_DETAIL_LIMIT, PromptValidation, ReferenceImageContext (+7 more)

### Community 32 - "Api Config Environment"
Cohesion: 0.16
Nodes (10): environmentSchema, EnvironmentValidationError, optionalModelSchema, optionalSecretSchema, parseEnvironment(), portSchema, strictBooleanSchema, app (+2 more)

### Community 33 - "Api Http Errors"
Cohesion: 0.11
Nodes (20): VoiceServiceError, VoiceServiceFailureReason, ApiErrorBody, AppError, errorBody(), installErrorHandling(), isFastifyError(), mapProviderError() (+12 more)

### Community 34 - "Tsconfig Api Json"
Cohesion: 0.13
Nodes (14): compilerOptions, composite, lib, noEmit, types, extends, include, DOM (+6 more)

### Community 35 - "Tsconfig Compileroptions Ref"
Cohesion: 0.13
Nodes (14): compilerOptions, composite, jsx, jsxImportSource, noEmit, types, extends, include (+6 more)

### Community 36 - "Package Scripts Build"
Cohesion: 0.13
Nodes (15): scripts, build, build:packages, dev, format, format:check, lint, quality (+7 more)

### Community 37 - "index.ts"
Cohesion: 0.09
Nodes (19): Button, ButtonProps, ButtonSize, ButtonVariant, IconButton, IconButtonProps, fadeIn, focusableSelector (+11 more)

### Community 38 - "Session Orchestration Usemodelsessionactions"
Cohesion: 0.18
Nodes (14): SessionLifecycle, SafeMediaError, AppliedRealtimeState, isModelMode(), SessionDraft, disconnectError(), ModelSessionActions, ModelSessionActionsOptions (+6 more)

### Community 39 - "Contracts Package Scripts"
Cohesion: 0.14
Nodes (13): dependencies, zod, exports, zod, main, name, private, scripts (+5 more)

### Community 40 - "Assets Creativeassetsearchresults Recentprompt"
Cohesion: 0.17
Nodes (14): ALLOWED_IMAGE_TYPES, ImageValidation, loadDimensions(), validateReferenceImage(), emptyFeedback(), formatFileSize(), ImageFeedback, ReferenceImageField() (+6 more)

### Community 41 - "useRecording.test.tsx"
Cohesion: 0.18
Nodes (13): LocalCaptureProfileId, actualSettingsStyles(), bodyStyles(), CaptureSettingsPanel(), CaptureSettingsPanelProps, footerStyles(), introductionStyles(), panelStyles() (+5 more)

### Community 42 - "Recording Recordinghelpers Mime"
Cohesion: 0.22
Nodes (15): selectAudioMime(), selectVideoMime(), createOriginalRecordingArtifact(), createRecordingSidecar(), firstChunkMimeType(), attachRecordingAttemptListeners(), createRecordingAttempt(), liveTrack() (+7 more)

### Community 43 - "Api Providers Elevenlabs"
Cohesion: 0.23
Nodes (11): fullLabelStyles(), panelStyles(), rootStyles(), shortLabelStyles(), TabItem, tabListStyles(), Tabs(), TabsProps (+3 more)

### Community 44 - "Recording Mime Format"
Cohesion: 0.13
Nodes (20): cleanupRecordingAttempt(), startRecordingAttempt(), useRecording(), createRecordingFilename(), filenameMode, formatDuration(), formatFileSize(), timestampForFilename() (+12 more)

### Community 45 - "Api Http Security"
Cohesion: 0.17
Nodes (18): AppDependencies, createApp(), RuntimeConfig, registerRealtimeRoutes(), localOriginHeaders, verifyProviderOrigin(), registerSystemRoutes(), SUPPORTED_AUDIO_CONTENT_TYPES (+10 more)

### Community 46 - "Api Providers Provider"
Cohesion: 0.12
Nodes (24): formatBytes(), formatDuration(), FakeTrack, actionStyles(), captureMetadataChips(), downloadStyles(), formatFrameRate(), gridStyles() (+16 more)

### Community 47 - "types.ts"
Cohesion: 0.16
Nodes (14): headingStyles(), introStyles(), optionGridStyles(), panelStyles(), providerContentStyles(), summaryStyles(), createOriginal(), createRecording() (+6 more)

### Community 48 - "Primitives Formcontrols Fieldrootstyles"
Cohesion: 0.13
Nodes (15): buttonStyles(), controlStyles(), SelectField, SelectFieldProps, SharedFieldProps, TextAreaFieldProps, TextFieldProps, fullLabelStyles() (+7 more)

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
Cohesion: 0.20
Nodes (9): `01-preparation`, `02-creative-tools`, `03-live-sessions`, `04-recording-and-review`, Capture details, Filename convention, Lightframe Studio responsive screenshot archive, State inventory (+1 more)

### Community 54 - "useVoiceProcessing.test.tsx"
Cohesion: 0.14
Nodes (33): createRepository(), browserStorage(), createCreativeAssetRepository(), CreativeAssetErrorCode, defaultIdFactory(), loadInitialState(), mapDomainError(), storageNotice() (+25 more)

### Community 55 - "Tsconfig Contracts Compileroptions"
Cohesion: 0.20
Nodes (9): compilerOptions, composite, noEmit, types, extends, include, src, ../../tsconfig.base.json (+1 more)

### Community 56 - "Tsconfig Compileroptions Json"
Cohesion: 0.20
Nodes (9): compilerOptions, composite, noEmit, types, extends, include, src, ../../tsconfig.base.json (+1 more)

### Community 57 - "Characterpresetpicker Prompt Authoring"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 58 - "Tsconfig Contracts Build"
Cohesion: 0.22
Nodes (8): compilerOptions, types, exclude, extends, include, src/**/*.test.ts, src/**/*.ts, ../../tsconfig.base.json

### Community 59 - "Tsconfig Build Json"
Cohesion: 0.22
Nodes (8): compilerOptions, types, exclude, extends, include, src/**/*.test.ts, src/**/*.ts, ../../tsconfig.base.json

### Community 60 - "Generatedpromptpreview Prompt Authoring"
Cohesion: 0.18
Nodes (15): CreativeAssetSearchResults, CreativeAssetStore, RecentPrompt, ReferenceImageStatus, SanitizeCreativeAssetResult, SavedCharacterPrompt, SavedCharacterPromptInput, SavedCharacterPromptSource (+7 more)

### Community 61 - "StudioMode"
Cohesion: 0.22
Nodes (7): CHARACTER_MODEL_ID, isSessionModeId(), LocalSessionMode, MODEL_MODE_IDS, ModelSessionMode, SessionMode, VTON_MODEL_ID

### Community 62 - "Promptworkshopactions Prompt Authoring"
Cohesion: 0.27
Nodes (11): ApiClientError, apiFetch(), fetchProviderAvailability(), readError(), requestRealtimeToken(), convertRecordingVoice(), importPublicVoice(), invalidResponse() (+3 more)

### Community 63 - "Docs Lightframe Architecture"
Cohesion: 0.33
Nodes (6): Lightframe Web Shell, Architecture and Ownership, Browser Support, Live Provider Smoke Test, Manual QA Checklist, Lightframe Studio

### Community 65 - "RecordingControls.test.tsx"
Cohesion: 0.24
Nodes (9): getImageQualityWarnings(), IMAGE_MIME_TYPES, ImageMimeType, ImageQualityWarning, ImageQualityWarningCode, ImageValidationCode, ImageValidationIssue, isImageMimeType() (+1 more)

### Community 66 - "createCreativeAssetRepository"
Cohesion: 0.18
Nodes (15): libraryOptions, pageStyles(), searchButtonStyles(), searchFormStyles(), stackStyles(), VoiceLibrary(), VoiceLibraryProps, audioStyles() (+7 more)

### Community 68 - "Prettierrc Printwidth Semi"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 69 - "Favicon Public Gold"
Cohesion: 0.50
Nodes (4): Dark Rounded-Square Application Favicon, Gold Circular Accent, Gold L-Shaped Glyph, Teal Rounded-Square Frame

### Community 74 - "Axe Core Playwright"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 76 - "PromptWorkshopHeader.tsx"
Cohesion: 0.27
Nodes (11): CharacterPromptWorkshopProps, PromptIntent, draftStatusStyles(), eyebrowStyles(), headerStyles(), intentHintStyles(), intentOptions, introStyles() (+3 more)

### Community 82 - "Playwright Package Devdependencies"
Cohesion: 0.27
Nodes (10): connectClearEffect(), connectRobotEffect(), connectWarmEffect(), decodeAudioBlob(), getAudioContext(), getOfflineContext(), renderLocalEffect(), isMp4() (+2 more)

### Community 83 - "CharacterPresetPicker.tsx"
Cohesion: 0.29
Nodes (10): CharacterPreset, CharacterPresetPicker(), CharacterPresetPickerProps, characterPresets, presetButtonStyles(), presetDescriptionStyles(), presetLabelStyles(), presetListStyles() (+2 more)

### Community 95 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 96 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 97 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 101 - "GeneratedPromptPreview.tsx"
Cohesion: 0.43
Nodes (7): GeneratedPromptPreview(), GeneratedPromptPreviewProps, previewCountStyles(), previewHeaderStyles(), previewLabelStyles(), previewStyles(), previewTextStyles()

### Community 102 - "image.ts"
Cohesion: 0.47
Nodes (5): adapters, Deferred, originalArtifact(), readySidecar(), recordingController()

### Community 103 - "workshopSteps.ts"
Cohesion: 0.52
Nodes (6): characterSteps(), concise(), editLabel, editSummary(), getPromptWorkshopSteps(), PromptWorkshopStep

### Community 106 - "StudioDesignProvider"
Cohesion: 0.27
Nodes (6): OverlayPanel, globalStyles(), StudioDesignProvider(), @emotion/react, StudioTheme, Theme

### Community 107 - "concurrently"
Cohesion: 0.15
Nodes (23): acquireLocalMedia(), hasLiveAudio(), hasLiveTrack(), hasLiveVideo(), MediaRequirements, stopOwnedStream(), withCaptureDevices(), BrowserCapabilities (+15 more)

### Community 108 - "useRecording.test.tsx"
Cohesion: 0.33
Nodes (6): createSource(), createTrack(), installRecorderHarness(), RecorderHarness, RecorderListener, TrackOptions

### Community 109 - "sanitation.ts"
Cohesion: 0.47
Nodes (5): normalizeAssetName(), normalizeAssetNotes(), normalizeAssetText(), normalizePromptText(), normalizeTags()

## Knowledge Gaps
- **419 isolated node(s):** `semi`, `singleQuote`, `trailingComma`, `printWidth`, `name` (+414 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `StudioMode` connect `Recording Orchestration Recordingattempt` to `Studio Studioapp Recording`, `Media Session Sessioncomposer`, `Session Orchestration Usemodelsessionactions`, `Primitives Segmentedcontrol Button`, `useRecording.test.tsx`, `Recording Recordinghelpers Mime`, `concurrently`, `SessionComposer.test.tsx`, `Recording Recordingcontrols Live`, `Prompt Authoring Characterpromptworkshop`, `Recording Orchestration Recordingartifacts`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `ElevenLabsProvider` connect `Api Voices Voice` to `Api Voices Routes`, `Api Providers Elevenlabs`, `Api Http Security`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `ModelModeId` connect `Generatedpromptpreview Prompt Authoring` to `Assets Creative Userecipeshelfcontroller`, `Primitives Segmentedcontrol Button`, `Session Image Modes`, `Session Orchestration Realtimesnapshot`, `useVoiceProcessing.test.tsx`, `StudioMode`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `semi`, `singleQuote`, `trailingComma` to the rest of the system?**
  _419 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Creative Assets Recipeshelf` be split into smaller, more focused modules?**
  _Cohesion score 0.08663457978526472 - nodes in this community are weakly interconnected._
- **Should `Studio Studioapp Recording` be split into smaller, more focused modules?**
  _Cohesion score 0.06656426011264721 - nodes in this community are weakly interconnected._
- **Should `Api Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._