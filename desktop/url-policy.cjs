'use strict';

function validateAppUrl(input, mode = 'production') {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Adresse Nashra manquante. Utilise NASHRA_DESKTOP_URL=https://ton-domaine.tld/dashboard');
  }
  const url = new URL(input.trim());
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Adresse incorrecte : aucun identifiant, paramètre ou fragment autorisé.');
  }
  if (url.protocol !== 'https:') {
    const local = (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:';
    if (!(mode !== 'production' && local)) {
      throw new Error('En production, Nashra Desktop exige une adresse HTTPS.');
    }
  }
  if (!url.hostname || url.hostname.endsWith('.example') || url.hostname === 'example.com') {
    throw new Error('Renseigne un vrai domaine hébergeant Nashra.');
  }
  // La racine publique contient la landing page : ouvrir directement l'application.
  if (url.pathname === '/') url.pathname = '/dashboard';
  return url.toString();
}

function externalHttpUrl(input) {
  try {
    const value = new URL(input);
    if (value.protocol !== 'https:' && value.protocol !== 'http:') return null;
    if (value.username || value.password) return null;
    return value.toString();
  } catch {
    return null;
  }
}

module.exports = { validateAppUrl, externalHttpUrl };
