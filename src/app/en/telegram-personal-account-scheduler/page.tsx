import type { Metadata } from "next";
import Link from "next/link";

const canonical = "https://www.usenashra.com/en/telegram-personal-account-scheduler";

export const metadata: Metadata = {
  title: "Telegram Personal Account Scheduler | Nashra",
  description: "Schedule Telegram messages using your personal account. Organize publishing to groups and channels with the Nashra scheduler.",
  alternates: { canonical },
  openGraph: {
    title: "Telegram Personal Account Scheduler | Nashra",
    description: "Schedule Telegram messages using your personal account. Organize publishing to groups and channels with the Nashra scheduler.",
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
          Telegram Personal Account Scheduler
        </h1>

        <p style={{ fontSize: 20, lineHeight: 1.8, color: "#a1a1aa" }}>
          Schedule Telegram publishing using your connected personal account instead of depending only on a bot.
        </p>

                <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>S</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>c</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>C</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>r</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>W</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>h</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>S</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>o</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>M</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>a</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>O</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>r</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>S</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>t</p>
        </section>
        <section style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: 26, marginBottom: 12 }}>R</h2>
          <p style={{ color: "#a1a1aa", lineHeight: 1.8 }}>e</p>
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
