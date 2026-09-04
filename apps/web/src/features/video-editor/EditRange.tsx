import { useTheme } from '@emotion/react';
import { formatVideoEditTime } from './types';
import { rangeFieldStyles } from './VideoEditWorkspace.styles';

export type EditRangeProps = Readonly<{
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step?: number;
  /** How the current value reads beside the label; time by default for coarse steps, else the number. */
  format?: (value: number) => string;
  onStart: () => void;
  onChange: (value: number) => void;
  onCommit: () => void;
}>;

/**
 * A slider whose whole gesture is one undo entry: `onStart` opens the transaction on the first
 * pointer or key contact, `onChange` previews, and `onCommit` closes it on release or blur.
 */
export const EditRange = ({
  label,
  value,
  minimum,
  maximum,
  step = 1,
  format,
  onStart,
  onChange,
  onCommit,
}: EditRangeProps) => {
  const theme = useTheme();
  return (
    <label css={rangeFieldStyles(theme)}>
      <span>
        <span>{label}</span>
        <output>{format ? format(value) : step >= 10 ? formatVideoEditTime(value) : value}</output>
      </span>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        aria-label={label}
        onPointerDown={onStart}
        onKeyDown={(event) => {
          if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
            onStart();
          }
        }}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onPointerUp={onCommit}
        onPointerCancel={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
    </label>
  );
};
