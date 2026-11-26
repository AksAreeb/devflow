# Worst-case catalogue

Version 2026-11-26. Written for devflow. Used in step 15 to build one fixture of data that is unpleasant but real.

Two rules for using it. Every value must be something a real user or a real integration could produce, within the limits the surface map found, so never use random strings. And spread the cases across rows, so that one screen shows many of them at once and no single row is absurd.

Pick from each group that applies to the screen. Skip a group the screen has nothing of.

## People and names

| Case | Example | What it tends to break |
|------|---------|------------------------|
| Very long name | Wilhelmina Featherstonehaugh-Cholmondeley | Rows, cards, avatars pushed out of shape |
| Shortest name | Bo Li, or the single letter A | Initials logic, minimum widths |
| Accents and marks | Zoë Łukasiewicz, Nguyễn Thị Ánh | Clipped marks, sorting, search |
| No spaces between words | 山田太郎 | Wrapping, initials |
| Right-to-left script | محمد العبدالله | Alignment, mixed-direction rows |
| Apostrophes and particles | Seán O'Brien, Ludwig van der Berg | Escaping, capitalization logic |
| Emoji in the name | 🌟 Starr | Initials, truncation mid-character |
| Stray spaces | two spaces inside, one trailing | Trimming, duplicate detection |
| No name at all | empty, or only whitespace | Placeholder handling |
| Two people with the same name | identical display names | Anything keyed on the name |

## Emails, links and identifiers

| Case | Example | What it tends to break |
|------|---------|------------------------|
| Long address with no break point | a 60-character local part at a long domain | Overflow in rows and tables |
| Shortest valid address | a@b.co | Minimum widths |
| Plus addressing | pat+rentals@example.com | Validation that rejects valid mail |
| Long URL | a deep path with a query string | Overflow, truncation with no way to read it |
| Opaque identifier | a UUID | Columns sized for short ids |
| Awkward file name | Scan 2026-11-03 (final) [v2].pdf | Escaping, truncation hiding the extension |

## Labels and copy

| Case | Example | What it tends to break |
|------|---------|------------------------|
| Long title | a 12-word listing title | Card height, line clamps |
| Long single word | Rechtsschutzversicherungsgesellschaften | Overflow where wrapping needs a space |
| Translated text | the same label about 40% longer | Buttons, tabs, table headers |
| Many tags | twelve tags on one item | Wrapping, overflow menus |
| One very long tag | a 40-character tag | Chips with fixed heights |
| Markup as text | `<b>bold</b>` and `**bold**` typed by a user | Unescaped rendering |
| Line breaks in a single-line field | a title containing a newline | Layout, CSV export |
| Very long body | 2,000 characters | Expanders, page length |
| Empty title | untitled, or whitespace only | Empty links, zero-height rows |

## Numbers and money

| Case | Example | What it tends to break |
|------|---------|------------------------|
| Zero | 0 units, CAD 0.00 | Empty-state logic, division |
| One | 1 unit | Plurals ("1 units") |
| Thousands | 1,284 | Separators |
| Very large | 1,000,000 and CAD 12,500,000.00 | Badge and column widths |
| Negative | a credit of CAD 150.00 | Sign and colour handling |
| Fractions of a cent | 0.1 + 0.2 | Rounding, totals that do not add up |
| Out of range | 104%, or -3% | Progress bars, charts |
| Missing | null, undefined, not a number | "NaN" or "undefined" on screen |
| Changing live | a counter that ticks | Digits that jitter in width |

## Collections

| Case | What it tends to break |
|------|------------------------|
| Nothing | No designed empty state |
| Exactly one item | Layouts built for grids, "1 results" |
| One full page, and one full page plus one | Pagination edges |
| A thousand or more | Rendering time, scroll, memory |
| One item far larger than the others | Row height, alignment |

## Dates and time

| Case | What it tends to break |
|------|------------------------|
| Just now | "0 minutes ago" |
| Days, months and years ago | Relative-time wording |
| In the future | Labels that assume the past |
| The zero date, 1 January 1970 | A missing value shown as a date |
| Near midnight in another time zone | The wrong day shown |
| A very long duration | Formatting built for minutes |

## Images and media

| Case | What it tends to break |
|------|------------------------|
| Image fails to load | A broken-image icon, collapsed layout |
| No image set | Missing fallback |
| Extremely wide, and extremely tall | Cropping, stretched thumbnails |
| Transparent or dark logo | Invisible on one theme |
| Slow to load | Layout jumping as it arrives |

## States

| Case | What it tends to break |
|------|------------------------|
| Loading | A blank screen, or a spinner that never ends |
| The request fails | No message, no way to retry |
| Partial data | A section that assumes every field is present |
| Every status at once | Colours and labels never seen side by side |
| No permission | Controls shown that do nothing |
| The current user in their own list | Self-referring actions such as "remove" |

## Environment

| Case | What it tends to break |
|------|------------------------|
| 320 pixels wide | Horizontal scrolling, overlapping controls |
| A narrow container on a wide screen | Components that sized to the viewport |
| Very wide screen | Lines of text too long to read, stretched layouts |
| Zoomed to 200% | Clipped text, lost controls |
| Dark theme | Hard-coded colours |
| Right-to-left layout | Mirrored icons and spacing |
| Touch only | Actions that appear only on hover |
| Slow network and slow processor | Double submits, stale responses arriving late |
