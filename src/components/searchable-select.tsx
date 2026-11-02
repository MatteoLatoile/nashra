'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import styles from './searchable-select.module.css';

export type SearchOption = {
  value: string;
  label: string;
  detail?: string;
  disabled?: boolean;
};

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
}

export function SearchableSelect({
  value, onChange, options, placeholder = 'Choisir une option',
  searchPlaceholder = 'Rechercher…', emptyMessage = 'Aucun résultat',
  disabled = false, ariaLabel, className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selected = options.find(option => option.value === value);
  const filtered = useMemo(() => {
    const needle = normalize(query);
    return needle ? options.filter(option => normalize(`${option.label} ${option.detail || ''}`).includes(needle)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  function select(option: SearchOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>('button[data-trigger]')?.focus();
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && open) {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(current => {
        if (!filtered.length) return 0;
        let index = current;
        for (let count = 0; count < filtered.length; count++) {
          index = (index + delta + filtered.length) % filtered.length;
          if (!filtered[index].disabled) return index;
        }
        return current;
      });
    } else if (event.key === 'Enter' && open && filtered[activeIndex] && !filtered[activeIndex].disabled) {
      event.preventDefault();
      select(filtered[activeIndex]);
    } else if (event.key === 'ArrowDown' && !open && !disabled) {
      event.preventDefault();
      setOpen(true);
    }
  }

  return <div ref={root} className={`${styles.root} ${className || ''}`} onKeyDown={onKeyDown}>
    <button type="button" data-trigger className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
      disabled={disabled} aria-label={ariaLabel} aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-list`}
      onClick={() => { setQuery(''); setActiveIndex(0); setOpen(current => !current); }}>
      <span className={`${styles.selected} ${selected ? '' : styles.placeholder}`} title={selected?.label} dir="auto">{selected?.label || placeholder}</span>
      <ChevronDown size={17} aria-hidden className={open ? styles.chevronOpen : ''}/>
    </button>
    {open && <div className={styles.panel}>
      <div className={styles.searchRow}><Search size={17} aria-hidden/><input ref={search} type="search" value={query}
        onChange={event => { setQuery(event.target.value); setActiveIndex(0); }}
        placeholder={searchPlaceholder} aria-label={`Rechercher : ${ariaLabel}`}
        aria-controls={`${id}-list`} aria-activedescendant={filtered[activeIndex] ? `${id}-opt-${activeIndex}` : undefined}/>
        {query && <button type="button" className={styles.clear} aria-label="Effacer la recherche" onClick={() => { setQuery(''); setActiveIndex(0); search.current?.focus(); }}><X size={15}/></button>}
      </div>
      <div id={`${id}-list`} role="listbox" aria-label={ariaLabel} className={styles.options}>
        {filtered.length ? filtered.map((option, index) => <button type="button" role="option"
          id={`${id}-opt-${index}`} key={option.value} aria-selected={option.value === value}
          disabled={option.disabled} className={`${styles.option} ${activeIndex === index ? styles.highlight : ''}`}
          onMouseEnter={() => setActiveIndex(index)} onClick={() => select(option)}>
            <span className={styles.optionText} dir="auto"><span>{option.label}</span>{option.detail && <small>{option.detail}</small>}</span>
            {option.value === value && <Check size={16} className={styles.tick} aria-hidden/>}
          </button>) : <p className={styles.empty}>{emptyMessage}</p>}
      </div>
      <div className={styles.hint}>{filtered.length} résultat{filtered.length > 1 ? 's' : ''} · Recherche par nom</div>
    </div>}
  </div>;
}

export function SearchableMultiSelect({
  values, onChange, options, max = 5,
  placeholder = 'Choisir des destinations', ariaLabel = 'Destinations', disabled = false,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: SearchOption[];
  max?: number;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const needle = normalize(query);
    return needle ? options.filter(option => normalize(`${option.label} ${option.detail || ''}`).includes(needle)) : options;
  }, [options, query]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  const chosenNames = values.map(v => options.find(o => o.value === v)?.label).filter(Boolean).slice(0, 2).join(', ');
  function toggle(value: string) {
    if (values.includes(value)) onChange(values.filter(v => v !== value));
    else if (values.length < max) onChange([...values, value]);
  }

  return <div ref={root} className={styles.root} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault(); setOpen(false);
      root.current?.querySelector<HTMLButtonElement>('button[data-trigger]')?.focus();
    }
  }}>
    <button type="button" data-trigger className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
      aria-label={ariaLabel} aria-expanded={open} aria-haspopup="true" disabled={disabled}
      onClick={() => { setOpen(prev => !prev); setQuery(''); }}>
      <span className={styles.selected} dir="auto">{values.length ? `${values.length} sélectionnée${values.length > 1 ? 's' : ''} · ${chosenNames}${values.length > 2 ? '…' : ''}` : <span className={styles.placeholder}>{placeholder}</span>}</span>
      <ChevronDown size={17} aria-hidden className={open ? styles.chevronOpen : ''}/>
    </button>
    {open && <div className={styles.panel}>
      <div className={styles.searchRow}><Search size={17} aria-hidden/><input ref={input} type="search" value={query}
        onChange={event => setQuery(event.target.value)} placeholder="Rechercher un groupe ou canal…" aria-label="Rechercher une destination"/>
        {query && <button type="button" className={styles.clear} aria-label="Effacer la recherche" onClick={() => { setQuery(''); input.current?.focus(); }}><X size={15}/></button>}
      </div>
      <div role="group" aria-label={ariaLabel} className={styles.options}>
        {filtered.length ? filtered.map(option => {
          const checked = values.includes(option.value);
          return <button type="button" key={option.value} role="checkbox" aria-checked={checked}
            disabled={option.disabled || (!checked && values.length >= max)}
            onClick={() => toggle(option.value)} className={styles.option}>
            <span className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ''}`}>{checked && <Check size={13} aria-hidden/>}</span>
            <span className={styles.optionText} dir="auto"><span>{option.label}</span>{option.detail && <small>{option.detail}</small>}</span>
          </button>;
        }) : <p className={styles.empty}>Aucune destination trouvée.</p>}
      </div>
      <div className={styles.hint}>{values.length} / {max} sélectionnée(s) · Vous pouvez décocher une destination.</div>
    </div>}
  </div>;
}
