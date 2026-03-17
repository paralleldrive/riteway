---
name: aidd-lit
description: Enforces Lit element authoring best practices. Use when creating Lit elements, binding elements, presentations, DatabaseElement, useObservableValues, or when the user asks about Lit UI patterns, reactive binding, or action callbacks.
---

# Lit element authoring

Lit elements live in the `components/` layer per [structure](../aidd-structure/SKILL.md). Consume Observe and void actions from plugins per [service](../aidd-service/SKILL.md).

---

## Extending DatabaseElement

Binding elements extend `DatabaseElement<typeof myPlugin>` — either directly or via an intermediate base class. The required plugin must be specified in the generic.

This ensures the plugin's services are extended onto the main database **before** the element renders, so `this.service` exposes the correct Observe APIs and actions.

```ts
// Direct
export class HelloWorldElement extends DatabaseElement<typeof helloWorldPlugin> {
  get plugin() { return helloWorldPlugin; }
}

// Indirect — base extends DatabaseElement, leaf specifies plugin
export class LayoutElement<T extends MyApplicationPlugin = MyApplicationPlugin> extends CoreApplicationElement<T> { }
export class ToolbarElement extends LayoutElement<typeof toolbarPlugin> { }
```

---

## Binding element vs presentation

```sudolang
BindingElement {
  injects: "observed values via useObservableValues"
  triggers: "re-render when those values change"
  binds: "action callbacks to the presentation"
}

Presentation {
  type: "pure function (no hooks)"
  receives: "data and action callbacks as props"
  returns: "TemplateResult"
  constraint: "Keep reactive logic in binding element; presentation stays pure"
}
```

---

## Testing

```sudolang
Testing {
  presentation: "add *.test.ts when appropriate; unit test the presentation"
  bindingElement: "not unit tested — no business logic; uses Database service (already unit tested)"
}
```

---

## useObservableValues

*Most* binding elements use a **single** `useObservableValues` call. Collect all observed values in one object.

**Observe only what you need** — the minimal values required for rendering. For values that may resolve slowly, wrap with `Observe.withDefault` so you can render a skeleton (or placeholder) immediately while waiting. See [observe](../aidd-observe/SKILL.md).

```ts
render() {
  const values = useObservableValues(() => ({
    visible: this.service.actions.isViewVisible(name),
    userProfile: this.service.services.authentication.userProfile,
  }));
  if (!values) return;

  return presentation.render({ ...values, toggleView: () => this.toggleView(name) });
}
```

---

## Presentation exports

```sudolang
Constraints {
  Presentation files ONLY export render (and unlocalized bundles where appropriate)
  Nothing else ever exported from a presentation file
  For render args type externally: use Parameters<typeof render>[0]
}
```

---

## Action callbacks (not events)

```sudolang
PresentationCallbacks {
  are: "action calls, not events"
  semantics: "verbNoun — not onClick/onToggle/onSignOut style"
  bindingElement: "passes action callbacks (e.g. toggleView, signOut) as props"
  presentation: "invokes them when user intent occurs"
  callback: "calls the service/transaction directly"
}
```

```ts
// Binding element: binds the action (verbNoun)
toggleView: () => this.toggleToolbarChild(name)

// Presentation: receives and invokes when user acts
item.toggleView()
```

---

## Lit properties

```sudolang
PropertyRules {
  default: "Almost never use @property on binding elements"
  exception: "Use properties ONLY when needed to bind to the correct entity in the database (e.g. entity for table rows, layer for view hosts)"
  multipleInstances: "need a property to identify which entity they represent"
  singleInstanceElements: "have no properties; observe values directly; re-render only when those values change"
}
```

---

## Execute

```sudolang
fn whenCreatingOrModifyingLitElement() {
  Constraints {
    Extend DatabaseElement<typeof myPlugin> (directly or indirectly) with required plugin specified
    Split into binding element (reactive) and presentation (pure)
    Use single useObservableValues in binding element; Observe only minimal values; use Observe.withDefault for slow-resolving values
    Pass observed values and action callbacks to presentation
    Keep presentation pure — no hooks
    Add @property only when entity binding requires it (multiple instances)
    Presentation exports only render (and localization bundles where appropriate)
    Add *-presentation.test.ts for presentation when appropriate; do not unit test binding elements
    Never include business logic within binding elements — move into computed values or action handlers
    Good binding elements should be extremely small
  }
}
```
