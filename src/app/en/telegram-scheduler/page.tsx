import type { Metadata } from "next";
import { SeoLanding } from "@/components/seo/landing";
import { seoPages } from "@/components/seo/content";

const slug = "telegram-scheduler" as const;
const page = seoPages[slug];
export const metadata: Metadata = {
  title: { absolute: page.title },
  description: page.desc,
  alternates: { canonical: `https://www.usenashra.com/en/${slug}` },
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "Nashra", locale: "en_US", title: page.title, description: page.desc, url: `https://www.usenashra.com/en/${slug}` },
  twitter: { card: "summary", title: page.title, description: page.desc },
};
export default function Page() { return <SeoLanding page={slug} />; }
