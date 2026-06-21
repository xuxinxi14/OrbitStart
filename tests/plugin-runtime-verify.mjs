/**
 * Plugin Worker Runtime — verification harness
 *
 * Runs in Node and exercises the pure-JS pieces of the worker runtime:
 *   1. preparePluginSource() — source transformation
 *   2. WORKER_BOOTSTRAP logic — activate / register-command / query-provider
 *
 * We can't spin up a real Web Worker in Node without extra deps, so we
 * simulate the Worker message protocol by evaluating the bootstrap in a
 * sandboxed function scope and intercepting postMessage.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";

const runtimePath = new URL("../src/plugin/workerRuntime.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const source = readFileSync(runtimePath, "utf-8");

// --- Extract WORKER_BOOTSTRAP string literal ---
const bootstrapMatch = source.match(/const WORKER_BOOTSTRAP = String\.raw`([\s\S]*?)`;/);
if (!bootstrapMatch) {
  console.error("FAIL: could not extract WORKER_BOOTSTRAP from workerRuntime.ts");
  process.exit(1);
}
const bootstrap = bootstrapMatch[1];

// --- Extract preparePluginSource function (it's not exported, so we copy its logic) ---
// We'll reimplement the same transforms to verify they produce valid JS.
function preparePluginSource(source, entry) {
  let next = source.replace(/^\s*import\s+type\s+[^;]+;\s*/gm, "");
  if (/^\s*import\s+(?!type\b)/m.test(next)) {
    throw new Error("Plugin runtime does not support static imports yet.");
  }
  next = next
    .replace(/^\s*export\s+\{\s*\};?\s*$/gm, "")
    .replace(/\s+satisfies\s+OrbitPlugin\b/g, "")
    .replace(/:\s*OrbitPlugin\b/g, "")
    .replace(/:\s*OrbitPluginContext\b/g, "")
    .replace(/export\s+default\s+/g, "__orbit_exports.default = ");
  return `${next}\n//# sourceURL=orbit-plugin://${entry}`;
}

