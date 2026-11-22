import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://www.usenashra.com/', changeFrequency: 'weekly', priority: 1 },
    { url: 'https://www.usenashra.com/aide', changeFrequency: 'monthly', priority: 0.5 },
  ];
}
