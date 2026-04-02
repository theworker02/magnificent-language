# Rust Integration

MGL 1.6.0 supports `import rust "module.rs"` for supported `pub fn` Rust exports.

```mgl
import rust "./rust/math.rs" as math
print(math.add(5, 10))
```

Supported type bridges:

- `int` to `i32`, `i64`, `usize`
- `float` to `f32`, `f64`
- `string` to `String`, `&str`
- `array<number|string>` to `Vec<_>`

Build Rust artifacts with:

```bash
mgl build examples/rust-interop.mgl --rust
```
