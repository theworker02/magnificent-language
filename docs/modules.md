# MGL Modules

## Exporting

Modules can explicitly export top-level declarations with `export`.

```mgl
export let version: string = "1.6.0"

export func add(a: number, b: number): number {
  return a + b
}
```

Supported export forms:

- `export let ...`
- `export func ...`
- `export class ...`

## Importing

Import a module by file path:

```mgl
import "./modules/math.mgl"
```

By default, the namespace name is derived from the file name. You can also choose an alias:

```mgl
import "./modules/math.mgl" as math
import "./services/reporting.mgl" as reporting
```

## Compatibility

Modules without explicit `export` declarations still expose their top-level bindings. This keeps older MGL code working while enabling clearer boundaries in newer code.

## Caching

Modules are cached within a runtime session. Importing the same file more than once does not re-execute it.
