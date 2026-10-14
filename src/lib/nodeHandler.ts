import { NextResponse } from "next/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Vercel/Node-style serverless handler: (req, res) => void */
export type NodeHandler = (req: any, res: any) => unknown;

/**
 * Runs an unmodified Vercel Node serverless function (req/res style) as a
 * Next.js App Router route handler. Supports what such handlers typically use:
 * req.method / headers / body / query, res.status().json(), setHeader(), send(), end().
 */
export function adaptNodeHandler(handler: NodeHandler) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    let body: unknown;
    if (request.method !== "GET" && request.method !== "HEAD") {
      const text = await request.text();
      if ((headers["content-type"] ?? "").includes("application/json")) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      } else {
        body = text;
      }
    }
    const req = { method: request.method, headers, body, query: Object.fromEntries(url.searchParams), url: url.pathname + url.search };

    return new Promise<Response>((resolve) => {
      let status = 200;
      let done = false;
      const resHeaders = new Headers();
      const finish = (r: Response) => {
        if (!done) {
          done = true;
          resolve(r);
        }
      };
      const res = {
        status(code: number) {
          status = code;
          return res;
        },
        setHeader(name: string, value: string | number | string[]) {
          resHeaders.set(name, Array.isArray(value) ? value.join(", ") : String(value));
          return res;
        },
        getHeader(name: string) {
          return resHeaders.get(name) ?? undefined;
        },
        json(data: unknown) {
          resHeaders.set("Content-Type", "application/json; charset=utf-8");
          finish(new Response(JSON.stringify(data), { status, headers: resHeaders }));
          return res;
        },
        send(data: unknown) {
          finish(new Response(typeof data === "string" ? data : JSON.stringify(data), { status, headers: resHeaders }));
          return res;
        },
        end(data?: string) {
          finish(new Response(data ?? null, { status, headers: resHeaders }));
          return res;
        },
      };
      Promise.resolve()
        .then(() => handler(req, res))
        .then(() => finish(new Response(null, { status, headers: resHeaders })))
        .catch((e: unknown) => finish(NextResponse.json({ erreur: e instanceof Error ? e.message : String(e) }, { status: 500 })));
    });
  };
}
