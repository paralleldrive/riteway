---
name: aidd-observe
description: Enforces Observe pattern best practices from @adobe/data/observe. Use when working with Observe, observables, reactive data flow, service Observe properties, or when the user asks about Observe.withMap, Observe.withFilter, Observe.fromConstant, Observe.fromProperties, or similar.
---

# Observe pattern

`Observe<T>` from `@adobe/data/observe` — a subscription function: `(notify: (value: T) => void) => Unobserve`. Callback may be invoked synchronously or asynchronously, zero or more times. Returns `Unobserve` to stop observing.

---

## Creation helpers

| Helper | Usage |
|--------|-------|
| `Observe.fromConstant(value)` | `Observe<T>` from a constant value |
| `Observe.fromProperties({ a, b })` | Combine named observables into `Observe<{ a, b }>` |
| `Observe.fromArray([obs1, obs2])` | Combine array of observables into `Observe<T[]>` |
| `Observe.fromPromise(() => Promise)` | Lazy; notifies once when promise resolves |
| `Observe.createState(initial?)` | `[Observe<T>, (value: T) => void]` — mutable state |

```ts
const constant = Observe.fromConstant(42);
const combined = Observe.fromProperties({ a: db.observe.resources.a, b: db.observe.resources.b });
const [count, setCount] = Observe.createState(0);
```

---

## Transformation helpers

| Helper | Usage |
|--------|-------|
| `Observe.withMap(obs, fn)` | Transform value; map from one type to another |
| `Observe.withFilter(obs, fn)` | Transform or filter; return `undefined` to skip |
| `Observe.withDefault(default, obs)` | Use default when value is undefined |

```ts
const doubled = Observe.withMap(count, n => n * 2);
const isDev = Observe.withMap(service.type, t => t === 'development');
const max = Observe.withFilter(
  Observe.fromProperties({ a, b }),
  ({ a, b }) => Math.max(a, b)
);
const withFallback = Observe.withDefault('unknown', maybeName);
```

---

## Conversion helpers

| Helper | Usage |
|--------|-------|
| `Observe.toPromise(obs)` | Resolve with first value (one-shot) |

```ts
const first = await Observe.toPromise(service.states);
```

---

## Common patterns

**Derived observable from service:**
```ts
export const isDevelopment = memoize((service: Pick<EnvironmentService, 'type'>) =>
  Observe.withMap(service.type, type => type === 'development')
);
```

**Computed from multiple resources:**
```ts
Observe.withFilter(
  Observe.fromProperties({ a: db.observe.resources.a, b: db.observe.resources.b }),
  ({ a, b }) => Math.max(a, b)
);
```

**Lazy creation:** `Observe.withLazy(() => expensiveObs)` — defers until first subscription.

---

## Execute

```sudolang
fn whenAddingOrUsingObserve() {
  Constraints {
    Use Observe.fromConstant for static values
    Use Observe.fromProperties to combine multiple observables
    Use Observe.withFilter when mapping and/or filtering
    Use Observe.createState for mutable state with a setter
    Call unobserve() when cleaning up (e.g. component unmount)
  }
}
```

## Related

- [service](../aidd-service/SKILL.md) — Observe in front-end services (data up via Observe)
