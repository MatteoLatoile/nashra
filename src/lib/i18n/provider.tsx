'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { detectDeviceLanguage, isChoice, isLocale, translateFrench } from './index';
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
function useLegacyTextBridge(locale: Locale) {
  useEffect(() => {
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

    function apply() {
      if (applying || !document.body) return;
      applying = true;
      observer.disconnect();
      try {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const item = node as Text;
          const parent = item.parentElement;
          if (!parent || parent.closest(blocked)) continue;
          const current = item.nodeValue || '';
          if (!current.trim()) continue;
          let cache = textCache.get(item);
          if (!cache || (current !== cache.applied && current !== cache.source)) {
            cache = { source: current, applied: current };
          }
          const result = translate(cache.source);
          if (current !== result) item.nodeValue = result;
          cache.applied = result;
          textCache.set(item, cache);
        }
        const attrs = ['placeholder', 'title', 'aria-label', 'alt'];
        document.body.querySelectorAll<HTMLElement>('[placeholder],[title],[aria-label],[alt]').forEach(element => {
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
        });
      } finally {
        applying = false;
        observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true,
          attributeFilter: ['placeholder', 'title', 'aria-label', 'alt'] });
      }
    }

    function schedule() {
      if (scheduled || applying) return;
      scheduled = true;
      queueMicrotask(() => { scheduled = false; apply(); });
    }
    const observer = new MutationObserver(schedule);
    apply();
    // A route change or async UI update may create new React nodes.
    return () => { observer.disconnect(); };
  }, [locale]);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<Locale>('fr');
  const [choice, setChoice] = useState<LanguageChoice>('auto');
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const locale: Locale = choice === 'auto' ? device : choice;
  useLegacyTextBridge(locale);

  useEffect(() => {
    setDevice(detectDeviceLanguage());
    let mounted = true;
    // Supabase Auth is optional for demo installations.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return;
    const supabase = createClient();
    async function loadUser() {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        const user = data.user;
        const id = user?.id || null;
        setUserId(id);
        if (!id) { setChoice('auto'); return; }
        const locallySaved = localStorage.getItem(`nashra:locale:${id}`);
        const cloudSaved = user?.user_metadata?.nashra_language;
        setChoice(isChoice(locallySaved) ? locallySaved : isChoice(cloudSaved) ? cloudSaved : 'auto');
      } catch { /* Remain on device language when offline. */ }
    }
    void loadUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session) { setUserId(null); setChoice('auto'); }
      else void loadUser();
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
  }, [locale]);

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
  }), [locale, choice, device, saving, saveError, chooseLanguage]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLanguage() {
  const context = useContext(Context);
  if (!context) throw new Error('useLanguage must be inside I18nProvider.');
  return context;
}
