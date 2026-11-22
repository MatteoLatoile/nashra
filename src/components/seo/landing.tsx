import Link from "next/link";
import { seoPages, type SeoPageKey } from "./content";
import styles from "./landing.module.css";

const base = "https://www.usenashra.com";

export function SeoLanding({ page }: { page: SeoPageKey }) {
  const content = seoPages[page];
  const url = `${base}/en/${page}`;
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "WebPage", name: content.title, description: content.desc, url, inLanguage: "en" },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Nashra", item: base + "/" },
      { "@type": "ListItem", position: 2, name: content.label, item: url },
    ] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: content.faqs.map(([q,a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
  return (
    <main lang="en" className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand} aria-label="Nashra home">Nashra<span>.</span></Link>
          <nav aria-label="Primary navigation" className={styles.topnav}>
            <Link href="/">Home</Link><Link href="/aide">Help</Link><Link href="/en/blog">Guides</Link><Link href="/connexion" className={styles.topcta}>Start free</Link>
          </nav>
        </header>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span>{content.label}</span></nav>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>TELEGRAM PUBLISHING • NASHRA</span>
          <h1>{content.h1}</h1>
          <p className={styles.lede}>{content.intro}</p>
          <div className={styles.actions}><Link href="/connexion" className={styles.button}>Start with Nashra →</Link><Link href="#how-it-works" className={styles.secondary}>See how it works</Link></div>
          <p className={styles.note}>Independent service • Always follow Telegram rules and group permissions</p>
        </section>
        <section className={styles.section} aria-labelledby="why-heading">
          <span className={styles.sectionKicker}>WHY NASHRA</span><h2 id="why-heading">A simpler way to organize Telegram publishing</h2>
          <div className={styles.grid}>{content.benefits.map(([heading,text])=><article className={styles.card} key={heading}><h3>{heading}</h3><p>{text}</p></article>)}</div>
          <p className={styles.audience}>{content.audience}</p>
        </section>
        <section className={styles.section} id="how-it-works" aria-labelledby="how-heading">
          <span className={styles.sectionKicker}>HOW IT WORKS</span><h2 id="how-heading">Three steps to prepare your posts</h2>
          <ol className={styles.steps}>{content.steps.map((step,i)=><li key={step}><span>{String(i+1).padStart(2,'0')}</span><p>{step}</p></li>)}</ol>
          <p className={styles.note}>Available functionality and publishing limits depend on your plan and account permissions.</p>
        </section>
        <section className={styles.section} aria-labelledby="faq-heading">
          <span className={styles.sectionKicker}>COMMON QUESTIONS</span><h2 id="faq-heading">Frequently asked questions</h2>
          <div className={styles.faq}>{content.faqs.map(([q,a])=><article key={q}><h3>{q}</h3><p>{a}</p></article>)}</div>
        </section>
        <section className={styles.section} aria-labelledby="explore-heading">
          <span className={styles.sectionKicker}>EXPLORE THE PLATFORM</span><h2 id="explore-heading">More Telegram publishing guides</h2>
          <div className={styles.related}>{(Object.keys(seoPages) as SeoPageKey[]).filter(k=>k!==page).map(k=><Link key={k} href={`/en/${k}`}>{seoPages[k].label}<span aria-hidden="true">↗</span></Link>)}</div>
        </section>
        <section className={styles.bottom}><h2>Ready to organize your Telegram posts?</h2><p>Create your Nashra account and explore the available plans.</p><Link href="/connexion" className={styles.button}>Get started with Nashra →</Link></section>
        <footer className={styles.footer}><Link href="/">Nashra</Link><Link href="/aide">Help center</Link><Link href="/en/blog">All guides</Link><span>Nashra is not affiliated with Telegram.</span></footer>
      </div>
    </main>
  );
}
