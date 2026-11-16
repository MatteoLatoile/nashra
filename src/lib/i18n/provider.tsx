'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { detectDeviceLanguage, hasTranslationCatalog, isChoice, isLocale, loadTranslationCatalog, translateFrench } from './index';
import type { Locale, LanguageChoice } from './index';

interface LanguageContextValue {
  locale: Locale;
  choice: LanguageChoice;
  device: Locale;
  saving: boolean;
  saveError: string;
  chooseLanguage: (choice: LanguageChoice) => Promise<void>;
  t: (source: string) => string;
}
const Context = createContext<LanguageContextValue | undefined>(undefined);

// This bridge translates existing hard-coded French UI without rewriting pages or
// touching user-entered form values. New components should use useLanguage().t().
// Keep original French text across locale changes.
const textCache = new WeakMap<Text, { source: string; applied: string }>();
const attributeCache = new WeakMap<Element, Record<string, { source: string; applied: string }>>();
function useLegacyTextBridge(locale: Locale, catalogVersion: number) {
  const hasUsedBridge = useRef(false);
  useEffect(() => {
    // Do not scan/observe the whole page for the default French UI.
    // Restore the original text once if the user switches back from another language.
    if (locale === 'fr' && !hasUsedBridge.current) return;
    if (locale !== 'fr' && !hasTranslationCatalog()) return;
    if (locale !== 'fr') hasUsedBridge.current = true;
    const blocked = 'script,style,pre,code,textarea,[contenteditable="true"],[translate="no"],[data-nashra-i18n-ignore="true"]';
    let scheduled = false;
    let applying = false;

    function repairVisibleText(value: string): string {
      if (!/(?:Ã.|Â.|â[€œ€™“”]|ðŸ)/u.test(value)) return value;
      const extra: Record<string, number> = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134,
        '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145, '’': 146,
        '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155,
        'œ': 156, 'ž': 158, 'Ÿ': 159 };
      let current = value;
      for (let pass = 0; pass < 2; pass++) {
        let result = ''; let replacements = 0;
        for (let i = 0; i < current.length;) {
          const first = current.charCodeAt(i);
          const len = first >= 194 && first <= 223 ? 2 : first >= 224 && first <= 239 ? 3 : first >= 240 && first <= 244 ? 4 : 0;
          if (len && i + len <= current.length) {
            const chars = [...current.slice(i, i + len)];
            const bytes = chars.map(char => char.charCodeAt(0) <= 255 ? char.charCodeAt(0) : extra[char]);
            if (bytes.every(b => typeof b === 'number')) {
              try {
                const fixed = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
                if (fixed && !/[\u0000-\u001f\u007f-\u009f]/.test(fixed)) {
                  result += fixed; i += len; replacements++; continue;
                }
              } catch { /* incomplete UTF-8 sequence */ }
            }
          }
          result += current[i]; i++;
        }
        current = result;
        if (!replacements) break;
      }
      return current;
    }

    function translate(text: string): string {
      const outer = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
      if (!outer) return text;
      const source = repairVisibleText(outer[2]);
      const target = translateFrench(source, locale);
      return outer[1] + (target || source) + outer[3];
    }

    // Translate only mutated subtrees after the first pass instead of rescanning
    // the complete document for every React update or text change.
    const dirty = new Set<Node>();
    let frame = 0;
    const attrs = ['placeholder', 'title', 'aria-label', 'alt'] as const;
    const attrSelector = '[placeholder],[title],[aria-label],[alt]';

    function translateText(item: Text) {
      const parent = item.parentElement;
      if (!parent || parent.closest(blocked)) return;
      const current = item.nodeValue || '';
      if (!current.trim()) return;
      let cache = textCache.get(item);
      if (!cache || (current !== cache.applied && current !== cache.source)) {
        cache = { source: current, applied: current };
      }
      const result = translate(cache.source);
      if (current !== result) item.nodeValue = result;
      cache.applied = result;
      textCache.set(item, cache);
    }

    function translateAttributes(element: Element) {
      if (element.closest(blocked)) return;
      const cache = attributeCache.get(element) || {};
      for (const attr of attrs) {
        const current = element.getAttribute(attr);
        if (!current) continue;
        const old = cache[attr];
        const source = old && (current === old.applied || current === old.source) ? old.source : current;
        const result = translate(source);
        if (result !== current) element.setAttribute(attr, result);
        cache[attr] = { source, applied: result };
      }
      attributeCache.set(element, cache);
    }

    function processNode(node: Node) {
      if (!node.isConnected) return;
      if (node.nodeType === Node.TEXT_NODE) { translateText(node as Text); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node as Element;
      if (element.closest(blocked)) return;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let current: Node | null;
      while ((current = walker.nextNode())) translateText(current as Text);
      translateAttributes(element);
      element.querySelectorAll(attrSelector).forEach(translateAttributes);
    }

    function apply() {
      if (applying || !document.body || !dirty.size) return;
      applying = true;
      observer.disconnect();
      try {
        // Do not visit a child twice when its parent is already dirty.
        const nodes = Array.from(dirty);
        dirty.clear();
        const roots = nodes.filter(node => !nodes.some(parent => parent !== node && parent.contains(node)));
        roots.forEach(processNode);
      } finally {
        applying = false;
        observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true,
          attributeFilter: [...attrs] });
      }
    }

    function schedule() {
      if (scheduled || applying) return;
      scheduled = true;
      frame = requestAnimationFrame(() => { scheduled = false; frame = 0; apply(); });
    }

    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'childList') {
          record.addedNodes.forEach(node => dirty.add(node));
        } else {
          dirty.add(record.target);
        }
      }
      if (dirty.size) schedule();
    });
    dirty.add(document.body);
    apply();
    if (locale === 'fr') {
      // React renders French natively; no ongoing DOM observer needed.
      observer.disconnect();
      return;
    }
    // A route change or async UI update may create new React nodes.
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); dirty.clear(); };
  }, [locale, catalogVersion]);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<Locale>('fr');
  const [choice, setChoice] = useState<LanguageChoice>('auto');
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const locale: Locale = choice === 'auto' ? device : choice;
  const [catalogVersion, setCatalogVersion] = useState(0);
  useLegacyTextBridge(locale, catalogVersion);

  useEffect(() => {
    if (locale === 'fr' || hasTranslationCatalog()) return;
    let active = true;
    void loadTranslationCatalog().then(() => {
      if (active) setCatalogVersion(v => v + 1);
    }).catch(() => {
      // Keep the original French text when the optional language catalog is unavailable.
    });
    return () => { active = false; };
  }, [locale]);

  useEffect(() => {
    setDevice(detectDeviceLanguage());
    let mounted = true;
    // Supabase Auth is optional for demo installations.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return;
    const supabase = createClient();
    function applySession(user: { id: string; user_metadata?: Record<string, unknown> } | null | undefined) {
      if (!mounted) return;
      const id = user?.id || null;
      setUserId(id);
      if (!id) { setChoice('auto'); return; }
      const locallySaved = localStorage.getItem(`nashra:locale:${id}`);
      const cloudSaved = user?.user_metadata?.nashra_language;
      setChoice(isChoice(locallySaved) ? locallySaved : isChoice(cloudSaved) ? cloudSaved : 'auto');
    }
    // Language choice only: local session data is sufficient here (not used for authorization).
    void supabase.auth.getSession().then(({ data }) => applySession(data.session?.user)).catch(() => {});
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' || locale === 'ur' ? 'rtl' : 'ltr';
    document.title = locale === 'fr' ? 'Nashra — Gestion de publications' :
      locale === 'ar' ? 'نشرة — إدارة المنشورات' :
      locale === 'ur' ? 'نشرا — پوسٹس کا انتظام' :
      'Nashra — ' + (translateFrench('Mes annonces', locale) || 'Publishing');
  }, [locale, catalogVersion]);

  const chooseLanguage = useCallback(async (next: LanguageChoice) => {
    if (!isChoice(next)) return;
    setSaveError('');
    setChoice(next);
    if (!userId) return;
    localStorage.setItem(`nashra:locale:${userId}`, next);
    setSaving(true);
    try {
      const { error } = await createClient().auth.updateUser({ data: { nashra_language: next } });
      if (error) throw error;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to synchronize language preference.');
    } finally { setSaving(false); }
  }, [userId]);

  const value = useMemo<LanguageContextValue>(() => ({
    locale, choice, device, saving, saveError, chooseLanguage,
    t: (source: string) => translateFrench(source, locale) || source,
  }), [locale, choice, device, saving, saveError, chooseLanguage, catalogVersion]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLanguage() {
  const context = useContext(Context);
  if (!context) throw new Error('useLanguage must be inside I18nProvider.');
  return context;
}
