'use client';

import { X, Info, Check, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow ?? 'ESPACE DE TRAVAIL'} <span className="eyebrow-line"/></div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}
export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'positive' | 'warn' | 'blue' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Modal({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-cover" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className="modal-dialog" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Fermer"><X size={19}/></button></div><div className="modal-inner">{children}</div></section></div>;
}
export function DemoNotice({ compact = false }: { compact?: boolean }) {
  return <div className={`demo-notice ${compact ? 'demo-compact' : ''}`}><Info size={17}/><span><strong>Campagnes simulées</strong> — aucune programmation automatique. Les envois manuels sont disponibles dans la rubrique Telegram si votre compte personnel est connecté.</span></div>;
}
export function EmptyState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action && <div className="empty-action">{action}</div>}</div>;
}
export function SectionHead({ title, link, linkText }: { title: string; link?: string; linkText?: string }) {
  return <div className="section-head"><h2>{title}</h2>{link && <Link href={link} className="text-link">{linkText ?? 'Tout voir'} <ArrowRight size={15}/></Link>}</div>;
}
export function Checkmark() { return <span className="checkmark"><Check size={13}/></span>; }
