# Graph Report - webrtc2Sol  (2026-07-18)

## Corpus Check
- 261 files · ~119,718 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1998 nodes · 4505 edges · 128 communities (100 shown, 28 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 48 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `90cab946`
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

## God Nodes (most connected - your core abstractions)
1. `CharacterPromptWorkshop()` - 33 edges
2. `StudioExperience()` - 26 edges
3. `MediaStage()` - 25 edges
4. `createCreativeAssetRepository()` - 23 edges
5. `useRecording()` - 23 edges
6. `normalizeWhitespace()` - 22 edges
7. `Button` - 21 edges
8. `PromptBuilderDraft` - 20 edges
9. `FakeElevenLabsProvider` - 19 edges
10. `StudioMode` - 18 edges

## Surprising Connections (you probably didn't know these)
- `useSessionDraftState()` --indirect_call--> `image()`  [INFERRED]
  apps/web/src/orchestration/session/useSessionDraftState.ts → packages/domain/src/session/session.test.ts
- `createCreativeAssetRepository()` --indirect_call--> `referenceImageAssetId()`  [INFERRED]
  apps/web/src/features/creative-assets/repository.ts → packages/domain/src/assets/sanitize.ts
- `useRecipeShelfController()` --indirect_call--> `referenceImageAssetId()`  [INFERRED]
  apps/web/src/features/creative-assets/useRecipeShelfController.ts → packages/domain/src/assets/sanitize.ts
- `StudioExperience()` --indirect_call--> `referenceImageAssetId()`  [INFERRED]
  apps/web/src/studio/StudioApp.tsx → packages/domain/src/assets/sanitize.ts
- `Lightframe Web Shell` --conceptually_related_to--> `Lightframe Studio`  [INFERRED]
  apps/web/index.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Composite Application Mark** — apps_web_public_favicon_teal_frame, apps_web_public_favicon_gold_l_glyph, apps_web_public_favicon_gold_dot [EXTRACTED 1.00]
- **Local-First Consent and No-Provider Boundary** — docs_architecture_local_first_stateless_broker, docs_privacy_and_temporary_data_explicit_consent_boundaries, docs_privacy_and_temporary_data_local_no_provider_guarantee, docs_product_evolution_separation_of_preparation_and_execution, docs_manual_qa_no_key_local_guarantee_validation [INFERRED 0.85]
- **Stable Stage Lifecycle** — docs_architecture_stable_stage_and_overlay_shell, docs_product_evolution_stable_stage_overlay_workspace, docs_manual_qa_stable_stage_and_responsive_validation, docs_browser_support_responsive_viewport_matrix [INFERRED 0.95]
- **Recording Finalization and Resource Handoff** — docs_architecture_recording_finalization_handoff, docs_product_evolution_first_class_finalization_handoff, docs_manual_qa_recording_and_resource_safety_validation, docs_privacy_and_temporary_data_temporary_single_take_lifecycle [INFERRED 0.95]

## Communities (128 total, 28 thin omitted)

### Community 0 - "Creative Recipe Shelf"
Cohesion: 0.16
Nodes (24): CharacterRecipeList(), updateCharacterRecipe(), RecentRecipeList(), DeleteConfirmation(), DeleteConfirmationProps, parseTags(), RecipeEditor(), RecipeEditorDraft (+16 more)

### Community 1 - "Media Session Composer"
Cohesion: 0.15
Nodes (27): confirmModeReplacement(), hasDraftContent(), ModelRecipeFields(), ModelRecipeFieldsProps, SessionActions(), SessionActionsProps, SessionComposer(), SessionComposerProps (+19 more)

### Community 2 - "Voice API Contracts"
Cohesion: 0.08
Nodes (39): contentTypeEssence(), registerVoiceRoutes(), requireVoiceService(), streamProviderAudio(), validationError(), verifyProviderOrigin(), sendAudioStream(), API_ERROR_CODES (+31 more)

### Community 3 - "Studio Application Shell"
Cohesion: 0.07
Nodes (52): ApiClientError, createReferenceImage(), extensionForMime(), fetchProviderAvailability(), fetchReferenceImageMetadata(), hydrateReferenceImage(), PersistedReferenceImage, readError() (+44 more)

### Community 4 - "Prompt Draft Generation"
Cohesion: 0.10
Nodes (43): promptIntent(), normalizeWhitespace(), createPromptBuilderDraft(), isAdultAge(), isCharacterGender(), isIntent(), isRecord(), normalizeField() (+35 more)

### Community 5 - "Studio Product Documentation"
Cohesion: 0.07
Nodes (42): Lightframe Web Shell, Architecture and Ownership, Atomic Capture Replacement, Explicit Session and Provider Flow, Immutable Processing Sources, Inward Ownership Boundaries, Lifecycle Ownership and Deny-External Testing, Local-First Stateless Loopback Broker (+34 more)

### Community 6 - "Realtime API Security"
Cohesion: 0.09
Nodes (24): AppDependencies, createApp(), RuntimeConfig, localOriginHeaders, localHeaders, registerSystemRoutes(), MAX_RECORDING_AUDIO_BYTES, SUPPORTED_AUDIO_CONTENT_TYPES (+16 more)

### Community 7 - "API Package Configuration"
Cohesion: 0.05
Nodes (42): dependencies, @decartai/sdk, dotenv, fastify, @fastify/helmet, @fastify/static, openai, sharp (+34 more)

### Community 8 - "Accessible Overlay Panels"
Cohesion: 0.07
Nodes (30): canRestoreFocus(), fadeIn, fadeOut, focusableSelector, focusTopmostDialog(), getFocusableElements(), getTopmostDialog(), hasInertState() (+22 more)

### Community 9 - "Studio Capture Sessions"
Cohesion: 0.14
Nodes (21): acquireLocalMedia(), enumerateMediaDevices(), finiteSetting(), hasLiveAudio(), hasLiveTrack(), hasLiveVideo(), MediaRequirements, readCaptureStreamSettings() (+13 more)

### Community 10 - "ElevenLabs HTTP Integration"
Cohesion: 0.12
Nodes (21): ALLOWED_PREVIEW_HOSTS, audioExtension(), classifyProviderFailure(), FEATURE_UNAVAILABLE_CODES, importResponseSchema, INVALID_AUDIO_CODES, isAllowedPreviewUrl(), labelsSchema (+13 more)

### Community 11 - "Voice Processing Pipeline"
Cohesion: 0.21
Nodes (15): safeProcessingMessage(), useVoiceProcessing(), beginVoiceProcessing(), completeVoiceProcessing(), createVoiceProcessingState(), failVoiceProcessing(), isPlaybackLocked(), restoreOriginalVoice() (+7 more)

### Community 13 - "Live Media Stage"
Cohesion: 0.14
Nodes (27): AudioLevelMeter(), emptyCopy(), lifecycleLabel(), lifecycleTone(), LiveSnapshot, MediaStage(), StreamDetails, activityIndicatorStyles() (+19 more)

### Community 14 - "Decart Realtime Gateway"
Cohesion: 0.11
Nodes (24): connectDecartRealtime(), ConnectRealtimeOptions, DevelopmentRealtimeDriver, getDecartModelRequirements(), ModelRequirements, RealtimeConnectionState, RealtimeSnapshot, FakeMediaStream (+16 more)

### Community 15 - "Session Draft Snapshots"
Cohesion: 0.15
Nodes (27): SessionDraft, hasPendingChanges(), imageIdentity(), imageIds, normalizePrompt, referenceIdentity(), revertToAppliedDraft(), toAppliedState() (+19 more)

### Community 16 - "TypeScript Path Configuration"
Cohesion: 0.07
Nodes (27): packages/contracts/src/index.ts, packages/domain/src/index.ts, packages/testing/src/index.ts, compilerOptions, baseUrl, exactOptionalPropertyTypes, ignoreDeprecations, isolatedModules (+19 more)

### Community 17 - "Character Prompt Workshop"
Cohesion: 0.17
Nodes (28): CharacterPromptWorkshop(), createDraftForIntent(), createDraftMap(), createStepMap(), referenceContext(), accordionStyles(), chevronStyles(), footerStyles() (+20 more)

### Community 18 - "Recording Session Domain"
Cohesion: 0.26
Nodes (12): SafeError, RecordingFinishAction, recordingFinishOrder(), AudioSidecar, RecordingArtifact, RecordingLifecycle, RecordingLifecycleStatus, RecordingReleaseReason (+4 more)

### Community 19 - "API Error Contracts"
Cohesion: 0.18
Nodes (14): ReferenceImageStorageError, ReferenceImageGenerationStateError, ApiErrorBody, AppError, errorBody(), installErrorHandling(), isFastifyError(), mapProviderError() (+6 more)

### Community 20 - "Web Package Configuration"
Cohesion: 0.08
Nodes (24): dependencies, @decartai/sdk, @emotion/react, mediabunny, react, react-dom, @studio/contracts, @studio/domain (+16 more)

### Community 21 - "Recording Source Composition"
Cohesion: 0.10
Nodes (17): StudioMode, AUDIO_MIME_CANDIDATES, composeRecordingSource(), live(), revokeArtifactUrl(), selectedLiveTracks(), selectSupportedMime(), FakeMediaStream (+9 more)

### Community 22 - "Recording Lifecycle Orchestration"
Cohesion: 0.18
Nodes (23): cleanupRecordingAttempt(), startRecordingAttempt(), asRecord(), captureTakeMetadata(), captureTrackMeasurements(), domainAudioSource(), domainVideoSource(), fixedCapabilityValue() (+15 more)

### Community 23 - "Graphify Pipeline References"
Cohesion: 0.11
Nodes (24): Background Folder Watcher, Debounced Change-Type-Aware Refresh, graphify reference: add a URL and watch a folder, URL Ingestion, Deterministic Node Identifiers, graphify reference: extraction subagent prompt (compact), Relationship Confidence Taxonomy, Semantic Similarity and Hyperedges (+16 more)

### Community 24 - "Voice Route Integration Tests"
Cohesion: 0.14
Nodes (13): FailingProvider, InvalidAudioProvider, LimitedProvider, ZeroRetentionRejectedProvider, ProviderSharedVoice, ProviderSharedVoicePage, ProviderVoice, ProviderWorkspaceVoicePage (+5 more)

### Community 25 - "Prompt Authoring Fields"
Cohesion: 0.26
Nodes (18): CharacterTransformFields(), CharacterTransformFieldsProps, checkboxLabelStyles(), checkboxStyles(), PromptBuilderDraft, PromptIssue, promptFieldGridStyles(), promptFullWidthStyles() (+10 more)

### Community 26 - "Voice Library Client"
Cohesion: 0.26
Nodes (14): apiFetch(), convertRecordingVoice(), importPublicVoice(), invalidResponse(), listPublicVoices(), listWorkspaceVoices(), VoicePage, VoiceSummary (+6 more)

### Community 27 - "Recording Artifact Management"
Cohesion: 0.17
Nodes (14): AutomaticRecordingStopEvent, AutomaticRecordingStopReason, CaptureDeviceState, RecordingArtifact, RecordingAudioSidecar, TakeMetadata, UseRecordingOptions, VoiceProcessingState (+6 more)

### Community 28 - "Creative Asset Repository"
Cohesion: 0.12
Nodes (25): RecipeShelfViewProps, RecipeSelection, RecipeShelfProps, CreativeAssetErrorCode, CreativeAssetRepositoryOptions, MemoryStorage, repositoryFixture(), normalizeTags() (+17 more)

### Community 29 - "Studio Screenshot Scenarios"
Cohesion: 0.14
Nodes (15): CAPTURE_TIME, captureStableViewport(), createLocalTake(), FIXED_WEBP, Scenario, SCENARIOS, SCREENSHOT_ROOT, settlePage() (+7 more)

### Community 30 - "Studio Journey Testing"
Cohesion: 0.17
Nodes (6): exactViewports, expectStableStageRect(), readStageRect(), StageRect, expectNoDocumentOverflow(), triggerProviderDisconnect()

### Community 31 - "Creative Asset Sanitization"
Cohesion: 0.13
Nodes (32): count(), isRecord(), normalizedId(), nullableDate(), readTags(), referenceImageAssetId(), referenceStatus(), sanitizeArray() (+24 more)

### Community 32 - "Creative Asset Operations"
Cohesion: 0.19
Nodes (32): browserStorage(), createCreativeAssetRepository(), defaultIdFactory(), isSupportedLegacyPayload(), loadInitialState(), mapDomainError(), storageNotice(), context() (+24 more)

### Community 33 - "Prompt Authoring Model"
Cohesion: 0.24
Nodes (9): CharacterPromptWorkshopProps, PromptWorkshopAction, SavePromptWorkshopAction, generatedReference, populatedCharacterDraft(), createPromptBuilderDraft(), PROMPT_DETAIL_LIMIT, ReferenceGenerationState (+1 more)

### Community 34 - "Take Review Dock"
Cohesion: 0.14
Nodes (23): formatBytes(), RecordingController, actionStyles(), captureMetadataChips(), defaultAudioSourceLabel(), downloadStyles(), formatFrameRate(), gridStyles() (+15 more)

### Community 35 - "Voice Effects Panel"
Cohesion: 0.18
Nodes (12): VoiceLibraryKind, LOCAL_EFFECTS, LocalVoiceEffectId, VoiceEffectSelection, headingStyles(), introStyles(), optionGridStyles(), panelStyles() (+4 more)

### Community 36 - "Core UI Primitives"
Cohesion: 0.15
Nodes (18): Button, ButtonProps, ButtonSize, ButtonVariant, IconButton, IconButtonProps, OverlayPanelPlacement, frameStyles() (+10 more)

### Community 37 - "Live Stage Notices"
Cohesion: 0.16
Nodes (15): noticeActionStyles(), noticeCopyStyles, noticeDismissStyles(), noticeLayerStyles(), noticeStyles(), StageNoticeLayer(), StageNoticeLayerProps, defaultPriority (+7 more)

### Community 38 - "Recording Control Panel"
Cohesion: 0.18
Nodes (15): actionRowStyles(), captureResolutionLabel(), captureSurfaceStyles(), detailsStyles(), disabledReasonStyles(), headingStyles(), recordActionStyles(), RecordingAvailability (+7 more)

### Community 39 - "Workspace Development Dependencies"
Cohesion: 0.11
Nodes (19): @axe-core/playwright, @eslint/js, fast-check, devDependencies, @axe-core/playwright, @eslint/js, fast-check, @playwright/test (+11 more)

### Community 40 - "Model Session Actions"
Cohesion: 0.10
Nodes (27): CaptureAudioSettings, CaptureDeviceOption, CapturePreferences, CaptureStreamSettings, CaptureVideoSettings, LocalCaptureProfileId, ModelMode, ProviderAvailability (+19 more)

### Community 41 - "Reference Image Validation"
Cohesion: 0.16
Nodes (13): ImageValidation, loadDimensions(), validateReferenceImage(), getImageQualityWarnings(), IMAGE_MIME_TYPES, ImageDescriptorCandidate, ImageMimeType, ImageQualityWarning (+5 more)

### Community 42 - "Recording Attempts and Artifacts"
Cohesion: 0.20
Nodes (17): selectAudioMime(), selectVideoMime(), createArtifactObjectUrl(), createOriginalRecordingArtifact(), createProcessedRecordingArtifact(), createRecordingSidecar(), firstChunkMimeType(), attachRecordingAttemptListeners() (+9 more)

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
Cohesion: 0.33
Nodes (3): OverlayPanel, OverlayPanelBodyMode, HarnessProps

### Community 51 - "Web TypeScript Configuration"
Cohesion: 0.13
Nodes (14): compilerOptions, composite, jsx, jsxImportSource, noEmit, types, extends, include (+6 more)

### Community 52 - "Prompt Text Normalization"
Cohesion: 0.29
Nodes (7): normalizeAssetName(), normalizeAssetNotes(), normalizeAssetText(), normalizePromptText(), normalizeAuthoredPrompt(), trimText(), CHARACTER_REFERENCE_PROMPT_TEMPLATE_VERSION

### Community 53 - "Accessible Tab Controls"
Cohesion: 0.15
Nodes (16): fullLabelStyles(), panelStyles(), rootStyles(), shortLabelStyles(), TabItem, tabListStyles(), Tabs(), TabsProps (+8 more)

### Community 54 - "Accessibility Responsive Testing"
Cohesion: 0.22
Nodes (3): BrowserTestState, MockStudioState, representativeViewports

### Community 55 - "Contracts Package Configuration"
Cohesion: 0.14
Nodes (13): dependencies, zod, exports, zod, main, name, private, scripts (+5 more)

### Community 56 - "Recording File Format Utilities"
Cohesion: 0.23
Nodes (10): createRecordingFilename(), filenameMode, formatDuration(), formatFileSize(), timestampForFilename(), isAudioMimeType(), isSupportedVoiceSidecarMimeType(), MimeSupportTest (+2 more)

### Community 57 - "Owned Local Media Streams"
Cohesion: 0.11
Nodes (25): registerReferenceImageRoutes(), requireAssetId(), verifyGenerationOrigin(), canonicalLoopbackOrigin(), installLocalSecurityBoundary(), isLoopbackHostname(), localOwnerIdForRequest(), LOOPBACK_HOSTS (+17 more)

### Community 58 - "Prompt Workshop Header"
Cohesion: 0.31
Nodes (10): PromptIntent, draftStatusStyles(), eyebrowStyles(), headerStyles(), intentHintStyles(), intentOptions, introStyles(), PromptWorkshopHeader() (+2 more)

### Community 59 - "Recording Hook Test Harness"
Cohesion: 0.21
Nodes (7): createSource(), createTrack(), installRecorderHarness(), RecorderHarness, RecorderListener, TrackOptions, FakeMediaStream

### Community 61 - "Segmented Control Component"
Cohesion: 0.13
Nodes (15): buttonStyles(), controlStyles(), SelectField, SelectFieldProps, SharedFieldProps, TextAreaFieldProps, TextFieldProps, fullLabelStyles() (+7 more)

### Community 62 - "Form Field Components"
Cohesion: 0.13
Nodes (13): ReferenceImageAssetStore, StoredReferenceImageContent, StoredReferenceImageMetadata, createReferenceImagePrompt(), createWorkshopPromptHash(), ReferenceImagePromptVersion, versionReferenceImagePrompt(), GenerateReferenceImageInput (+5 more)

### Community 63 - "Root Workspace Manifest"
Cohesion: 0.18
Nodes (10): engines, node, npm, name, private, type, version, workspaces (+2 more)

### Community 64 - "Domain Package Manifest"
Cohesion: 0.18
Nodes (10): exports, main, name, private, scripts, build, typecheck, type (+2 more)

### Community 65 - "Creative Asset Domain Types"
Cohesion: 0.11
Nodes (18): registerRealtimeRoutes(), verifyProviderOrigin(), CapabilityAvailability, createRequestLifetime(), RequestLifetime, CapabilitiesResponse, capabilitiesResponseSchema, HealthResponse (+10 more)

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
Cohesion: 0.16
Nodes (17): CharacterPreset, CharacterPresetPicker(), CharacterPresetPickerProps, characterPresets, presetButtonStyles(), presetDescriptionStyles(), presetLabelStyles(), presetListStyles() (+9 more)

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
Nodes (8): isModelModeId(), isSessionModeId(), LOCAL_MODE_ID, LocalSessionMode, MODEL_MODE_IDS, ModelSessionMode, SessionMode, VTON_MODEL_ID

### Community 75 - "Domain Build Configuration"
Cohesion: 0.22
Nodes (8): compilerOptions, types, exclude, extends, include, src/**/*.test.ts, src/**/*.ts, ../../tsconfig.base.json

### Community 76 - "Generated Prompt Preview"
Cohesion: 0.19
Nodes (15): GeneratedPromptPreview(), GeneratedPromptPreviewProps, previewCountStyles(), previewHeaderStyles(), previewLabelStyles(), previewStyles(), previewTextStyles(), actionsStyles() (+7 more)

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
Cohesion: 0.50
Nodes (4): describeStream(), formatFrameRate(), isFinitePositive(), trackSettings()

### Community 85 - "Cross-Repository Graph Merging"
Cohesion: 0.67
Nodes (4): Cached GitHub Clone, Cross-Repository Graph Merge, graphify reference: GitHub clone and cross-repo merge, Provenance-Preserving Monorepo Merge

### Community 91 - "Playwright Accessibility Testing"
Cohesion: 0.16
Nodes (11): digestPathSegment(), extensionForMimeType(), idempotencyMappingSchema, internalMetadataSchema, isMissingPathError(), LocalReferenceImageAssetStore, readJson(), StoreReferenceImageInput (+3 more)

### Community 111 - "RecipeCards.tsx"
Cohesion: 0.24
Nodes (22): CharacterPromptCard(), EmptyShelf(), formatDate(), modeName(), RecentPromptCard(), SavedPromptCard(), Tags(), actionStyles() (+14 more)

### Community 112 - "RecipeShelf.styles.ts"
Cohesion: 0.24
Nodes (20): RecipeShelfView(), categoryButtonStyles(), categoryStyles(), controlsRegionStyles(), countStyles(), eyebrowStyles(), footerMetadataStyles(), headerActionsStyles() (+12 more)

### Community 113 - "reference-image-provider.ts"
Cohesion: 0.15
Nodes (11): GeneratedReferenceImagePayload, isModerationFailure(), isOpenAIError(), normalizeOpenAIError(), OPENAI_REFERENCE_IMAGE_MODEL, OPENAI_REFERENCE_IMAGE_PARAMETERS, OpenAIClientFactory, OpenAIImageClient (+3 more)

### Community 114 - "useRecipeShelfController.ts"
Cohesion: 0.14
Nodes (14): EditAction, ShelfCategory, createRecipeEditorDraft(), RecipeShelf(), createRepository(), CreativeAssetError, useCreativeAssetRepository(), ControllerOptions (+6 more)

### Community 115 - "ReferenceImageField.tsx"
Cohesion: 0.18
Nodes (15): emptyFeedback(), formatFileSize(), ImageFeedback, ReferenceImageField(), StubURL, referenceFieldStyles(), referenceFileAreaStyles(), referenceGuidanceStyles() (+7 more)

### Community 116 - "studioHarness.ts"
Cohesion: 0.17
Nodes (14): assetIdForSequence(), BrowserJourneyState, canonicalPrompt(), createMockReferenceAsset(), expectNoExternalProviderTraffic(), installSuccessfulStudioHarness(), MockReferenceImageAsset, ModelId (+6 more)

### Community 117 - "voice-service.ts"
Cohesion: 0.20
Nodes (10): VoiceServiceError, VoiceServiceFailureReason, isModelCompatible(), isProfessionalVoice(), summarizePublicVoice(), summarizeVoice(), PublicVoiceSummary, SharedVoicesResponse (+2 more)

### Community 119 - "audioEffects.ts"
Cohesion: 0.27
Nodes (10): connectClearEffect(), connectRobotEffect(), connectWarmEffect(), decodeAudioBlob(), getAudioContext(), getOfflineContext(), renderLocalEffect(), isMp4() (+2 more)

### Community 120 - "image-validation.ts"
Cohesion: 0.29
Nodes (8): decodeStrictBase64(), hasCanonicalBase64Shape(), inspectImage(), InvalidReferenceImageError, isBase64AlphabetCode(), mimeTypeForFormat(), ValidatedReferenceImage, validateReferenceImage()

### Community 122 - "useStudioSession.test.tsx"
Cohesion: 0.22
Nodes (7): RealtimeSession, adapters, ControllableTrack, Deferred, fakeStream(), fakeTrack(), Listener

### Community 123 - "safe-error.ts"
Cohesion: 0.33
Nodes (4): browserErrorMap, classifyBrowserError(), DomainRuleError, SafeErrorCode

### Community 124 - "PromptFeedback.tsx"
Cohesion: 0.53
Nodes (5): PromptValidation, feedbackRootStyles(), issueListStyles(), PromptFeedback(), PromptFeedbackProps

### Community 125 - "live-session.ts"
Cohesion: 0.33
Nodes (5): canSwitchMode(), MediaStreamDescriptor, MediaTrackDescriptor, RecordableStreamMetadata, SessionLifecycleStatus

## Knowledge Gaps
- **456 isolated node(s):** `semi`, `singleQuote`, `trailingComma`, `printWidth`, `name` (+451 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Button` connect `Core UI Primitives` to `Creative Recipe Shelf`, `Media Session Composer`, `Take Review Dock`, `Voice Effects Panel`, `Studio Application Shell`, `Recording Control Panel`, `Voice Preview List`, `Generated Prompt Preview`, `Prompt Workshop Actions`, `Capture Settings Panel`, `RecipeCards.tsx`, `RecipeShelf.styles.ts`, `Voice Library Interface`, `ReferenceImageField.tsx`, `Prompt Workshop Header`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `@playwright/test` connect `@playwright/test` to `End-to-End TypeScript Configuration`, `studioHarness.ts`, `Accessibility Responsive Testing`, `Studio Screenshot Scenarios`, `Studio Journey Testing`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `StatusNotice()` connect `ReferenceImageField.tsx` to `Creative Recipe Shelf`, `Media Session Composer`, `Take Review Dock`, `Voice Effects Panel`, `Studio Application Shell`, `Core UI Primitives`, `Generated Prompt Preview`, `Prompt Workshop Actions`, `Capture Settings Panel`, `RecipeShelf.styles.ts`, `Voice Library Interface`, `PromptFeedback.tsx`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `StudioExperience()` (e.g. with `draft()` and `referenceImageAssetId()`) actually correct?**
  _`StudioExperience()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `createCreativeAssetRepository()` (e.g. with `notice()` and `context()`) actually correct?**
  _`createCreativeAssetRepository()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `semi`, `singleQuote`, `trailingComma` to the rest of the system?**
  _456 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Media Session Composer` be split into smaller, more focused modules?**
  _Cohesion score 0.14714714714714713 - nodes in this community are weakly interconnected._