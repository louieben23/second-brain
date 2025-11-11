import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  const p = path.join(process.cwd(), "125.txt");
  let text = "";
  try {
    text = fs.readFileSync(p, "utf-8");
  } catch (e) {
    return NextResponse.json({ error: "Could not read sample file" }, { status: 500 });
  }

  return NextResponse.json({ text });
}
