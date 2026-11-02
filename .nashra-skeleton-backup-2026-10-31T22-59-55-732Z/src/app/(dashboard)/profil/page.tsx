"use client";

import { useEffect, useState } from "react";
import {
  UserRound,
  Building2,
  ShieldCheck,
  Save,
  Check,
  Eye,
  EyeOff,
  ExternalLink
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState("");

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data } = await createClient().auth.getUser();

      if (!active) return;

      if (data.user) {
        const metadata = data.user.user_metadata || {};

        setName(metadata.full_name || metadata.name || "");
        setCompany(metadata.company_name || "");
        setEmail(data.user.email || "");
        setAvatar(metadata.avatar_url || metadata.picture || "");
      }

      setLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();

    setError("");
    setMessage("");
    setSaving(true);

    try {
      const { error } = await createClient().auth.updateUser({
        data: {
          full_name: name.trim(),
          company_name: company.trim(),
          avatar_url: avatar.trim()
        }
      });

      if (error) throw error;

      window.dispatchEvent(new Event("nashra:profile-updated"));

      setMessage("Votre profil a été mis à jour.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible d'enregistrer les modifications."
      );
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();

    setPasswordError("");
    setPasswordMessage("");

    if (password.length < 8) {
      setPasswordError("Utilisez au moins 8 caractères.");
      return;
    }

    if (password !== confirmation) {
      setPasswordError("Les mots de passe ne correspondent pas.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await createClient().auth.updateUser({
        password
      });

      if (error) throw error;

      setPassword("");
      setConfirmation("");

      setPasswordMessage("Votre mot de passe a été mis à jour.");
    } catch (err) {
      setPasswordError(
        err instanceof Error
          ? err.message
          : "Impossible de modifier le mot de passe."
      );
    } finally {
      setSaving(false);
    }
  }

  const initials = name.trim()
    ? name.trim().split(/\s+/).slice(0, 2)
        .map(part => part[0]).join("").toUpperCase()
    : "N";

  if (loading) {
    return <div className="na-profile-loading">Chargement de votre profil…</div>;
  }

  return (
    <div className="na-profile-page">
      <div className="na-profile-heading">
        <div>
          <span className="na-eyebrow">PARAMÈTRES DU COMPTE</span>
          <h1>Mon profil<span>.</span></h1>
          <p>
            Gérez vos informations personnelles et la sécurité
            de votre compte Nashra.
          </p>
        </div>
      </div>

      <div className="na-profile-grid">
        <div className="na-profile-main">

          <form className="na-card" onSubmit={saveProfile}>
            <div className="na-card-header">
              <div className="na-card-icon"><UserRound size={19} /></div>
              <div>
                <h2>Informations personnelles</h2>
                <p>Ces informations sont associées à votre compte.</p>
              </div>
            </div>

            <div className="na-profile-avatar-row">
              <div className="na-profile-avatar">
                {avatar && !avatarError
                  ? <img
                      src={avatar}
                      alt="Photo de profil"
                      onError={() => setAvatarError(true)}
                    />
                  : <span>{initials}</span>
                }
              </div>

              <div>
                <strong>Photo de profil</strong>
                <p>Ajoutez l'URL d'une image accessible en HTTPS.</p>
              </div>
            </div>

            <div className="na-field">
              <label htmlFor="profile-avatar">URL de la photo</label>
              <input
                id="profile-avatar"
                type="url"
                placeholder="https://exemple.com/photo.jpg"
                value={avatar}
                onChange={event => {
                  setAvatar(event.target.value);
                  setAvatarError(false);
                }}
              />
            </div>

            <div className="na-field">
              <label htmlFor="profile-name">Nom complet</label>
              <input
                id="profile-name"
                type="text"
                placeholder="Votre nom"
                value={name}
                onChange={event => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </div>

            <div className="na-field">
              <label htmlFor="profile-email">Adresse e-mail</label>
              <input
                id="profile-email"
                type="email"
                value={email}
                disabled
              />
              <small>L'adresse e-mail est liée à votre authentification.</small>
            </div>

            <div className="na-section-divider" />

            <div id="entreprise" className="na-subsection">
              <Building2 size={18} />
              <div>
                <h3>Votre entreprise</h3>
                <p>Personnalisez votre espace professionnel.</p>
              </div>
            </div>

            <div className="na-field">
              <label htmlFor="profile-company">Nom de l'entreprise</label>
              <input
                id="profile-company"
                type="text"
                placeholder="Ex. Mathwa Madinah"
                value={company}
                onChange={event => setCompany(event.target.value)}
              />
              <small>Facultatif. Vous pourrez le modifier à tout moment.</small>
            </div>

            {error && <div className="na-feedback-error">{error}</div>}
            {message && <div className="na-feedback-success"><Check size={16}/>{message}</div>}

            <div className="na-card-actions">
              <button
                type="submit"
                className="na-primary"
                disabled={saving}
              >
                <Save size={16} />
                {saving ? "Enregistrement…" : "Enregistrer les modifications"}
              </button>
            </div>
          </form>

          <form
            className="na-card"
            id="securite"
            onSubmit={changePassword}
          >
            <div className="na-card-header">
              <div className="na-card-icon"><ShieldCheck size={19} /></div>
              <div>
                <h2>Sécurité du compte</h2>
                <p>Protégez votre accès à Nashra.</p>
              </div>
            </div>

            <div className="na-field">
              <label htmlFor="profile-password">Nouveau mot de passe</label>

              <div className="na-password-field">
                <input
                  id="profile-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Au moins 8 caractères"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />

                <button
                  type="button"
                  aria-label={showPassword ? "Masquer" : "Afficher"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}
                </button>
              </div>
            </div>

            <div className="na-field">
              <label htmlFor="profile-password-confirm">Confirmer le mot de passe</label>
              <input
                id="profile-password-confirm"
                type="password"
                placeholder="Confirmez votre mot de passe"
                value={confirmation}
                onChange={event => setConfirmation(event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {passwordError && <div className="na-feedback-error">{passwordError}</div>}
            {passwordMessage && <div className="na-feedback-success"><Check size={16}/>{passwordMessage}</div>}

            <div className="na-card-actions">
              <button
                className="na-secondary"
                type="submit"
                disabled={saving}
              >
                Modifier le mot de passe
              </button>
            </div>
          </form>
        </div>

        <aside className="na-profile-aside">
          <div className="na-card">
            <span className="na-eyebrow">VOTRE ABONNEMENT</span>

            <div className="na-plan-name">Gratuit<span>.</span></div>

            <p>Vous utilisez actuellement la version de lancement de Nashra.</p>

            <span className="na-plan-status">
              <Check size={13} />
              Compte actif
            </span>

            <div className="na-section-divider"/>

            <span className="na-aside-note">
              Les offres payantes seront disponibles lors du lancement commercial.
            </span>
          </div>

          <div className="na-card na-help-card">
            <ShieldCheck size={20}/>
            <strong>Vos données restent privées.</strong>
            <p>
              Votre profil est associé à votre compte Supabase
              et protégé par votre authentification.
            </p>
            <a
              href="https://supabase.com/docs/guides/auth"
              target="_blank"
              rel="noreferrer"
            >
              En savoir plus <ExternalLink size={13}/>
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}