/**
 * Tiny HTTP host: one API route plus static files. No framework — there is exactly
 * one endpoint and it does exactly one thing.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createThinker } from "./think.js";

const PORT = Number(process.env.PORT ?? 5174);
const WEB_ROOT = new URL("../../web/dist/", import.meta.url).pathname;

if (!process.env.TYPESAFE_API_KEY) {
  console.error("TYPESAFE_API_KEY is not set. Create .env at the repo root (see .env.example).");
  process.exit(1);
}

const think = createThinker();

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ts": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const json = (res: import("node:http").ServerResponse, code: number, body: unknown): void => {
  const payload = JSON.stringify(body);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
};

async function readBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    // The psyche state is deliberately small; anything large is a bug or an abuse.
    if (size > 256 * 1024) throw new Error("request body too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/think" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const state = (body as { state?: unknown })?.state;
      if (!state || typeof state !== "object") return json(res, 400, { error: "expected { state }" });

      const result = await think(state as never);
      console.log(`think ${result.latencyMs}ms  ${result.usage.input_tokens} tok  $${((result.usage.input_tokens / 1e6) * 0.042).toFixed(8)}`);
      return json(res, 200, result);
    } catch (err) {
      // The pet must not freeze because the network did. The client falls back to a
      // dull idle and tries again on the next heartbeat.
      const message = err instanceof Error ? err.message : String(err);
      console.error("think failed:", message);
      return json(res, 503, { error: "jev unavailable", detail: message });
    }
  }

  if (req.method === "GET") {
    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const path = join(WEB_ROOT, normalize(requested).replace(/^(\.\.[/\\])+/, ""));
    if (!path.startsWith(WEB_ROOT)) return json(res, 403, { error: "forbidden" });
    try {
      if (!(await stat(path)).isFile()) throw new Error("not a file");
      const body = await readFile(path);
      res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
      return res.end(body);
    } catch {
      return json(res, 404, { error: "not found" });
    }
  }

  return json(res, 405, { error: "method not allowed" });
});

server.listen(PORT, () => console.log(`jevagotchi -> http://localhost:${PORT}`));
