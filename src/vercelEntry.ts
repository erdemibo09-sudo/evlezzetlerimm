import { Buffer } from "node:buffer";
import { createApp } from "./app.ts";
import { getDatabase } from "./db/database.ts";

const db = getDatabase();
const app = createApp(db, { enableSupabaseSync: true });

export default async function handler(req: any, res: any) {
  try {
    const proto = req.headers?.["x-forwarded-proto"] || "https";
    const host = req.headers?.["x-forwarded-host"] || req.headers?.host || "localhost:3000";
    const fullUrl = new URL(req.url || "/", `${proto}://${host}`);

    const headers = new Headers();
    if (req.headers) {
      for (const [k, v] of Object.entries(req.headers)) {
        if (Array.isArray(v)) {
          headers.set(k, v.join(", "));
        } else if (typeof v === "string") {
          headers.set(k, v);
        }
      }
    }

    const method = (req.method || "GET").toUpperCase();
    let bodyBytes: Uint8Array | undefined = undefined;

    if (method !== "GET" && method !== "HEAD") {
      if (req.body !== undefined && req.body !== null) {
        if (typeof req.body === "string") {
          bodyBytes = new TextEncoder().encode(req.body);
        } else if (Buffer.isBuffer(req.body) || req.body instanceof Uint8Array) {
          bodyBytes = new Uint8Array(req.body);
        } else if (typeof req.body === "object") {
          bodyBytes = new TextEncoder().encode(JSON.stringify(req.body));
        }
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        if (chunks.length > 0) {
          bodyBytes = new Uint8Array(Buffer.concat(chunks));
        }
      }
    }

    const webReq = new Request(fullUrl.toString(), {
      method,
      headers,
      body: bodyBytes ? (bodyBytes as unknown as BodyInit) : undefined,
    });

    const webRes = await app.fetch(webReq);

    res.statusCode = webRes.status;
    webRes.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const respArrayBuffer = await webRes.arrayBuffer();
    res.end(Buffer.from(respArrayBuffer));
  } catch (err) {
    console.error("Vercel Handler Error:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Sunucu hatası" }));
  }
}
