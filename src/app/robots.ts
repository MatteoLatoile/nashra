import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: ['/', '/aide'],
      disallow: ['/api/', '/dashboard', '/annonces', '/telegram', '/groupes', '/campagnes', '/historique', '/parametres', '/abonnement', '/profil', '/connexion', '/bienvenue', '/reinitialiser', '/auth/', '/admin', '/diagnostics', '/file-attente', '/operations', '/limites', '/automatisation', '/planification', '/supervision', '/surveillance-systeme'],
    }],
    sitemap: 'https://www.usenashra.com/sitemap.xml',
    host: 'https://www.usenashra.com',
  };
}
