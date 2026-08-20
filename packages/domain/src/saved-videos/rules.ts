/**
 * The longest a Saved Video title may be.
 *
 * A product invariant, not a transport one: it is what every rule below truncates against, and
 * `savedVideoTitleSchema` states the same bound at the HTTP boundary.
 */
export const SAVED_VIDEO_TITLE_MAX_LENGTH = 120;

const removeControlCharacters = (value: string): string =>
  [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('');

export const normalizeSavedVideoTitle = (value: string): string => {
  const normalized = removeControlCharacters(value).replaceAll(/\s+/gu, ' ').trim();
  return normalized.slice(0, SAVED_VIDEO_TITLE_MAX_LENGTH) || 'Untitled video';
};

/**
 * What a Project proposes to call the Saved Video taken from its current state.
 *
 * Naming an output after its Project alone sent every save from one Project to the library under
 * one name, so the proposal also carries the change it was taken from — the number History reports
 * for the same output as "Saved at change N". Derived only from state already in hand: no clock,
 * no counter and no request, so one Project state always proposes the same name.
 */
export const defaultProjectOutputTitle = (project: {
  readonly title: string;
  readonly currentRevisionNumber: number;
}): string => {
  const suffix = ` · change ${project.currentRevisionNumber}`;
  const base = project.title.trim();
  const room = SAVED_VIDEO_TITLE_MAX_LENGTH - suffix.length;
  return `${base.length > room ? `${base.slice(0, room - 1).trimEnd()}…` : base}${suffix}`;
};
