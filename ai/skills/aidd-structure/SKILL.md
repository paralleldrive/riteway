---
name: aidd-structure
description: Enforces source code structuring and interdependency best practices. Use when creating folders, moving files, adding imports, or when the user asks about architecture, layering, or module dependencies.
---

# Standard folder structure

```
types ← services ← plugins ← components
  ↑         ↑         ↑
  └─────────┴─────────┘ (types only depend on types)
```

## Dependency rules

```sudolang
LayerDependency {
  layer: "components" | "plugins" | "services" | "types"
  mayDependOn: String[]
  mustNotDependOn: String[]
}

DependencyRules [
  { layer: "components", mayDependOn: ["plugins (Observe<Data>, void actions)", "types"], mustNotDependOn: ["services"] },
  { layer: "plugins", mayDependOn: ["services", "types", "other plugins"], mustNotDependOn: [] },
  { layer: "services", mayDependOn: ["other services", "types"], mustNotDependOn: ["components", "plugins"] },
  { layer: "types", mayDependOn: ["other types"], mustNotDependOn: ["everything else"] }
]

Constraints {
  Never: components → services
  Never: services → components or plugins
  Never: types → anything except types
}
```

---

## components

UI components or elements (also called "elements").

**From plugins:** only Observe<Data> for reactive re-renders and void-returning action functions.

## plugins (if using @adobe/data/ecs for state)

ECS Database.Plugin declarations. Usually depend on services, types, and other plugins.

## services

Asynchronous data services, each in its own folder. Immutable data only. Adhere to [namespace](../aidd-namespace/SKILL.md) guidelines.

**Async patterns only:** Observe<Data>, Promise<Data>, AsyncGenerator<Data>, void actions.

**External code** depends only on interfaces, never on implementations.

## types

Pure functional types and associated pure functions. Adhere to [namespace](../aidd-namespace/SKILL.md) guidelines.

## Nested structure

When a component has implementation-specific sub-parts, mirror the root structure inside it:

```
components/my-component/
  components/
  plugins/
  types/
```

---

## Execute

```sudolang
fn whenAddingOrMovingCode() {
  Constraints {
    Place code in the correct layer (components, plugins, services, types)
    Check dependencies against the dependency rules
    Fix any violations (e.g. components importing services)
  }
}
```
