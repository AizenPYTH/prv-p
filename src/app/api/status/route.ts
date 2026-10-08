import { NextResponse } from "next/server";

/** Tells the client whether server-side AI (Claude) is configured. */
export async function GET() {
  return NextResponse.json({ ai: Boolean(process.env.ANTHROPIC_API_KEY) });
}
