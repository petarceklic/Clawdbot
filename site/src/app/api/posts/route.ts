import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const posts = await prisma.post.findMany({
      select: { title: true, slug: true },
      orderBy: { publishedAt: "desc" },
    });
    return NextResponse.json(posts);
  } catch {
    return NextResponse.json([]);
  }
}
