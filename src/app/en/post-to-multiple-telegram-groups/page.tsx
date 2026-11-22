import type { Metadata } from "next";
import Link from "next/link";

const canonical = "https://www.usenashra.com/en/post-to-multiple-telegram-groups";

export const metadata: Metadata = {
  title: "Post to Multiple Telegram Groups | Nashra",
  description: "Publish and schedule messages across multiple Telegram groups from one dashboard. Organize your Telegram posting with Nashra.",
  alternates: { canonical },
  openGraph: {
    title: "Post to Multiple Telegram Groups | Nashra",
    description: "Publish and schedule messages across multiple Telegram groups from one dashboard. Organize your Telegram posting with Nashra.",
    url: canonical,
    type: "website",
    locale: "en_US",
  },
};

export default function Page() {
  return (
    <main
      lang="en"
      style={{
        minHeight: "100vh",
        background: "#09090b",
        color: "#fafafa",
        padding: "72px 24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <article style={{ maxWidth: 850, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#a5b4fc" }}>
          Nashra
        </Link>

        <h1 style={{ fontSize: "clamp(32px, 5vw, 52px)", marginTop: 48 }}>
          Post to Multiple Telegram Groups
        </h1>

        <p style={{ fontSize: 20, lineHeight: 1.8, color: "#a1a1aa" }}>
          Manage your Telegram publishing workflow without preparing the same message separately for every selected group.
        </p>

                <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>O</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>n</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>P</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>r</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>S</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>c</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>C</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>h</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>O</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>r</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>K</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>e</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>U</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>s</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>C</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>o</p>
        </section>

        <section style={{ marginTop: 60 }}>
          <h2>Start Scheduling with Nashra</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>
            Explore Nashra and choose the publishing plan that suits your workflow.
          </p>
          <Link
            href="/"
            style={{
              display: "inline-block",
              background: "#6366f1",
              color: "#ffffff",
              padding: "14px 24px",
              marginTop: 18,
              borderRadius: 10,
              textDecoration: "none",
            }}
          >
            Get Started
          </Link>
        </section>
      </article>
    </main>
  );
}
