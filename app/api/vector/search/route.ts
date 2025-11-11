import { NextResponse } from "next/server";
import { searchVectorStore } from "../../../lib/vector";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { query, k } = body;
    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Missing 'query' string in request body" }, { status: 400 });
    }

    const topK = typeof k === "number" && k > 0 ? k : 5;
    const res = await searchVectorStore(query, topK);
    if ((res as any).error) {
      return NextResponse.json({ error: (res as any).error }, { status: 500 });
    }

    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
