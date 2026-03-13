import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BUCKETS } from "@/lib/blog";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

async function getPost(slug: string) {
  try {
    return await prisma.post.findUnique({ where: { slug } });
  } catch {
    return null;
  }
}

async function getRelatedPosts(slug: string) {
  try {
    return await prisma.post.findMany({
      where: { slug: { not: slug } },
      orderBy: { publishedAt: "desc" },
      take: 3,
      select: { slug: true, title: true, bucket: true, excerpt: true, publishedAt: true },
    });
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Not Found" };
  return {
    title: post.metaTitle || `${post.title} — Disruptis`,
    description: post.metaDesc || post.excerpt,
    openGraph: {
      title: post.metaTitle || post.title,
      description: post.metaDesc || post.excerpt,
      type: "article",
      publishedTime: post.publishedAt.toISOString(),
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const bucket = BUCKETS[post.bucket] || { label: post.bucket, color: "var(--green)" };

  const related = await getRelatedPosts(slug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { "@type": "Organization", name: "Disruptis" },
    publisher: { "@type": "Organization", name: "Disruptis" },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 60px" }}>
        <Link href="/blog" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-secondary)", textDecoration: "none", display: "inline-block", marginBottom: 24 }}>
          &larr; Back to Insights
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            padding: "3px 10px",
            borderRadius: 4,
            background: `${bucket.color}18`,
            color: bucket.color,
          }}>
            {bucket.label}
          </span>
          <time style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            {post.publishedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </time>
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2, marginBottom: 16, letterSpacing: "-0.02em" }}>
          {post.title}
        </h1>

        {post.dataPoint && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--green)", fontWeight: 500, marginBottom: 16, padding: "10px 16px", background: "var(--green-dim)", borderRadius: 8, border: "1px solid rgba(21, 238, 118, 0.15)" }}>
            {post.dataPoint}
          </p>
        )}

        {post.tags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 32 }}>
            {post.tags.map((tag) => (
              <span key={tag} style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                padding: "3px 10px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                color: "var(--text-secondary)",
                background: "var(--bg-elevated)",
              }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="disruptis-prose" dangerouslySetInnerHTML={{ __html: post.content }} />
      </article>

      {related.length > 0 && (
        <section style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px 60px" }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 16 }}>Related Posts</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {related.map((r) => {
              const rb = BUCKETS[r.bucket] || { label: r.bucket, color: "var(--green)" };
              return (
                <Link key={r.slug} href={`/blog/${r.slug}`} style={{ textDecoration: "none" }}>
                  <div style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "16px 20px",
                    transition: "border-color 0.2s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: `${rb.color}18`, color: rb.color }}>
                        {rb.label}
                      </span>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{r.title}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
