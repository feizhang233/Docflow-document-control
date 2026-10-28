# Code cleanup regression verification — 2026-10-28

Local review: [Documents register](http://127.0.0.1:5173/documents/all). Verification used Chrome, the local Vite/FastAPI preview and the existing isolated SQLite database with twelve demo documents and disposable accounts. No production data or services were accessed.

## Read-only audit

- The TypeScript import graph, including lazy `import()` routes, reached every application source module. `main.tsx` and `vite-env.d.ts` were intentional entrypoints; no dead component/file deletion was justified.
- `@tanstack/react-table` had no source/test/config usage. `date-fns` remained used by the drawer, access panel and notifications.
- Unused API/helper and legacy CSS candidates were checked against source strings, import/template usage and dynamic class prefixes before being reported to the root agent. Dynamic density, project, feedback-status and dialog-tone classes were retained. Mixed live/dead selector groups required preserving the live arms.

## Browser regression results

| Check | Result |
| --- | --- |
| Session restore / fresh login / reopen | Saved sign-in restored after cleanup; fresh login and a newly opened register tab worked without losing stored preferences. |
| Automatic recovery | A temporary launcher shortened only access JWT expiry to five seconds. Protected requests recovered successfully through the extracted HTTP client; the inspected log included parallel 401 responses sharing one successful refresh and successful retries. Eight successful refreshes and zero failed refreshes were counted at the checkpoint. |
| Header drag | Actual pointer drag changed the saved order; headings and every body row retained the same field sequence. Sort state stayed unchanged and Columns did not open spuriously. |
| Chooser / persistence | Heading right-click opened the extracted chooser. Hidden Document Title and custom order survived reload. Reset order preserved hidden state; Show all restored the column. |
| Row controls | Select page selected all twelve records. Row menu actions rendered. Delete confirmation opened and Cancel closed it without deleting data. Edit modal opened and closed without changes. |
| Read-only account / isolation | Guest retained its separate hidden Document Title/Date settings, saved and reloaded its own keyboard column order, and had no edit controls or Settings link. Document details rendered with disabled progress controls. |
| Visual regression | Dark register and confirmation dialog, light editor/settings/dashboard and their active styles were inspected. Settings retained ten column cards; dashboard retained four metric cards and live lists. No missing live-style regression was found. |
| Narrow / short viewport | At 375 × 600 the chooser stayed within the viewport. At 800 × 420 its top was 72 px, below the topbar ending at 64 px; bottom was 412 px and the checkbox list scrolled internally. Temporary viewport overrides were reset. |
| Final normal configuration | The API was restored to normal 30-minute access tokens and a 24-hour session setting. Reload recovered without a login form; Guest permissions remained intact. No browser console errors were reported on the final tab. |

Vite required one restart after `useAuth.tsx` became `useAuth.ts`: its existing development module graph still resolved the deleted extension. A clean preview startup resolved this without product changes. The previously observed Chrome tab input issue after an account switch was handled with a fresh local tab; no product change was required.

The normal local API and frontend were left running for review. This is not a production deployment. Backend tests, frontend auth tests, build/lint and strict static audit are reported separately by the root agent. Other browser engines, physical devices, a full screen-reader audit and an actual 24-hour wait were outside this regression pass.
