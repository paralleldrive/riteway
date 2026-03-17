# Data modeling: components, resources, archetypes

Reference for modeling components, resources, and archetypes. Data modeling only — no transactions, systems, or higher-level plugin structure. See [SKILL.md](SKILL.md) for full plugin authoring.

---

## Particle simulation example

```ts
import { Database } from '@adobe/data/ecs';
import { Vec3, Vec4, F32 } from '@adobe/data/math';

const particleDataPlugin = Database.Plugin.create({
  components: {
    position: Vec3.schema,
    velocity: Vec3.schema,
    color: Vec4.schema,
    mass: F32.schema,
  },
  resources: {
    gravity: { default: 9.8 as number },
  },
  archetypes: {
    Particle: ['position', 'velocity', 'color', 'mass'],
  },
});
```

---

## Guidelines

- **Components**: Per-entity data. Use schema imports (Vec3, Vec4, F32 from `@adobe/data/math`) or type namespaces for custom shapes.
- **Resources**: Global state. Use **only** `{ default: value as Type }`.
- **Archetypes**: One per entity kind. List all components that kind requires.
