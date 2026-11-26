# Interface checklist

Version 2026-11-26. Written for devflow. Applied by the verifier in step 22 when a slice changes UI.

This list holds only what needs judgement. Rules a linter can decide (missing labels, images without dimensions, click handlers on non-interactive elements, removed focus outlines) belong in the repo's lint config and are not repeated here. Report each problem as `path:line` with the item it breaks.

## Forms

- An error appears beside the field it belongs to, in words, and says how to fix it.
- On a failed submit, focus moves to the first field with an error.
- The submit control stays usable while a request is in flight and shows that it is working. It is not disabled before the user has tried.
- A second click or a retry cannot create a second record.
- Leaving a form with unsaved changes warns the user.
- Each input uses the type and keyboard that suit its content (email, number, telephone), and paste is never blocked.

## State and navigation

- Filters, tabs, pagination and open panels are reflected in the URL, so a reload or a shared link shows the same view.
- Anything that navigates is a real link, so it opens in a new tab and works from the keyboard.
- A destructive action asks for confirmation or offers undo.
- The back button returns to where the user was, with their place kept.

## Content

- Every list and panel has a designed empty state that says what will appear and how to add the first item.
- Loading, error and partial-data states are each handled, and none leaves a blank screen.
- Long names, long words and long translations wrap or truncate on purpose. Truncated text can still be read in full somewhere.
- Counts read correctly for zero, one and many.
- Dates, times, numbers and currency are formatted for the user's locale by the platform's formatter, not by hand.

## Motion and feedback

- Animation is skipped or reduced when the user has asked for reduced motion.
- An action gives visible feedback within about a tenth of a second, and anything slower than a second shows progress.
- Nothing that conveys meaning relies on hover alone, since touch screens have no hover.
- Content does not jump as images, fonts or late data arrive.

## Wording

- Buttons name the action they perform ("Delete listing", not "OK").
- Error messages say what happened and what to do next, without blame or jargon.
- The same thing is called by the same name everywhere on the screen.

## Dark mode and small screens

- Every colour comes from the theme, so nothing is unreadable in the other theme.
- The layout works at 320 pixels wide without horizontal scrolling.
- Touch targets are large enough to hit and are not crowded together.
