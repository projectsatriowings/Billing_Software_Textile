import React, { useState } from 'react';
import './SalesLoaders.css';

/* ==========================================================================
   REUSABLE CONTENT-SHAPED SALES LOADERS
   ========================================================================== */

export interface PulseBarProps {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  circle?: boolean;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 1. PulseBar
 * Reusable placeholder bar (#EADFE8) with gentle opacity pulse (0.5 -> 1 -> 0.5, 1.6s)
 */
export const PulseBar: React.FC<PulseBarProps> = ({
  width = '100%',
  height = 14,
  radius = 6,
  circle = false,
  delay = 0,
  className = '',
  style = {},
}) => {
  return (
    <div
      className={`sales-pulse-bar ${circle ? 'circle' : ''} ${className}`.trim()}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: circle ? '50%' : typeof radius === 'number' ? `${radius}px` : radius,
        animationDelay: `${delay}ms`,
        ...style,
      }}
    />
  );
};

export interface EqualizerChartProps {
  bars?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 2. EqualizerChart
 * 14 vertical bars of varied heights (38-90%), #E2D2DF, scaleY .55 -> 1 -> .55 wave with 80ms stagger
 * Aligned to a dashed baseline with 150x28 date-switch placeholder at top.
 */
export const EqualizerChart: React.FC<EqualizerChartProps> = ({
  bars = 14,
  height = 240,
  className = '',
  style = {},
}) => {
  const presetHeights = [45, 78, 62, 88, 54, 90, 72, 85, 40, 68, 82, 50, 76, 60];

  return (
    <div className={`sales-equalizer-chart-wrap ${className}`.trim()} style={style}>
      <div className="equalizer-header-sub">
        <PulseBar width={150} height={28} radius={8} />
      </div>
      <div className="equalizer-chart-area" style={{ height: `${height}px` }}>
        <div className="equalizer-bars-row">
          {Array.from({ length: bars }).map((_, idx) => {
            const h = presetHeights[idx % presetHeights.length];
            return (
              <div
                key={idx}
                className="equalizer-bar-col"
                style={{
                  height: `${h}%`,
                  animationDelay: `${idx * 80}ms`,
                }}
              />
            );
          })}
        </div>
        <div className="equalizer-dashed-baseline" />
      </div>
    </div>
  );
};

export interface SplineChartLoaderProps {
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 2b. SplineChartLoader
 * Calm pulsating dual spline curves for Revenue Breakdown placeholder (#EADFE8, #E2D2DF)
 */
export const SplineChartLoader: React.FC<SplineChartLoaderProps> = ({
  height = 240,
  className = '',
  style = {},
}) => {
  return (
    <div className={`sales-spline-loader-wrap ${className}`.trim()} style={style}>
      <div className="spline-loader-header-sub">
        <PulseBar width={130} height={28} radius={8} />
      </div>
      <div className="spline-loader-chart-area" style={{ height: `${height}px`, position: 'relative' }}>
        <svg viewBox="0 0 600 240" className="spline-loader-svg" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <defs>
            <linearGradient id="splineLoaderGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EADFE8" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#EADFE8" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="splineLoaderGrad2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E2D2DF" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#E2D2DF" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          <line x1="0" y1="60" x2="600" y2="60" stroke="#F3EDF1" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="0" y1="120" x2="600" y2="120" stroke="#F3EDF1" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="0" y1="180" x2="600" y2="180" stroke="#F3EDF1" strokeWidth="1" strokeDasharray="3 3" />

          <path
            className="spline-loader-path-area"
            d="M 0 160 C 100 110, 200 190, 300 90 C 400 40, 500 120, 600 70 L 600 240 L 0 240 Z"
            fill="url(#splineLoaderGrad)"
          />
          <path
            className="spline-loader-path-line"
            d="M 0 160 C 100 110, 200 190, 300 90 C 400 40, 500 120, 600 70"
            fill="none"
            stroke="#DDD2DC"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          <path
            className="spline-loader-path-area2"
            d="M 0 190 C 120 160, 220 210, 320 140 C 420 100, 510 160, 600 120 L 600 240 L 0 240 Z"
            fill="url(#splineLoaderGrad2)"
          />
          <path
            className="spline-loader-path-line2"
            d="M 0 190 C 120 160, 220 210, 320 140 C 420 100, 510 160, 600 120"
            fill="none"
            stroke="#C9B3C5"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        <div className="spline-dashed-baseline" />
      </div>
    </div>
  );
};

export interface DonutLoaderProps {
  size?: number;
  thickness?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 3. DonutLoader
 * 168px donut ring (26px thick, #EADFE8) with darker segment (#C9B3C5) turning around it (1.4s linear infinite)
 * 4 real mode names (Cash, UPI, Card, Credit) below it with 56px value bars.
 */
export const DonutLoader: React.FC<DonutLoaderProps> = ({
  size = 168,
  thickness = 26,
  className = '',
  style = {},
}) => {
  const modes = ['Cash', 'UPI', 'Card', 'Credit'];
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashLength = circumference * 0.28;
  const gapLength = circumference - dashLength;

  return (
    <div className={`sales-donut-loader-wrap ${className}`.trim()} style={style}>
      <div className="donut-ring-stage" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#EADFE8"
            strokeWidth={thickness}
          />
          <circle
            className="donut-spinning-segment"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#C9B3C5"
            strokeWidth={thickness}
            strokeDasharray={`${dashLength.toFixed(1)} ${gapLength.toFixed(1)}`}
            strokeLinecap="round"
          />
        </svg>
      </div>

      <div className="donut-modes-grid">
        {modes.map((name, idx) => (
          <div key={idx} className="donut-mode-item">
            <span className="donut-mode-label">{name}</span>
            <PulseBar width={56} height={14} radius={4} delay={idx * 60} />
          </div>
        ))}
      </div>
    </div>
  );
};

export interface HeatmapLoaderProps {
  rows?: number;
  cols?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 4. HeatmapLoader
 * 7 rows (Mon-Sun) x 12 hour columns, 22px cells, 4px radius, 6px gap.
 * Diagonal wave opacity .5 -> 1 -> .5, 1.8s, delay = (row + col) * 70ms.
 */
export const HeatmapLoader: React.FC<HeatmapLoaderProps> = ({
  rows = 7,
  cols = 12,
  className = '',
  style = {},
}) => {
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hourLabels = ['8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p', '7p'];

  return (
    <div className={`sales-heatmap-loader-wrap ${className}`.trim()} style={style}>
      <div className="heatmap-loader-header-hours">
        <div className="heatmap-loader-day-spacer" />
        {hourLabels.slice(0, cols).map((hr, idx) => (
          <div key={idx} className="heatmap-loader-hour-label">{hr}</div>
        ))}
      </div>

      <div className="heatmap-loader-grid-body">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="heatmap-loader-row">
            <div className="heatmap-loader-day-label">{dayLabels[rIdx % dayLabels.length]}</div>
            <div className="heatmap-loader-cells-row">
              {Array.from({ length: cols }).map((_, cIdx) => (
                <div
                  key={cIdx}
                  className="heatmap-loader-cell"
                  style={{
                    animationDelay: `${(rIdx + cIdx) * 70}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * 5. TopCashiersLoader
 * 5 rows, each a 34px avatar circle + name bar + 6px progress-bar track (shrinking 92% -> 30%) + 52px amount bar.
 */
export const TopCashiersLoader: React.FC<{ className?: string }> = ({ className = '' }) => {
  const trackFills = [92, 76, 60, 45, 30];

  return (
    <div className={`sales-cashiers-loader-list ${className}`.trim()}>
      {trackFills.map((fillPct, idx) => (
        <div key={idx} className="cashier-loader-row">
          <PulseBar width={34} height={34} circle delay={idx * 60} />
          <div className="cashier-loader-center">
            <PulseBar width="45%" height={14} radius={4} delay={idx * 60 + 20} />
            <div className="cashier-loader-track">
              <div
                className="cashier-loader-bar"
                style={{
                  width: `${fillPct}%`,
                  animationDelay: `${idx * 60 + 40}ms`,
                }}
              />
            </div>
          </div>
          <PulseBar width={52} height={14} radius={4} delay={idx * 60 + 50} />
        </div>
      ))}
    </div>
  );
};

export interface SectionCardProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  loading?: boolean;
  isRefreshing?: boolean;
  error?: string | null;
  onRetry?: () => void;
  cardIndex?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  placeholder?: React.ReactNode;
  hideHeaderWhenLoaded?: boolean;
  borderlessWhenLoaded?: boolean;
}

/**
 * 6. SectionCard
 * Card wrapper with real title, white card, 1px #EEE7EC border, 16px radius.
 * Handles loading placeholders, refreshing state (2px plum indeterminate bar, 50% opacity), and inline retry errors.
 */
export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  subtitle,
  badge,
  action,
  loading = false,
  isRefreshing = false,
  error = null,
  onRetry,
  cardIndex = 0,
  className = '',
  style = {},
  children,
  placeholder,
  hideHeaderWhenLoaded = false,
  borderlessWhenLoaded = false,
}) => {
  return (
    <div
      className={`sales-section-card ${loading ? 'is-loading' : 'is-loaded'} ${borderlessWhenLoaded && !loading ? 'is-borderless-loaded' : ''} ${className}`.trim()}
      style={{
        animationDelay: `${cardIndex * 60}ms`,
        ...style,
      }}
      aria-busy={loading ? 'true' : undefined}
    >
      {isRefreshing && (
        <div className="card-refresh-progress-wrap">
          <div className="card-refresh-progress-bar" />
        </div>
      )}

      {(!hideHeaderWhenLoaded || loading) && (
        <div className="sales-section-card-header">
          <div className="header-left">
            <h3 className="section-card-real-title">{title}</h3>
            {subtitle && <p className="section-card-real-subtitle">{subtitle}</p>}
          </div>
          <div className="header-right">
            {badge}
            {action}
          </div>
        </div>
      )}

      <div className="sales-section-card-body">
        {error ? (
          <div className="section-card-inline-error">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="error-msg">Couldn't load {title}</span>
            {onRetry && (
              <button type="button" className="section-retry-btn" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        ) : loading ? (
          <div className="section-card-placeholder-fade">
            {placeholder}
          </div>
        ) : (
          <div className={`section-card-content-fade ${isRefreshing ? 'is-refreshing-dim' : ''}`}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export interface KPICardProps {
  label: string;
  icon?: React.ReactNode;
  loading?: boolean;
  isRefreshing?: boolean;
  error?: string | null;
  onRetry?: () => void;
  cardIndex?: number;
  valueWidth?: string | number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * 7. KPICard
 * Real label (13px semibold, #5B4A58), 30px value bar (40-70% wide), 72x20 pill for trend %.
 */
export const KPICard: React.FC<KPICardProps> = ({
  label,
  icon,
  loading = false,
  isRefreshing = false,
  error = null,
  onRetry,
  cardIndex = 0,
  valueWidth = '58%',
  className = '',
  style = {},
  children,
}) => {
  return (
    <div
      className={`sales-kpi-card-wrapper ${className}`.trim()}
      style={{
        animationDelay: `${cardIndex * 60}ms`,
        ...style,
      }}
      aria-busy={loading ? 'true' : undefined}
    >
      {isRefreshing && (
        <div className="card-refresh-progress-wrap">
          <div className="card-refresh-progress-bar" />
        </div>
      )}

      {error ? (
        <div className="section-card-inline-error">
          <span className="error-msg">Couldn't load {label}</span>
          {onRetry && (
            <button type="button" className="section-retry-btn" onClick={onRetry}>
              Retry
            </button>
          )}
        </div>
      ) : loading ? (
        <div className="section-card-placeholder-fade">
          <div className="kpi-loader-header">
            <span className="kpi-real-label">{label}</span>
            {icon}
          </div>
          <div className="kpi-loader-trend-row">
            <PulseBar width={72} height={20} radius={9999} delay={cardIndex * 60 + 20} />
          </div>
          <div className="kpi-loader-bottom-row">
            <PulseBar width={valueWidth} height={30} radius={6} delay={cardIndex * 60 + 40} />
            <PulseBar width={54} height={28} radius={4} delay={cardIndex * 60 + 50} />
          </div>
        </div>
      ) : (
        <div className={`section-card-content-fade ${isRefreshing ? 'is-refreshing-dim' : ''}`}>
          {children}
        </div>
      )}
    </div>
  );
};

/* ==========================================================================
   REAL LOADED SECTIONS (ZERO LAYOUT SHIFT PAIRS)
   ========================================================================== */

export interface PaymentModesRealProps {
  modes: Array<{
    mode: string;
    label: string;
    totalMinor: number;
    sharePct: number;
    color?: string;
  }>;
  totalMinor?: number;
  formatRupeesFn?: (val: number) => string;
}

const COLORFUL_PAYMENT_PALETTE = [
  '#7C3AED', // UPI / Violet
  '#10B981', // Cash / Emerald Green
  '#3B82F6', // Card / Electric Blue
  '#F59E0B', // Credit / Amber Gold
  '#EC4899', // Pink / Coral
  '#06B6D4', // Teal
];

const MODE_COLOR_MAP: Record<string, string> = {
  cash: '#10B981',       // Vibrant Emerald Green
  upi: '#7C3AED',        // Vibrant Violet
  card: '#3B82F6',       // Vibrant Electric Blue
  credit: '#F59E0B',     // Vibrant Amber Gold
  khata: '#F97316',      // Vibrant Warm Orange
  cheque: '#06B6D4',     // Vibrant Cyan
  bank: '#0284C7',       // Sky Blue
  netbanking: '#6366F1', // Indigo
};

export const getPaymentModeColor = (
  mode: { mode?: string; label?: string; color?: string },
  index: number
): string => {
  const key = (mode.mode || mode.label || '').toLowerCase().trim();
  for (const [k, color] of Object.entries(MODE_COLOR_MAP)) {
    if (key.includes(k)) return color;
  }
  if (
    mode.color &&
    mode.color !== '#3B1E36' &&
    !mode.color.startsWith('#5C') &&
    !mode.color.startsWith('#7D')
  ) {
    return mode.color;
  }
  return COLORFUL_PAYMENT_PALETTE[index % COLORFUL_PAYMENT_PALETTE.length];
};

export const PaymentModesReal: React.FC<PaymentModesRealProps> = ({
  modes = [],
  totalMinor,
  formatRupeesFn = (val: number) => `₹${Math.round(val / 100).toLocaleString('en-IN')}`,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const size = 168;
  const thickness = 26;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedAngle = 0;
  const activeModes = modes.filter((m) => m.sharePct > 0 || m.totalMinor > 0);

  const calculatedTotal = totalMinor !== undefined
    ? totalMinor
    : modes.reduce((acc, m) => acc + (m.totalMinor || 0), 0);

  const hoveredMode = hoveredIdx !== null ? modes[hoveredIdx] : null;

  return (
    <div className="payment-modes-real-wrap">
      <div className="payment-modes-donut-box">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#F1EBF0"
            strokeWidth={thickness}
          />
          {activeModes.map((m, idx) => {
            const origIdx = modes.indexOf(m);
            const targetIdx = origIdx !== -1 ? origIdx : idx;
            const isHovered = hoveredIdx === targetIdx;
            const share = Math.max(0, Math.min(100, m.sharePct));
            const rawStroke = (share / 100) * circumference;
            // Add a crisp 2px segment gap if multiple modes exist
            const strokeDash = activeModes.length > 1 ? Math.max(2, rawStroke - 2.5) : rawStroke;
            const strokeGap = circumference - strokeDash;
            const strokeOffset = -((accumulatedAngle / 100) * circumference);
            accumulatedAngle += share;
            const col = getPaymentModeColor(m, idx);

            return (
              <circle
                key={idx}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={col}
                strokeWidth={isHovered ? thickness + 4 : thickness}
                strokeDasharray={`${strokeDash.toFixed(2)} ${strokeGap.toFixed(2)}`}
                strokeDashoffset={strokeOffset.toFixed(2)}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                opacity={hoveredIdx !== null && !isHovered ? 0.45 : 1}
                style={{
                  cursor: 'pointer',
                  transition: 'stroke-width 0.2s ease, opacity 0.2s ease, stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease',
                }}
                onMouseEnter={() => setHoveredIdx(targetIdx)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            );
          })}
        </svg>

        <div className="payment-modes-center-text">
          {hoveredMode ? (
            <>
              <span
                className="payment-modes-center-total"
                style={{ color: getPaymentModeColor(hoveredMode, hoveredIdx!) }}
              >
                {formatRupeesFn(hoveredMode.totalMinor)}
              </span>
              <span className="payment-modes-center-sub" style={{ color: '#5B4A58' }}>
                {hoveredMode.label} • {hoveredMode.sharePct}%
              </span>
            </>
          ) : (
            <>
              <span className="payment-modes-center-total">{formatRupeesFn(calculatedTotal)}</span>
              <span className="payment-modes-center-sub">Total</span>
            </>
          )}
        </div>
      </div>

      <div className="payment-modes-real-grid">
        {modes.slice(0, 4).map((m, idx) => {
          const col = getPaymentModeColor(m, idx);
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={idx}
              className={`payment-mode-real-item ${isHovered ? 'hovered' : ''}`}
              style={{
                cursor: 'pointer',
                opacity: hoveredIdx !== null && !isHovered ? 0.5 : 1,
                transition: 'opacity 0.2s ease, transform 0.2s ease',
                transform: isHovered ? 'scale(1.03)' : 'none',
              }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="payment-mode-real-left">
                <span
                  className="payment-mode-real-dot"
                  style={{
                    backgroundColor: col,
                    boxShadow: `0 0 0 2px ${col}33`,
                  }}
                />
                <span className="payment-mode-real-name">{m.label}</span>
              </div>
              <span className="payment-mode-real-val mono" style={{ color: col }}>
                {m.sharePct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export interface TopCashiersRealProps {
  cashiers: Array<{
    userId?: string;
    userName: string;
    counterName?: string;
    salesMinor: number;
    billsCount?: number;
    avgBillMinor?: number;
  }>;
  formatRupeesFn?: (val: number) => string;
}

export const TopCashiersReal: React.FC<TopCashiersRealProps> = ({
  cashiers = [],
  formatRupeesFn = (val: number) => `₹${Math.round(val / 100).toLocaleString('en-IN')}`,
}) => {
  const top5 = cashiers.slice(0, 5);
  const maxSales = Math.max(1, ...top5.map((c) => c.salesMinor));

  if (top5.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#7C6878', fontSize: '13px' }}>
        No cashier performance activity for this period.
      </div>
    );
  }

  return (
    <div className="cashier-real-list">
      {top5.map((c, idx) => {
        const initials = c.userName
          ? c.userName
              .split(' ')
              .map((p) => p[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase()
          : 'U';
        const pct = Math.max(12, Math.min(100, Math.round((c.salesMinor / maxSales) * 100)));

        return (
          <div key={c.userId || idx} className="cashier-real-row">
            <div className="cashier-real-avatar" title={c.userName}>
              {initials}
            </div>
            <div className="cashier-real-center">
              <div className="cashier-real-name-row">
                <span className="cashier-real-name" title={c.userName}>{c.userName}</span>
                {c.counterName && <span className="cashier-real-counter">{c.counterName}</span>}
              </div>
              <div className="cashier-real-track">
                <div className="cashier-real-bar" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <span className="cashier-real-amount mono">{formatRupeesFn(c.salesMinor)}</span>
          </div>
        );
      })}
    </div>
  );
};

