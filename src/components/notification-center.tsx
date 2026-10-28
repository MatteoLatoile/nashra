"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  CalendarClock,
  History,
  AlertCircle,
  Inbox,
  X
} from "lucide-react";
import { useApp } from "@/lib/store";

export function NotificationCenter({
  userEmail
}: {
  userEmail?: string;
}) {
  const { data, syncStatus, syncError } = useApp();

  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(0);

  const container = useRef<HTMLDivElement>(null);
  const storageKey = `nashra_notifications_${userEmail || "local"}`;

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setLoaded(false);
    try {
      const saved = JSON.parse(
        localStorage.getItem(storageKey) || "[]"
      );

      setReadIds(Array.isArray(saved) ? saved : []);
    } catch {
      setReadIds([]);
    }
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;

    function close(event: MouseEvent) {
      if (
        container.current &&
        !container.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);

    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const activity = data.activity.slice(0, 20).map(item => ({
    id: `activity-${item.id}`,
    title: item.title,
    detail: item.detail,
    date: item.createdAt,
    href: "/historique",
    type: "activity"
  }));

  const upcoming = data.campaigns
    .filter(c => c.status === "scheduled")
    .flatMap(c => (c.scheduledDates?.length
      ? c.scheduledDates
      : [c.scheduledAt]
    ).map(date => ({ campaign: c, date })))
    .filter(({ date }) => {
      const time = new Date(date).getTime();
      return now > 0 &&
        Number.isFinite(time) &&
        time >= now &&
        time <= now + 86400000;
    })
    .map(({ campaign, date }) => ({
      id: `campaign-${campaign.id}-${date}`,
      title: "Campagne à venir",
      detail: `${campaign.name} — ${new Date(date).toLocaleString("fr-FR")}`,
      date,
      href: "/campagnes",
      type: "campaign"
    }));

  const errors = syncStatus === "error" ? [{
    id: `sync-error-${syncError || "unknown"}`,
    title: "Erreur de synchronisation",
    detail: syncError || "La sauvegarde cloud a échoué.",
    date: new Date(now || Date.now()).toISOString(),
    href: "/parametres",
    type: "error"
  }] : [];

  const notifications = [...errors, ...upcoming, ...activity]
    .sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    )
    .slice(0, 30);

  const unread = notifications.filter(
    item => !readIds.includes(item.id)
  ).length;

  function markRead(id: string) {
    const updated = [...new Set([...readIds, id])];

    setReadIds(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  }

  function markAllRead() {
    const updated = [
      ...new Set([
        ...readIds,
        ...notifications.map(item => item.id)
      ])
    ];

    setReadIds(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  }

  return (
    <div className="n9-container" ref={container}>
      <button
        type="button"
        className="n9-trigger"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={19} strokeWidth={1.8} />

        {loaded && unread > 0 && (
          <span className="n9-badge">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="n9-panel"
          role="dialog"
          aria-label="Centre de notifications"
        >
          <div className="n9-header">
            <div>
              <span className="n9-eyebrow">VOTRE ACTIVITÉ</span>
              <h3>Notifications</h3>
            </div>

            <button
              className="n9-close"
              onClick={() => setOpen(false)}
              aria-label="Fermer les notifications"
            >
              <X size={17} />
            </button>
          </div>

          <div className="n9-toolbar">
            <span>
              {unread === 0
                ? "Tout est à jour"
                : `${unread} non lue${unread > 1 ? "s" : ""}`}
            </span>

            {unread > 0 && (
              <button onClick={markAllRead}>
                <CheckCheck size={14} />
                Tout marquer comme lu
              </button>
            )}
          </div>

          <div className="n9-list">
            {notifications.length === 0 ? (
              <div className="n9-empty">
                <div className="n9-empty-icon">
                  <Inbox size={25} strokeWidth={1.4} />
                </div>

                <strong>Aucune notification</strong>
                <p>
                  Les activités et campagnes à venir
                  apparaîtront ici.
                </p>
              </div>
            ) : (
              notifications.map(item => {
                const isRead = readIds.includes(item.id);

                const Icon =
                  item.type === "campaign"
                    ? CalendarClock
                    : item.type === "error"
                    ? AlertCircle
                    : History;

                return (
                  <Link
                    href={item.href}
                    key={item.id}
                    className={`n9-item ${isRead ? "n9-read" : ""}`}
                    onClick={() => {
                      markRead(item.id);
                      setOpen(false);
                    }}
                  >
                    <span className="n9-item-icon">
                      <Icon size={17} />
                    </span>

                    <span className="n9-item-content">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                      <small>
                        {new Date(item.date).toLocaleString("fr-FR")}
                      </small>
                    </span>

                    {!isRead && <span className="n9-unread-dot" />}
                  </Link>
                );
              })
            )}
          </div>

          <div className="n9-footer">
            <Link
              href="/historique"
              onClick={() => setOpen(false)}
            >
              Voir tout l'historique
              <span>→</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}