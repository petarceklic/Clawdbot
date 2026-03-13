import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.secret !== process.env.PUBLISH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const post = await prisma.post.upsert({
    where: { slug: body.slug },
    update: {
      title: body.title,
      excerpt: body.excerpt,
      content: body.content,
      bucket: body.bucket,
      tags: body.tags ?? [],
      dataPoint: body.dataPoint ?? "",
      metaTitle: body.metaTitle ?? "",
      metaDesc: body.metaDesc ?? "",
      publishedAt: new Date(),
    },
    create: {
      slug: body.slug,
      title: body.title,
      excerpt: body.excerpt,
      content: body.content,
      bucket: body.bucket,
      tags: body.tags ?? [],
      dataPoint: body.dataPoint ?? "",
      metaTitle: body.metaTitle ?? "",
      metaDesc: body.metaDesc ?? "",
    },
  });
  revalidatePath("/blog");
  revalidatePath("/");
  return NextResponse.json({ success: true, post: { id: post.id, slug: post.slug } });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  if (body.secret !== process.env.PUBLISH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.post.delete({ where: { slug: body.slug } });
  revalidatePath("/blog");
  return NextResponse.json({ success: true });
}
