import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';

export type TooltipPosition = 'top' | 'right' | 'bottom' | 'left';

export interface TooltipProps {
  label?: string | React.ReactNode;
  position?: TooltipPosition;
  children: React.ReactElement;
  disabled?: boolean;
  delay?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * Universal, accessible, Portal-based Tooltip component for POS Navigation and Actions.
 * - Rendered in document.body via createPortal to prevent overflow: hidden clipping
 * - Smooth fade-in animation with dark theme matching POS sidebar/topbar
 * - Supports hover, keyboard :focus-visible, and touch tap accessibility
 * - Automatically computes viewport bounds and sets aria-label / role="tooltip"
 */
export const Tooltip: React.FC<TooltipProps> = ({
  label,
  position = 'top',
  children,
  disabled = false,
  delay = 60,
  className = '',
  ariaLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; arrowOffset?: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const touchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tooltipId = useId();

  const stringLabel = typeof label === 'string' ? label : (ariaLabel || '');

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const ttWidth = tooltipEl ? tooltipEl.offsetWidth : 120;
    const ttHeight = tooltipEl ? tooltipEl.offsetHeight : 30;

    let top = 0;
    let left = 0;
    let arrowOffset = 50;

    if (position === 'top') {
      top = rect.top - 8;
      const centerX = rect.left + rect.width / 2;
      const minLeft = 8 + ttWidth / 2;
      const maxLeft = window.innerWidth - 8 - ttWidth / 2;
      const clampedX = Math.max(minLeft, Math.min(centerX, maxLeft));
      left = clampedX;
      if (clampedX !== centerX) {
        arrowOffset = Math.max(15, Math.min(85, ((centerX - (clampedX - ttWidth / 2)) / ttWidth) * 100));
      }
    } else if (position === 'bottom') {
      top = rect.bottom + 8;
      const centerX = rect.left + rect.width / 2;
      const minLeft = 8 + ttWidth / 2;
      const maxLeft = window.innerWidth - 8 - ttWidth / 2;
      const clampedX = Math.max(minLeft, Math.min(centerX, maxLeft));
      left = clampedX;
      if (clampedX !== centerX) {
        arrowOffset = Math.max(15, Math.min(85, ((centerX - (clampedX - ttWidth / 2)) / ttWidth) * 100));
      }
    } else if (position === 'right') {
      top = rect.top + rect.height / 2;
      left = rect.right + 9;
      // Clamp vertical if overflowing viewport
      const minY = 8 + ttHeight / 2;
      const maxY = window.innerHeight - 8 - ttHeight / 2;
      top = Math.max(minY, Math.min(top, maxY));
    } else if (position === 'left') {
      top = rect.top + rect.height / 2;
      left = rect.left - 9;
      const minY = 8 + ttHeight / 2;
      const maxY = window.innerHeight - 8 - ttHeight / 2;
      top = Math.max(minY, Math.min(top, maxY));
    }

    setCoords({ top, left, arrowOffset });
  }, [position]);

  const showTooltip = useCallback(() => {
    if (disabled || !label) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, delay);
  }, [disabled, label, delay]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    setIsOpen(false);
  }, []);

  const handleTouch = useCallback(() => {
    if (disabled || !label) return;
    setIsOpen(true);
    if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    touchTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 1800);
  }, [disabled, label]);

  // Recalculate position when tooltip opens and on window scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hideTooltip();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition, hideTooltip]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (touchTimeoutRef.current) clearTimeout(touchTimeoutRef.current);
    };
  }, []);

  if (!React.isValidElement(children)) {
    return children;
  }

  const childProps = (children.props || {}) as Record<string, any>;

  const handleMouseEnter = (e: React.MouseEvent) => {
    childProps.onMouseEnter?.(e);
    showTooltip();
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    childProps.onMouseLeave?.(e);
    hideTooltip();
  };

  const handleFocus = (e: React.FocusEvent) => {
    childProps.onFocus?.(e);
    showTooltip();
  };

  const handleBlur = (e: React.FocusEvent) => {
    childProps.onBlur?.(e);
    hideTooltip();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    childProps.onTouchStart?.(e);
    handleTouch();
  };

  // Clone child with ref, handlers, and accessibility attributes
  const triggerElement = React.cloneElement(children as React.ReactElement<any>, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node;
      const originalRef = (children as any).ref;
      if (typeof originalRef === 'function') {
        originalRef(node);
      } else if (originalRef && typeof originalRef === 'object') {
        originalRef.current = node;
      }
    },
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onTouchStart: handleTouchStart,
    'aria-label': childProps['aria-label'] || stringLabel || undefined,
    'aria-describedby': isOpen ? tooltipId : childProps['aria-describedby'],
    'data-tooltip': typeof label === 'string' ? label : undefined,
    'data-tooltip-pos': position,
  });

  return (
    <>
      {triggerElement}
      {isOpen &&
        !disabled &&
        label &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className={`pos-portal-tooltip pos-portal-tooltip-${position} ${className}`}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              pointerEvents: 'none',
              zIndex: 99999,
            }}
          >
            <div className="pos-portal-tooltip-content">
              {label}
            </div>
            <div
              className="pos-portal-tooltip-arrow"
              style={
                position === 'top' || position === 'bottom'
                  ? { left: `${coords.arrowOffset ?? 50}%` }
                  : undefined
              }
            />
          </div>,
          document.body
        )}
    </>
  );
};
