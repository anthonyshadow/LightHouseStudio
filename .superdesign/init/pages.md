# Page and feature dependency trees

## `/` — provider-free entry

Entry: `apps/web/src/app/EntryPage.tsx`

- `apps/web/src/app/EntryPage.tsx`
  - `apps/web/src/ui/primitives/Button.tsx`
  - `apps/web/src/ui/StudioDesignProvider.tsx`
  - `apps/web/src/ui/theme.ts`

## `/studio` — persistent Studio runtime

Entry: `apps/web/src/studio/StudioApp.tsx`

- `apps/web/src/studio/StudioApp.tsx`
  - `apps/web/src/studio/CreativeWorkspace.tsx`
  - `apps/web/src/studio/StudioHeader.tsx`
  - `apps/web/src/features/live-stage/MediaStage.tsx`
  - `apps/web/src/features/character-builder/CharacterBuilderCoordinator.tsx`
    - `apps/web/src/features/character-builder/CharacterBuilderPanel.tsx`
      - `apps/web/src/ui/primitives/OverlayPanel.tsx`
        - `apps/web/src/ui/primitives/OverlayPanel.styles.ts`
        - `apps/web/src/ui/primitives/overlayStack.ts`
      - `apps/web/src/features/character-builder/CharacterBuilderForm.tsx`
        - `apps/web/src/features/character-builder/CharacterDirectionPreview.tsx`
        - `apps/web/src/features/character-builder/CharacterChoiceDrawer.tsx`
        - `apps/web/src/features/character-builder/CharacterVisualChoiceSection.tsx`
        - `apps/web/src/features/character-builder/catalog.ts`
        - `apps/web/src/features/character-builder/characterModel.ts`
        - `apps/web/src/features/character-builder/formStyles.ts`
      - `apps/web/src/features/character-builder/BuilderReferenceImageField.tsx`
      - `apps/web/src/features/character-builder/ReferenceOptionsFields.tsx`
      - `apps/web/src/features/character-builder/CharacterNameDialog.tsx`
      - `apps/web/src/features/character-builder/RegenerationDialog.tsx`
      - `apps/web/src/features/character-builder/styles.ts`
      - `apps/web/src/ui/primitives/Button.tsx`
      - `apps/web/src/ui/primitives/FormControls.tsx`
      - `apps/web/src/ui/primitives/ImagePickerDropField.tsx`
      - `apps/web/src/ui/primitives/StatusNotice.tsx`
  - `apps/web/src/ui/StudioDesignProvider.tsx`
  - `apps/web/src/ui/theme.ts`

The rendered Character builder is a two-column form + sticky preview above 64rem and a single
column at and below 64rem. Option cards collapse from six to three to two columns. Its action
footer becomes a two-column grid below 40rem.
