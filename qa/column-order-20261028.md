# Column order browser verification — 2026-10-28

Verified against [the local Documents preview](http://127.0.0.1:5173/documents/all), with the Vite frontend, FastAPI backend, an isolated temporary SQLite database and twelve demo documents. Disposable Administrator, second Administrator and read-only Guest fixtures were used. No production accounts or records were accessed.

Migration `20261028_29` applied successfully over `20261028_28`, preserving the previously saved visibility preferences and initializing empty custom orders. The final API restart also loaded the expected-account guard used by the frontend preferences requests.

Browser: Google Chrome through the connected browser tool. Default viewport: 2169 × 1289. Additional viewport checks: 375 × 600 and 800 × 420. Light and dark themes were visually inspected. Temporary viewport overrides were reset after testing.

| Check | Result |
| --- | --- |
| Pointer drag | Dragging the Date grip moved it across headers and into the first data-column position. A subsequent Document Type drag also moved it to first. |
| Header/body alignment | Every row's `data-column-field` sequence matched the heading sequence after movement; cell values remained paired with their fields. |
| Drag does not sort | The register sort URL stayed unchanged after column drags. |
| Drag does not open chooser | Completed pointer drag left Columns closed. |
| Grip click / Enter | Both opened Columns for the corresponding column. |
| Keyboard order | Alt+Left moved Document Type; focus remained on its grip after saving. |
| Chooser arrows | Move Document Title left changed the order and retained focus on the move button. |
| Hidden-column slot | Document Title was hidden; moving visible Document Type left preserved the hidden column's full-order slot. Showing Document Title restored it in that slot. |
| Browser reload | Custom order was restored after a full reload. |
| New tab | A newly opened local tab restored the same custom order. |
| Logout / login | Returning to the original Administrator restored its custom order after using other accounts. |
| Same-role isolation | A second Administrator initially saw the default order, saved its own Document Title-first order and retained it after reload; the original Administrator's Document Type-first order remained intact. |
| Read-only account | Guest saved Initiator before Document Type using Alt+Left and retained that order after reload. Document editing remained unavailable. |
| Reset order | Guest's reset restored default order while keeping Document Title and Date hidden. |
| Register independence | Documents retained Document Type-first order; Workflow saved Document Title before Document Number; Transmittal saved Document Type before Date. Existing Workflow Date and Transmittal Discipline visibility choices were retained. |
| Existing sort | Document Number sort updated `aria-sort` and the URL without changing the column order. |
| Existing selection | Select page selected all twelve rows. |
| Existing row reorder | The separate row grip moved the first record below the second without changing the column order. |
| Existing resize | Date resized from 110 px to 140 px using its resize grip without changing order or opening Columns. |
| Failed order save | With the isolated API stopped, Alt+Left on Date left the previous order unchanged and displayed “Could not save your column settings. Request failed with status code 500”. |
| API restart | Restarting the API and reloading retained the last successfully saved order; the failed move was not applied. |
| Dark / narrow view | Reordered headings, chooser checkboxes and movement arrows were readable; at 375 × 600 the chooser stayed within the viewport. |
| Short viewport | At 800 × 420, chooser top was 72 px below a topbar ending at 64 px, bottom was 412 px; the list scrolled internally (223 px client height / 368 px content). Title, Close and footer remained reachable. |

Screenshots were inspected during the pointer, light/dark and responsive checks. One Chrome tab stopped accepting all page input (including theme and ordinary Tab focus); a fresh local tab with the same account restored input. The apparent Guest chooser failure did not reproduce there and required no product change.

The local preview servers were left running for review. This is not the production deployment. Backend regression tests, account-guard mismatch cases and frontend build/lint are reported separately. Physical touch devices, other browser engines and a complete screen-reader audit were not exercised in this browser pass.
