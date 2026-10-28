'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Info, LockKeyhole, ShieldCheck, Trash2, X } from 'lucide-react';

export type ConfirmOptions = {
  title: string;
  description: string;
  /** Optional short label shown in a separate preview card (the record being affected). */
  item?: string;
  itemLabel?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'neutral' | 'warning';
  note?: string;
  /** Requires manually typing this word before a high-impact destructive operation. */
  requireText?: string;
};

type ConfirmRequest = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmRequest | null>(null);

export function useConfirm() {
  const request = useContext(ConfirmContext);
  if (!request) throw new Error('useConfirm doit être utilisé dans ConfirmProvider.');
  return request;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const resolverRef = useRef<((approved: boolean) => void) | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const close = useCallback((approved: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    setTyped('');
    resolve?.(approved);
    const previous = previouslyFocusedRef.current;
    previouslyFocusedRef.current = null;
    requestAnimationFrame(() => previous?.focus());
  }, []);

  const confirm = useCallback<ConfirmRequest>((request) => {
    // A new request never silently approves the previous pending action.
    resolverRef.current?.(false);
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTyped('');
    setOptions(request);
    return new Promise<boolean>(resolve => { resolverRef.current = resolve; });
  }, []);

  useEffect(() => {
    if (!options) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimeout = window.setTimeout(() => (options.requireText ? inputRef.current : cancelRef.current)?.focus(), 30);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); close(false); return; }
      if (event.key !== 'Tab' || !cardRef.current) return;
      const elements = Array.from(cardRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[href],textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])'))
        .filter(element => element.getClientRects().length > 0);
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimeout);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [options, close]);

  useEffect(() => () => { resolverRef.current?.(false); resolverRef.current = null; }, []);

  const tone = options?.tone ?? 'neutral';
  const canConfirm = !!options && (!options.requireText || typed.trim() === options.requireText);
  const Icon = tone === 'danger' ? Trash2 : tone === 'warning' ? AlertTriangle : ShieldCheck;

  return <ConfirmContext.Provider value={confirm}>
    {children}
    {options && <div className="n7-confirm-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(false); }}>
      <div ref={cardRef} className={`n7-confirm-dialog n7-confirm-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="n7-confirm-title" aria-describedby="n7-confirm-description">
        <div className="n7-confirm-topline" />
        <div className="n7-confirm-body">
          <div className="n7-confirm-toprow">
            <span className="n7-confirm-symbol"><Icon size={23} strokeWidth={1.8}/></span>
            <button type="button" className="n7-confirm-close" onClick={() => close(false)} aria-label="Fermer la confirmation"><X size={18}/></button>
          </div>
          <div className="n7-confirm-eyebrow">{tone === 'danger' ? 'ACTION IRRÉVERSIBLE' : tone === 'warning' ? 'VÉRIFICATION REQUISE' : 'CONFIRMATION'}</div>
          <h2 id="n7-confirm-title">{options.title}</h2>
          <p id="n7-confirm-description" className="n7-confirm-description">{options.description}</p>
          {options.item && <div className="n7-confirm-item"><div><span>{options.itemLabel ?? 'ÉLÉMENT CONCERNÉ'}</span><strong>{options.item}</strong></div><ArrowRight size={16} aria-hidden="true" /></div>}
          {options.note && <div className="n7-confirm-note"><Info size={16} aria-hidden="true"/><p>{options.note}</p></div>}
          {options.requireText && <label className="n7-confirm-type"><span>Pour confirmer, écrivez <strong>{options.requireText}</strong></span><input ref={inputRef} autoComplete="off" spellCheck={false} value={typed} onChange={event => setTyped(event.target.value)} placeholder={options.requireText} aria-label={`Saisissez ${options.requireText} pour confirmer`} /></label>}
        </div>
        <div className="n7-confirm-bottom">
          <button ref={cancelRef} type="button" className="n7-confirm-cancel" onClick={() => close(false)}>{options.cancelText ?? 'Annuler'}</button>
          <button type="button" className="n7-confirm-submit" disabled={!canConfirm} onClick={() => close(true)}>{tone === 'danger' ? <Trash2 size={16}/> : <LockKeyhole size={16}/>} {options.confirmText ?? (tone === 'danger' ? 'Supprimer' : 'Confirmer')}</button>
        </div>
        <div className="n7-confirm-hint"><kbd>ESC</kbd> pour annuler <span>·</span> Nashra</div>
      </div>
    </div>}
  </ConfirmContext.Provider>;
}
