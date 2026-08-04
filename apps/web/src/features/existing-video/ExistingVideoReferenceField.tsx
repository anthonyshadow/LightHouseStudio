import {
  ReferenceImageInputField,
  type ReferenceImageInputFieldProps,
} from '../reference-images/ReferenceImageInputField';
import type { ExistingVideoStep } from './useExistingVideoWorkflow';

export interface ExistingVideoReferenceFieldProps extends Omit<
  ReferenceImageInputFieldProps,
  'kind'
> {
  readonly modelId: ExistingVideoStep['modelId'];
}

/** @deprecated Use the neutral shared ReferenceImageInputField for new flows. */
export const ExistingVideoReferenceField = ({
  modelId,
  ...props
}: ExistingVideoReferenceFieldProps) => (
  <ReferenceImageInputField {...props} kind={modelId === 'lucy-latest' ? 'character' : 'garment'} />
);
