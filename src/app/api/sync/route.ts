import { NextResponse } from "next/server";
import { del, get, list } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const maxDuration = 60;

/** Blob paths are scoped by the SHA-256 of the user's sync code. */
const PATH = /^spaces\/[a-f0-9]{64}\/(?:(?:documents|templates)\/[\w-]+\.json|library\.json)$/;
const PREFIX = /^spaces\/[a-f0-9]{64}\/$/;

const configured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** GET ?prefix=… lists a space; GET ?path=… streams one private blob. */
export async function GET(req: Request) {
  if (!configured()) return NextResponse.json({ available: false });
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  const prefix = url.searchParams.get("prefix");
  try {
    if (path) {
      if (!PATH.test(path)) return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
      const blob = await get(path, { access: "private", useCache: false });
      if (!blob) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
      return new Response(blob.stream, { headers: { "Content-Type": "application/json" } });
    }
    if (prefix) {
      if (!PREFIX.test(prefix)) return NextResponse.json({ error: "Préfixe invalide" }, { status: 400 });
      const res = await list({ prefix, limit: 1000 });
      return NextResponse.json({
        available: true,
        blobs: res.blobs.map((b) => ({ pathname: b.pathname, uploadedAt: b.uploadedAt, size: b.size })),
      });
    }
    return NextResponse.json({ available: true });
  } catch (err) {
    return NextResponse.json({ available: true, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

/** Issues client upload tokens so large files bypass the function body limit. */
export async function POST(req: Request) {
  if (!configured()) return NextResponse.json({ available: false }, { status: 503 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!PATH.test(pathname)) throw new Error("Chemin invalide");
        return {
          access: "private",
          allowedContentTypes: ["application/json"],
          addRandomSuffix: false,
          allowOverwrite: true,
          maximumSizeInBytes: 200 * 1024 * 1024,
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  if (!configured()) return NextResponse.json({ available: false }, { status: 503 });
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!PATH.test(path)) return NextResponse.json({ error: "Chemin invalide" }, { status: 400 });
  await del(path);
  return NextResponse.json({ ok: true });
}
