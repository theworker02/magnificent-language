const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { parseRustModule } = require("./parser");
const { findRustBinary } = require("./toolchain");
const { MglRuntimeError } = require("../../utils/errors");

function compileRustModule(filePath, options = {}) {
  const manifest = parseRustModule(filePath);
  const hash = crypto
    .createHash("sha1")
    .update(manifest.source)
    .update(process.platform)
    .update(process.arch)
    .digest("hex")
    .slice(0, 12);
  const crateName = sanitizeCrateName(`${manifest.moduleName}_${hash}`);
  const cacheRoot = path.resolve(options.cacheRoot || path.join(options.projectRoot || path.dirname(manifest.filePath), ".mgl-cache", "rust"));
  const projectDir = path.join(cacheRoot, crateName);
  const srcDir = path.join(projectDir, "src");
  const artifactDir = path.join(projectDir, "target", "release");
  const libraryPath = resolveLibraryPath(artifactDir, crateName);
  const bridgePath = path.join(artifactDir, process.platform === "win32" ? "mgl_bridge.exe" : "mgl_bridge");
  const manifestPath = path.join(projectDir, "mgl-rust-manifest.json");

  if (!fs.existsSync(libraryPath) || !fs.existsSync(bridgePath) || !fs.existsSync(manifestPath)) {
    const cargoBinary = findRustBinary("cargo");
    if (!cargoBinary) {
      throw new MglRuntimeError("Unable to find cargo. Install Rust or add cargo to PATH.", {
        filePath: manifest.filePath,
      });
    }

    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, "Cargo.toml"), renderCargoToml(crateName), "utf8");
    fs.writeFileSync(path.join(srcDir, "user_module.rs"), manifest.source, "utf8");
    fs.writeFileSync(path.join(srcDir, "lib.rs"), renderLibSource(manifest), "utf8");
    fs.writeFileSync(path.join(srcDir, "main.rs"), renderBridgeSource(), "utf8");
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      crateName,
      moduleName: manifest.moduleName,
      filePath: manifest.filePath,
      functions: manifest.functions,
      libraryPath,
      bridgePath,
    }, null, 2)}\n`, "utf8");

    const result = spawnSync(cargoBinary, ["build", "--release", "--offline"], {
      cwd: projectDir,
      encoding: "utf8",
    });

    if (result.error && result.status !== 0) {
      throw new MglRuntimeError(`Unable to run cargo for '${manifest.filePath}': ${result.error.message}`, {
        filePath: manifest.filePath,
      });
    }

    if (result.status !== 0) {
      throw new MglRuntimeError(
        `Rust build failed for '${manifest.filePath}'.\n${(result.stderr || result.stdout || "").trim()}`,
        { filePath: manifest.filePath },
      );
    }
  }

  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function sanitizeCrateName(name) {
  return name.replace(/[^A-Za-z0-9_]/g, "_").toLowerCase();
}

function resolveLibraryPath(artifactDir, crateName) {
  if (process.platform === "win32") {
    return path.join(artifactDir, `${crateName}.dll`);
  }

  if (process.platform === "darwin") {
    return path.join(artifactDir, `lib${crateName}.dylib`);
  }

  return path.join(artifactDir, `lib${crateName}.so`);
}

function renderCargoToml(crateName) {
  return [
    "[package]",
    `name = "${crateName}"`,
    'version = "0.1.0"',
    'edition = "2021"',
    "",
    "[lib]",
    `name = "${crateName}"`,
    'crate-type = ["cdylib"]',
    "",
    "[[bin]]",
    'name = "mgl_bridge"',
    'path = "src/main.rs"',
    "",
  ].join("\n");
}

function renderLibSource(manifest) {
  const manifestLines = manifest.functions
    .map((fn) => `${fn.name}|${fn.returnType.raw}|${fn.params.map((param) => `${param.name}:${param.type.raw}`).join(",")}`)
    .join("\\n");
  const dispatchLines = manifest.functions.map((fn) => renderDispatchArm(fn)).join("\n");

  return [
    "mod user_module;",
    "",
    "use std::ffi::{CStr, CString};",
    "use std::os::raw::c_char;",
    "",
    "#[no_mangle]",
    "pub extern \"C\" fn mgl_manifest_text() -> *mut c_char {",
    `    into_c_string("${manifestLines}".to_string())`,
    "}",
    "",
    "#[no_mangle]",
    "pub extern \"C\" fn mgl_invoke_text(function_name: *const c_char, payload: *const c_char) -> *mut c_char {",
    "    let rendered = match invoke_impl(function_name, payload) {",
    "        Ok(value) => value,",
    "        Err(error) => format!(\"e:{}\", encode_hex(&error)),",
    "    };",
    "",
    "    into_c_string(rendered)",
    "}",
    "",
    "#[no_mangle]",
    "pub extern \"C\" fn mgl_free_string(value: *mut c_char) {",
    "    if value.is_null() {",
    "        return;",
    "    }",
    "",
    "    unsafe {",
    "        let _ = CString::from_raw(value);",
    "    }",
    "}",
    "",
    "fn invoke_impl(function_name: *const c_char, payload: *const c_char) -> Result<String, String> {",
    "    let function_name = ptr_to_string(function_name)?;",
    "    let payload = ptr_to_string(payload)?;",
    "    let args = split_args(&payload);",
    "",
    "    match function_name.as_str() {",
    dispatchLines,
    "        _ => Err(format!(\"Unknown Rust export '{}'\", function_name)),",
    "    }",
    "}",
    "",
    "fn split_args(payload: &str) -> Vec<&str> {",
    "    if payload.is_empty() {",
    "        vec![]",
    "    } else {",
    "        payload.split('\\n').collect()",
    "    }",
    "}",
    "",
    "fn ptr_to_string(ptr: *const c_char) -> Result<String, String> {",
    "    if ptr.is_null() {",
    "        return Ok(String::new());",
    "    }",
    "",
    "    unsafe {",
    "        CStr::from_ptr(ptr)",
    "            .to_str()",
    "            .map(|value| value.to_string())",
    "            .map_err(|error| error.to_string())",
    "    }",
    "}",
    "",
    "fn into_c_string(value: String) -> *mut c_char {",
    "    CString::new(value).unwrap().into_raw()",
    "}",
    "",
    "fn encode_hex(value: &str) -> String {",
    "    let mut rendered = String::new();",
    "    for byte in value.as_bytes() {",
    "        rendered.push_str(&format!(\"{:02x}\", byte));",
    "    }",
    "    rendered",
    "}",
    "",
    "fn decode_hex(value: &str) -> Result<String, String> {",
    "    if value.is_empty() {",
    "        return Ok(String::new());",
    "    }",
    "",
    "    if value.len() % 2 != 0 {",
    "        return Err(\"Invalid hex payload length\".to_string());",
    "    }",
    "",
    "    let mut bytes = Vec::new();",
    "    let chars: Vec<char> = value.chars().collect();",
    "    let mut index = 0;",
    "    while index < chars.len() {",
    "        let chunk = format!(\"{}{}\", chars[index], chars[index + 1]);",
    "        let byte = u8::from_str_radix(&chunk, 16).map_err(|error| error.to_string())?;",
    "        bytes.push(byte);",
    "        index += 2;",
    "    }",
    "",
    "    String::from_utf8(bytes).map_err(|error| error.to_string())",
    "}",
    "",
    "fn parse_int(raw: &str) -> Result<i64, String> {",
    "    raw.strip_prefix(\"i:\")",
    "        .ok_or_else(|| \"Expected integer payload\".to_string())?",
    "        .parse::<i64>()",
    "        .map_err(|error| error.to_string())",
    "}",
    "",
    "fn parse_float(raw: &str) -> Result<f64, String> {",
    "    raw.strip_prefix(\"f:\")",
    "        .ok_or_else(|| \"Expected float payload\".to_string())?",
    "        .parse::<f64>()",
    "        .map_err(|error| error.to_string())",
    "}",
    "",
    "fn parse_string(raw: &str) -> Result<String, String> {",
    "    let encoded = raw.strip_prefix(\"s:\").ok_or_else(|| \"Expected string payload\".to_string())?;",
    "    decode_hex(encoded)",
    "}",
    "",
    "fn parse_int_array(raw: &str) -> Result<Vec<i64>, String> {",
    "    let encoded = raw.strip_prefix(\"ai:\").ok_or_else(|| \"Expected int array payload\".to_string())?;",
    "    if encoded.is_empty() {",
    "        return Ok(vec![]);",
    "    }",
    "    encoded.split(',').map(|item| item.parse::<i64>().map_err(|error| error.to_string())).collect()",
    "}",
    "",
    "fn parse_float_array(raw: &str) -> Result<Vec<f64>, String> {",
    "    let encoded = raw.strip_prefix(\"af:\").ok_or_else(|| \"Expected float array payload\".to_string())?;",
    "    if encoded.is_empty() {",
    "        return Ok(vec![]);",
    "    }",
    "    encoded.split(',').map(|item| item.parse::<f64>().map_err(|error| error.to_string())).collect()",
    "}",
    "",
    "fn parse_string_array(raw: &str) -> Result<Vec<String>, String> {",
    "    let encoded = raw.strip_prefix(\"as:\").ok_or_else(|| \"Expected string array payload\".to_string())?;",
    "    if encoded.is_empty() {",
    "        return Ok(vec![]);",
    "    }",
    "    encoded.split(';').map(decode_hex).collect()",
    "}",
    "",
    "fn encode_int(value: i64) -> String {",
    "    format!(\"i:{}\", value)",
    "}",
    "",
    "fn encode_float(value: f64) -> String {",
    "    format!(\"f:{}\", value)",
    "}",
    "",
    "fn encode_string(value: String) -> String {",
    "    format!(\"s:{}\", encode_hex(&value))",
    "}",
    "",
    "fn encode_int_array(values: Vec<i64>) -> String {",
    "    format!(\"ai:{}\", values.iter().map(|value| value.to_string()).collect::<Vec<_>>().join(\",\"))",
    "}",
    "",
    "fn encode_float_array(values: Vec<f64>) -> String {",
    "    format!(\"af:{}\", values.iter().map(|value| value.to_string()).collect::<Vec<_>>().join(\",\"))",
    "}",
    "",
    "fn encode_string_array(values: Vec<String>) -> String {",
    "    format!(\"as:{}\", values.iter().map(|value| encode_hex(value)).collect::<Vec<_>>().join(\";\"))",
    "}",
    "",
  ].join("\n");
}

function renderDispatchArm(fn) {
  const setup = [
    `        "${fn.name}" => {`,
    `            if args.len() != ${fn.params.length} {`,
    `                return Err(format!("Rust export '${fn.name}' expected ${fn.params.length} argument(s), received {}", args.len()));`,
    "            }",
  ];
  const callArgs = [];

  fn.params.forEach((param, index) => {
    const variable = `arg_${index}`;
    setup.push(...renderDecodeLines(variable, param.type, `args[${index}]`));
    callArgs.push(renderCallArgument(variable, param.type));
  });

  const callExpression = `user_module::${fn.name}(${callArgs.join(", ")})`;
  if (fn.returnType.kind === "void") {
    setup.push(`            ${callExpression};`);
    setup.push('            Ok("v:".to_string())');
    setup.push("        },");
    return setup.join("\n");
  }

  setup.push(`            let result = ${callExpression};`);
  setup.push(`            Ok(${renderEncodeExpression("result", fn.returnType)})`);
  setup.push("        },");
  return setup.join("\n");
}

function renderDecodeLines(variable, type, sourceExpr) {
  switch (type.kind) {
    case "int":
      return [`            let ${variable}: ${type.rustType} = parse_int(${sourceExpr})? as ${type.rustType};`];
    case "float":
      return [`            let ${variable}: ${type.rustType} = parse_float(${sourceExpr})? as ${type.rustType};`];
    case "string":
      if (type.rustType === "&str") {
        return [
          `            let ${variable}_storage = parse_string(${sourceExpr})?;`,
          `            let ${variable}: &str = ${variable}_storage.as_str();`,
        ];
      }

      return [`            let ${variable}: String = parse_string(${sourceExpr})?;`];
    case "array":
      if (type.elementType.kind === "int") {
        return [`            let ${variable}: ${type.rustType} = parse_int_array(${sourceExpr})?.into_iter().map(|value| value as ${type.elementType.rustType}).collect();`];
      }

      if (type.elementType.kind === "float") {
        return [`            let ${variable}: ${type.rustType} = parse_float_array(${sourceExpr})?.into_iter().map(|value| value as ${type.elementType.rustType}).collect();`];
      }

      return [`            let ${variable}: ${type.rustType} = parse_string_array(${sourceExpr})?;`];
    default:
      return [`            return Err("Unsupported Rust parameter type".to_string());`];
  }
}

function renderCallArgument(variable, type) {
  if (type.kind === "string" && type.rustType === "&str") {
    return variable;
  }

  return variable;
}

function renderEncodeExpression(variable, type) {
  switch (type.kind) {
    case "int":
      return `encode_int(${variable} as i64)`;
    case "float":
      return `encode_float(${variable} as f64)`;
    case "string":
      return `encode_string(${variable}.to_string())`;
    case "array":
      if (type.elementType.kind === "int") {
        return `encode_int_array(${variable}.into_iter().map(|value| value as i64).collect())`;
      }

      if (type.elementType.kind === "float") {
        return `encode_float_array(${variable}.into_iter().map(|value| value as f64).collect())`;
      }

      return `encode_string_array(${variable})`;
    default:
      return '"v:".to_string()';
  }
}

function renderBridgeSource() {
  return [
    "use std::env;",
    "use std::ffi::{CStr, CString};",
    "use std::os::raw::{c_char, c_void};",
    "",
    "type InvokeFn = unsafe extern \"C\" fn(*const c_char, *const c_char) -> *mut c_char;",
    "type ManifestFn = unsafe extern \"C\" fn() -> *mut c_char;",
    "type FreeFn = unsafe extern \"C\" fn(*mut c_char);",
    "",
    "#[cfg(unix)]",
    "const RTLD_NOW: i32 = 2;",
    "",
    "fn main() {",
    "    if let Err(error) = run() {",
    "        eprintln!(\"{}\", error);",
    "        std::process::exit(1);",
    "    }",
    "}",
    "",
    "fn run() -> Result<(), String> {",
    "    let mut args = env::args().skip(1).collect::<Vec<_>>();",
    "    if args.is_empty() {",
    "        return Err(\"Usage: mgl_bridge <library> [--manifest|<function> <args...>]\".to_string());",
    "    }",
    "",
    "    let library_path = args.remove(0);",
    "    let library = Library::open(&library_path)?;",
    "    let free_fn = library.symbol::<FreeFn>(\"mgl_free_string\")?;",
    "",
    "    if args.first().map(|value| value.as_str()) == Some(\"--manifest\") {",
    "        let manifest_fn = library.symbol::<ManifestFn>(\"mgl_manifest_text\")?;",
    "        let rendered = unsafe { take_string(manifest_fn(), free_fn)? };",
    "        print!(\"{}\", rendered);",
    "        return Ok(());",
    "    }",
    "",
    "    if args.is_empty() {",
    "        return Err(\"Expected Rust export name.\".to_string());",
    "    }",
    "",
    "    let function_name = args.remove(0);",
    "    let payload = args.join(\"\\n\");",
    "    let invoke_fn = library.symbol::<InvokeFn>(\"mgl_invoke_text\")?;",
    "    let function_name_c = CString::new(function_name).map_err(|error| error.to_string())?;",
    "    let payload_c = CString::new(payload).map_err(|error| error.to_string())?;",
    "    let rendered = unsafe { take_string(invoke_fn(function_name_c.as_ptr(), payload_c.as_ptr()), free_fn)? };",
    "    print!(\"{}\", rendered);",
    "    Ok(())",
    "}",
    "",
    "unsafe fn take_string(ptr: *mut c_char, free_fn: FreeFn) -> Result<String, String> {",
    "    if ptr.is_null() {",
    "        return Err(\"Rust bridge returned a null pointer\".to_string());",
    "    }",
    "",
    "    let rendered = CStr::from_ptr(ptr)",
    "        .to_str()",
    "        .map(|value| value.to_string())",
    "        .map_err(|error| error.to_string())?;",
    "    free_fn(ptr);",
    "    Ok(rendered)",
    "}",
    "",
    "struct Library {",
    "    handle: *mut c_void,",
    "}",
    "",
    "impl Library {",
    "    fn open(path: &str) -> Result<Self, String> {",
    "        #[cfg(unix)]",
    "        unsafe {",
    "            let path_c = CString::new(path).map_err(|error| error.to_string())?;",
    "            let handle = dlopen(path_c.as_ptr(), RTLD_NOW);",
    "            if handle.is_null() {",
    "                return Err(last_dl_error());",
    "            }",
    "            Ok(Self { handle })",
    "        }",
    "",
    "        #[cfg(windows)]",
    "        unsafe {",
    "            let path_c = CString::new(path).map_err(|error| error.to_string())?;",
    "            let handle = LoadLibraryA(path_c.as_ptr());",
    "            if handle.is_null() {",
    "                return Err(\"LoadLibraryA failed\".to_string());",
    "            }",
    "            Ok(Self { handle: handle as *mut c_void })",
    "        }",
    "    }",
    "",
    "    fn symbol<T>(&self, name: &str) -> Result<T, String> {",
    "        #[cfg(unix)]",
    "        unsafe {",
    "            let symbol_name = CString::new(name).map_err(|error| error.to_string())?;",
    "            let symbol = dlsym(self.handle, symbol_name.as_ptr());",
    "            if symbol.is_null() {",
    "                return Err(format!(\"Unable to resolve symbol '{}'\", name));",
    "            }",
    "            Ok(std::mem::transmute_copy(&symbol))",
    "        }",
    "",
    "        #[cfg(windows)]",
    "        unsafe {",
    "            let symbol_name = CString::new(name).map_err(|error| error.to_string())?;",
    "            let symbol = GetProcAddress(self.handle as *mut _, symbol_name.as_ptr());",
    "            if symbol.is_null() {",
    "                return Err(format!(\"Unable to resolve symbol '{}'\", name));",
    "            }",
    "            Ok(std::mem::transmute_copy(&symbol))",
    "        }",
    "    }",
    "}",
    "",
    "impl Drop for Library {",
    "    fn drop(&mut self) {",
    "        #[cfg(unix)]",
    "        unsafe {",
    "            let _ = dlclose(self.handle);",
    "        }",
    "",
    "        #[cfg(windows)]",
    "        unsafe {",
    "            let _ = FreeLibrary(self.handle as *mut _);",
    "        }",
    "    }",
    "}",
    "",
    "#[cfg(unix)]",
    "fn last_dl_error() -> String {",
    "    unsafe {",
    "        let error = dlerror();",
    "        if error.is_null() {",
    "            return \"dlopen failed\".to_string();",
    "        }",
    "        CStr::from_ptr(error).to_string_lossy().to_string()",
    "    }",
    "}",
    "",
    "#[cfg(unix)]",
    "unsafe extern \"C\" {",
    "    fn dlopen(filename: *const c_char, flags: i32) -> *mut c_void;",
    "    fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;",
    "    fn dlclose(handle: *mut c_void) -> i32;",
    "    fn dlerror() -> *const c_char;",
    "}",
    "",
    "#[cfg(windows)]",
    "unsafe extern \"system\" {",
    "    fn LoadLibraryA(lpLibFileName: *const c_char) -> *mut c_void;",
    "    fn GetProcAddress(hModule: *mut c_void, lpProcName: *const c_char) -> *mut c_void;",
    "    fn FreeLibrary(hLibModule: *mut c_void) -> i32;",
    "}",
    "",
  ].join("\n");
}

module.exports = {
  compileRustModule,
};
