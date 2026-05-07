import React from 'react';

interface IconProps {
    className?: string;
}

export const MapPinIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M21 10C21 17 12 23 12 23C12 23 3 17 3 10C3 5.02944 7.02944 1 12 1C16.9706 1 21 5.02944 21 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 13C13.6569 13 15 11.6569 15 10C15 8.34315 13.6569 7 12 7C10.3431 7 9 8.34315 9 10C9 11.6569 10.3431 13 12 13Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

export const LocationIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

export const NorthIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 L15.5 10 L12 12 L8.5 10 Z"  />
    <path d="M12 22 L8.5 14 L12 12 L15.5 14 Z" />
  </svg>
);

export const ExpandIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        <path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.1 5.1l3.8 3.8M15.1 15.1l3.8 3.8M5.1 18.9l3.8-3.8M15.1 8.9l3.8-3.8" />
    </svg>
);

export const CollapseIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="5" />
    </svg>
);

export const DoubleChevronHandleIcon: React.FC<IconProps> = ({ className = "w-12 h-16" }) => (
    <svg
        viewBox="0 0 64 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
    >
        <path
            d="M30 14 12 40l18 26"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M52 14 34 40l18 26"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);
