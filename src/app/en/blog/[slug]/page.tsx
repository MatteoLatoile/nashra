import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { blogPosts, getBlogPost } from "@/lib/seo-blog/posts";
import { BlogArticle } from "@/components/blog/blog";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { robots: { index: false, follow: false } };
  const url = `https://www.usenashra.com/en/blog/${post.slug}`;
  return {
    title: { absolute: `${post.title} | Nashra` },
    description: post.description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { type: "article", siteName: "Nashra", locale: "en_US", title: post.title, description: post.description, url, publishedTime: post.published, modifiedTime: post.updated },
    twitter: { card: "summary", title: post.title, description: post.description },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();
  return <BlogArticle post={post} />;
}
