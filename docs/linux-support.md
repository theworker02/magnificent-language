# Linux Support

MGL runs natively on Linux and Unix-like systems with:

- `system.os()`
- `system.arch()`
- `system.spawn(...)`
- `system.exec(...)`
- executable bundles from `mgl build --native`

Example:

```mgl
print(system.os())
let proc = system.spawn("ls", ["-la"])
print((await proc.wait()).stdout)
```
