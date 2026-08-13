import { useEffect, useRef, useState } from 'react';
import type { RecentOutfit } from './ExistingVideoVisualEditor';
import type { ExistingVideoWorkflow } from './useExistingVideoWorkflow';

export const useRecentExistingVideoOutfits = (workflow: ExistingVideoWorkflow) => {
  const [recentOutfits, setRecentOutfits] = useState<readonly RecentOutfit[]>([]);
  const acceptedRecentKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const acceptedStep = workflow.steps[0];
    if (
      !workflow.acceptedSubmission ||
      acceptedStep?.modelId !== 'lucy-vton-latest' ||
      acceptedStep.inputKind !== 'reference-image' ||
      !acceptedStep.referenceImage
    ) {
      return;
    }
    const file = acceptedStep.referenceImage;
    const key = `${acceptedStep.id}:${file.name}:${file.size}:${file.lastModified}`;
    if (acceptedRecentKeyRef.current === key) return;
    acceptedRecentKeyRef.current = key;
    setRecentOutfits((current) =>
      [
        { id: crypto.randomUUID(), file },
        ...current.filter(
          (item) =>
            `${item.file.name}:${item.file.size}:${item.file.lastModified}` !==
            `${file.name}:${file.size}:${file.lastModified}`,
        ),
      ].slice(0, 12),
    );
  }, [workflow.acceptedSubmission, workflow.steps]);

  return {
    clearRecentOutfits: () => setRecentOutfits([]),
    recentOutfits,
  };
};
