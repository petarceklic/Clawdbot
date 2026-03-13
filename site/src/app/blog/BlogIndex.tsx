"use client";
import { useState } from "react";
import Link from "next/link";
import { BUCKETS } from "@/lib/blog";

interface Post {
  slug: string;
  title: string;
  bucket: string;
  tags: string[];
  dataPoint: string;
  excerpt: string;
  publishedAt: string;
}

export default function BlogIndex({ posts }: { posts: Post[] }) {
  const [activeBucket, setActiveBucket] = useState<string | null>(null);
  const filtered = activeBucket ? posts.filter((p) => p.bucket === activeBucket) : posts;
  const buckets = [...new Set(posts.map((p) => p.bucket))];

  if (posts.length === 0) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "80px 24px", textAlign: "center" }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>No posts yet</p>
        <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 8 }}>Check back soon for trade disruption insights.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, letterSpacing: "-0.02em" }}>Insights</h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 32, lineHeight: 1.6 }}>
        Trade disruption intelligence, analysis, and data-driven insights.
      </p>

      {/* Bucket filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 32, flexWrap: "wrap" }}>
        <button
          onClick={() => setActiveBucket(null)}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            padding: "5px 14px",
            borderRadius: 6,
            border: `1px solid ${!activeBucket ? "var(--green)" : "var(--border)"}`,
            background: !activeBucket ? "var(--green-dim)" : "var(--bg-elevated)",
            color: !activeBucket ? "var(--green)" : "var(--text-secondary)",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          All
        </button>
        {buckets.map((b) => {
          const bucket = BUCKETS[b];
          const isActive = activeBucket === b;
          return (
            <button
              key={b}
              onClick={() => setActiveBucket(isActive ? null : b)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                padding: "5px 14px",
                borderRadius: 6,
                border: `1px solid ${isActive ? bucket?.color || "var(--green)" : "var(--border)"}`,
                background: isActive ? `${bucket?.color}18` : "var(--bg-elevated)",
                color: isActive ? bucket?.color || "var(--green)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {bucket?.label || b}
            </button>
          );
        })}
      </div>

      {/* Post grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {filtered.map((post) => {
          const bucket = BUCKETS[post.bucket];
          return (
            <Link key={post.slug} href={`/blog/${post.slug}`} style={{ textDecoration: "none" }}>
              <article style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                borderTop: `3px solid ${bucket?.color || "var(--green)"}`,
                padding: 24,
                transition: "border-color 0.2s, transform 0.2s",
                height: "100%",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${bucket?.color || "var(--green)"}18`,
                    color: bucket?.color || "var(--green)",
                  }}>
                    {bucket?.label || post.bucket}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                    {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8, lineHeight: 1.3 }}>
                  {post.title}
                </h2>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>
                  {post.excerpt}
                </p>
                {post.dataPoint && (
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--green)", fontWeight: 500 }}>
                    {post.dataPoint}
                  </p>
                )}
                {post.tags.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                    {post.tags.map((tag) => (
                      <span key={tag} style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        padding: "2px 8px",
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
              </article>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
