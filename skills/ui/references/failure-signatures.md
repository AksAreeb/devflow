# Failure signatures

Version 2026-11-26. Written for devflow. Used by the verifier in step 15 to read screenshots of the worst-case fixture.

Each row is something visible in a screenshot, the usual cause, and the usual fix. Use it to name the cause in a finding, not as a replacement for looking. The causes are the common ones in flexbox and grid layouts, so check the code before reporting.

| What you see | Usual cause | Usual fix |
|--------------|-------------|-----------|
| An avatar or icon squashed into an oval | A flex child allowed to shrink | Stop it shrinking (`flex-shrink: 0`) |
| Text running out of its box | A flex or grid child that will not go below its content width | Let it shrink (`min-width: 0`) and decide between wrapping and truncating |
| A long email or URL pushing the row wide | No break opportunity in the string | Allow breaks anywhere (`overflow-wrap: anywhere`) |
| The action at the end of a row pushed off screen | The middle of the row cannot shrink | Let the middle shrink, keep the action fixed |
| A badge or chip wrapped onto two lines | No rule against wrapping inside it | Keep it on one line and let the row handle overflow |
| Items in a row no longer lined up | Alignment that depends on equal heights | Align explicitly instead of relying on content |
| The last row or line cut off | A fixed height on a container holding variable content | Let content set the height |
| A word broken in the middle for no reason | Breaking allowed everywhere | Break only when a word cannot fit |
| Wrong or broken initials | Taking the first code unit, not the first character | Split by grapheme, and skip suffixes and particles |
| A lone dash or "undefined" where a value should be | A missing value passed straight to the screen | Give missing values a designed placeholder |
| "1 members", "0 result" | Plurals built by adding "s" | Use the platform's plural rules |
| Numbers that shift sideways as they change | Proportional digits | Tabular figures for anything that updates or lines up |
| "1284" or "12500000.5" | A number printed without formatting | The platform's number and currency formatter |
| A translated label overflowing its button | A width fixed for the English text | Size to content, with a sensible minimum |
| The tops of accented letters clipped | Line height too tight for the font | Loosen the line height |
| A broken-image icon | No fallback when an image fails | An error fallback and a reserved space |
| Truncated text with no way to read the rest | Truncation with no title, expander or detail view | Give the full text a home |
| A list that stutters when scrolled | Thousands of nodes rendered at once | Paginate or virtualize |
| Tags or stars rendered as formatting | User text treated as markup | Escape it once, at output |
| Content jumping as the page loads | Images or late data with no reserved space | Reserve the space up front |
| Two records after one click | No guard against a second submit | Disable on submit, or make the action idempotent |
| Old results replacing new ones | Responses arriving out of order | Ignore or cancel stale requests |

## Severity

| Severity | Meaning |
|----------|---------|
| **Blocking** | Content cannot be read, an action cannot be reached, or the data shown or saved is wrong |
| **Should-fix** | It looks broken but still works |
| **Nit** | It would break with slightly worse data than the fixture has |

Some findings are choices that belong to the person, such as whether a long title truncates or wraps. List those separately with a recommendation and do not decide them.
