import Link from "next/link";
import { blogPosts, getBlogPost, type BlogPost } from "@/lib/seo-blog/posts";
import styles from "./blog.module.css";

const site = "https://www.usenashra.com";

function BlogHeader() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo} aria-label="Nashra home">Nashra<span>.</span></Link>
      <nav className={styles.topNav} aria-label="Guides navigation">
        <Link href="/en/blog">All guides</Link>
        <Link href="/en/telegram-scheduler">Telegram scheduler</Link>
        <Link href="/connexion" className={styles.navButton}>Start free</Link>
      </nav>
    </header>
  );
}

function BlogFooter() {
  return (
    <footer className={styles.footer}>
      <p>© Nashra · Independent Telegram publishing software. Not affiliated with Telegram.</p>
      <nav aria-label="Footer navigation">
        <Link href="/en/blog">Guides</Link>
        <Link href="/en/telegram-auto-poster">Auto poster</Link>
        <Link href="/en/post-to-multiple-telegram-groups">Multiple groups</Link>
        <Link href="/en/telegram-personal-account-scheduler">Personal account</Link>
        <Link href="/">Nashra home</Link>
      </nav>
    </footer>
  );
}

function GuideCard({ post }: { post: BlogPost }) {
  return (
    <article className={styles.card}>
      <span className={styles.tag}>{post.category}</span>
      <h2><Link href={`/en/blog/${post.slug}`}>{post.title}</Link></h2>
      <p>{post.excerpt}</p>
      <Link href={`/en/blog/${post.slug}`} className={styles.readMore}>Read the guide <span aria-hidden="true">→</span></Link>
    </article>
  );
}

export function BlogIndex() {
  const collection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Telegram Publishing Guides | Nashra",
    url: `${site}/en/blog`,
    inLanguage: "en",
    hasPart: blogPosts.map((post) => ({ "@type": "WebPage", url: `${site}/en/blog/${post.slug}`, name: post.title })),
  };
  return (
    <main lang="en" className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collection).replace(/</g, "\\u003c") }} />
      <div className={styles.container}>
        <BlogHeader />
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/">Home</Link><span>/</span><span>Guides</span></nav>
        <section className={styles.indexHero}>
          <span className={styles.eyebrow}>THE NASHRA FIELD GUIDE</span>
          <h1>Practical guides for publishing on Telegram</h1>
          <p>Learn what Telegram can already do, how to organize publishing across permitted groups, and when a scheduling dashboard saves time. Clear steps, real examples and links to official documentation.</p>
          <div className={styles.heroActions}>
            <Link href="#articles" className={styles.buttonPrimary}>Explore all guides <span aria-hidden="true">↓</span></Link>
            <Link href="/en/telegram-scheduler" className={styles.buttonOutline}>Explore the scheduler</Link>
          </div>
        </section>
        <section id="articles" className={styles.indexSection} aria-labelledby="articles-title">
          <div className={styles.sectionIntro}><span className={styles.eyebrow}>LEARN BY DOING</span><h2 id="articles-title">7 guides, one clear publishing workflow</h2><p>Choose the problem you want to solve first.</p></div>
          <div className={styles.cardGrid}>{blogPosts.map((post) => <GuideCard key={post.slug} post={post} />)}</div>
        </section>
        <section className={styles.bottomCta}>
          <div><span className={styles.eyebrow}>FROM READING TO DOING</span><h2>Ready to organize your Telegram posts?</h2><p>Prepare announcements and coordinate authorized destinations from your Nashra dashboard.</p></div>
          <Link href="/connexion" className={styles.buttonPrimary}>Try Nashra →</Link>
        </section>
        <BlogFooter />
      </div>
    </main>
  );
}

