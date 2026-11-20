import React from 'react';
import './Skeleton.css';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
  circle?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  radius = 6,
  circle = false,
  className = '',
  style = {},
}) => {
  const inlineStyles: React.CSSProperties = {
    width: width !== undefined ? (typeof width === 'number' ? `${width}px` : width) : '100%',
    height: height !== undefined ? (typeof height === 'number' ? `${height}px` : height) : '16px',
    borderRadius: circle ? '50%' : (typeof radius === 'number' ? `${radius}px` : radius),
    ...style,
  };

  return (
    <span
      className={`ui-skeleton ${circle ? 'circle' : ''} ${className}`.trim()}
      style={inlineStyles}
      aria-hidden="true"
    />
  );
};
