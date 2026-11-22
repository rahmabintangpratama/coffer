// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseHeaders } from "../headers/check.ts";
import { headersFor, startServer } from "./dist-server.ts";

describe("headersFor", () => {
  const rules = parseHeaders("/*\n  X-All: 1\n/assets/*\n  Cache-Control: immutable\n/index.html\n  Cache-Control: no-cache\n");

  it("applies the catch-all to every path and specific rules on top", () => {
    expect(headersFor(rules, "/other")).toEqual({ "x-all": "1" });
    expect(headersFor(rules, "/assets/app.js")).toEqual({ "x-all": "1", "cache-control": "immutable" });
    expect(headersFor(rules, "/index.html")).toEqual({ "x-all": "1", "cache-control": "no-cache" });
  });
});

describe("dist server", () => {
  let server: Server;
  let base = "";

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "coffer-dist-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "_headers"), "/*\n  X-Test: yes\n/assets/*\n  Cache-Control: immutable\n");
    writeFileSync(join(dir, "index.html"), "<h1>hi</h1>");
    writeFileSync(join(dir, "assets", "a.js"), "1");
    server = await startServer(dir, 0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("serves the index at / with the matching headers", async () => {
    const response = await fetch(`${base}/`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-test")).toBe("yes");
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  it("applies path-specific headers", async () => {
    const response = await fetch(`${base}/assets/a.js`);
    expect(response.headers.get("cache-control")).toBe("immutable");
  });

  it("returns 404 for a missing file and does not escape the directory", async () => {
    expect((await fetch(`${base}/missing`)).status).toBe(404);
    const escape = await fetch(`${base}/..%2F..%2Fetc%2Fpasswd`);
    expect(escape.status).toBe(404);
  });

  it("answers a malformed escape with 404 and keeps serving", async () => {
    // fetch() normalizes the URL, so send the raw request line.
    const status = await new Promise<number>((resolve, reject) => {
      const socket = connect(Number(new URL(base).port), "127.0.0.1", () => {
        socket.write("GET /%E0%A4%A HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
      });
      let data = "";
      socket.on("data", (chunk) => { data += String(chunk); });
      socket.on("end", () => { resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(data)?.[1])); });
      socket.on("error", reject);
    });
    expect(status).toBe(404);
    expect((await fetch(`${base}/`)).status).toBe(200);
  });
});
