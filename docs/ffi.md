# FFI

MGL uses a generated Rust bridge for FFI-backed modules.

Workflow:

1. Parse supported `pub fn` exports from `.rs` files.
2. Generate a small cargo project with a `cdylib`.
3. Build a companion bridge executable that dynamically loads the shared library.
4. Marshal values between MGL and Rust at runtime.

This keeps the language runtime stable while enabling real native offload paths.
