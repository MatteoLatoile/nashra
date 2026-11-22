import type { Metadata } from "next";
import Link from "next/link";

const url = "https://www.usenashra.com/en/telegram-scheduler";

export const metadata: Metadata = {
  title: "Telegram Scheduler – Schedule Messages & Posts | Nashra",
  description:
    "Schedule Telegram messages and publish to multiple groups and channels using your personal Telegram account. Discover Nashra.",
  alternates: { canonical: url },
  openGraph: {
    title: "Telegram Scheduler | Nashra",
    description:
      "Schedule Telegram posts and manage publishing across groups and channels.",
    url,
    type: "website",
  },
};

export default function TelegramSchedulerPage() {
  return (
    <main
      lang="en"
      style={{
        minHeight: "100vh",
        background: "#09090b",
        color: "#fafafa",
        padding: "80px 24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: 850, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#a5b4fc" }}>
          ← Nashra
        </Link>

        <h1 style={{ fontSize: "clamp(32px, 5vw, 56px)", marginTop: 48 }}>
          Telegram Scheduler for Groups and Channels
        </h1>

        <p style={{ fontSize: 20, lineHeight: 1.7, color: "#a1a1aa" }}>
          Schedule Telegram messages, organize your posts, and publish
          across multiple groups and channels from your personal
          Telegram account with Nashra.
        </p>

        <Link
          href="/"
          style={{
            display: "inline-block",
            marginTop: 24,
            background: "#6366f1",
            color: "#fff",
            padding: "14px 24px",
            borderRadius: 10,
            textDecoration: "none",
          }}
        >
          Get started with Nashra
        </Link>

        <section style={{ marginTop: 80, lineHeight: 1.8 }}>
          <h2>Schedule Telegram Messages</h2>
          <p>
            Prepare your content in advance and choose when your
            Telegram messages should be published.
          </p>

          <h2>Publish to Multiple Telegram Groups</h2>
          <p>
            Organize publishing across your selected Telegram groups
            and channels without preparing each post separately.
          </p>

          <h2>Use Your Personal Telegram Account</h2>
          <p>
            Nashra is designed for publishing through your own
            Telegram account, rather than relying exclusively
            on a Telegram bot.
          </p>

          <h2>Who Is Nashra For?</h2>
          <p>
            Nashra helps community managers, creators, and businesses
            coordinate their Telegram publishing workflow.
          </p>

          <h2>Start Scheduling Telegram Posts</h2>
          <p>
            Explore Nashra and choose the publishing plan that
            fits your needs.
          </p>
        </section>
      </div>
    </main>
  );
}
