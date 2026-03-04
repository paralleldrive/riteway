---
name: aidd-ecs
description: Enforces @adobe/data/ecs best practices. Use this whenever @adobe/data/ecs is imported, when creating or modifying Database.Plugin definitions, or when working with ECS components, resources, transactions, actions, systems, or services.
---

# Database.Plugin authoring

Plugins are created with `Database.Plugin.create()` from `@adobe/data/ecs`.

## Property order (enforced at runtime)

Properties **must** appear in this exact order. All are optional.

```sudolang
PluginPropertyOrder [
  "extends — Plugin, base plugin to extend"
  "services — (db) => ServiceInstance, singleton service factories"
  "components — schema object, ECS component schemas"
  "resources — { default: value as Type }, global resource schemas"
  "archetypes — ['comp1', 'comp2'], standard ECS archetypes; storage tables for efficient insertions"
  "computed — (db) => Observe<T>, computed observables"
  "transactions — (store, payload) => void, synchronous deterministic atomic mutations"
  "actions — (db, payload) => T, general functions"
  "systems — { create: (db) => fn | void }, per-frame (60fps) or init-only"
]

Constraints {
  Properties must appear in this exact order; wrong order throws at runtime
}
```

---

## Composition

**Single extension** — one plugin extends another:
```ts
export const authPlugin = Database.Plugin.create({
  extends: environmentPlugin,
  services: {
    auth: db => AuthService.createLazy({ services: db.services }),
  },
});
```

**Combine** — `extends` accepts only one plugin. To extend from multiple use Database.Plugin.combine:
```ts
export const generationPlugin = Database.Plugin.create({
  extends: Database.Plugin.combine(aPlugin, bPlugin),
  computed: {
    max: db => Observe.withFilter(
        Observe.fromProperties({
            a: db.observe.resources.a,
            b: db.observe.resources.b
        }),
        ({ a, b }) => Math.max(a, b)
    )
  },
});
```

**Final composition** — combine all plugins into the app plugin:
```ts
export const appPlugin = Database.Plugin.combine(
  corePlugin, themePlugin, dataPlugin,
  authPlugin, uiPlugin, featurePlugin
);

export type AppPlugin = typeof appPlugin;
export type AppDatabase = Database.Plugin.ToDatabase<AppPlugin>;
```

---

## Property details

### services

Factory functions creating singleton services. Extended plugin services initialize first, so `db.services` has access to them.

```ts
services: {
  environment: _db => EnvironmentService.create(),
}
```

### components

Schema objects defining ECS component data. Use schema imports from type namespaces or inline schemas. See [data-modeling.md](data-modeling.md) for a simple example.

```ts
components: {
  layout: Layout.schema,
  layoutElement: { default: null as unknown as HTMLElement, transient: true },
  layoutLayer: F32.schema,
},
```

Non-persistable values (e.g. HTML elements, DOM refs) must use `transient: true` — excluded from serialization.

### resources

Global state not tied to entities. Use `as Type` to provide the compile-time type — without it the value is treated as a const literal. See [data-modeling.md](data-modeling.md) for patterns.

```ts
resources: {
  themeColor: { default: 'dark' as ThemeColor },
  themeScale: { default: 'medium' as ThemeScale },
},
```

Use `null as unknown as Type` for resources initialized later in a system initializer:

```ts
resources: {
  connection: { default: null as unknown as WebSocket },
},
```

### archetypes

Standard ECS archetypes. Used for querying and inserting related components. See [data-modeling.md](data-modeling.md) for a simple example.

```ts
archetypes: {
  Layout: ['layout', 'layoutElement', 'layoutLayer'],
},
```

### computed

Factory returning `Observe<T>` or `(...args) => Observe<T>`. Receives full db.

```ts
computed: {
  max: db => Observe.withFilter(
    Observe.fromProperties({
      a: db.observe.resources.a,
      b: db.observe.resources.b,
    }),
    ({ a, b }) => Math.max(a, b)
  ),
},
```

### transactions

Synchronous, deterministic atomic mutations. Receive `store` and a payload. Store allows direct, immediate mutation of all entities, components, and resources.

```ts
transactions: {
  updateLayout: (store, { entity, layout }: { entity: Entity; layout: Layout }) => {
    store.update(entity, { layout });
  },
  setThemeColor: (store, color: ThemeColor) => {
    store.resources.themeColor = color;
  },
},
```

```sudolang
StoreAPI {
  "store.update(entity, data)" = "update entity components"
  "store.resources.x = value" = "mutate resources"
  "store.get(entity, 'component')" = "read component value"
  "store.read(entity)" = "read all entity component values"
  "store.read(entity, archetype)" = "read entity component values in archetype"
  "store.select(archetype.components, { where })" = "query entities"
}
```

### actions

General functions with access to the full db. Can return anything or nothing.
UI components that call actions MUST never consume returned values — call for side effects only. Consuming return values violates unidirectional flow (data down via Observe, actions up as void).
Call at most one transaction per action; multiple transactions corrupt the undo/redo stack.

```ts
actions: {
  generateNewName: async (db) => {
    const generatedName = await db.services.nameGenerator.generateName();
    db.transactions.setName(generatedName);
  },
  getAuth: db => db.services.auth,
},
```

### systems

`create` receives db and may optionally return a per-frame function (60fps) or just initialize values. Always called synchronously when `database.extend(plugin)` runs.

```ts
systems: {
  ui_state_plugin_initialize: {
    create: db => {
      db.transactions.registerViews(views);
    },
  },
  layout_plugin__system: {
    create: db => {
      const observer = new ResizeObserver(/* ... */);
      Database.observeSelectDeep(db, db.archetypes.Layout.components)(entries => {
        // react to entity changes
      });
    },
  },
},
```

**System scheduling** (optional):
```ts
systems: {
  physics: {
    create: db => () => { /* per-tick work */ },
    schedule: {
      before: ['render'],
      after: ['input'],
      during: ['simulation'],
    },
  },
},
```

```sudolang
Schedule {
  before: "hard ordering constraints"
  after: "hard ordering constraints"
  during: "soft preference for same execution tier"
}
```

---

## Naming conventions

```sudolang
PluginNaming {
  file: "*-plugin.ts (kebab-case) — e.g. layout-plugin.ts"
  export: "*Plugin (camelCase) — e.g. layoutPlugin"
  system: "plugin_name__system (snake_case, double underscore) — e.g. layout_plugin__system"
  initSystem: "plugin_name_initialize — e.g. ui_state_plugin_initialize"
}
```

---

## Type utilities

```ts
export type MyDatabase = Database.Plugin.ToDatabase<typeof myPlugin>;
export type MyStore = Database.Plugin.ToStore<typeof myPlugin>;
```

---

## Execute

```sudolang
fn whenCreatingOrModifyingPlugin() {
  Constraints {
    Verify property order matches (extends, services, components, resources, archetypes, computed, transactions, actions, systems)
    Use extends for single-parent; Database.Plugin.combine() for multiple peers
    Ensure services only access db.services from extended plugins (not forward references)
    Export type *Database = Database.Plugin.ToDatabase<typeof *Plugin> when consumers need typed db access
    Follow naming conventions for files, exports, and systems
  }
}
```

## Additional resources

- [data-modeling.md](data-modeling.md) — Components, resources, and archetypes (particle simulation example)
