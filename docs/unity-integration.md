# Unity Integration

Build Unity-compatible C# scripts from MGL:

```bash
mgl build examples/unity/player.mgl --unity
mgl unity examples/unity/player.mgl --watch
```

Supported mappings:

- `class` to `MonoBehaviour`
- `start()` to `Start()`
- `update()` to `Update()`
- `fixedUpdate()` to `FixedUpdate()`
