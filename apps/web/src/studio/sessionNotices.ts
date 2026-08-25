/**
 * The two sentences a Studio session owes the operator, owned once because several surfaces say
 * them. This module deliberately imports nothing: the capture panel, the help explainer, the exit
 * guard, the logout dialog and the expiry notice all reach it, and they sit on both sides of the
 * `studio` / `features` boundary.
 */

/**
 * What leaving costs.
 *
 * The exit guard, the logout dialog and the session-expiry notice each used to recite their own
 * five-item list of internal work kinds — the same fact told three ways, and three places to keep
 * in step.
 */
export const UNSAVED_WORK_DISCARD_NOTICE =
  'Anything you have not saved is discarded, including the current take. Everything you have already saved stays where it is.';

/**
 * What a session keeps. The session and device column states it where there is room; the help
 * explainer states it everywhere else, including the layouts that column does not reach.
 */
export const LOCAL_RETENTION_NOTICE =
  'Prompts and generated references persist locally. Manual uploads and takes stay temporary until you save them.';
