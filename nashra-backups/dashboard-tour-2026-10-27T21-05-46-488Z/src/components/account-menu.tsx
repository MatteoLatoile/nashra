"use client";
import { OnboardingAccountLink } from '@/components/onboarding-link';

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  UserRound,
  Settings2,
  ShieldCheck,
  LogOut,
  ChevronDown,
  Building2,
  CreditCard,
  LoaderCircle
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  name: string;
  email: string;
  company: string;
  avatar: string;
};

export function AccountMenu({
  userEmail,
  onSignOut
}: {
  userEmail?: string;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imageError, setImageError] = useState(false);

  const [profile, setProfile] = useState<Profile>({
    name: "",
    email: userEmail || "",
    company: "",
    avatar: ""
  });

  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const { data } = await createClient().auth.getUser();

      if (!active || !data.user) return;

      const metadata = data.user.user_metadata || {};

      setProfile({
        name: metadata.full_name || metadata.name || "",
        email: data.user.email || "",
        company: metadata.company_name || "",
        avatar: metadata.avatar_url || metadata.picture || ""
      });

      setImageError(false);
    }

    void loadProfile();

    window.addEventListener("nashra:profile-updated", loadProfile);

    return () => {
      active = false;
      window.removeEventListener("nashra:profile-updated", loadProfile);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (
        container.current &&
        !container.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const initials = profile.name
    ? profile.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0])
        .join("")
        .toUpperCase()
    : "N";

  const avatar = profile.avatar && !imageError
    ? <img
        src={profile.avatar}
        alt=""
        onError={() => setImageError(true)}
      />
    : <span>{initials}</span>;

  const close = () => setOpen(false);

  return (
    <div className="na-menu-root" ref={container}>
      <button
        type="button"
        className="na-avatar-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Ouvrir le menu de mon compte"
      >
        {avatar}
      </button>

      {open && (
        <div className="na-menu" role="menu">
          <div className="na-menu-user">
            <div className="na-menu-avatar">
              {avatar}
            </div>

            <div className="na-menu-identity">
              <strong>{profile.name || "Mon compte"}</strong>
              <span>{profile.email}</span>
            </div>
          </div>

          <div className="na-menu-plan">
            <span className="na-plan-dot" />
            <span>Offre actuelle</span>
            <strong>Gratuit</strong>
          </div>

          <div className="na-menu-section">
            <Link href="/profil" onClick={close} role="menuitem">
              <UserRound size={17} />
              <span>Mon profil</span>
            </Link>

            <Link href="/profil#entreprise" onClick={close} role="menuitem">
              <Building2 size={17} />
              <span>Mon entreprise</span>
            </Link>

            <Link href="/profil#securite" onClick={close} role="menuitem">
              <ShieldCheck size={17} />
              <span>Sécurité du compte</span>
            </Link>
          </div>

          <div className="na-menu-section">
            <Link href="/parametres#langue" onClick={close} role="menuitem">
              <Settings2 size={17} />
              <span>Langue</span>
            </Link>
            <OnboardingAccountLink onNavigate={close} />
            <Link href="/parametres" onClick={close} role="menuitem">
              <Settings2 size={17} />
              <span>Paramètres</span>
            </Link>

            <div className="na-menu-disabled">
              <CreditCard size={17} />
              <span>Abonnement</span>
              <small>Bientôt</small>
            </div>
          </div>

          <div className="na-menu-section na-menu-last">
            <button
              type="button"
              disabled={busy}
              role="menuitem"
              onClick={() => {
                setBusy(true);
                onSignOut();
              }}
            >
              {busy
                ? <LoaderCircle size={17} className="tg-spin" />
                : <LogOut size={17} />
              }
              <span>Se déconnecter</span>
            </button>
          </div>

          <div className="na-menu-footer">
            Nashra · Gestion de publications
          </div>
        </div>
      )}
    </div>
  );
}