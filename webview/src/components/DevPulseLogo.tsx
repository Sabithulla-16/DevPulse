import React from 'react';

interface DevPulseLogoProps {
  size?: number;
  className?: string;
  color?: string;
}

export const DevPulseLogo: React.FC<DevPulseLogoProps> = ({
  size = 20,
  className = '',
  color = '#22c55e'
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M3 12h4l3-8 4 16 3-8h4"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