export function BlogArticle({ post }: { post: BlogPost }) {
  const url = `${site}/en/blog/${post.slug}`;
  const richData = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      datePublished: post.published,
      dateModified: post.updated,
      inLanguage: "en",
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      author: { "@type": "Organization", name: "Nashra", url: site },
      publisher: { "@type": "Organization", name: "Nashra", url: site },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Nashra", item: site },
        { "@type": "ListItem", position: 2, name: "Telegram guides", item: `${site}/en/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];
  const related = post.related.map(getBlogPost).filter((item): item is BlogPost => item !== undefined);
  return (
    <main lang="en" className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(richData).replace(/</g, "\\u003c") }} />
      <div className={styles.container}>
        <BlogHeader />
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/">Home</Link><span>/</span><Link href="/en/blog">Guides</Link><span>/</span><span>{post.category}</span></nav>
        <div className={styles.articleLayout}>
          <article className={styles.article}>
            <header className={styles.articleHero}>
              <span className={styles.eyebrow}>{post.category.toUpperCase()} · TELEGRAM PUBLISHING</span>
              <h1>{post.title}</h1>
              <p className={styles.articleIntro}>{post.excerpt}</p>
              <div className={styles.byline}>By the Nashra team <span>·</span> Updated <time dateTime={post.updated}>{new Date(`${post.updated}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</time></div>
            </header>
            <nav className={styles.toc} aria-label="On this page"><strong>On this page</strong><ol>{post.sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.heading}</a></li>)}</ol></nav>
            <div className={styles.articleBody}>
              {post.sections.map((section, index) => (
                <section key={section.id} id={section.id} className={styles.articleSection} aria-labelledby={`${section.id}-heading`}>
                  <h2 id={`${section.id}-heading`}>{section.heading}</h2>
                  {section.paragraphs.map((paragraph, i) => <p key={`${section.id}-${i}`}>{paragraph}</p>)}
                  {section.steps && <ol className={styles.ordered}>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
                  {section.bullets && <ul className={styles.bullets}>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul>}
                  {section.example && <aside className={styles.example}><strong>Practical example</strong><p>{section.example}</p></aside>}
                  {index === 2 && <aside className={styles.inlineCta}><span>COORDINATE MULTIPLE DESTINATIONS</span><p>Nashra helps you organize scheduled posts for groups and channels where your account is allowed to publish.</p><Link href={`/en/${post.landing}`}>Explore the Nashra workflow →</Link></aside>}
                </section>
              ))}
            </div>
            <section className={styles.faqSection} aria-labelledby="faq-heading"><h2 id="faq-heading">Frequently asked questions</h2>{post.faqs.map((faq) => <div key={faq.question} className={styles.faqItem}><h3>{faq.question}</h3><p>{faq.answer}</p></div>)}</section>
            <section className={styles.sources} aria-labelledby="sources-title"><h2 id="sources-title">Official references</h2><p>For platform behavior and permissions, consult Telegram’s own documentation:</p><ul>{post.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} <span aria-hidden="true">↗</span></a></li>)}</ul></section>
            <div className={styles.bottomCta}><div><span className={styles.eyebrow}>NEXT STEP</span><h2>Plan your next Telegram announcement</h2><p>Use Nashra to manage your schedule and authorized destinations in one place.</p></div><Link href="/connexion" className={styles.buttonPrimary}>Start with Nashra →</Link></div>
          </article>
          <aside className={styles.sidebar} aria-label="Explore more Nashra guides">
            <div className={styles.sidebarBox}><strong>Explore the platform</strong><p>Learn how Nashra organizes publishing from a connected personal Telegram account.</p><Link href={`/en/${post.landing}`}>Explore {post.focus} →</Link></div>
            <div className={styles.sidebarBox}><strong>More topics</strong><Link href="/en/blog">Browse all articles</Link><Link href="/en/telegram-auto-poster">Telegram auto poster</Link><Link href="/en/telegram-personal-account-scheduler">Personal account scheduling</Link></div>
          </aside>
        </div>
        <section className={styles.relatedSection} aria-labelledby="related-title"><div className={styles.sectionIntro}><span className={styles.eyebrow}>KEEP EXPLORING</span><h2 id="related-title">Related guides</h2></div><div className={styles.cardGrid}>{related.map((item) => <GuideCard post={item} key={item.slug} />)}</div></section>
        <BlogFooter />
      </div>
    </main>
  );
}
