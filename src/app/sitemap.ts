import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://www.usenashra.com/', changeFrequency: 'weekly', priority: 1 },
    { url: 'https://www.usenashra.com/aide', changeFrequency: 'monthly', priority: 0.5 },
    { url: 'https://www.usenashra.com/programmation-telegram', changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://www.usenashra.com/publication-groupes-telegram', changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://www.usenashra.com/en/telegram-scheduler', changeFrequency: 'monthly', priority: 0.9 },
    { url: 'https://www.usenashra.com/en/telegram-auto-poster', changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://www.usenashra.com/en/post-to-multiple-telegram-groups', changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://www.usenashra.com/en/telegram-personal-account-scheduler', changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://www.usenashra.com/en/blog', changeFrequency: 'monthly', priority: 0.7 },
    { url: 'https://www.usenashra.com/en/blog/how-to-schedule-telegram-messages', changeFrequency: 'monthly', priority: 0.7 },
    { url: 'https://www.usenashra.com/en/blog/how-to-post-to-multiple-telegram-groups', changeFrequency: 'monthly', priority: 0.7 },
    { url: 'https://www.usenashra.com/en/blog/telegram-bot-vs-personal-account-scheduler', changeFrequency: 'monthly', priority: 0.7 },
    { url: 'https://www.usenashra.com/en/blog/telegram-content-calendar-template', changeFrequency: 'monthly', priority: 0.7 },
    { url: 'https://www.usenashra.com/en/blog/telegram-scheduled-messages-not-sending', changeFrequency: 'monthly', priority: 0.7 },
    { url: 'https://www.usenashra.com/en/blog/how-to-schedule-telegram-channel-posts', changeFrequency: 'monthly', priority: 0.7 },
    { url: 'https://www.usenashra.com/en/blog/telegram-scheduling-for-small-business', changeFrequency: 'monthly', priority: 0.7 },
  ];
}


