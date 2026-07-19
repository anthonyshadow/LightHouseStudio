# Graph Report - .  (2026-07-18)

## Corpus Check
- 245 files · ~106,470 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1816 nodes · 4065 edges · 111 communities (88 shown, 23 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 48 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Creative Recipe Shelf
- Media Session Composer
- Voice API Contracts
- Studio Application Shell
- Prompt Draft Generation
- Studio Product Documentation
- Realtime API Security
- API Package Configuration
- Accessible Overlay Panels
- Studio Capture Sessions
- ElevenLabs HTTP Integration
- Voice Processing Pipeline
- Voice Service Models
- Live Media Stage
- Decart Realtime Gateway
- Session Draft Snapshots
- TypeScript Path Configuration
- Character Prompt Workshop
- Recording Session Domain
- API Error Contracts
- Web Package Configuration
- Recording Source Composition
- Recording Lifecycle Orchestration
- Graphify Pipeline References
- Voice Route Integration Tests
- Prompt Authoring Fields
- Voice Library Client
- Recording Artifact Management
- Creative Asset Repository
- Studio Screenshot Scenarios
- Studio Journey Testing
- Creative Asset Sanitization
- Creative Asset Operations
- Prompt Authoring Model
- Take Review Dock
- Voice Effects Panel
- Core UI Primitives
- Live Stage Notices
- Recording Control Panel
- Workspace Development Dependencies
- Model Session Actions
- Reference Image Validation
- Recording Attempts and Artifacts
- Media Stage Component Tests
- Capture Settings Panel
- Workspace Quality Scripts
- API Environment Bootstrap
- API TypeScript Configuration
- Live Audio Metering
- Voice Library Interface
- Studio Theme Provider
- Web TypeScript Configuration
- Prompt Text Normalization
- Accessible Tab Controls
- Accessibility Responsive Testing
- Contracts Package Configuration
- Recording File Format Utilities
- Owned Local Media Streams
- Prompt Workshop Header
- Recording Hook Test Harness
- Provider Error Handling Tests
- Segmented Control Component
- Form Field Components
- Root Workspace Manifest
- Domain Package Manifest
- Creative Asset Domain Types
- Testing Package Manifest
- Testing TypeScript Configuration
- Contracts TypeScript Configuration
- Domain TypeScript Configuration
- Character Preset Picker
- Voice Preview List
- End-to-End TypeScript Configuration
- Contracts Build Configuration
- Session Mode Definitions
- Domain Build Configuration
- Generated Prompt Preview
- Prompt Workshop Actions
- Prompt Workshop Steps
- Graph Query and Traversal
- Graph Export Integrations
- Web Vite Configuration
- Prettier Formatting Configuration
- Application Favicon Artwork
- Media Stream Diagnostics
- Cross-Repository Graph Merging
- Network Isolation Test Harness
- Root TypeScript References
- Graphify Skill Policy
- Browser Window Type Extension
- Playwright Accessibility Testing
- Concurrent Script Runner
- ESLint Core Tooling
- React Hooks Linting
- JavaScript Global Definitions
- JSDOM Browser Testing
- Mock Service Worker
- Jest DOM Matchers
- React Testing Library
- TSUP Package Bundling
- Node Type Definitions
- React Type Definitions
- React DOM Type Definitions
- TypeScript ESLint Tooling
- Vite React Plugin
- Vitest Test Runner
- Vitest V8 Coverage
- Root Vitest Configuration

## God Nodes (most connected - your core abstractions)
1. `CharacterPromptWorkshop()` - 31 edges
2. `MediaStage()` - 25 edges
3. `useRecording()` - 23 edges
4. `createCreativeAssetRepository()` - 21 edges
5. `normalizeWhitespace()` - 21 edges
6. `PromptBuilderDraft` - 20 edges
7. `StudioExperience()` - 20 edges
8. `FakeElevenLabsProvider` - 19 edges
9. `Button` - 19 edges
10. `StudioMode` - 18 edges

## Surprising Connections (you probably didn't know these)
- `createCreativeAssetRepository()` --indirect_call--> `context()`  [INFERRED]
  apps/web/src/features/creative-assets/repository.ts → packages/domain/src/assets/assets.test.ts
- `useSessionDraftState()` --indirect_call--> `image()`  [INFERRED]
  apps/web/src/orchestration/session/useSessionDraftState.ts → packages/domain/src/session/session.test.ts
- `Lightframe Web Shell` --conceptually_related_to--> `Lightframe Studio`  [INFERRED]
  apps/web/index.html → README.md
- `registerVoiceRoutes()` --indirect_call--> `signal()`  [INFERRED]
  apps/api/src/features/voices/routes.ts → apps/api/src/providers/elevenlabs/http-provider.test.ts
- `createCreativeAssetRepository()` --indirect_call--> `notice()`  [INFERRED]
  apps/web/src/features/creative-assets/repository.ts → apps/web/src/features/live-stage/stageNotices.test.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Composite Application Mark** — apps_web_public_favicon_teal_frame, apps_web_public_favicon_gold_l_glyph, apps_web_public_favicon_gold_dot [EXTRACTED 1.00]
- **Local-First Consent and No-Provider Boundary** — docs_architecture_local_first_stateless_broker, docs_privacy_and_temporary_data_explicit_consent_boundaries, docs_privacy_and_temporary_data_local_no_provider_guarantee, docs_product_evolution_separation_of_preparation_and_execution, docs_manual_qa_no_key_local_guarantee_validation [INFERRED 0.85]
- **Stable Stage Lifecycle** — docs_architecture_stable_stage_and_overlay_shell, docs_product_evolution_stable_stage_overlay_workspace, docs_manual_qa_stable_stage_and_responsive_validation, docs_browser_support_responsive_viewport_matrix [INFERRED 0.95]
- **Recording Finalization and Resource Handoff** — docs_architecture_recording_finalization_handoff, docs_product_evolution_first_class_finalization_handoff, docs_manual_qa_recording_and_resource_safety_validation, docs_privacy_and_temporary_data_temporary_single_take_lifecycle [INFERRED 0.95]

## Communities (111 total, 23 thin omitted)

### Community 0 - "Creative Recipe Shelf"
Cohesion: 0.05
Nodes (100): CharacterRecipeList(), updateCharacterRecipe(), RecentRecipeList(), CharacterPromptCard(), EditAction, EmptyShelf(), formatDate(), modeName() (+92 more)

### Community 1 - "Media Session Composer"
Cohesion: 0.09
Nodes (44): StudioMode, confirmModeReplacement(), hasDraftContent(), ModelRecipeFields(), ModelRecipeFieldsProps, emptyFeedback(), formatFileSize(), ImageFeedback (+36 more)

### Community 2 - "Voice API Contracts"
Cohesion: 0.06
Nodes (47): contentTypeEssence(), registerVoiceRoutes(), requireVoiceService(), streamProviderAudio(), validationError(), verifyProviderOrigin(), createRequestLifetime(), RequestLifetime (+39 more)

### Community 3 - "Studio Application Shell"
Cohesion: 0.08
Nodes (40): ApiClientError, fetchProviderAvailability(), readError(), requestRealtimeToken(), detectBrowserCapabilities(), BrowserCapabilities, ProviderAvailability, root (+32 more)

### Community 4 - "Prompt Draft Generation"
Cohesion: 0.11
Nodes (37): SavedCharacterPrompt, SavedCharacterPromptInput, createPromptBuilderDraft(), isAdultAge(), isCharacterGender(), isIntent(), isRecord(), nullableStringField() (+29 more)

### Community 5 - "Studio Product Documentation"
Cohesion: 0.07
Nodes (42): Lightframe Web Shell, Architecture and Ownership, Atomic Capture Replacement, Explicit Session and Provider Flow, Immutable Processing Sources, Inward Ownership Boundaries, Lifecycle Ownership and Deny-External Testing, Local-First Stateless Loopback Broker (+34 more)

### Community 6 - "Realtime API Security"
Cohesion: 0.11
Nodes (28): AppDependencies, createApp(), RuntimeConfig, registerRealtimeRoutes(), localOriginHeaders, verifyProviderOrigin(), CapabilityAvailability, registerSystemRoutes() (+20 more)

### Community 7 - "API Package Configuration"
Cohesion: 0.05
Nodes (36): dependencies, @decartai/sdk, dotenv, fastify, @fastify/helmet, @fastify/static, @studio/contracts, zod (+28 more)

### Community 8 - "Accessible Overlay Panels"
Cohesion: 0.07
Nodes (28): canRestoreFocus(), fadeIn, fadeOut, focusableSelector, focusTopmostDialog(), getFocusableElements(), getTopmostDialog(), hasInertState() (+20 more)

### Community 9 - "Studio Capture Sessions"
Cohesion: 0.11
Nodes (26): enumerateMediaDevices(), finiteSetting(), MediaRequirements, readCaptureStreamSettings(), supportsLocal1080pProfile(), originalMediaDevices, withCaptureDevices(), CaptureDeviceOption (+18 more)

### Community 10 - "ElevenLabs HTTP Integration"
Cohesion: 0.11
Nodes (23): ALLOWED_PREVIEW_HOSTS, audioExtension(), classifyProviderFailure(), ElevenLabsHttpProvider, FEATURE_UNAVAILABLE_CODES, importResponseSchema, INVALID_AUDIO_CODES, isAllowedPreviewUrl() (+15 more)

### Community 11 - "Voice Processing Pipeline"
Cohesion: 0.13
Nodes (25): connectClearEffect(), connectRobotEffect(), connectWarmEffect(), decodeAudioBlob(), getAudioContext(), getOfflineContext(), renderLocalEffect(), isMp4() (+17 more)

### Community 12 - "Voice Service Models"
Cohesion: 0.15
Nodes (12): AudioStream, isModelCompatible(), isProfessionalVoice(), summarizePublicVoice(), summarizeVoice(), VoiceService, ElevenLabsModel, ElevenLabsProvider (+4 more)

### Community 13 - "Live Media Stage"
Cohesion: 0.14
Nodes (27): AudioLevelMeter(), emptyCopy(), lifecycleLabel(), lifecycleTone(), LiveSnapshot, MediaStage(), StreamDetails, activityIndicatorStyles() (+19 more)

### Community 14 - "Decart Realtime Gateway"
Cohesion: 0.09
Nodes (22): connectDecartRealtime(), ConnectRealtimeOptions, DevelopmentRealtimeDriver, getDecartModelRequirements(), ModelRequirements, RealtimeConnectionState, RealtimeSession, RealtimeSnapshot (+14 more)

### Community 15 - "Session Draft Snapshots"
Cohesion: 0.16
Nodes (25): AppliedRealtimeState, hasPendingChanges(), imageIdentity(), imageIds, revertToAppliedDraft(), toDomainApplied(), toDomainDraft(), toImageDescriptor() (+17 more)

### Community 16 - "TypeScript Path Configuration"
Cohesion: 0.07
Nodes (27): packages/contracts/src/index.ts, packages/domain/src/index.ts, packages/testing/src/index.ts, compilerOptions, baseUrl, exactOptionalPropertyTypes, ignoreDeprecations, isolatedModules (+19 more)

### Community 17 - "Character Prompt Workshop"
Cohesion: 0.20
Nodes (25): CharacterPromptWorkshop(), createDraftForIntent(), createDraftMap(), createStepMap(), referenceContext(), accordionStyles(), chevronStyles(), footerStyles() (+17 more)

### Community 18 - "Recording Session Domain"
Cohesion: 0.14
Nodes (19): browserErrorMap, classifyBrowserError(), createSafeError(), SafeError, SafeErrorCode, RecordingFinishAction, AudioSidecar, RecordingArtifact (+11 more)

### Community 19 - "API Error Contracts"
Cohesion: 0.11
Nodes (20): VoiceServiceError, VoiceServiceFailureReason, ApiErrorBody, AppError, errorBody(), installErrorHandling(), isFastifyError(), mapProviderError() (+12 more)

### Community 20 - "Web Package Configuration"
Cohesion: 0.08
Nodes (24): dependencies, @decartai/sdk, @emotion/react, mediabunny, react, react-dom, @studio/contracts, @studio/domain (+16 more)

### Community 21 - "Recording Source Composition"
Cohesion: 0.12
Nodes (15): AUDIO_MIME_CANDIDATES, composeRecordingSource(), formatBytes(), hasSameRecordingTracks(), live(), selectedLiveTracks(), FakeMediaStream, FakeTrack (+7 more)

### Community 22 - "Recording Lifecycle Orchestration"
Cohesion: 0.18
Nodes (22): cleanupRecordingAttempt(), startRecordingAttempt(), asRecord(), captureTakeMetadata(), captureTrackMeasurements(), domainAudioSource(), domainVideoSource(), fixedCapabilityValue() (+14 more)

### Community 23 - "Graphify Pipeline References"
Cohesion: 0.11
Nodes (24): Background Folder Watcher, Debounced Change-Type-Aware Refresh, graphify reference: add a URL and watch a folder, URL Ingestion, Deterministic Node Identifiers, graphify reference: extraction subagent prompt (compact), Relationship Confidence Taxonomy, Semantic Similarity and Hyperedges (+16 more)

### Community 24 - "Voice Route Integration Tests"
Cohesion: 0.12
Nodes (11): MAX_RECORDING_AUDIO_BYTES, FailingProvider, InvalidAudioProvider, LimitedProvider, originHeaders, ZeroRetentionRejectedProvider, VoiceSearchInput, FakeElevenLabsProvider (+3 more)

### Community 25 - "Prompt Authoring Fields"
Cohesion: 0.23
Nodes (19): CharacterPreset, CharacterTransformFields(), CharacterTransformFieldsProps, checkboxLabelStyles(), checkboxStyles(), CharacterGender, CharacterTransformDraft, PromptIssue (+11 more)

### Community 26 - "Voice Library Client"
Cohesion: 0.19
Nodes (18): apiFetch(), convertRecordingVoice(), importPublicVoice(), invalidResponse(), listPublicVoices(), listWorkspaceVoices(), CaptureAudioSettings, CaptureVideoSettings (+10 more)

### Community 27 - "Recording Artifact Management"
Cohesion: 0.13
Nodes (19): CaptureStreamSettings, revokeArtifactUrl(), AutomaticRecordingStopEvent, AutomaticRecordingStopReason, CaptureDeviceState, RecordingArtifact, RecordingAudioSidecar, RecordingLifecycle (+11 more)

### Community 28 - "Creative Asset Repository"
Cohesion: 0.16
Nodes (17): browserStorage(), createCreativeAssetRepository(), CreativeAssetErrorCode, CreativeAssetRepositoryOptions, defaultIdFactory(), loadInitialState(), mapDomainError(), storageNotice() (+9 more)

### Community 29 - "Studio Screenshot Scenarios"
Cohesion: 0.13
Nodes (16): CAPTURE_TIME, captureStableViewport(), createLocalTake(), FIXED_WEBP, Scenario, SCENARIOS, SCREENSHOT_ROOT, settlePage() (+8 more)

### Community 30 - "Studio Journey Testing"
Cohesion: 0.12
Nodes (14): exactViewports, expectStableStageRect(), readStageRect(), StageRect, BrowserJourneyState, expectNoDocumentOverflow(), expectNoExternalProviderTraffic(), installSuccessfulStudioHarness() (+6 more)

### Community 31 - "Creative Asset Sanitization"
Cohesion: 0.26
Nodes (20): count(), isRecord(), normalizedId(), nullableDate(), promptIntent(), readTags(), referenceStatus(), sanitizeArray() (+12 more)

### Community 32 - "Creative Asset Operations"
Cohesion: 0.26
Nodes (18): context(), timestamp(), assertTimestamp(), capByUpdated(), createSavedCharacterPrompt(), createSavedPrompt(), deleteSavedPrompt(), recordSuccessfulPromptUse() (+10 more)

### Community 33 - "Prompt Authoring Model"
Cohesion: 0.19
Nodes (15): PromptWorkshopAction, SavePromptWorkshopAction, AdultAge, createPromptBuilderDraft(), generateStructuredPrompt(), PROMPT_DETAIL_LIMIT, PromptValidation, ReferenceImageContext (+7 more)

### Community 34 - "Take Review Dock"
Cohesion: 0.17
Nodes (18): TakeMetadata, actionStyles(), captureMetadataChips(), defaultAudioSourceLabel(), downloadStyles(), formatFrameRate(), gridStyles(), headingStyles() (+10 more)

### Community 35 - "Voice Effects Panel"
Cohesion: 0.15
Nodes (15): artifact(), processing, recording(), LOCAL_EFFECTS, LocalVoiceEffectId, VoiceEffectSelection, VoiceProcessingController, headingStyles() (+7 more)

### Community 36 - "Core UI Primitives"
Cohesion: 0.17
Nodes (14): Button, ButtonProps, ButtonSize, ButtonVariant, IconButton, IconButtonProps, OverlayPanelPlacement, OverlayPanelProps (+6 more)

### Community 37 - "Live Stage Notices"
Cohesion: 0.16
Nodes (15): noticeActionStyles(), noticeCopyStyles, noticeDismissStyles(), noticeLayerStyles(), noticeStyles(), StageNoticeLayer(), StageNoticeLayerProps, defaultPriority (+7 more)

### Community 38 - "Recording Control Panel"
Cohesion: 0.18
Nodes (15): actionRowStyles(), captureResolutionLabel(), captureSurfaceStyles(), detailsStyles(), disabledReasonStyles(), headingStyles(), recordActionStyles(), RecordingAvailability (+7 more)

### Community 39 - "Workspace Development Dependencies"
Cohesion: 0.11
Nodes (19): @eslint/js, eslint-plugin-jsx-a11y, fast-check, devDependencies, @eslint/js, eslint-plugin-jsx-a11y, fast-check, @playwright/test (+11 more)

### Community 40 - "Model Session Actions"
Cohesion: 0.20
Nodes (14): namedMessage(), SafeMediaError, toSafeMediaError(), isModelMode(), SessionDraft, normalizePrompt, toAppliedState(), toProviderSnapshot() (+6 more)

### Community 41 - "Reference Image Validation"
Cohesion: 0.16
Nodes (13): ImageValidation, loadDimensions(), validateReferenceImage(), getImageQualityWarnings(), IMAGE_MIME_TYPES, ImageDescriptorCandidate, ImageMimeType, ImageQualityWarning (+5 more)

### Community 42 - "Recording Attempts and Artifacts"
Cohesion: 0.21
Nodes (16): selectAudioMime(), selectVideoMime(), createArtifactObjectUrl(), createOriginalRecordingArtifact(), createRecordingSidecar(), firstChunkMimeType(), attachRecordingAttemptListeners(), createRecordingAttempt() (+8 more)

### Community 43 - "Media Stage Component Tests"
Cohesion: 0.12
Nodes (6): MediaStageProps, StagePresentation, defaultProps, FakeStream, FakeTrack, idlePresentation

### Community 44 - "Capture Settings Panel"
Cohesion: 0.20
Nodes (12): actualSettingsStyles(), bodyStyles(), CaptureSettingsPanel(), CaptureSettingsPanelProps, footerStyles(), introductionStyles(), panelStyles(), profileLabels (+4 more)

### Community 45 - "Workspace Quality Scripts"
Cohesion: 0.12
Nodes (16): scripts, build, build:packages, dev, format, format:check, lint, quality (+8 more)

### Community 46 - "API Environment Bootstrap"
Cohesion: 0.16
Nodes (10): environmentSchema, EnvironmentValidationError, optionalModelSchema, optionalSecretSchema, parseEnvironment(), portSchema, strictBooleanSchema, app (+2 more)

### Community 47 - "API TypeScript Configuration"
Cohesion: 0.13
Nodes (14): compilerOptions, composite, lib, noEmit, types, extends, include, DOM (+6 more)

### Community 48 - "Live Audio Metering"
Cohesion: 0.17
Nodes (10): audioContextConstructor(), AudioLevelState, connectedWithoutMeterState, measureLevel(), silentState, FakeAudioContext, FakeAudioStream, FakeAudioTrack (+2 more)

### Community 49 - "Voice Library Interface"
Cohesion: 0.19
Nodes (11): createOriginal(), createRecording(), emptyPage, voiceApi, libraryOptions, pageStyles(), searchButtonStyles(), searchFormStyles() (+3 more)

### Community 50 - "Studio Theme Provider"
Cohesion: 0.19
Nodes (8): OverlayPanel, OverlayPanelBodyMode, HarnessProps, globalStyles(), StudioDesignProvider(), @emotion/react, StudioTheme, Theme

### Community 51 - "Web TypeScript Configuration"
Cohesion: 0.13
Nodes (14): compilerOptions, composite, jsx, jsxImportSource, noEmit, types, extends, include (+6 more)

### Community 52 - "Prompt Text Normalization"
Cohesion: 0.22
Nodes (13): normalizeAssetName(), normalizeAssetNotes(), normalizeAssetText(), normalizePromptText(), normalizeTags(), normalizeWhitespace(), normalizeField(), normalizePreset() (+5 more)

### Community 53 - "Accessible Tab Controls"
Cohesion: 0.23
Nodes (11): fullLabelStyles(), panelStyles(), rootStyles(), shortLabelStyles(), TabItem, tabListStyles(), Tabs(), TabsProps (+3 more)

### Community 54 - "Accessibility Responsive Testing"
Cohesion: 0.14
Nodes (4): BrowserTestState, MockStudioState, representativeViewports, @playwright/test

### Community 55 - "Contracts Package Configuration"
Cohesion: 0.14
Nodes (13): dependencies, zod, exports, zod, main, name, private, scripts (+5 more)

### Community 56 - "Recording File Format Utilities"
Cohesion: 0.21
Nodes (11): selectSupportedMime(), createRecordingFilename(), filenameMode, formatDuration(), timestampForFilename(), isAudioMimeType(), isSupportedVoiceSidecarMimeType(), MimeSupportTest (+3 more)

### Community 57 - "Owned Local Media Streams"
Cohesion: 0.32
Nodes (11): acquireLocalMedia(), hasLiveAudio(), hasLiveTrack(), hasLiveVideo(), stopOwnedStream(), track(), OwnedLocalMediaController, OwnedLocalMediaOptions (+3 more)

### Community 58 - "Prompt Workshop Header"
Cohesion: 0.27
Nodes (11): CharacterPromptWorkshopProps, PromptIntent, draftStatusStyles(), eyebrowStyles(), headerStyles(), intentHintStyles(), intentOptions, introStyles() (+3 more)

### Community 59 - "Recording Hook Test Harness"
Cohesion: 0.21
Nodes (7): createSource(), createTrack(), installRecorderHarness(), RecorderHarness, RecorderListener, TrackOptions, FakeMediaStream

### Community 60 - "Provider Error Handling Tests"
Cohesion: 0.22
Nodes (4): sdkMocks, signal(), ProviderError, ProviderFailureReason

### Community 61 - "Segmented Control Component"
Cohesion: 0.27
Nodes (10): buttonStyles(), controlStyles(), fullLabelStyles(), groupStyles(), SegmentedControl(), SegmentedControlProps, SegmentOption, segmentStyles() (+2 more)

### Community 62 - "Form Field Components"
Cohesion: 0.24
Nodes (5): SelectField, SelectFieldProps, SharedFieldProps, TextAreaFieldProps, TextFieldProps

### Community 63 - "Root Workspace Manifest"
Cohesion: 0.18
Nodes (10): engines, node, npm, name, private, type, version, workspaces (+2 more)

### Community 64 - "Domain Package Manifest"
Cohesion: 0.18
Nodes (10): exports, main, name, private, scripts, build, typecheck, type (+2 more)

### Community 65 - "Creative Asset Domain Types"
Cohesion: 0.24
Nodes (10): CreativeAssetSearchResults, RecentPrompt, ReferenceImageStatus, SanitizeCreativeAssetResult, SavedCharacterPromptSource, SavedPrompt, SavedPromptInput, SavedPromptSource (+2 more)

### Community 66 - "Testing Package Manifest"
Cohesion: 0.18
Nodes (10): exports, main, name, private, scripts, build, typecheck, type (+2 more)

### Community 67 - "Testing TypeScript Configuration"
Cohesion: 0.18
Nodes (10): compilerOptions, composite, noEmit, types, extends, include, node, src (+2 more)

### Community 68 - "Contracts TypeScript Configuration"
Cohesion: 0.20
Nodes (9): compilerOptions, composite, noEmit, types, extends, include, src, ../../tsconfig.base.json (+1 more)

### Community 69 - "Domain TypeScript Configuration"
Cohesion: 0.20
Nodes (9): compilerOptions, composite, noEmit, types, extends, include, src, ../../tsconfig.base.json (+1 more)

### Community 70 - "Character Preset Picker"
Cohesion: 0.36
Nodes (8): CharacterPresetPicker(), CharacterPresetPickerProps, characterPresets, presetButtonStyles(), presetDescriptionStyles(), presetLabelStyles(), presetListStyles(), presetRootStyles()

### Community 71 - "Voice Preview List"
Cohesion: 0.39
Nodes (8): audioStyles(), listStyles(), previewUrl(), voiceActionStyles(), voiceBodyStyles(), VoiceList(), VoiceListProps, voiceStyles()

### Community 72 - "End-to-End TypeScript Configuration"
Cohesion: 0.22
Nodes (8): compilerOptions, noEmit, types, extends, include, node, ../tsconfig.base.json, ./**/*.ts

### Community 73 - "Contracts Build Configuration"
Cohesion: 0.22
Nodes (8): compilerOptions, types, exclude, extends, include, src/**/*.test.ts, src/**/*.ts, ../../tsconfig.base.json

### Community 74 - "Session Mode Definitions"
Cohesion: 0.22
Nodes (7): isSessionModeId(), LOCAL_MODE_ID, LocalSessionMode, MODEL_MODE_IDS, ModelSessionMode, SessionMode, VTON_MODEL_ID

### Community 75 - "Domain Build Configuration"
Cohesion: 0.22
Nodes (8): compilerOptions, types, exclude, extends, include, src/**/*.test.ts, src/**/*.ts, ../../tsconfig.base.json

### Community 76 - "Generated Prompt Preview"
Cohesion: 0.43
Nodes (7): GeneratedPromptPreview(), GeneratedPromptPreviewProps, previewCountStyles(), previewHeaderStyles(), previewLabelStyles(), previewStyles(), previewTextStyles()

### Community 77 - "Prompt Workshop Actions"
Cohesion: 0.38
Nodes (6): actionRowStyles(), PromptSaveState, PromptWorkshopActions(), PromptWorkshopActionsProps, saveFormStyles(), TextField

### Community 78 - "Prompt Workshop Steps"
Cohesion: 0.52
Nodes (6): characterSteps(), concise(), editLabel, editSummary(), getPromptWorkshopSteps(), PromptWorkshopStep

### Community 79 - "Graph Query and Traversal"
Cohesion: 0.48
Nodes (7): BFS and DFS Traversal, Constrained Graph Vocabulary Expansion, Graph-Grounded Answering, graphify reference: query, path, explain, NetworkX Traversal Fallback, Save-Result and Reflection Feedback Loop, Shortest Path and Node Explanation

### Community 80 - "Graph Export Integrations"
Cohesion: 0.40
Nodes (6): graphify reference: extra exports and benchmark, Idempotent MERGE Semantics, MCP Graph Server, Neo4j and FalkorDB Pushes, Portable Wiki, SVG, GraphML, and Cypher Exports, Token Reduction Benchmark

### Community 82 - "Prettier Formatting Configuration"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 83 - "Application Favicon Artwork"
Cohesion: 0.50
Nodes (4): Dark Rounded-Square Application Favicon, Gold Circular Accent, Gold L-Shaped Glyph, Teal Rounded-Square Frame

### Community 84 - "Media Stream Diagnostics"
Cohesion: 0.50
Nodes (4): describeStream(), formatFrameRate(), isFinitePositive(), trackSettings()

### Community 85 - "Cross-Repository Graph Merging"
Cohesion: 0.67
Nodes (4): Cached GitHub Clone, Cross-Repository Graph Merge, graphify reference: GitHub clone and cross-repo merge, Provenance-Preserving Monorepo Merge

## Knowledge Gaps
- **421 isolated node(s):** `semi`, `singleQuote`, `trailingComma`, `printWidth`, `name` (+416 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **23 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ElevenLabsProvider` connect `Voice Service Models` to `Voice Route Integration Tests`, `ElevenLabs HTTP Integration`, `Realtime API Security`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `ModelModeId` connect `Creative Asset Domain Types` to `Creative Recipe Shelf`, `Creative Asset Operations`, `Session Mode Definitions`, `Session Draft Snapshots`, `Voice Library Client`, `Creative Asset Sanitization`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `@playwright/test` connect `Accessibility Responsive Testing` to `End-to-End TypeScript Configuration`, `Studio Screenshot Scenarios`, `Studio Journey Testing`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `createCreativeAssetRepository()` (e.g. with `notice()` and `context()`) actually correct?**
  _`createCreativeAssetRepository()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `semi`, `singleQuote`, `trailingComma` to the rest of the system?**
  _421 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Creative Recipe Shelf` be split into smaller, more focused modules?**
  _Cohesion score 0.053673163418290856 - nodes in this community are weakly interconnected._
- **Should `Media Session Composer` be split into smaller, more focused modules?**
  _Cohesion score 0.09376890502117362 - nodes in this community are weakly interconnected._