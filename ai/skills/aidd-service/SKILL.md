---
name: aidd-service
description: Enforces asynchronous data service authoring best practices. Use when creating front-end or back-end services, service interfaces, Observe patterns, AsyncDataService, or when the user asks about service layer, data flow, unidirectional UI, or action/observable design.
---

# Service authoring

Asynchronous data services. Live in the `services/` layer per [structure](../aidd-structure/SKILL.md). Adhere to [namespace](../aidd-namespace/SKILL.md) for type and function organization.

**Data** = readonly JSON values or Blobs.

---

## Front-end vs back-end services

```sudolang
FrontEndService {
  allowed: ["Observe<Data>", "other services (sub-Services)", "void-returning action functions"]
  notAllowed: ["Promise or AsyncGenerator return"]
}

BackEndService {
  typicallyReturns: "Promise<Data> | AsyncGenerator<Data>"
  notCalledFrom: "UI"
  calledBy: "front-end services"
}

Constraints {
  UI components: unidirectional path — data down via void actions, data up via Observe
}
```

**Back-end services** — usually stateless. Functions typically return `Promise<Data>` or `AsyncGenerator<Data>`. Not called directly from UI; front-end services call them.

---

## Front-end service constraints

```sudolang
ServiceInterfaceForUI {
  mayContain: [
    "Observe<Data> — observable properties or factories",
    "Sub-Services — nested service interfaces",
    "Action functions — zero or more Data arguments, return void only",
    "Factory functions — create observables or sub-Services"
  ]
  observablesMayObserve: ["Data", "Service interfaces only"]
  compileTimeCheck: "Assert<AsyncDataService.IsValid<ServiceInterface>>"
}
```

## Benefits

- **Unidirectional flow** — data down via actions, data up via Observe
- **Async isolation** — view and service decoupled
- **Inspectability** — action/observable data serializable
- **Portability** — implementation swappable across process boundaries
- **Lazy Loading** - can use AsyncDataService.createLazy to wrap with lazy load on first actual usage.

---

## Folder structure

```sudolang
ServicePaths {
  "services/<name>-service/<name>-service.ts" = "Service interface only"
  "services/<name>-service/<function-name>.ts" = "One file per function; re-export from public"
  "services/<name>-service/<implementation>-<name>-service.ts" = "Implementation factory"
  "services/<name>-service/<implementation>-<name>-service/" = "Implementation folder if multi-file"
}

Constraints {
  Each function lives in its own file — not a single -service-functions.ts
  Interface file: types and optionally JSON schemas only; no implementation-specific code
  Implementation: factory function or static plain object only; no classes
  Namespace: export * as ServiceName from public.js or from functions/index.js
}
```

Per [namespace](../aidd-namespace/SKILL.md), each function lives in its own file — not a single `-service-functions.ts`.

**Interface file** — types and optionally JSON schemas only. No implementation-specific code. Follow [namespace](../aidd-namespace/SKILL.md) for type re-exporting (single import surface for consumers).

**Implementation** — factory function or static plain object. Export only that. **No classes** — brittle `this` bindings, violate pure functional design, block recomposing higher-order services from functions.

**Namespace** — `export * as ServiceName from './public.js'`; public.ts re-exports create and helpers. Or `export * as ServiceName from './functions/index.js'` when using a functions module. Per [namespace](../aidd-namespace/SKILL.md).

---

## Execute

```sudolang
fn whenCreatingOrModifyingService() {
  Constraints {
    Place in services/<name>-service/ per structure
    Interface in <name>-service.ts — types only, extend Service, add Assert<AsyncDataService.IsValid<>>
    Export namespace from public.js or functions/index.js
    In public.ts re-export create and all public helpers
    Implementation in <implementation>-<name>-service.ts or folder — factory or static instance only
    Front-end (UI-called): actions return void only; observables observe Data or Service only
    Back-end: functions return Promise<Data> or AsyncGenerator<Data>
  }
}
```

## Additional resources

- [observe](../aidd-observe/SKILL.md) — Observe pattern and helper functions
