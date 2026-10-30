import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';

interface SearchableSelectProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  required?: boolean;
}

export function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select or search...',
  disabled = false,
  error,
  required = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((item) =>
    item.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  const handleSelect = (selectedVal: string) => {
    onChange(selectedVal);
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
  };

  return (
    <div className="relative" ref={containerRef}>
      <label className="block text-xs font-bold text-slate-700 mb-1">
        {label} {required && '*'}
      </label>

      {/* Main Trigger Button */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full px-3.5 py-2.5 rounded-xl border text-sm flex items-center justify-between cursor-pointer transition ${
          disabled
            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
            : isOpen
            ? 'border-sbi-accent ring-2 ring-sbi-accent/20 bg-white'
            : 'border-slate-300 bg-white hover:border-slate-400'
        } ${error ? 'border-rose-500' : ''}`}
      >
        <span className={`truncate ${!value ? 'text-slate-400' : 'text-slate-900 font-medium'}`}>
          {value || placeholder}
        </span>
        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 transition"
              title="Clear selection"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-sbi-accent' : ''
            }`}
          />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search Input */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0 ml-1" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type to filter..."
              className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none py-1"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-52 overflow-y-auto py-1 divide-y divide-slate-50">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = opt === value;
                return (
                  <div
                    key={opt}
                    onClick={() => handleSelect(opt)}
                    className={`px-3.5 py-2 text-sm cursor-pointer flex items-center justify-between transition ${
                      isSelected
                        ? 'bg-blue-50 text-sbi-accent font-semibold'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span>{opt}</span>
                    {isSelected && <Check className="w-4 h-4 text-sbi-accent" />}
                  </div>
                );
              })
            ) : (
              <div className="px-4 py-3 text-xs text-slate-500 text-center">
                No matching results found
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
    </div>
  );
}
