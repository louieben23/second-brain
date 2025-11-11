import { NextResponse } from "next/server";
import { generateEmbeddings } from "../../actions/embeddings";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text, metadata } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing 'text' in request body" }, { status: 400 });
    }

    const res = await generateEmbeddings(text, metadata || {});

    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
