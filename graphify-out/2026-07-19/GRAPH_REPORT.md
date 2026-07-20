# Graph Report - webrtc2Sol  (2026-07-19)

## Corpus Check
- 267 files · ~131,974 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2130 nodes · 4848 edges · 136 communities (110 shown, 26 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 51 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c56ccf63`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

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
- RecipeCards.tsx
- RecipeShelf.styles.ts
- reference-image-provider.ts
- useRecipeShelfController.ts
- ReferenceImageField.tsx
- studioHarness.ts
- voice-service.ts
- ElevenLabsHttpProvider
- audioEffects.ts
- image-validation.ts
- VoiceService
- useStudioSession.test.tsx
- safe-error.ts
- PromptFeedback.tsx
- live-session.ts
- @playwright/test
- eslint-plugin-jsx-a11y
- types.ts
- browserMedia.ts
- FormControls.tsx
- types.ts
- ReferenceImagePreview.tsx
- StatusNotice
- FakeMediaStream
- OPENAI_REFERENCE_IMAGE_MODEL

## God Nodes (most connected - your core abstractions)
1. `CharacterPromptWorkshop()` - 39 edges
2. `StudioExperience()` - 29 edges
3. `MediaStage()` - 25 edges
4. `createCreativeAssetRepository()` - 23 edges
5. `useRecording()` - 23 edges
6. `normalizeWhitespace()` - 22 edges
7. `Button` - 21 edges
8. `PromptBuilderDraft` - 20 edges
9. `FakeElevenLabsProvider` - 19 edges
10. `StudioMode` - 18 edges

## Surprising Connections (you probably didn't know these)
- `createCreativeAssetRepository()` --indirect_call--> `context()`  [INFERRED]
  apps/web/src/features/creative-assets/repository.ts → packages/domain/src/assets/assets.test.ts
- `createCreativeAssetRepository()` --indirect_call--> `referenceImageAssetId()`  [INFERRED]
  apps/web/src/features/creative-assets/repository.ts → packages/domain/src/assets/sanitize.ts
- `useRecipeShelfController()` --indirect_call--> `referenceImageAssetId()`  [INFERRED]
  apps/web/src/features/creative-assets/useRecipeShelfController.ts → packages/domain/src/assets/sanitize.ts
- `useSessionDraftState()` --indirect_call--> `image()`  [INFERRED]
  apps/web/src/orchestration/session/useSessionDraftState.ts → packages/domain/src/session/session.test.ts
- `StudioExperience()` --indirect_call--> `referenceImageAssetId()`  [INFERRED]
  apps/web/src/studio/StudioApp.tsx → packages/domain/src/assets/sanitize.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Composite Application Mark** — apps_web_public_favicon_teal_frame, apps_web_public_favicon_gold_l_glyph, apps_web_public_favicon_gold_dot [EXTRACTED 1.00]
- **Local-First Consent and No-Provider Boundary** — docs_architecture_local_first_stateless_broker, docs_privacy_and_temporary_data_explicit_consent_boundaries, docs_privacy_and_temporary_data_local_no_provider_guarantee, docs_product_evolution_separation_of_preparation_and_execution, docs_manual_qa_no_key_local_guarantee_validation [INFERRED 0.85]
- **Stable Stage Lifecycle** — docs_architecture_stable_stage_and_overlay_shell, docs_product_evolution_stable_stage_overlay_workspace, docs_manual_qa_stable_stage_and_responsive_validation, docs_browser_support_responsive_viewport_matrix [INFERRED 0.95]
- **Recording Finalization and Resource Handoff** — docs_architecture_recording_finalization_handoff, docs_product_evolution_first_class_finalization_handoff, docs_manual_qa_recording_and_resource_safety_validation, docs_privacy_and_temporary_data_temporary_single_take_lifecycle [INFERRED 0.95]

## Communities (136 total, 26 thin omitted)

### Community 0 - "Creative Recipe Shelf"
Cohesion: 0.16
Nodes (24): CharacterRecipeList(), updateCharacterRecipe(), RecentRecipeList(), DeleteConfirmation(), DeleteConfirmationProps, parseTags(), RecipeEditor(), RecipeEditorDraft (+16 more)

### Community 1 - "Media Session Composer"
Cohesion: 0.18
Nodes (24): ModelRecipeFields(), ModelRecipeFieldsProps, SessionActions(), SessionActionsProps, SessionComposer(), SessionComposerProps, actionReasonStyles(), composerActionsStyles() (+16 more)

### Community 2 - "Voice API Contracts"
Cohesion: 0.08
Nodes (35): contentTypeEssence(), registerVoiceRoutes(), requireVoiceService(), streamProviderAudio(), validationError(), verifyProviderOrigin(), createRequestLifetime(), RequestLifetime (+27 more)

### Community 3 - "Studio Application Shell"
Cohesion: 0.07
Nodes (49): ApiClientError, createReferenceImage(), extensionForMime(), fetchProviderAvailability(), fetchReferenceImageMetadata(), hydrateReferenceImage(), optimizeCharacterReferencePrompt(), PersistedReferenceImage (+41 more)

### Community 4 - "Prompt Draft Generation"
Cohesion: 0.13
Nodes (25): ageLabels, genderLabels, generateCharacterTransform(), renderPrompt(), sentence(), AddObjectDraft, AdultAgeChoice, ChangeAttributeDraft (+17 more)

### Community 5 - "Studio Product Documentation"
Cohesion: 0.07
Nodes (42): Lightframe Web Shell, Architecture and Ownership, Atomic Capture Replacement, Explicit Session and Provider Flow, Immutable Processing Sources, Inward Ownership Boundaries, Lifecycle Ownership and Deny-External Testing, Local-First Stateless Loopback Broker (+34 more)

### Community 6 - "Realtime API Security"
Cohesion: 0.09
Nodes (24): AppDependencies, createApp(), RuntimeConfig, localOriginHeaders, registerSystemRoutes(), SUPPORTED_AUDIO_CONTENT_TYPES, create(), DecartSdkClient (+16 more)

### Community 7 - "API Package Configuration"
Cohesion: 0.05
Nodes (42): dependencies, @decartai/sdk, dotenv, fastify, @fastify/helmet, @fastify/static, openai, sharp (+34 more)

### Community 8 - "Accessible Overlay Panels"
Cohesion: 0.07
Nodes (28): canRestoreFocus(), fadeIn, fadeOut, focusableSelector, focusTopmostDialog(), getFocusableElements(), getTopmostDialog(), hasInertState() (+20 more)

### Community 9 - "Studio Capture Sessions"
Cohesion: 0.20
Nodes (10): enumerateMediaDevices(), finiteSetting(), readCaptureStreamSettings(), supportsLocal1080pProfile(), originalMediaDevices, DEFAULT_CAPTURE_PREFERENCES, deviceOptions(), samePreferences() (+2 more)

### Community 10 - "ElevenLabs HTTP Integration"
Cohesion: 0.08
Nodes (26): ALLOWED_PREVIEW_HOSTS, audioExtension(), classifyProviderFailure(), ElevenLabsHttpProvider, FEATURE_UNAVAILABLE_CODES, importResponseSchema, INVALID_AUDIO_CODES, isAllowedPreviewUrl() (+18 more)

### Community 11 - "Voice Processing Pipeline"
Cohesion: 0.14
Nodes (24): connectClearEffect(), connectRobotEffect(), connectWarmEffect(), decodeAudioBlob(), getAudioContext(), getOfflineContext(), renderLocalEffect(), isMp4() (+16 more)

### Community 12 - "Voice Service Models"
Cohesion: 0.14
Nodes (14): AudioStream, isModelCompatible(), isProfessionalVoice(), summarizePublicVoice(), summarizeVoice(), VoiceService, ElevenLabsModel, ElevenLabsProvider (+6 more)

### Community 13 - "Live Media Stage"
Cohesion: 0.13
Nodes (28): describeStream(), emptyCopy(), formatFrameRate(), isFinitePositive(), lifecycleLabel(), lifecycleTone(), LiveSnapshot, MediaStage() (+20 more)

### Community 14 - "Decart Realtime Gateway"
Cohesion: 0.15
Nodes (13): connectDecartRealtime(), ConnectRealtimeOptions, DevelopmentRealtimeDriver, ModelRequirements, RealtimeConnectionState, RealtimeSession, RealtimeSnapshot, FakeMediaStream (+5 more)

### Community 15 - "Session Draft Snapshots"
Cohesion: 0.16
Nodes (25): SessionDraft, hasPendingChanges(), imageIdentity(), imageIds, normalizePrompt, referenceIdentity(), revertToAppliedDraft(), toAppliedState() (+17 more)

### Community 16 - "TypeScript Path Configuration"
Cohesion: 0.07
Nodes (27): packages/contracts/src/index.ts, packages/domain/src/index.ts, packages/testing/src/index.ts, compilerOptions, baseUrl, exactOptionalPropertyTypes, ignoreDeprecations, isolatedModules (+19 more)

### Community 17 - "Character Prompt Workshop"
Cohesion: 0.14
Nodes (32): CharacterPromptWorkshop(), createDraftForIntent(), createDraftMap(), createReferenceOptimizationState(), createStepMap(), isAbortError(), optimizationErrorMessage(), OptimizationRequest (+24 more)

### Community 18 - "Recording Session Domain"
Cohesion: 0.14
Nodes (20): browserErrorMap, classifyBrowserError(), createSafeError(), DomainRuleError, SafeError, SafeErrorCode, RecordingFinishAction, AudioSidecar (+12 more)

### Community 19 - "API Error Contracts"
Cohesion: 0.10
Nodes (25): ReferenceImageGenerationStateError, VoiceServiceError, VoiceServiceFailureReason, ApiErrorBody, AppError, errorBody(), installErrorHandling(), isFastifyError() (+17 more)

### Community 20 - "Web Package Configuration"
Cohesion: 0.08
Nodes (24): dependencies, @decartai/sdk, @emotion/react, mediabunny, react, react-dom, @studio/contracts, @studio/domain (+16 more)

### Community 21 - "Recording Source Composition"
Cohesion: 0.16
Nodes (20): AUDIO_MIME_CANDIDATES, composeRecordingSource(), hasSameRecordingTracks(), live(), revokeArtifactUrl(), selectAudioMime(), selectedLiveTracks(), selectSupportedMime() (+12 more)

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
Cohesion: 0.26
Nodes (18): CharacterTransformFields(), CharacterTransformFieldsProps, checkboxLabelStyles(), checkboxStyles(), PromptBuilderDraft, PromptIssue, promptFieldGridStyles(), promptFullWidthStyles() (+10 more)

### Community 26 - "Voice Library Client"
Cohesion: 0.26
Nodes (14): apiFetch(), convertRecordingVoice(), importPublicVoice(), invalidResponse(), listPublicVoices(), listWorkspaceVoices(), VoicePage, VoiceSummary (+6 more)

### Community 27 - "Recording Artifact Management"
Cohesion: 0.16
Nodes (15): AutomaticRecordingStopEvent, AutomaticRecordingStopReason, CaptureDeviceState, RecordingArtifact, RecordingAudioSidecar, RecordingLifecycle, TakeMetadata, UseRecordingOptions (+7 more)

### Community 28 - "Creative Asset Repository"
Cohesion: 0.10
Nodes (32): RecipeShelf(), createRepository(), browserStorage(), createCreativeAssetRepository(), CreativeAssetError, CreativeAssetErrorCode, CreativeAssetRepositoryOptions, defaultIdFactory() (+24 more)

### Community 29 - "Studio Screenshot Scenarios"
Cohesion: 0.14
Nodes (15): CAPTURE_TIME, captureStableViewport(), createLocalTake(), FIXED_WEBP, Scenario, SCENARIOS, SCREENSHOT_ROOT, settlePage() (+7 more)

### Community 30 - "Studio Journey Testing"
Cohesion: 0.17
Nodes (6): exactViewports, expectStableStageRect(), readStageRect(), StageRect, expectNoDocumentOverflow(), triggerProviderDisconnect()

### Community 31 - "Creative Asset Sanitization"
Cohesion: 0.26
Nodes (20): createEmptyCreativeAssetStore(), count(), isRecord(), normalizedId(), nullableDate(), parseCreativeAssetStore(), promptIntent(), readTags() (+12 more)

### Community 32 - "Creative Asset Operations"
Cohesion: 0.22
Nodes (25): context(), timestamp(), assertTimestamp(), capByUpdated(), createSavedCharacterPrompt(), createSavedPrompt(), deleteSavedPrompt(), enrichNewestMatchingRecentWithReferenceImage() (+17 more)

### Community 33 - "Prompt Authoring Model"
Cohesion: 0.17
Nodes (18): CharacterPromptWorkshopProps, OptimizeWorkshopReferencePrompt, PromptWorkshopAction, SavePromptWorkshopAction, WorkshopReferenceGenerationInput, PROMPT_DETAIL_LIMIT, PromptIntent, ReferenceGenerationState (+10 more)

### Community 34 - "Take Review Dock"
Cohesion: 0.18
Nodes (18): formatBytes(), actionStyles(), captureMetadataChips(), defaultAudioSourceLabel(), downloadStyles(), formatFrameRate(), gridStyles(), headingStyles() (+10 more)

### Community 35 - "Voice Effects Panel"
Cohesion: 0.13
Nodes (17): VoiceLibraryKind, artifact(), processing, recording(), LOCAL_EFFECTS, LocalVoiceEffectId, VoiceEffectSelection, VoiceProcessingController (+9 more)

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
Nodes (19): @eslint/js, fast-check, devDependencies, @eslint/js, fast-check, @playwright/test, prettier, @testing-library/jest-dom (+11 more)

### Community 40 - "Model Session Actions"
Cohesion: 0.16
Nodes (13): StudioMode, confirmModeReplacement(), hasDraftContent(), createSession(), AppliedRealtimeState, createEmptyDraft(), EphemeralSessionReference, PersistedSessionReference (+5 more)

### Community 41 - "Reference Image Validation"
Cohesion: 0.15
Nodes (13): ImageValidation, loadDimensions(), validateReferenceImage(), getImageQualityWarnings(), IMAGE_MIME_TYPES, ImageDescriptorCandidate, ImageMimeType, ImageQualityWarning (+5 more)

### Community 42 - "Recording Attempts and Artifacts"
Cohesion: 0.42
Nodes (8): createArtifactObjectUrl(), createOriginalRecordingArtifact(), createProcessedRecordingArtifact(), createRecordingSidecar(), firstChunkMimeType(), completeAudioSidecar(), failAudioSidecar(), startAudioSidecar()

### Community 43 - "Media Stage Component Tests"
Cohesion: 0.12
Nodes (6): MediaStageProps, StagePresentation, defaultProps, FakeStream, FakeTrack, idlePresentation

### Community 44 - "Capture Settings Panel"
Cohesion: 0.18
Nodes (13): actualSettingsStyles(), bodyStyles(), CaptureSettingsPanel(), CaptureSettingsPanelProps, footerStyles(), introductionStyles(), panelStyles(), profileLabels (+5 more)

### Community 45 - "Workspace Quality Scripts"
Cohesion: 0.12
Nodes (16): scripts, build, build:packages, dev, format, format:check, lint, quality (+8 more)

### Community 46 - "API Environment Bootstrap"
Cohesion: 0.15
Nodes (12): environmentSchema, EnvironmentValidationError, optionalModelSchema, optionalSecretSchema, parseEnvironment(), portSchema, strictBooleanSchema, CHARACTER_PROMPT_OPTIMIZER_DEFAULT_MODEL (+4 more)

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
Cohesion: 0.47
Nodes (5): normalizeAssetName(), normalizeAssetNotes(), normalizeAssetText(), normalizePromptText(), normalizeTags()

### Community 53 - "Accessible Tab Controls"
Cohesion: 0.23
Nodes (11): fullLabelStyles(), panelStyles(), rootStyles(), shortLabelStyles(), TabItem, tabListStyles(), Tabs(), TabsProps (+3 more)

### Community 54 - "Accessibility Responsive Testing"
Cohesion: 0.22
Nodes (3): BrowserTestState, MockStudioState, representativeViewports

### Community 55 - "Contracts Package Configuration"
Cohesion: 0.14
Nodes (13): dependencies, zod, exports, zod, main, name, private, scripts (+5 more)

### Community 56 - "Recording File Format Utilities"
Cohesion: 0.21
Nodes (11): createRecordingFilename(), filenameMode, formatDuration(), formatFileSize(), timestampForFilename(), isAudioMimeType(), isSupportedVoiceSidecarMimeType(), MimeSupportTest (+3 more)

### Community 57 - "Owned Local Media Streams"
Cohesion: 0.07
Nodes (31): boundedResultList(), boundedResultString(), characterReferenceBackgroundSchema, characterReferenceExpressionSchema, characterReferenceFramingSchema, characterReferenceOrientationSchema, characterReferenceRenderingModeSchema, createReferenceImageRequestSchema (+23 more)

### Community 58 - "Prompt Workshop Header"
Cohesion: 0.33
Nodes (9): draftStatusStyles(), eyebrowStyles(), headerStyles(), intentHintStyles(), intentOptions, introStyles(), PromptWorkshopHeader(), PromptWorkshopHeaderProps (+1 more)

### Community 59 - "Recording Hook Test Harness"
Cohesion: 0.13
Nodes (10): RecordingSource, createSource(), createTrack(), installRecorderHarness(), RecorderHarness, RecorderListener, TrackOptions, streamEvents (+2 more)

### Community 60 - "Provider Error Handling Tests"
Cohesion: 0.10
Nodes (30): actionsStyles(), copyStyles(), generatorStyles(), optimizationMetaStyles(), optimizationPanelStyles(), optionsGridStyles(), previewCopyStyles(), previewRowStyles() (+22 more)

### Community 61 - "Segmented Control Component"
Cohesion: 0.27
Nodes (10): buttonStyles(), controlStyles(), fullLabelStyles(), groupStyles(), SegmentedControl(), SegmentedControlProps, SegmentOption, segmentStyles() (+2 more)

### Community 62 - "Form Field Components"
Cohesion: 0.11
Nodes (13): ReferenceImageAssetStore, StoredReferenceImageContent, StoredReferenceImageMetadata, ReferenceImageService, safeMetadata(), input, result, unusedStore (+5 more)

### Community 63 - "Root Workspace Manifest"
Cohesion: 0.18
Nodes (10): engines, node, npm, name, private, type, version, workspaces (+2 more)

### Community 64 - "Domain Package Manifest"
Cohesion: 0.18
Nodes (10): exports, main, name, private, scripts, build, typecheck, type (+2 more)

### Community 65 - "Creative Asset Domain Types"
Cohesion: 0.11
Nodes (24): registerRealtimeRoutes(), verifyProviderOrigin(), CapabilityAvailability, canonicalLoopbackOrigin(), installLocalSecurityBoundary(), isLoopbackHostname(), localOwnerIdForRequest(), LOOPBACK_HOSTS (+16 more)

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
Cohesion: 0.29
Nodes (10): CharacterPreset, CharacterPresetPicker(), CharacterPresetPickerProps, characterPresets, presetButtonStyles(), presetDescriptionStyles(), presetLabelStyles(), presetListStyles() (+2 more)

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
Cohesion: 0.20
Nodes (8): CHARACTER_MODEL_ID, isSessionModeId(), LOCAL_MODE_ID, LocalSessionMode, MODEL_MODE_IDS, ModelSessionMode, SessionMode, VTON_MODEL_ID

### Community 75 - "Domain Build Configuration"
Cohesion: 0.22
Nodes (8): compilerOptions, types, exclude, extends, include, src/**/*.test.ts, src/**/*.ts, ../../tsconfig.base.json

### Community 76 - "Generated Prompt Preview"
Cohesion: 0.21
Nodes (8): GeneratedPromptPreview(), GeneratedPromptPreviewProps, previewCountStyles(), previewHeaderStyles(), previewLabelStyles(), previewStyles(), previewTextStyles(), ReferenceImageGeneratorProps

### Community 77 - "Prompt Workshop Actions"
Cohesion: 0.47
Nodes (5): actionRowStyles(), PromptSaveState, PromptWorkshopActions(), PromptWorkshopActionsProps, saveFormStyles()

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
Cohesion: 0.67
Nodes (3): AudioLevelMeter(), audioMeterStyles(), audioTrackStyles()

### Community 85 - "Cross-Repository Graph Merging"
Cohesion: 0.67
Nodes (4): Cached GitHub Clone, Cross-Repository Graph Merge, graphify reference: GitHub clone and cross-repo merge, Provenance-Preserving Monorepo Merge

### Community 91 - "Playwright Accessibility Testing"
Cohesion: 0.30
Nodes (4): extensionForMimeType(), isMissingPathError(), LocalReferenceImageAssetStore, readJson()

### Community 111 - "RecipeCards.tsx"
Cohesion: 0.24
Nodes (22): CharacterPromptCard(), EmptyShelf(), formatDate(), modeName(), RecentPromptCard(), SavedPromptCard(), Tags(), actionStyles() (+14 more)

### Community 112 - "RecipeShelf.styles.ts"
Cohesion: 0.22
Nodes (21): RecipeShelfView(), RecipeShelfViewProps, categoryButtonStyles(), categoryStyles(), controlsRegionStyles(), countStyles(), eyebrowStyles(), footerMetadataStyles() (+13 more)

### Community 113 - "reference-image-provider.ts"
Cohesion: 0.16
Nodes (10): GeneratedReferenceImagePayload, isModerationFailure(), isOpenAIError(), normalizeOpenAIError(), OPENAI_REFERENCE_IMAGE_PARAMETERS, OpenAIClientFactory, OpenAIImageClient, OpenAIReferenceImageProvider (+2 more)

### Community 114 - "useRecipeShelfController.ts"
Cohesion: 0.19
Nodes (15): EditAction, ShelfCategory, createRecipeEditorDraft(), RecipeSelection, RecipeShelfProps, ModelModeId, SavedCharacterPrompt, useCreativeAssetRepository() (+7 more)

### Community 115 - "ReferenceImageField.tsx"
Cohesion: 0.23
Nodes (13): ModelMode, emptyFeedback(), formatFileSize(), ImageFeedback, ReferenceImageField(), ReferenceImageFieldProps, StubURL, referenceFieldStyles() (+5 more)

### Community 116 - "studioHarness.ts"
Cohesion: 0.16
Nodes (15): assetIdForSequence(), BrowserJourneyState, canonicalPrompt(), createMockReferenceAsset(), createOptimizationResponse(), expectNoExternalProviderTraffic(), installSuccessfulStudioHarness(), MockReferenceImageAsset (+7 more)

### Community 117 - "voice-service.ts"
Cohesion: 0.09
Nodes (20): localHeaders, optimizedResult, options, CharacterPromptOptimizerError, CharacterPromptOptimizerFailureReason, containsRefusal(), isOpenAIError(), normalizeOpenAIError() (+12 more)

### Community 118 - "ElevenLabsHttpProvider"
Cohesion: 0.17
Nodes (19): createPromptOptimizationInputHash(), createReferenceImagePrompt(), createWorkshopPromptHash(), ReferenceImagePromptVersion, versionReferenceImagePrompt(), formatForMimeType(), GenerateReferenceImageInput, LEGACY_REFERENCE_OPTIONS (+11 more)

### Community 119 - "audioEffects.ts"
Cohesion: 0.12
Nodes (16): digestPathSegment(), idempotencyMappingSchema, internalMetadataSchema, promptAuditSchema, ReferenceImageStorageError, StoreReferenceImageInput, otherOwnerId, ownerId (+8 more)

### Community 120 - "image-validation.ts"
Cohesion: 0.26
Nodes (9): decodeStrictBase64(), dimensionsForSize(), hasCanonicalBase64Shape(), inspectImage(), InvalidReferenceImageError, isBase64AlphabetCode(), mimeTypeForFormat(), ValidatedReferenceImage (+1 more)

### Community 121 - "VoiceService"
Cohesion: 0.22
Nodes (16): normalizeWhitespace(), createPromptBuilderDraft(), isAdultAge(), isCharacterGender(), isIntent(), isRecord(), normalizeField(), normalizePreset() (+8 more)

### Community 122 - "useStudioSession.test.tsx"
Cohesion: 0.25
Nodes (6): adapters, ControllableTrack, Deferred, fakeStream(), fakeTrack(), Listener

### Community 123 - "safe-error.ts"
Cohesion: 0.20
Nodes (14): getDecartModelRequirements(), namedMessage(), SafeMediaError, toSafeMediaError(), isModelMode(), persistedReferenceAssetId(), stream(), track() (+6 more)

### Community 124 - "PromptFeedback.tsx"
Cohesion: 0.14
Nodes (15): generatedReference, populatedCharacterDraft(), AdultAge, CharacterGender, createPromptBuilderDraft(), generateStructuredPrompt(), PromptValidation, ReferenceImageContext (+7 more)

### Community 125 - "live-session.ts"
Cohesion: 0.21
Nodes (11): MediaRequirements, withCaptureDevices(), LOCAL_MEDIA_PROFILES, LOCAL_MEDIA_REQUIREMENTS, localMediaRequirements(), LiveTimerController, useLiveTimer(), StudioSessionOptions (+3 more)

### Community 128 - "types.ts"
Cohesion: 0.13
Nodes (17): CreativeAssetSearchResults, RecentPrompt, ReferenceImageStatus, SanitizeCreativeAssetResult, SavedCharacterPrompt, SavedCharacterPromptInput, SavedCharacterPromptSource, SavedPrompt (+9 more)

### Community 129 - "browserMedia.ts"
Cohesion: 0.44
Nodes (9): acquireLocalMedia(), hasLiveAudio(), hasLiveTrack(), hasLiveVideo(), stopOwnedStream(), OwnedLocalMediaController, OwnedLocalMediaOptions, requestedDevicesMatch() (+1 more)

### Community 130 - "FormControls.tsx"
Cohesion: 0.24
Nodes (5): SelectField, SelectFieldProps, SharedFieldProps, TextAreaFieldProps, TextFieldProps

### Community 131 - "types.ts"
Cohesion: 0.25
Nodes (7): CaptureAudioSettings, CaptureDeviceOption, CapturePreferences, CaptureStreamSettings, CaptureVideoSettings, LocalCaptureProfileId, SessionLifecycle

### Community 132 - "ReferenceImagePreview.tsx"
Cohesion: 0.48
Nodes (6): frameStyles(), largePreviewStyles(), placeholderStyles(), referenceImageContentUrl(), ReferenceImagePreview(), ReferenceImagePreviewProps

### Community 133 - "StatusNotice"
Cohesion: 0.47
Nodes (5): noticeStyles(), noticeTitleStyles(), NoticeTone, StatusNotice(), StatusNoticeProps

## Knowledge Gaps
- **489 isolated node(s):** `semi`, `singleQuote`, `trailingComma`, `printWidth`, `name` (+484 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CreateReferenceImageRequest` connect `ElevenLabsHttpProvider` to `Studio Application Shell`, `Character Prompt Workshop`, `studioHarness.ts`, `voice-service.ts`, `Owned Local Media Streams`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `canonicalPrompt()` connect `Creative Asset Operations` to `types.ts`, `Prompt Authoring Model`, `Studio Application Shell`, `Prompt Draft Generation`, `VoiceService`, `Creative Asset Repository`, `Creative Asset Sanitization`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `OptimizeCharacterReferencePromptRequest` connect `voice-service.ts` to `Studio Application Shell`, `Character Prompt Workshop`, `studioHarness.ts`, `ElevenLabsHttpProvider`, `Owned Local Media Streams`, `PromptFeedback.tsx`, `Form Field Components`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `CharacterPromptWorkshop()` (e.g. with `createReferenceOptimizationState()` and `createStepMap()`) actually correct?**
  _`CharacterPromptWorkshop()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `StudioExperience()` (e.g. with `signal()` and `draft()`) actually correct?**
  _`StudioExperience()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `createCreativeAssetRepository()` (e.g. with `notice()` and `context()`) actually correct?**
  _`createCreativeAssetRepository()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `semi`, `singleQuote`, `trailingComma` to the rest of the system?**
  _489 weakly-connected nodes found - possible documentation gaps or missing edges._