// --- Read the hello-command plugin source ---
const pluginSource = readFileSync(
  new URL("../plugins/hello-command/main.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "utf-8"
);

let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

console.log("\n=== OrbitStart Plugin Worker Runtime Verification ===\n");

// --- Test 1: preparePluginSource strips import type ---
console.log("Test 1: preparePluginSource transformation");
const prepared = preparePluginSource(pluginSource, "main.ts");
ok("strips import type lines", !prepared.includes("import type"), `found 'import type' in: ${prepared.slice(0, 100)}`);
ok("strips : OrbitPlugin annotation", !prepared.includes(": OrbitPlugin"), `found ': OrbitPlugin' in: ${prepared.slice(0, 200)}`);
ok("rewrites export default", prepared.includes("__orbit_exports.default ="), `missing __orbit_exports.default in: ${prepared.slice(0, 200)}`);
ok("preserves activate call", prepared.includes("activate(ctx)"), "activate(ctx) not found");
ok("preserves registerCommand", prepared.includes("registerCommand"), "registerCommand not found");
ok("preserves registerProvider", prepared.includes("registerProvider"), "registerProvider not found");

// --- Test 2: prepared source is valid JavaScript (parseable) ---
console.log("\nTest 2: prepared source is valid JS");
try {
  new vm.Script(prepared);
  ok("new vm.Script(prepared) parses without error", true);
} catch (e) {
  ok("new vm.Script(prepared) parses without error", false, e.message);
}

// --- Test 3: simulate Worker bootstrap execution ---
console.log("\nTest 3: simulate Worker bootstrap activate()");

const manifest = JSON.parse(readFileSync(
  new URL("../plugins/hello-command/plugin.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "utf-8"
));

const messages = [];
const sandbox = {
  self: {
    postMessage: (msg) => messages.push(msg),
    onmessage: null,
  },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Promise: Promise,
  Map: Map,
  Set: Set,
  Array: Array,
  String: String,
  Number: Number,
  Math: Math,
  Date: Date,
  JSON: JSON,
  Error: Error,
  encodeURIComponent: encodeURIComponent,
  decodeURIComponent: decodeURIComponent,
  localStorage: {
    _store: {},
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = v; },
    removeItem(k) { delete this._store[k]; },
  },
};

const bootstrapScript = `${bootstrap}\n;self.onmessage = self.onmessage;`;

try {
  const context = vm.createContext(sandbox);
  vm.runInContext(bootstrapScript, context);
  ok("bootstrap evaluates without error", true);
} catch (e) {
  ok("bootstrap evaluates without error", false, e.message);
}

// Send activate message
try {
  const activateMessage = {
    type: "request",
    requestId: "test-activate",
    action: "activate",
    payload: {
      plugin: manifest,
      permissions: ["ui:toast"],
      source: prepared,
    },
  };
  messages.length = 0;
  vm.runInContext(`self.onmessage(${JSON.stringify({ data: activateMessage })})`, sandbox);
  ok("activate message processed without throw", true);
} catch (e) {
  ok("activate message processed without throw", false, e.message);
}

// Wait for async activate to complete
await new Promise((r) => setTimeout(r, 200));

const registerCmdMsg = messages.find((m) => m.type === "register-command");
ok("emits register-command message", !!registerCmdMsg, `messages: ${JSON.stringify(messages.map((m) => m.type))}`);
if (registerCmdMsg) {
  ok("command id is scoped", registerCmdMsg.command.id === "hello-command.sayHello", `got: ${registerCmdMsg.command.id}`);
  ok("command title present", registerCmdMsg.command.title === "Hello from local plugin", `got: ${registerCmdMsg.command.title}`);
  ok("command pluginId set", registerCmdMsg.command.pluginId === "hello-command", `got: ${registerCmdMsg.command.pluginId}`);
}

const registerProviderMsg = messages.find((m) => m.type === "register-search-provider");
ok("emits register-search-provider message", !!registerProviderMsg, `messages: ${JSON.stringify(messages.map((m) => m.type))}`);
if (registerProviderMsg) {
  ok("provider id is scoped", registerProviderMsg.id === "hello-command.search", `got: ${registerProviderMsg.id}`);
}

const logMsg = messages.find((m) => m.type === "runtime-log");
ok("no error logs during activate", !logMsg || logMsg.level !== "error", logMsg ? `error: ${logMsg.message}` : "");

// --- Test 4: query-provider returns search results ---
console.log("\nTest 4: query-provider execution");
try {
  const queryMessage = {
    type: "request",
    requestId: "test-query",
    action: "query-provider",
    payload: { providerId: "hello-command.search", query: "hello world" },
  };
  messages.length = 0;
  vm.runInContext(`self.onmessage(${JSON.stringify({ data: queryMessage })})`, sandbox);
  ok("query-provider message processed without throw", true);
} catch (e) {
  ok("query-provider message processed without throw", false, e.message);
}

await new Promise((r) => setTimeout(r, 200));

const queryResponse = messages.find((m) => m.type === "response" && m.requestId === "test-query");
ok("query-provider returns response", !!queryResponse, `messages: ${JSON.stringify(messages.map((m) => m.type))}`);
if (queryResponse) {
  ok("response is ok", queryResponse.ok === true, `error: ${queryResponse.error}`);
  if (queryResponse.ok && queryResponse.result) {
    const results = queryResponse.result;
    ok("returns 1 search result", Array.isArray(results) && results.length === 1, `got: ${JSON.stringify(results)}`);
    if (results.length > 0) {
      ok("result title correct", results[0].title === "Hello plugin search result", `got: ${results[0].title}`);
      ok("result has actionId", !!results[0].actionId, "missing actionId");
    }
  }
}

// --- Test 5: run-command executes the handler ---
console.log("\nTest 5: run-command execution");
try {
  const runMessage = {
    type: "request",
    requestId: "test-run",
    action: "run-command",
    payload: { commandId: "hello-command.sayHello" },
  };
  messages.length = 0;
  vm.runInContext(`self.onmessage(${JSON.stringify({ data: runMessage })})`, sandbox);
  ok("run-command message processed without throw", true);
} catch (e) {
  ok("run-command message processed without throw", false, e.message);
}

await new Promise((r) => setTimeout(r, 200));

const toastMsg = messages.find((m) => m.type === "ui-toast");
ok("command run triggers ui-toast", !!toastMsg, `messages: ${JSON.stringify(messages.map((m) => m.type))}`);
if (toastMsg) {
  ok("toast message correct", toastMsg.message === "Hello from a local plugin", `got: ${toastMsg.message}`);
}

const runResponse = messages.find((m) => m.type === "response" && m.requestId === "test-run");
ok("run-command returns ok response", !!runResponse && runResponse.ok === true, `response: ${JSON.stringify(runResponse)}`);

// --- Test 6: permission enforcement ---
console.log("\nTest 6: permission enforcement (ui:toast blocked)");
const sandboxNoPerm = {
  self: { postMessage: (msg) => {}, onmessage: null },
  console: console,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  Promise: Promise,
  Map: Map,
  Set: Set,
  Array: Array,
  String: String,
  Number: Number,
  Math: Math,
  Date: Date,
  JSON: JSON,
  Error: Error,
  encodeURIComponent: encodeURIComponent,
  decodeURIComponent: decodeURIComponent,
};
const messagesNoPerm = [];
sandboxNoPerm.self.postMessage = (msg) => messagesNoPerm.push(msg);

try {
  const ctx2 = vm.createContext(sandboxNoPerm);
  vm.runInContext(bootstrapScript, ctx2);
  const activateNoPerm = {
    type: "request",
    requestId: "test-no-perm",
    action: "activate",
    payload: { plugin: manifest, permissions: [], source: prepared },
  };
  vm.runInContext(`self.onmessage(${JSON.stringify({ data: activateNoPerm })})`, ctx2);
  await new Promise((r) => setTimeout(r, 200));

  // Try to run the command (which calls ctx.ui.toast)
  messagesNoPerm.length = 0;
  const runNoPerm = {
    type: "request",
    requestId: "test-run-noperm",
    action: "run-command",
    payload: { commandId: "hello-command.sayHello" },
  };
  vm.runInContext(`self.onmessage(${JSON.stringify({ data: runNoPerm })})`, ctx2);
  await new Promise((r) => setTimeout(r, 200));

  const runResp = messagesNoPerm.find((m) => m.type === "response" && m.requestId === "test-run-noperm");
  ok("ui.toast blocked without ui:toast permission", !!runResp && runResp.ok === false, `response: ${JSON.stringify(runResp)}`);
  if (runResp && !runResp.ok) {
    ok("error mentions Permission denied", runResp.error.includes("Permission denied"), `error: ${runResp.error}`);
  }
} catch (e) {
  ok("permission enforcement test ran", false, e.message);
}

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
