# Interface lint rules

Version 2026-11-26. Written for devflow. Used in step 9 when a slice changes UI.

These are the interface rules a linter can decide, so they belong in the repo's lint config and not in a reviewer's head. Each is set to error, never warning: a warning nobody acts on teaches everyone to ignore the output. The rules that need judgement are in the verifier's interface checklist.

Rule names below are from `eslint-plugin-jsx-a11y` and the Next.js plugin as commonly published. Confirm each against the versions installed in the repo before adding it, and turn off any rule the project deliberately does not follow instead of suppressing it line by line.

| What it prevents | Rule |
|------------------|------|
| Images with no text alternative | `jsx-a11y/alt-text` |
| Form controls with no label | `jsx-a11y/label-has-associated-control` |
| Buttons and links with no accessible name, such as icon-only buttons | `jsx-a11y/control-has-associated-label` |
| Click handlers on elements that are not interactive | `jsx-a11y/no-static-element-interactions`, `jsx-a11y/no-noninteractive-element-interactions` |
| Click handlers with no keyboard equivalent | `jsx-a11y/click-events-have-key-events` |
| Links that go nowhere or stand in for buttons | `jsx-a11y/anchor-is-valid` |
| Interactive elements that cannot take focus | `jsx-a11y/interactive-supports-focus` |
| Invalid or incomplete ARIA | `jsx-a11y/aria-props`, `jsx-a11y/role-has-required-aria-props` |
| Empty headings | `jsx-a11y/heading-has-content` |
| Video and audio with no captions | `jsx-a11y/media-has-caption` |
| Focus grabbed on page load | `jsx-a11y/no-autofocus` |
| Images that load without reserved space or optimization, in Next.js | `@next/next/no-img-element` |

## Patterns with no ready-made rule

Ban these with the linter's restricted-syntax rule or a small custom rule, since each is a plain text or syntax match:

| Pattern | Why |
|---------|-----|
| `transition: all` | Animates properties nobody meant to animate, and costs performance |
| A removed focus outline with no replacement | Keyboard users lose track of where they are |
| `user-scalable=no` or `maximum-scale=1` in the viewport tag | Stops people zooming |
| A paste handler that prevents the default | Blocks password managers and anyone copying a code |
| Raw HTML injection | The usual way user text becomes a script |
| A date or number formatted by hand | Wrong for every locale but the author's |

When the same interface mistake shows up twice in review, add a rule for it here and to the repo's config.
