---
name: aidd-namespace
description: Ensures types and related functions are authored and consumed in a modular, discoverable, tree-shakeable pattern. Use when creating types, refactoring type folders, defining schemas, importing types, or when the user mentions type namespaces, constants, or Schema.ToType.
---

# Type namespace pattern

Single import surface per type: `<type-name>/<type-name>.ts`. Each constant or function lives in `<exported-name>.ts`; namespace re-export from `public.js`. Types live in the `types/` layer per [structure](../aidd-structure/SKILL.md).

**Precedence:** This skill defines the canonical pattern. Existing files may not yet follow it; all new work and changes must conform. Do not copy legacy structure when adding or editing code.

## File naming (utilities and constants)

Inside a type folder, name each file after the single export it provides. The folder already identifies the type, so no type prefix in the filename.

```sudolang
NamespaceFileNaming {
  typeEntry: "<type-name>.ts — type alias and namespace re-export"
  utilityOrConstant: "<exported-name>.ts — one file per exported function or constant; filename = export name"
}

Constraints {
  Do not use <type-name>-<exported-name>.ts for children; <exported-name>.ts is sufficient
}
```

Example: under `types/point/`, files `length.ts`, `add.ts`, and `normalize.ts` each export the like-named function.

## Constant types

```sudolang
ConstantVisibility {
  private: "Single-file only, not exported"
  exported: "Sole export from eponymous file"
  public: "Re-exported from public.ts"
  internal: "Exported, not in public.ts"
}
```

## Constraints

```sudolang
Constraints {
  "<type-name>/<type-name>.ts" is the only public import surface
  Export a single type alias: "export type <type-name> = <type>"
  Export namespace: "export * as <type-name> from \"./public.js\""
  In public.ts re-export every public constant file
  Child files: <exported-name>.ts (one export per file; filename matches export)
}
```

## Consumers

```sudolang
Consumers {
  never: [
    "Import from public.js outside the type namespace folder",
    "Import from any child file (e.g. schema.js, length.js) outside the type namespace folder"
  ]
  do: [
    "import from <type-name>.ts only; e.g. Volume from \"../../types/volume/volume.js\"",
    "Access constants via the namespace: TypeName.length, etc."
  ]
}
```

## Extending external types

When authoring helper functions for external types (e.g. String), use `StringX` as the discoverable extension namespace name.

## Type derived from schema

Only for types whose source of truth is a schema. Most types do not; use a normal type alias. When the type is schema-backed, either derive it from the schema or keep a hand-written alias (e.g. for better JSDoc) and assert it matches the schema at compile time.

**Option A — derive from schema:**

src/types/player-mark/schema.ts
```ts
export const schema = { enum: ["X", "O"] } as const;
```

src/types/player-mark/public.ts
```ts
export { schema } from "./schema.js";
```

src/types/player-mark/player-mark.ts
```ts
import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";
export type PlayerMark = Schema.ToType<typeof schema>;
export * as PlayerMark from "./public.js";
```

**Option B — hand-written object type with compile-time assertion:** Use when you want property-level JSDoc. From `@adobe/data/types`, use `Assert<Equal<YourType, Schema.ToType<typeof schema>>>` so the type stays in sync with the schema.

```ts
import { Assert, Equal } from "@adobe/data/types";
import { Schema } from "@adobe/data/schema";
import { schema } from "./schema.js";

export type Bounds = {
  /** Left edge in world units. */
  x: number;
  /** Top edge in world units. */
  y: number;
  /** Width in world units. */
  width: number;
  /** Height in world units. */
  height: number;
};

type _CheckSameType = Assert<Equal<Bounds, Schema.ToType<typeof schema>>>;

export * as Bounds from "./public.js";
```

## Testing

```sudolang
Constraints {
  Give each function file its own <same-name>.test.ts unit test
}
```

## Execute

```sudolang
fn whenRefactoringToNamespace() {
  Constraints {
    Identify constants in the current file
    Extract them into the standard pattern
    Identify all consumers of public namespaces
    Check each consumer: imports use <type-name>.ts only, never public.js or individual child files
    Ensure unit tests exist per function file, splitting as needed
  }
}
```
