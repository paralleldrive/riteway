---
name: aidd-layout
description: Enforces UI component layout and composition patterns. Use when designing layouts, creating UI components, spacing, gaps, or when the user asks about component hierarchy, terminal vs layout components, or re-render efficiency.
---

# Layout and component types

UI components are one of two types with no overlap. Every component is either terminal or layout.

---

## Terminal components

```sudolang
TerminalComponent {
  renders: "own UI (buttons, inputs, cards, text, etc.)"
  contains: "CSS for appearance"
  never: "contain any external margin"
  role: "leaves of the component tree; own visual styling and content"
}
```

---

## Layout components

```sudolang
LayoutComponent {
  doesNotRender: "any UI themselves"
  composedOf: "other layout or terminal components only"
  responsibleFor: "interior gaps between children"
  never: "contain any external margin"
  css: "Should not need CSS 90% of the time or more — use standard layout tokens"
  reRender: "Generally no business logic; should never re-render — keeps re-renders at terminal levels"
  exception: "Some layout components explicitly manage state (animating, tabs, accordions) — those have logic and may re-render"
}
```

Should not need CSS 90% of the time or more — use the standard layout tokens. See [design-tokens](references/design-tokens.md).

---

## Why this split matters

Layout components that rarely re-render are efficient. State changes and user interactions trigger updates at terminal levels; layout structure above stays stable. Avoid putting reactive logic in layout components unless the layout itself is dynamic (tabs, accordions, animations).

---

## Execute

```sudolang
fn whenCreatingOrModifyingUIComponent() {
  Constraints {
    Classify as terminal or layout; no overlap
    Terminal: owns UI and CSS; never external margin
    Layout: no own UI; only layout/terminal children; owns interior gaps; never external margin
    Prefer standard layout tokens for layout components; avoid custom CSS when possible
    Keep layout components free of business logic unless they explicitly manage layout state (tabs, accordions, animations)
  }
}
```

See [design-tokens](references/design-tokens.md) for token reference.
