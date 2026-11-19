import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { Branch } from '../../api.ts';
import './BranchSelector.css';

export interface BranchSelectorProps {
  branches: Branch[];
  selectedBranch: string;
  onSelectBranch: (branchCode: string) => void;
  canAccessOverall?: boolean;
  className?: string;
  id?: string;
}

export const BranchSelector: React.FC<BranchSelectorProps> = ({
  branches,
  selectedBranch,
  onSelectBranch,
  canAccessOverall = true,
  className = '',
  id = 'global-branch-selector',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  if (!branches || branches.length === 0) {
    return null;
  }

  // Normalize current select value so it matches whether code or id was passed
  const selectValue = useMemo(() => {
    if (!selectedBranch || selectedBranch.toLowerCase() === 'all') return 'all';
    const match = branches.find(
      (b) => b.id === selectedBranch || (b.code && b.code.toUpperCase() === selectedBranch.toUpperCase())
    );
    return match ? (match.code || match.id) : selectedBranch;
  }, [selectedBranch, branches]);

  // Current selected branch details
  const selectedInfo = useMemo(() => {
    if (selectValue === 'all') {
      return {
        code: 'all',
        name: 'All Branches (Overall)',
        isAll: true,
      };
    }
    const match = branches.find(
      (b) => b.id === selectValue || (b.code && b.code.toUpperCase() === selectValue.toUpperCase())
    );
    return {
      code: match ? (match.code || match.id) : selectValue,
      name: match ? match.name : selectValue,
      isAll: false,
    };
  }, [selectValue, branches]);

  // Build the option list for keyboard navigation and rendering
  const optionsList = useMemo(() => {
    const list: Array<{ code: string; name: string; isAll: boolean; active?: boolean }> = [];
    if (canAccessOverall) {
      list.push({
        code: 'all',
        name: 'All Branches (Overall)',
        isAll: true,
        active: true,
      });
    }
    branches.forEach((b) => {
      list.push({
        code: b.code || b.id,
        name: b.name,
        isAll: false,
        active: b.active !== false,
      });
    });
    return list;
  }, [branches, canAccessOverall]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        const currentIndex = optionsList.findIndex((opt) => opt.code === selectValue);
        setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < optionsList.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : optionsList.length - 1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < optionsList.length) {
        const item = optionsList[highlightedIndex];
        onSelectBranch(item.code);
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  const handleSelectOption = (code: string) => {
    onSelectBranch(code);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={`top-branch-selector-pill ${isOpen ? 'is-dropdown-open' : ''} ${className}`.trim()}
      onKeyDown={handleKeyDown}
    >
      {/* Hidden native select for form accessibility and backwards compatibility */}
      <select
        id={id}
        value={selectValue}
        onChange={(e) => onSelectBranch(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="top-branch-native-hidden-select"
      >
        {canAccessOverall && <option value="all">All Branches (Overall)</option>}
        {branches.map((b) => (
          <option key={b.id || b.code} value={b.code || b.id}>
            {b.name} ({b.code})
          </option>
        ))}
      </select>

      {/* a) Building icon tile with gradient squircle */}
      <div className="top-branch-icon-tile" aria-hidden="true">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="top-branch-icon"
        >
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
          <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
          <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
          <path d="M10 6h4" />
          <path d="M10 10h4" />
          <path d="M10 14h4" />
          <path d="M10 18h4" />
        </svg>
      </div>

      {/* b) "Branch" label */}
      <span className="top-branch-label" onClick={() => setIsOpen((prev) => !prev)}>
        Branch
      </span>

      {/* c) Custom interactive dropdown trigger button */}
      <div className="top-branch-select-wrapper">
        <button
          ref={triggerRef}
          type="button"
          id={`${id}-trigger`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={`${id}-popover`}
          onClick={() => setIsOpen((prev) => !prev)}
          className="top-branch-select top-branch-select-trigger"
          title="Switch branch scope"
        >
          <span className="top-branch-trigger-text">
            {selectedInfo.name}
          </span>
          {!selectedInfo.isAll && (
            <span className="top-branch-trigger-badge">
              {selectedInfo.code}
            </span>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`top-branch-chevron ${isOpen ? 'rotated' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* d) Custom Floating Popover Dropdown Menu */}
        {isOpen && (
          <div
            id={`${id}-popover`}
            ref={listboxRef}
            role="listbox"
            aria-labelledby={`${id}-trigger`}
            className="top-branch-popover-menu"
          >
            <div className="top-branch-menu-header">
              <span className="top-branch-menu-title">Select Active Branch</span>
              <span className="top-branch-menu-live-tag">
                <span className="live-dot" /> Live
              </span>
            </div>

            <div className="top-branch-menu-list">
              {canAccessOverall && (
                <div
                  role="option"
                  aria-selected={selectValue === 'all'}
                  tabIndex={0}
                  className={`top-branch-menu-item ${selectValue === 'all' ? 'active' : ''} ${
                    highlightedIndex === 0 ? 'highlighted' : ''
                  }`}
                  onClick={() => handleSelectOption('all')}
                  onMouseEnter={() => setHighlightedIndex(0)}
                >
                  <div className="top-branch-item-icon-tile all-icon">
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </div>
                  <div className="top-branch-item-content">
                    <div className="top-branch-item-row">
                      <span className="top-branch-item-name">All Branches (Overall)</span>
                      <span className="top-branch-badge-pill overall">OVERALL</span>
                    </div>
                    <span className="top-branch-item-sub">Consolidated Multi-Branch View</span>
                  </div>
                  {selectValue === 'all' && (
                    <div className="top-branch-item-check" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>
              )}

              {canAccessOverall && branches.length > 0 && (
                <div className="top-branch-menu-divider" />
              )}

              {branches.map((b, idx) => {
                const itemCode = b.code || b.id;
                const isSelected = selectValue.toUpperCase() === itemCode.toUpperCase();
                const optIndex = canAccessOverall ? idx + 1 : idx;
                const isHighlighted = highlightedIndex === optIndex;

                return (
                  <div
                    key={b.id || b.code}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    className={`top-branch-menu-item ${isSelected ? 'active' : ''} ${
                      isHighlighted ? 'highlighted' : ''
                    }`}
                    onClick={() => handleSelectOption(itemCode)}
                    onMouseEnter={() => setHighlightedIndex(optIndex)}
                  >
                    <div className="top-branch-item-icon-tile store-icon">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
                        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
                        <path d="M10 6h4" />
                        <path d="M10 10h4" />
                      </svg>
                    </div>
                    <div className="top-branch-item-content">
                      <div className="top-branch-item-row">
                        <span className="top-branch-item-name">{b.name}</span>
                        <span className="top-branch-badge-pill branch-code">{b.code}</span>
                      </div>
                      <span className="top-branch-item-sub">
                        {b.address ? b.address.slice(0, 36) : 'Individual Branch Store'}
                      </span>
                    </div>
                    {isSelected && (
                      <div className="top-branch-item-check" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* e) Count pill: "3 branches" (singular "1 branch") */}
      {branches.length > 1 && (
        <span className="top-branch-count-pill" onClick={() => setIsOpen((prev) => !prev)}>
          {branches.length} {branches.length === 1 ? 'branch' : 'branches'}
        </span>
      )}
    </div>
  );
};
