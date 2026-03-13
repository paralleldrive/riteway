# Namespace Example.

Create a new file like this:


src/types/point.ts

    export type Point = { x: number, y: number };

    
    export const length = ({ x, y }: Point) => Math.hypot(x, y);
    export const add = ({ x: x1, y: y1 }: Point, { x: x2, y: y2 }: Point): Point => ({ x: x1 + x2, y: y1 + y2 });

With this file in context run

    /aidd-namespace

The expected resulting files will be:


src/types/point/point.ts

    export type Point = { x: number, y: number };
    export * as Point from "./public.js";

src/types/point/public.ts

    export * from "./length.js";
    export * from "./add.js";

src/types/point/length.ts

    export const length = ({ x, y }: Point) => Math.hypot(x, y);

src/types/point/add.ts

    export const add = ({ x: x1, y: y1 }: Point, { x: x2, y: y2 }: Point): Point => ({ x: x1 + x2, y: y1 + y2 });

