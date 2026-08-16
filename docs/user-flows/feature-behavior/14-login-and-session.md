# Login and local session

## Story

As the local operator, I can log in to the loopback Studio, restore that session after closing the
browser for up to 24 hours, and log out with temporary work safely cleaned up.

## Observable behavior

1. `/` loads without mounting Studio, requesting media, fetching capabilities, or contacting a
   provider. **Log in** opens the shared accessible dialog.
2. Development may prefill both configured demo credentials. Production never returns or displays
   that prefill. The password field clears when the dialog closes or login succeeds.
3. Incorrect credentials return one generic error. Correct credentials establish an HTTP-only
   cookie and navigate to Dashboard in the same lazy Studio runtime.
4. Direct access to Dashboard, Create, a Project workspace, Campaign, or Assets route restores
   through `/api/auth/me`. An absent, invalid, revoked, or expired session returns to `/`, offers
   Login, and preserves the recognized destination for post-login return.
5. The 24-hour cookie can survive browser closure; it never enters browser storage or a URL.
6. **Log out** is blocked while recording/finalization cannot be abandoned. Discardable work asks
   for confirmation, then cleanup cancels temporary work, releases media, clears user caches,
   revokes the session, and returns to `/`.

## Acceptance checks

- Keyboard focus is trapped in Login, errors are announced, Escape/close returns focus, and the
  submit target remains usable at all canonical viewports and 200% text.
- Private APIs reject no-cookie and tampered-cookie requests; mutations also reject an untrusted
  Origin. Cross-owner resource requests reveal neither existence nor paths.
- Login failure logs no credentials, cookies, JWTs, or raw request bodies.

## Limits

This is one seeded local user, not signup, recovery, multi-user tenancy, public authentication, or
a remote deployment. In default `local` and `shadow` modes, restarting the broker invalidates its
process-memory session records. In authoritative `neon` mode, the same owner-scoped session and
revocation records survive restart; this durability does not make the seeded login public-ready.
