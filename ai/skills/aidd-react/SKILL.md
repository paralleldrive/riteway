---
name: aidd-react
description: Enforces React component authoring best practices. Use when creating React components, binding components, presentations, useObservableValues, or when the user asks about React UI patterns, reactive binding, or action callbacks.
---

# React component authoring

React components live in the `components/` layer per [structure](../aidd-structure/SKILL.md). Consume Observe and void actions from plugins per [service](../aidd-service/SKILL.md). Use `@adobe/data-react` for `useDatabase`, `useObservableValues`, and `DatabaseProvider`.

---

## useDatabase — single context

```sudolang
Constraints {
  Binding components must call useDatabase to obtain the main service context
  Do not access any other React context
  All other services and state reachable from database (db.services, db.observe, db.transactions)
  Single context is sufficient
}
```

Binding components **must** call `useDatabase` to obtain the main service context. Do **not** access any other React context. Additional contexts create a context waterfall and hurt performance. All other services and state are reachable from the database — e.g. `db.services`, `db.observe`, `db.transactions` — so a single context is sufficient.

---

## Binding component vs presentation

```sudolang
BindingComponent {
  injects: "observed values via useObservableValues"
  triggers: "re-render when those values change"
  binds: "action callbacks to the presentation"
}

Presentation {
  type: "pure function (no hooks)"
  receives: "data and action callbacks as props"
  returns: "JSX"
  constraint: "Keep reactive logic in binding component; presentation stays pure"
}
```

---

## Props from parent

**Do not** pass values from parent except when needed to identify which entity in the database to bind to.

When multiple instances exist (e.g. table rows), the parent passes an identifying value such as `entity` so the child knows which record to observe.

```tsx
// Parent: passes entity so child knows which record to bind to
{values.sprites.map((entity) => (
  <Sprite key={entity} entity={entity} />
))}

// Child: uses entity prop to observe the right record
function Sprite({ entity }: { entity: Entity }) {
  const db = useDatabase();
  const values = useObservableValues(
    () => ({ sprite: db.observe.entity(entity, db.archetypes.Sprite) }),
    [entity],
  );
  // ...
}
```

---

## useObservableValues

*Most* binding components use a **single** `useObservableValues` call. Collect all observed values in one object.

**Observe only what you need** — the minimal values required for rendering. For values that may resolve slowly, wrap with `Observe.withDefault` so you can render a skeleton (or placeholder) immediately while waiting. See [observe](../aidd-observe/SKILL.md).

```tsx
function Counter() {
  const db = useDatabase(counterPlugin);
  const values = useObservableValues(() => ({
    count: db.observe.resources.count,
  }));

  if (!values) return null;
  return presentation.render({ ...values, increment: db.transactions.increment });
}
```

---

## Presentation exports

```sudolang
Constraints {
  Presentation files ONLY export render (and localization bundles where appropriate)
  Nothing else
  For render args type externally (storybook, testing): use Parameters<typeof render>[0]
}
```

---

## Action callbacks (not events)

```sudolang
PresentationCallbacks {
  are: "action calls, not events"
  semantics: "verbNoun — not onClick/onToggle/onSignOut style"
  bindingComponent: "passes action callbacks (e.g. toggleView, signOut) as props"
  presentation: "invokes them when user intent occurs"
  passFunctionReferencesDirectly: true
  reason: "All actions are pure functions with no this binding"
}
```

```tsx
// Binding component: pass the function reference (no arrow wrapper)
increment: db.transactions.increment

// When the action needs arguments, wrap to supply them
toggleSprite: () => db.transactions.toggleSpriteActive({ entity })

// Presentation: receives and invokes when user acts
<button onClick={props.increment}>Increment</button>
```

---

## Testing

```sudolang
Testing {
  presentation: "add *-presentation.test.tsx when appropriate; unit test the presentation"
  bindingComponent: "not unit tested — no business logic; uses Database service (already unit tested)"
}
```

---

## Execute

```sudolang
fn whenCreatingOrModifyingReactComponent() {
  Constraints {
    Call useDatabase for main service context; do not use any other React context
    Split into binding component (reactive) and presentation (pure)
    Use single useObservableValues in binding component; Observe only minimal values; use Observe.withDefault for slow-resolving values
    Pass observed values and action callbacks to presentation; pass function references directly when signature matches; wrap only when supplying arguments
    Pass entity (or identifying value) from parent only when child must bind to specific database record
    Keep presentation pure — no hooks
    Presentation exports only render (and localization bundles where appropriate)
    Add *-presentation.test.tsx for presentation when appropriate; do not unit test binding components
    Never include business logic within binding components — move into computed values or action handlers
    Good binding components should be extremely small
  }
}
```
