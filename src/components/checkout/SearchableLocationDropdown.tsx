import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { LocationOption } from '../../../shared/bangladeshLocations.ts';

interface SearchableLocationDropdownProps {
  id?: string;
  label: string;
  required?: boolean;
  placeholder: string;
  searchPlaceholder?: string;
  options: LocationOption[];
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  emptyMessage?: string;
  icon?: React.ReactNode;
}

export function SearchableLocationDropdown({
  id,
  label,
  required = false,
  placeholder,
  searchPlaceholder = 'Search...',
  options,
  value,
  onChange,
  disabled = false,
  loading = false,
  error,
  emptyMessage = 'No matching location found',
  icon,
}: SearchableLocationDropdownProps) {
  const autoId = useId();
  const controlId = id || `loc-dd-${autoId}`;
  const listboxId = `${controlId}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.code === value) || null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return options;
    return options.filter((opt) => opt.name.toLowerCase().includes(trimmed));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      const idx = filteredOptions.findIndex((o) => o.code === value);
      setActiveIndex(idx >= 0 ? idx : 0);
      window.setTimeout(() => searchInputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined;
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const handleSelect = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) =>
        filteredOptions.length === 0 ? -1 : Math.min(filteredOptions.length - 1, prev + 1)
      );
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) =>
        filteredOptions.length === 0 ? -1 : Math.max(0, prev - 1)
      );
      return;
    }
    if (e.key === 'Enter' && activeIndex >= 0 && filteredOptions[activeIndex]) {
      e.preventDefault();
      handleSelect(filteredOptions[activeIndex].code);
    }
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <label
        htmlFor={controlId}
        className="block text-xs font-bold text-slate-800 mb-1.5"
      >
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      <div className="relative">
        <button
          id={controlId}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          disabled={disabled}
          onClick={() => !disabled && setOpen((prev) => !prev)}
          className={`w-full h-11 pl-3 pr-9 rounded-xl border text-left text-sm flex items-center gap-2.5 transition-colors focus:outline-none ${
            disabled
              ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
              : error
              ? 'bg-white border-red-400 focus:border-red-500'
              : open
              ? 'bg-white border-[#16A34A] ring-2 ring-emerald-500/15'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          {icon && (
            <span className={`shrink-0 ${disabled ? 'text-slate-300' : 'text-slate-400'}`}>
              {icon}
            </span>
          )}
          <span
            className={`flex-1 truncate ${
              selectedOption ? 'text-slate-900 font-medium' : 'text-slate-400'
            }`}
          >
            {loading ? 'Loading...' : selectedOption ? selectedOption.name : placeholder}
          </span>
        </button>

        {selectedOption && !disabled ? (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
              setOpen(false);
            }}
            className="absolute right-7 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null}

        <ChevronDown
          className={`w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 transition-transform ${
            open ? 'rotate-180 text-[#16A34A]' : ''
          }`}
        />
      </div>

      {open && !disabled && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 mt-1.5 z-40 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
        >
          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={`Search ${label}`}
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#16A34A] focus:outline-none"
              />
            </div>
          </div>

          <div ref={listRef} className="max-h-56 overflow-y-auto py-1">
            {loading ? (
              <p className="px-3 py-4 text-center text-xs text-slate-500">Loading locations...</p>
            ) : filteredOptions.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-slate-500">{emptyMessage}</p>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.code === value;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleSelect(opt.code)}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-800 font-bold'
                        : isActive
                        ? 'bg-slate-100 text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{opt.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {error && <p className="text-[11px] font-medium text-red-600 mt-1">{error}</p>}
    </div>
  );
}
