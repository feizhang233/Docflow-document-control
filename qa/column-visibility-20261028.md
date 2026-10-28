# Column visibility browser verification — 2026-10-28

Verified against the local Vite frontend and FastAPI backend, using an isolated temporary SQLite database, disposable Administrator and built-in read-only Guest fixtures, and twelve demo documents. No production data or accounts were accessed. All Alembic migrations through `20261028_28` applied successfully to the isolated database.

Browser: Codex in-app browser (Chromium). Default viewport: 1280 × 720. Additional viewport checks: 375 × 600 and 800 × 420. Light and dark themes were visually inspected; temporary viewport overrides were reset after testing.

Local review preview: [Documents register](http://127.0.0.1:5173/documents/all). The local frontend and isolated API were left running for review. This is not the production deployment.

| Check | Result |
| --- | --- |
| Right-click a data-column heading | Opens Columns with the matching Hide action and checkboxes for all ten available data columns. |
| Hide a column | Corresponding heading and row cells disappear. Sorting controls for remaining columns remain available. |
| Reload the page | Previously hidden column stays hidden after data finishes loading. |
| Open the register in another browser tab | Saved account preference is restored. |
| Restart the local API | Saved preferences remain after restart and page reload. |
| Independent registers | Documents: Document Title hidden; Workflow: Date hidden; Transmittal: Discipline hidden. Choices remained independent and survived reloading. |
| Separate accounts | After signing out of Administrator and into Guest, Administrator's hidden Document Title did not carry over. Signing back into Administrator restored its own saved choice. |
| Read-only account | Guest can hide its own Initiator column and retain the choice after reload; document editing remains unavailable. |
| All data columns hidden | Columns remains reachable after reload; Show all restores all ten data columns with one save. |
| Keyboard context menu | Shift+F10 on Document Title opens Columns and focuses that column's checkbox. |
| Keyboard save/focus | Space saves a checkbox change; focus returns to that checkbox after saving. Tab reaches the next checkbox and Space saves it. Rechecked after focus hardening. |
| Show all focus | When Show all becomes disabled after completion, focus moves to the first checkbox. |
| Escape after hiding the invoking heading | Chooser closes and focus returns to the persistent Columns button when the original heading has disappeared. |
| Dark theme | Checkbox labels, current-column action, Show all, boundaries and focus indicators are readable. |
| Narrow viewport (375 × 600) | Chooser stays within viewport; all checkbox choices and footer are reachable. |
| Short viewport (800 × 420) | After the clearance fix, chooser top is 72 px below a topbar ending at 64 px, bottom is 412 px. Title/Close and footer stay visible; checkbox list scrolls internally (223 px client height / 368 px content height). |

Screenshots were inspected during the light, dark, narrow and short viewport checks. A discovered short-viewport overlap with the sticky topbar was fixed and rechecked successfully.

Limits: local Chromium verification only. Production deployment, physical touch devices, other browser engines, a full screen-reader audit and simulated slow/offline network failures were not exercised in this browser pass. Backend regression tests and frontend build/lint are reported separately.
