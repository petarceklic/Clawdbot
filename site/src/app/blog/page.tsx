import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import BlogIndex from "./BlogIndex";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Insights — Disruptis",
  description: "Trade disruption analysis: severity trends, commodity risk intelligence, supply chain signals, and event pattern analysis from Disruptis.",
};

async function getPosts() {
  try {
    const posts = await prisma.post.findMany({ orderBy: { publishedAt: "desc" } });
    return posts.map((p) => ({
      slug: p.slug,
      title: p.title,
      bucket: p.bucket,
      tags: p.tags,
      dataPoint: p.dataPoint || "",
      excerpt: p.excerpt,
      publishedAt: p.publishedAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export default async function BlogPage() {
  const posts = await getPosts();
  return <BlogIndex posts={posts} />;
}
