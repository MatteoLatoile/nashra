import type { Metadata } from "next";
import { BlogIndex } from "@/components/blog/blog";

export const metadata: Metadata = {
  title: { absolute: "Telegram Publishing Guides & Tutorials | Nashra" },
  description: "Explore practical Telegram guides: schedule messages, publish to multiple groups, compare bots and personal accounts, and build a content calendar.",
  alternates: { canonical: "https://www.usenashra.com/en/blog" },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "Nashra", locale: "en_US", title: "Telegram Publishing Guides | Nashra", description: "Practical tutorials for Telegram groups, channels and scheduled publishing.", url: "https://www.usenashra.com/en/blog" },
  twitter: { card: "summary", title: "Telegram Publishing Guides | Nashra" },
};

export default function Page() { return <BlogIndex />; }
