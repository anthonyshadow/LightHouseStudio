# Graph Report - webrtc2Sol  (2026-07-21)

## Corpus Check
- 320 files · ~1,243,977 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2729 nodes · 6365 edges · 162 communities (134 shown, 28 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 69 edges (avg confidence: 0.73)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `66304b92`
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
- capture-guided-screenshots.screenshots.ts
- createLocalProjectRepository
- reference-image-provider.ts
- Guided character video: creation to voiced download
- projectRepository.test.ts
- studioHarness.ts
- voice-service.ts
- ElevenLabsHttpProvider
- audioEffects.ts
- image-validation.ts
- audioEffects.ts
- MemoryProjectBackend
- safe-error.ts
- PromptFeedback.tsx
- ProjectBackend
- LocalProjectRepository
- eslint-plugin-jsx-a11y
- recordingAttempt.ts
- Stage 1: Create a character
- FormControls.tsx
- .commit
- Capability and recovery boundaries
- Configure capture settings
- Virtual try-on session
- OPENAI_REFERENCE_IMAGE_MODEL
- Character workshop and reference generation
- Recipe Shelf
- Local voice treatments
- ElevenLabs voice workflow
- ReferenceImagePreview.tsx
- README.md
- Local camera capture
- Character AI session
- Take review and cleanup
- useVoiceProcessing.test.tsx
- Verification coverage
- requestPersistentProjectStorage
- AudioLevelMeter
- concurrently
- @testing-library/react
- VoiceLibrary.tsx
- GuidedChoiceDrawer.tsx
- FormControls.tsx
- VoiceEffectsPanel.test.tsx
- ReferenceImagePreview.tsx
- sanitation.ts
- describeStream
- useVoiceProcessing.test.tsx
- describeStream
- characterReferencePromptHashInput
- reference-image.ts

## God Nodes (most connected - your core abstractions)
1. `CharacterPromptWorkshop()` - 42 edges
2. `GuidedExperience()` - 33 edges
3. `Button` - 30 edges
4. `StudioExperience()` - 28 edges
5. `GuidedCharacterBuilder()` - 27 edges
6. `MediaStage()` - 27 edges
7. `StatusNotice()` - 27 edges
8. `createCreativeAssetRepository()` - 25 edges
9. `useRecording()` - 25 edges
10. `normalizeWhitespace()` - 23 edges

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

## Communities (162 total, 28 thin omitted)

### Community 0 - "Creative Recipe Shelf"
Cohesion: 0.07
Nodes (80): CharacterRecipeList(), updateCharacterRecipe(), RecentRecipeList(), CharacterPromptCard(), EditAction, EmptyShelf(), formatDate(), modeName() (+72 more)

### Community 1 - "Media Session Composer"
Cohesion: 0.12
Nodes (31): SessionLifecycle, confirmModeReplacement(), hasDraftContent(), ModelRecipeFields(), ModelRecipeFieldsProps, SessionActions(), SessionActionsProps, SessionComposer() (+23 more)

### Community 2 - "Voice API Contracts"
Cohesion: 0.07
Nodes (42): contentTypeEssence(), registerVoiceRoutes(), requireVoiceService(), streamProviderAudio(), validationError(), verifyProviderOrigin(), createRequestLifetime(), RequestLifetime (+34 more)

### Community 3 - "Studio Application Shell"
Cohesion: 0.06
Nodes (57): ApiClientError, createReferenceImage(), extensionForMime(), fetchProviderAvailability(), fetchReferenceImageMetadata(), hydrateReferenceImage(), PersistedReferenceImage, readError() (+49 more)

### Community 4 - "Prompt Draft Generation"
Cohesion: 0.09
Nodes (42): sanitizeCharacterDraft(), promptIntent(), isAdultAge(), isCharacterGender(), isIntent(), isRecord(), normalizeField(), normalizePreset() (+34 more)

### Community 5 - "Studio Product Documentation"
Cohesion: 0.07
Nodes (42): Lightframe Web Shell, Architecture and Ownership, Atomic Capture Replacement, Explicit Session and Provider Flow, Immutable Processing Sources, Inward Ownership Boundaries, Lifecycle Ownership and Deny-External Testing, Local-First Stateless Loopback Broker (+34 more)

### Community 6 - "Realtime API Security"
Cohesion: 0.19
Nodes (10): create(), DecartSdkClient, DecartSdkModule, normalizeExpiry(), numericStatusFrom(), sdkTokenSchema, TemporaryToken, sdkMocks (+2 more)

### Community 7 - "API Package Configuration"
Cohesion: 0.05
Nodes (42): dependencies, @decartai/sdk, dotenv, fastify, @fastify/helmet, @fastify/static, openai, sharp (+34 more)

### Community 8 - "Accessible Overlay Panels"
Cohesion: 0.07
Nodes (28): canRestoreFocus(), fadeIn, fadeOut, focusableSelector, focusTopmostDialog(), getFocusableElements(), getTopmostDialog(), hasInertState() (+20 more)

### Community 9 - "Studio Capture Sessions"
Cohesion: 0.09
Nodes (32): acquireLocalMedia(), enumerateMediaDevices(), finiteSetting(), hasLiveAudio(), hasLiveTrack(), hasLiveVideo(), MediaRequirements, readCaptureStreamSettings() (+24 more)

### Community 10 - "ElevenLabs HTTP Integration"
Cohesion: 0.12
Nodes (21): ALLOWED_PREVIEW_HOSTS, audioExtension(), classifyProviderFailure(), FEATURE_UNAVAILABLE_CODES, importResponseSchema, INVALID_AUDIO_CODES, isAllowedPreviewUrl(), labelsSchema (+13 more)

### Community 11 - "Voice Processing Pipeline"
Cohesion: 0.18
Nodes (18): safeProcessingMessage(), useVoiceProcessing(), browserErrorMap, classifyBrowserError(), createSafeError(), SafeErrorCode, beginVoiceProcessing(), completeVoiceProcessing() (+10 more)

### Community 12 - "Voice Service Models"
Cohesion: 0.12
Nodes (19): createApp(), resolveOptionalProvider(), localOriginHeaders, MAX_RECORDING_AUDIO_BYTES, FailingProvider, InvalidAudioProvider, LimitedProvider, originHeaders (+11 more)

### Community 13 - "Live Media Stage"
Cohesion: 0.14
Nodes (27): AudioLevelMeter(), emptyCopy(), lifecycleLabel(), lifecycleTone(), LiveSnapshot, MediaStage(), StreamDetails, activityIndicatorStyles() (+19 more)

### Community 14 - "Decart Realtime Gateway"
Cohesion: 0.08
Nodes (31): connectDecartRealtime(), ConnectRealtimeOptions, DevelopmentRealtimeDriver, getDecartModelRequirements(), ModelRequirements, RealtimeConnectionState, RealtimeSession, RealtimeSnapshot (+23 more)

### Community 15 - "Session Draft Snapshots"
Cohesion: 0.26
Nodes (18): CharacterTransformFields(), CharacterTransformFieldsProps, checkboxLabelStyles(), checkboxStyles(), PromptBuilderDraft, PromptIssue, promptFieldGridStyles(), promptFullWidthStyles() (+10 more)

### Community 16 - "TypeScript Path Configuration"
Cohesion: 0.07
Nodes (27): packages/contracts/src/index.ts, packages/domain/src/index.ts, packages/testing/src/index.ts, compilerOptions, baseUrl, exactOptionalPropertyTypes, ignoreDeprecations, isolatedModules (+19 more)

### Community 17 - "Character Prompt Workshop"
Cohesion: 0.14
Nodes (32): CharacterPromptWorkshop(), createDraftForIntent(), createDraftMap(), createReferenceOptimizationState(), createStepMap(), hasCompleteOptimizationResponse(), isAbortError(), optimizationErrorMessage() (+24 more)

### Community 18 - "Recording Session Domain"
Cohesion: 0.18
Nodes (18): SafeError, canStartRecording(), completeRecordingLifecycle(), createRecordingLifecycle(), RecordingFinishAction, recordingFinishOrder(), shouldRevokeRecordingObjectUrl(), startRecordingLifecycle() (+10 more)

### Community 19 - "API Error Contracts"
Cohesion: 0.20
Nodes (15): ReferenceImageGenerationStateError, ApiErrorBody, AppError, errorBody(), installErrorHandling(), isFastifyError(), mapCharacterPromptOptimizerError(), mapProviderError() (+7 more)

### Community 20 - "Web Package Configuration"
Cohesion: 0.08
Nodes (24): dependencies, @decartai/sdk, @emotion/react, mediabunny, react, react-dom, @studio/contracts, @studio/domain (+16 more)

### Community 21 - "Recording Source Composition"
Cohesion: 0.11
Nodes (16): AUDIO_MIME_CANDIDATES, composeRecordingSource(), hasSameRecordingTracks(), live(), selectAudioMime(), selectedLiveTracks(), selectSupportedMime(), selectVideoMime() (+8 more)

### Community 22 - "Recording Lifecycle Orchestration"
Cohesion: 0.11
Nodes (34): CaptureStreamSettings, StudioMode, AutomaticRecordingStopEvent, AutomaticRecordingStopReason, CaptureDeviceState, PersistedRecordingArtifactMetadata, PersistedRecordingAudioSidecar, RecordingController (+26 more)

### Community 23 - "Graphify Pipeline References"
Cohesion: 0.11
Nodes (24): Background Folder Watcher, Debounced Change-Type-Aware Refresh, graphify reference: add a URL and watch a folder, URL Ingestion, Deterministic Node Identifiers, graphify reference: extraction subagent prompt (compact), Relationship Confidence Taxonomy, Semantic Similarity and Hyperedges (+16 more)

### Community 24 - "Voice Route Integration Tests"
Cohesion: 0.07
Nodes (46): accessories, ages, appearances, bodyShapes, catalogChoice(), escapeXml(), genders, hairColors (+38 more)

### Community 25 - "Prompt Authoring Fields"
Cohesion: 0.11
Nodes (14): AppDependencies, RuntimeConfig, ReferenceImageAssetStore, StoredReferenceImageMetadata, ReferenceImageService, input, result, unusedStore (+6 more)

### Community 26 - "Voice Library Client"
Cohesion: 0.21
Nodes (17): apiFetch(), convertRecordingVoice(), importPublicVoice(), invalidResponse(), listPublicVoices(), listWorkspaceVoices(), CaptureAudioSettings, CaptureVideoSettings (+9 more)

### Community 27 - "Recording Artifact Management"
Cohesion: 0.22
Nodes (17): revokeArtifactUrl(), RecordingArtifact, RecordingAudioSidecar, RestorePersistedOriginalInput, createArtifactObjectUrl(), createOriginalRecordingArtifact(), createPersistedOriginalRecording(), createProcessedRecordingArtifact() (+9 more)

### Community 28 - "Creative Asset Repository"
Cohesion: 0.09
Nodes (37): RecipeShelf(), createRepository(), browserStorage(), createCreativeAssetRepository(), CreativeAssetError, CreativeAssetErrorCode, CreativeAssetRepositoryOptions, defaultIdFactory() (+29 more)

### Community 29 - "Studio Screenshot Scenarios"
Cohesion: 0.14
Nodes (15): CAPTURE_TIME, captureStableViewport(), createLocalTake(), FIXED_WEBP, Scenario, SCENARIOS, SCREENSHOT_ROOT, settlePage() (+7 more)

### Community 30 - "Studio Journey Testing"
Cohesion: 0.18
Nodes (5): exactViewports, expectStableStageRect(), readStageRect(), StageRect, expectNoDocumentOverflow()

### Community 31 - "Creative Asset Sanitization"
Cohesion: 0.16
Nodes (15): BuilderHarness(), BuilderSnapshot, openSection(), sectionNamed(), createEmptyGuidedDesign(), GuidedRestoreAvailability, GuidedRestoredCharacter, GuidedRestoreResult (+7 more)

### Community 32 - "Creative Asset Operations"
Cohesion: 0.20
Nodes (25): context(), timestamp(), assertTimestamp(), capByUpdated(), createSavedCharacterPrompt(), createSavedPrompt(), deleteSavedPrompt(), enrichNewestMatchingRecentWithReferenceImage() (+17 more)

### Community 33 - "Prompt Authoring Model"
Cohesion: 0.10
Nodes (28): CharacterPromptWorkshopProps, OptimizeWorkshopReferencePrompt, PromptWorkshopAction, SavePromptWorkshopAction, generatedReference, populatedCharacterDraft(), WorkshopReferenceGenerationInput, AdultAge (+20 more)

### Community 34 - "Take Review Dock"
Cohesion: 0.18
Nodes (18): formatBytes(), actionStyles(), captureMetadataChips(), defaultAudioSourceLabel(), downloadStyles(), formatFrameRate(), gridStyles(), headingStyles() (+10 more)

### Community 35 - "Voice Effects Panel"
Cohesion: 0.11
Nodes (13): ProjectStorageError, cloneStored(), commit(), FakeDatabase, FakeDatabaseState, FakeEventSource, fakeIndexedDb(), fakeKey() (+5 more)

### Community 36 - "Core UI Primitives"
Cohesion: 0.17
Nodes (14): Button, ButtonProps, ButtonSize, ButtonVariant, IconButton, IconButtonProps, OverlayPanelPlacement, OverlayPanelProps (+6 more)

### Community 37 - "Live Stage Notices"
Cohesion: 0.17
Nodes (12): VoiceServiceError, VoiceServiceFailureReason, isModelCompatible(), isProfessionalVoice(), summarizePublicVoice(), summarizeVoice(), VoiceService, ElevenLabsModel (+4 more)

### Community 38 - "Recording Control Panel"
Cohesion: 0.19
Nodes (13): actionRowStyles(), captureResolutionLabel(), captureSurfaceStyles(), detailsStyles(), disabledReasonStyles(), headingStyles(), recordActionStyles(), RecordingAvailability (+5 more)

### Community 39 - "Workspace Development Dependencies"
Cohesion: 0.11
Nodes (19): @axe-core/playwright, @eslint/js, fast-check, devDependencies, @axe-core/playwright, @eslint/js, fast-check, @playwright/test (+11 more)

### Community 40 - "Model Session Actions"
Cohesion: 0.17
Nodes (11): GuidedStageRecording, GuidedStageSession, StagePresentation, defaultPriority, deriveStageNotices(), noticePriority(), severityRank, StageNotice (+3 more)

### Community 41 - "Reference Image Validation"
Cohesion: 0.16
Nodes (13): ImageValidation, loadDimensions(), validateReferenceImage(), getImageQualityWarnings(), IMAGE_MIME_TYPES, ImageDescriptorCandidate, ImageMimeType, ImageQualityWarning (+5 more)

### Community 42 - "Recording Attempts and Artifacts"
Cohesion: 0.13
Nodes (15): GuidedFlowEffect, createRecordingGuidedFlowTelemetry(), GuidedFlowEventBase, GuidedFlowTelemetry, GuidedFlowTelemetryEvent, RecordingGuidedFlowTelemetry, GUIDED_PROJECT_SCHEMA_VERSION, GuidedFinalVariant (+7 more)

### Community 43 - "Media Stage Component Tests"
Cohesion: 0.13
Nodes (5): MediaStageProps, defaultProps, FakeStream, FakeTrack, idlePresentation

### Community 44 - "Capture Settings Panel"
Cohesion: 0.21
Nodes (14): CaptureDeviceOption, LocalCaptureProfileId, actualSettingsStyles(), bodyStyles(), CaptureSettingsPanel(), CaptureSettingsPanelProps, footerStyles(), introductionStyles() (+6 more)

### Community 45 - "Workspace Quality Scripts"
Cohesion: 0.12
Nodes (16): scripts, build, build:packages, dev, format, format:check, lint, quality (+8 more)

### Community 46 - "API Environment Bootstrap"
Cohesion: 0.09
Nodes (45): GuidedDownloadStage(), GuidedDownloadStageProps, allDoneGridStyles(), controlPanelStyles(), countdownStyles(), detailsGridStyles(), guidedHeaderStyles(), progressListStyles() (+37 more)

### Community 47 - "API TypeScript Configuration"
Cohesion: 0.13
Nodes (14): compilerOptions, composite, lib, noEmit, types, extends, include, DOM (+6 more)

### Community 48 - "Live Audio Metering"
Cohesion: 0.12
Nodes (14): environmentSchema, EnvironmentValidationError, optionalModelSchema, optionalSecretSchema, parseEnvironment(), portSchema, strictBooleanSchema, app (+6 more)

### Community 49 - "Voice Library Interface"
Cohesion: 0.14
Nodes (16): artifact(), processing, recording(), LOCAL_EFFECTS, LocalVoiceEffectId, VoiceEffectSelection, VoiceProcessingController, headingStyles() (+8 more)

### Community 50 - "Studio Theme Provider"
Cohesion: 0.19
Nodes (8): OverlayPanel, OverlayPanelBodyMode, HarnessProps, globalStyles(), StudioDesignProvider(), @emotion/react, StudioTheme, Theme

### Community 51 - "Web TypeScript Configuration"
Cohesion: 0.13
Nodes (14): compilerOptions, composite, jsx, jsxImportSource, noEmit, types, extends, include (+6 more)

### Community 52 - "Prompt Text Normalization"
Cohesion: 0.23
Nodes (6): extensionForMimeType(), isMissingPathError(), LocalReferenceImageAssetStore, readJson(), otherOwnerId, ownerId

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
Cohesion: 0.23
Nodes (10): createRecordingFilename(), filenameMode, formatDuration(), formatFileSize(), timestampForFilename(), isAudioMimeType(), isSupportedVoiceSidecarMimeType(), MimeSupportTest (+2 more)

### Community 57 - "Owned Local Media Streams"
Cohesion: 0.05
Nodes (44): digestPathSegment(), idempotencyMappingSchema, internalMetadataSchema, promptAuditSchema, ReferenceImageStorageError, StoreReferenceImageInput, ValidReferenceImageMimeType, boundedResultList() (+36 more)

### Community 58 - "Prompt Workshop Header"
Cohesion: 0.31
Nodes (10): PromptIntent, draftStatusStyles(), eyebrowStyles(), headerStyles(), intentHintStyles(), intentOptions, introStyles(), PromptWorkshopHeader() (+2 more)

### Community 59 - "Recording Hook Test Harness"
Cohesion: 0.21
Nodes (7): createSource(), createTrack(), installRecorderHarness(), RecorderHarness, RecorderListener, TrackOptions, FakeMediaStream

### Community 60 - "Provider Error Handling Tests"
Cohesion: 0.12
Nodes (22): GeneratedPromptPreview(), GeneratedPromptPreviewProps, previewCountStyles(), previewHeaderStyles(), previewLabelStyles(), previewStyles(), previewTextStyles(), actionsStyles() (+14 more)

### Community 61 - "Segmented Control Component"
Cohesion: 0.27
Nodes (10): buttonStyles(), controlStyles(), fullLabelStyles(), groupStyles(), SegmentedControl(), SegmentedControlProps, SegmentOption, segmentStyles() (+2 more)

### Community 62 - "Form Field Components"
Cohesion: 0.08
Nodes (60): GuidedCharacterBuilder(), GuidedCharacterBuilderProps, previewMontageStyles, profileLabels, StarterArtwork(), starterArtworkStyles(), ageChoiceFromDraft(), ageFromChoice() (+52 more)

### Community 63 - "Root Workspace Manifest"
Cohesion: 0.18
Nodes (10): engines, node, npm, name, private, type, version, workspaces (+2 more)

### Community 64 - "Domain Package Manifest"
Cohesion: 0.18
Nodes (10): exports, main, name, private, scripts, build, typecheck, type (+2 more)

### Community 65 - "Creative Asset Domain Types"
Cohesion: 0.09
Nodes (43): GuidedExperience(), GuidedExperienceProps, SendEvent, contentCardStyles(), guidedPageStyles(), guidedShellStyles(), guidedTopLineStyles(), projectListStyles() (+35 more)

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
Nodes (19): registerRealtimeRoutes(), verifyProviderOrigin(), canonicalLoopbackOrigin(), installLocalSecurityBoundary(), isLoopbackHostname(), localOwnerIdForRequest(), LOOPBACK_HOSTS, parseHostHeader() (+11 more)

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
Cohesion: 0.12
Nodes (33): AppliedRealtimeState, RecipeDraftReplacement, SessionDraft, hasPendingChanges(), imageIdentity(), imageIds, normalizePrompt, referenceIdentity() (+25 more)

### Community 75 - "Domain Build Configuration"
Cohesion: 0.22
Nodes (8): compilerOptions, types, exclude, extends, include, src/**/*.test.ts, src/**/*.ts, ../../tsconfig.base.json

### Community 76 - "Generated Prompt Preview"
Cohesion: 0.13
Nodes (17): decodeStrictBase64(), dimensionsForSize(), hasCanonicalBase64Shape(), inspectImage(), InvalidReferenceImageError, isBase64AlphabetCode(), mimeTypeForFormat(), ValidatedReferenceImage (+9 more)

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

### Community 81 - "Web Vite Configuration"
Cohesion: 0.38
Nodes (3): DEVELOPMENT_API_PROXY, DEVELOPMENT_OPTIMIZE_DEPS, rootPath

### Community 82 - "Prettier Formatting Configuration"
Cohesion: 0.40
Nodes (4): printWidth, semi, singleQuote, trailingComma

### Community 83 - "Application Favicon Artwork"
Cohesion: 0.50
Nodes (4): Dark Rounded-Square Application Favicon, Gold Circular Accent, Gold L-Shaped Glyph, Teal Rounded-Square Frame

### Community 84 - "Media Stream Diagnostics"
Cohesion: 0.19
Nodes (20): DEGRADED_STATE, DeletedProjectSnapshot, INITIAL_STATE, isRecord(), limitedText(), LocalProjectRepositoryOptions, nullableText(), projectCheckpoints (+12 more)

### Community 85 - "Cross-Repository Graph Merging"
Cohesion: 0.67
Nodes (4): Cached GitHub Clone, Cross-Repository Graph Merge, graphify reference: GitHub clone and cross-repo merge, Provenance-Preserving Monorepo Merge

### Community 91 - "Playwright Accessibility Testing"
Cohesion: 0.23
Nodes (13): ModelMode, emptyFeedback(), formatFileSize(), ImageFeedback, ReferenceImageField(), ReferenceImageFieldProps, StubURL, referenceFieldStyles() (+5 more)

### Community 93 - "ESLint Core Tooling"
Cohesion: 0.27
Nodes (10): connectClearEffect(), connectRobotEffect(), connectWarmEffect(), decodeAudioBlob(), getAudioContext(), getOfflineContext(), renderLocalEffect(), isMp4() (+2 more)

### Community 98 - "Jest DOM Matchers"
Cohesion: 0.29
Nodes (10): CharacterPreset, CharacterPresetPicker(), CharacterPresetPickerProps, characterPresets, presetButtonStyles(), presetDescriptionStyles(), presetLabelStyles(), presetListStyles() (+2 more)

### Community 99 - "React Testing Library"
Cohesion: 0.19
Nodes (10): audioContextConstructor(), AudioLevelState, connectedWithoutMeterState, measureLevel(), silentState, FakeAudioContext, FakeAudioStream, FakeAudioTrack (+2 more)

### Community 111 - "capture-guided-screenshots.screenshots.ts"
Cohesion: 0.17
Nodes (9): assertProviderFree(), CAPTURE_TIME, captureStableViewport(), settlePage(), STORY_IMAGE_ROOT, VIEWPORT, expectNoExternalProviderTraffic(), NetworkJourneyState (+1 more)

### Community 112 - "createLocalProjectRepository"
Cohesion: 0.20
Nodes (10): browserIndexedDb(), createLocalProjectRepository(), deleteProjectArtifacts(), IndexedDbProjectBackend, openProjectDatabase(), safeTimestamp(), sameArtifactIdentity(), fixture() (+2 more)

### Community 113 - "reference-image-provider.ts"
Cohesion: 0.16
Nodes (10): GeneratedReferenceImagePayload, isModerationFailure(), isOpenAIError(), normalizeOpenAIError(), OPENAI_REFERENCE_IMAGE_PARAMETERS, OpenAIClientFactory, OpenAIImageClient, ReferenceImageProviderError (+2 more)

### Community 114 - "Guided character video: creation to voiced download"
Cohesion: 0.12
Nodes (17): Accessibility and responsive behavior, Advanced Studio path, Completion criteria, Component boundaries, End state, Entry points, rollout, and compatibility, Failure and recovery behavior, Goal (+9 more)

### Community 115 - "projectRepository.test.ts"
Cohesion: 0.18
Nodes (3): createProjectObjectUrlRegistry(), ProjectObjectUrlRegistry, ProjectObjectUrlRegistryOptions

### Community 116 - "studioHarness.ts"
Cohesion: 0.14
Nodes (16): openGuidedCreate(), openFreshGuidedCreate(), assetIdForSequence(), BrowserJourneyState, canonicalPrompt(), createMockReferenceAsset(), createOptimizationResponse(), IMAGE_DIMENSIONS_BY_SIZE (+8 more)

### Community 117 - "voice-service.ts"
Cohesion: 0.09
Nodes (21): localHeaders, optimizedResult, options, CharacterPromptOptimizerError, CharacterPromptOptimizerFailureReason, containsRefusal(), isOpenAIError(), normalizeOpenAIError() (+13 more)

### Community 118 - "ElevenLabsHttpProvider"
Cohesion: 0.10
Nodes (28): StoredReferenceImageContent, createPromptOptimizationInputHash(), createReferenceImagePrompt(), createWorkshopPromptHash(), ReferenceImagePromptVersion, versionReferenceImagePrompt(), formatForMimeType(), GenerateReferenceImageInput (+20 more)

### Community 120 - "image-validation.ts"
Cohesion: 0.29
Nodes (3): signal(), ProviderError, ProviderFailureReason

### Community 122 - "MemoryProjectBackend"
Cohesion: 0.32
Nodes (3): cloneArtifact(), cloneProject(), MemoryProjectBackend

### Community 124 - "PromptFeedback.tsx"
Cohesion: 0.53
Nodes (5): PromptValidation, feedbackRootStyles(), issueListStyles(), PromptFeedback(), PromptFeedbackProps

### Community 125 - "ProjectBackend"
Cohesion: 0.24
Nodes (4): ProjectBackend, ProjectBackendSnapshot, ProjectArtifactRecord, ProjectRecordV1

### Community 126 - "LocalProjectRepository"
Cohesion: 0.33
Nodes (7): noticeActionStyles(), noticeCopyStyles, noticeDismissStyles(), noticeLayerStyles(), noticeStyles(), StageNoticeLayer(), StageNoticeLayerProps

### Community 128 - "recordingAttempt.ts"
Cohesion: 0.20
Nodes (5): drawerFor(), openDrawer(), REPRESENTATIVE_VIEWPORTS, StudioHarnessOptions, triggerProviderDisconnect()

### Community 129 - "Stage 1: Create a character"
Cohesion: 0.20
Nodes (10): Change gender without losing work, Choose visual characteristics, Continue with Prompt Only, Generate Reference & Continue, Keep Existing Reference, Profile-aware catalogs, Review the direction preview, Save and choose whether to generate a reference (+2 more)

### Community 130 - "FormControls.tsx"
Cohesion: 0.12
Nodes (24): optimizeCharacterReferencePrompt(), GuidedCreateStage(), GuidedCreateStageProps, primaryActionRowStyles(), referenceChoiceGridStyles(), referenceChoiceStyles(), sectionStackStyles(), DEFAULT_OPTIONS (+16 more)

### Community 131 - ".commit"
Cohesion: 0.31
Nodes (8): abortTransaction(), artifactRecord(), assertExpectedRevision(), recordForCommit(), validateArtifact(), validateCommit(), validId(), CheckpointCommit

### Community 132 - "Capability and recovery boundaries"
Cohesion: 0.22
Nodes (8): Capability and recovery boundaries, Completion criteria, End-to-end steps, Failure and alternate paths, Starting state, User story, UX investigation cues, What never happens automatically

### Community 133 - "Configure capture settings"
Cohesion: 0.25
Nodes (7): Completion criteria, Configure capture settings, End-to-end steps, Failure and alternate paths, Starting state, User story, UX investigation cues

### Community 134 - "Virtual try-on session"
Cohesion: 0.25
Nodes (7): Completion criteria, End-to-end steps, Failure and alternate paths, Starting state, User story, UX investigation cues, Virtual try-on session

### Community 136 - "Character workshop and reference generation"
Cohesion: 0.25
Nodes (7): Character workshop and reference generation, Completion criteria, End-to-end steps, Failure and alternate paths, Starting state, User story, UX investigation cues

### Community 137 - "Recipe Shelf"
Cohesion: 0.25
Nodes (7): Completion criteria, End-to-end steps, Failure and alternate paths, Recipe Shelf, Starting state, User story, UX investigation cues

### Community 138 - "Local voice treatments"
Cohesion: 0.25
Nodes (7): Completion criteria, End-to-end steps, Failure and alternate paths, Local voice treatments, Starting state, User story, UX investigation cues

### Community 139 - "ElevenLabs voice workflow"
Cohesion: 0.25
Nodes (7): Completion criteria, ElevenLabs voice workflow, End-to-end steps, Failure and alternate paths, Starting state, User story, UX investigation cues

### Community 140 - "ReferenceImagePreview.tsx"
Cohesion: 0.12
Nodes (39): createEmptyCreativeAssetStore(), count(), isRecord(), normalizedId(), nullableDate(), parseCreativeAssetStore(), readTags(), referenceImageAssetId() (+31 more)

### Community 142 - "Local camera capture"
Cohesion: 0.29
Nodes (7): Completion criteria, End-to-end steps, Failure and alternate paths, Local camera capture, Starting state, User story, UX investigation cues

### Community 143 - "Character AI session"
Cohesion: 0.29
Nodes (7): Character AI session, Completion criteria, End-to-end steps, Failure and alternate paths, Starting state, User story, UX investigation cues

### Community 144 - "Take review and cleanup"
Cohesion: 0.29
Nodes (7): Completion criteria, End-to-end steps, Failure and alternate paths, Starting state, Take review and cleanup, User story, UX investigation cues

### Community 145 - "useVoiceProcessing.test.tsx"
Cohesion: 0.15
Nodes (10): MediaStreamDescriptor, MediaTrackDescriptor, RecordableStreamMetadata, SessionLifecycleStatus, LOCAL_MODE_ID, LocalSessionMode, MODEL_MODE_IDS, ModelSessionMode (+2 more)

### Community 146 - "Verification coverage"
Cohesion: 0.40
Nodes (5): Character model and catalogs, Product quality gates, Save and reference decisions, Verification coverage, Workflow, media, and persistence

### Community 148 - "AudioLevelMeter"
Cohesion: 0.28
Nodes (12): createOptimizerReferenceOptions(), createWorkshopOptimizationKey(), DEFAULT_WORKSHOP_REFERENCE_PREFERENCES, isOneOf(), isRecord(), loadWorkshopReferencePreferences(), normalizeWhitespace(), normalizeWorkshopReferenceOptions() (+4 more)

### Community 151 - "VoiceLibrary.tsx"
Cohesion: 0.39
Nodes (7): libraryOptions, pageStyles(), searchButtonStyles(), searchFormStyles(), stackStyles(), VoiceLibrary(), VoiceLibraryProps

### Community 152 - "GuidedChoiceDrawer.tsx"
Cohesion: 0.48
Nodes (6): GuidedChoiceDrawer(), GuidedChoiceDrawerProps, choiceDrawerContentStyles(), choiceDrawerStyles(), choiceDrawerSummaryStyles(), choiceSectionStyles()

### Community 153 - "FormControls.tsx"
Cohesion: 0.24
Nodes (5): SelectField, SelectFieldProps, SharedFieldProps, TextAreaFieldProps, TextFieldProps

### Community 154 - "VoiceEffectsPanel.test.tsx"
Cohesion: 0.33
Nodes (4): createOriginal(), createRecording(), emptyPage, voiceApi

### Community 155 - "ReferenceImagePreview.tsx"
Cohesion: 0.48
Nodes (6): frameStyles(), largePreviewStyles(), placeholderStyles(), referenceImageContentUrl(), ReferenceImagePreview(), ReferenceImagePreviewProps

### Community 156 - "sanitation.ts"
Cohesion: 0.47
Nodes (5): normalizeAssetName(), normalizeAssetNotes(), normalizeAssetText(), normalizePromptText(), normalizeTags()

### Community 158 - "useVoiceProcessing.test.tsx"
Cohesion: 0.47
Nodes (5): adapters, Deferred, originalArtifact(), readySidecar(), recordingController()

### Community 159 - "describeStream"
Cohesion: 0.50
Nodes (4): describeStream(), formatFrameRate(), isFinitePositive(), trackSettings()

### Community 160 - "characterReferencePromptHashInput"
Cohesion: 0.83
Nodes (3): hashWorkshopPrompt(), isSameCanonicalWorkshopPrompt(), characterReferencePromptHashInput()

### Community 161 - "reference-image.ts"
Cohesion: 0.50
Nodes (3): CHARACTER_REFERENCE_PROMPT_TEMPLATE_VERSION, CharacterReferencePromptFraming, framingInstructions

## Knowledge Gaps
- **657 isolated node(s):** `semi`, `singleQuote`, `trailingComma`, `printWidth`, `name` (+652 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Button` connect `Core UI Primitives` to `Creative Recipe Shelf`, `Creative Asset Domain Types`, `FormControls.tsx`, `Media Session Composer`, `Take Review Dock`, `Prompt Authoring Model`, `Recording Control Panel`, `Voice Preview List`, `Capture Settings Panel`, `Prompt Workshop Actions`, `API Environment Bootstrap`, `ReferenceImagePreview.tsx`, `Voice Library Interface`, `VoiceLibrary.tsx`, `Prompt Workshop Header`, `Playwright Accessibility Testing`, `Provider Error Handling Tests`, `Form Field Components`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `@playwright/test` connect `Accessibility Responsive Testing` to `recordingAttempt.ts`, `End-to-End TypeScript Configuration`, `capture-guided-screenshots.screenshots.ts`, `studioHarness.ts`, `Studio Screenshot Scenarios`, `Studio Journey Testing`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `createCreativeAssetRepository()` connect `Creative Asset Repository` to `Creative Asset Operations`, `Creative Asset Domain Types`, `Studio Application Shell`, `Model Session Actions`, `ReferenceImagePreview.tsx`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `CharacterPromptWorkshop()` (e.g. with `createReferenceOptimizationState()` and `createStepMap()`) actually correct?**
  _`CharacterPromptWorkshop()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `GuidedExperience()` (e.g. with `createEmptyGuidedDesign()` and `project()`) actually correct?**
  _`GuidedExperience()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `StudioExperience()` (e.g. with `draft()` and `referenceImageAssetId()`) actually correct?**
  _`StudioExperience()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `semi`, `singleQuote`, `trailingComma` to the rest of the system?**
  _657 weakly-connected nodes found - possible documentation gaps or missing edges._