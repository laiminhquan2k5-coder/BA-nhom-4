import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server.js";

let app, base;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kilo", "soulwine-http-"));
before(async () => { app = createApp(dir, { logging: false }); await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve)); base = `http://127.0.0.1:${app.server.address().port}`; });
after(async () => { await new Promise((resolve) => app.server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });

function rawRequest(target, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: "127.0.0.1", port: app.server.address().port, path: target, headers }, (response) => {
      let body = ""; response.setEncoding("utf8"); response.on("data", (chunk) => body += chunk); response.on("end", () => resolve({ status: response.statusCode, body }));
    });
    request.on("error", reject); request.end();
  });
}

test("untrusted Host and malformed targets never terminate the server", async () => {
  assert.equal((await rawRequest("/api/health", { Host: "[" })).status, 200);
  assert.equal((await rawRequest("http://untrusted.example/api/health")).status, 400);
  assert.equal((await rawRequest("/api/products/%ZZ")).status, 400);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
});

test("JSON shape, syntax, content type and size are validated", async () => {
  for (const body of ["null", "[]", "123", "{broken", '{"__proto__":{"polluted":true}}']) {
    const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    assert.equal(response.status, 400, body);
    assert.equal(typeof (await response.json()).requestId, "string");
  }
  assert.equal((await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: '{}' })).status, 415);
  const oversized = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x".repeat(1024 * 1024) }) });
  assert.equal(oversized.status, 413);
  assert.equal(({}).polluted, undefined);
});

test("CORS applies one allowlist to preflight and normal responses", async () => {
  const allowed = await fetch(`${base}/api/health`, { method: "OPTIONS", headers: { Origin: "http://localhost:4173", "Access-Control-Request-Method": "GET" } });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), "http://localhost:4173");
  assert.equal(allowed.headers.get("Vary"), "Origin");
  for (const method of ["GET", "OPTIONS"]) {
    const denied = await fetch(`${base}/api/health`, { method, headers: { Origin: "https://untrusted.example" } });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("Access-Control-Allow-Origin"), null);
  }
});

test("reads, rejected reads and rejected mutations have request-linked audit records", async () => {
  const read = await fetch(`${base}/api`);
  assert.equal(read.status, 200);
  const readId = read.headers.get("X-Request-Id");
  assert(app.store.journal.some((event) => event.requestId === readId && event.action === "http.read"));
  const denied = await fetch(`${base}/api/users`);
  assert.equal(denied.status, 401);
  const payload = await denied.json();
  assert.equal(denied.headers.get("X-Request-Id"), payload.requestId);
  assert(app.store.journal.some((event) => event.requestId === payload.requestId && event.status === 401));
  const failedLogin = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "unregistered@example.test", password: "PRIVATE_TEST_PASSWORD_123" }) });
  assert.equal(failedLogin.status, 401);
  assert(!JSON.stringify(app.store.journal).includes("PRIVATE_TEST_PASSWORD_123"));
});
