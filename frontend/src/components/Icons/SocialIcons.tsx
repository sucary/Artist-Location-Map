import React from 'react';

interface IconProps {
    className?: string;
}

// Initialize all svg icons used for social links and others

export const HomeIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M13.5 14.7998C13.5 15.1864 13.1864 15.5 12.7998 15.5H10C9.72386 15.5 9.5 15.2761 9.5 15C9.5 14.7239 9.72386 14.5 10 14.5H12.5V8.5H3.5V14.5H6C6.27614 14.5 6.5 14.7239 6.5 15C6.5 15.2761 6.27614 15.5 6 15.5H3.2002C2.8136 15.5 2.5 15.1864 2.5 14.7998V8.2002C2.5 7.8136 2.8136 7.5 3.2002 7.5H12.7998C13.1864 7.5 13.5 7.8136 13.5 8.2002V14.7998Z" fill="currentColor" stroke="currentColor" strokeWidth="0.25"/>
        <path d="M6 15V11.2C6 11.0895 6.08954 11 6.2 11H9.8C9.91046 11 10 11.0895 10 11.2V15" stroke="currentColor" strokeWidth="1.25"/>
        <path d="M7.50488 0.788087C7.74401 0.548963 8.11308 0.519024 8.38476 0.698243L8.49512 0.788087L15.0117 7.30469C15.4526 7.74556 15.1409 8.49966 14.5176 8.5H1.48242C0.859071 8.49966 0.547402 7.74557 0.98828 7.30469L7.50488 0.788087ZM2.20703 7.5L7 7.5L13.793 7.5L8 1.70703L2.20703 7.5Z" fill="currentColor" stroke="currentColor" strokeWidth="0.25"/>
    </svg>
);

export const MusicIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M6 12V3.33333L14 2V10.6667" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 14C5.10457 14 6 13.1046 6 12C6 10.8954 5.10457 10 4 10C2.89543 10 2 10.8954 2 12C2 13.1046 2.89543 14 4 14Z" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 12.6667C13.1046 12.6667 14 11.7712 14 10.6667C14 9.5621 13.1046 8.66667 12 8.66667C10.8954 8.66667 10 9.5621 10 10.6667C10 11.7712 10.8954 12.6667 12 12.6667Z" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

export const YoutubeIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M1.66667 11.3333C1.20095 9.13551 1.20095 6.86449 1.66667 4.66667C1.72786 4.44347 1.8461 4.24005 2.00974 4.0764C2.17339 3.91276 2.37681 3.79453 2.6 3.73333C6.17564 3.14097 9.82437 3.14097 13.4 3.73333C13.6232 3.79453 13.8266 3.91276 13.9903 4.0764C14.1539 4.24005 14.2721 4.44347 14.3333 4.66667C14.7991 6.86449 14.7991 9.13551 14.3333 11.3333C14.2721 11.5565 14.1539 11.7599 13.9903 11.9236C13.8266 12.0872 13.6232 12.2055 13.4 12.2667C9.82438 12.8591 6.17563 12.8591 2.6 12.2667C2.37681 12.2055 2.17339 12.0872 2.00974 11.9236C1.8461 11.7599 1.72786 11.5565 1.66667 11.3333Z" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6.66666 10L10 8L6.66666 6V10Z" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

export const InstagramIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M11.3333 1.33333H4.66667C2.82572 1.33333 1.33333 2.82572 1.33333 4.66667V11.3333C1.33333 13.1743 2.82572 14.6667 4.66667 14.6667H11.3333C13.1743 14.6667 14.6667 13.1743 14.6667 11.3333V4.66667C14.6667 2.82572 13.1743 1.33333 11.3333 1.33333Z" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M10.6667 7.58C10.7489 8.13483 10.6542 8.70147 10.3958 9.19934C10.1375 9.69721 9.72877 10.1009 9.22776 10.3531C8.72675 10.6053 8.15897 10.6931 7.6052 10.604C7.05143 10.5148 6.53985 10.2534 6.14323 9.85677C5.74662 9.46016 5.48516 8.94858 5.39605 8.39481C5.30694 7.84103 5.39472 7.27326 5.64689 6.77225C5.89907 6.27123 6.3028 5.86249 6.80066 5.60416C7.29853 5.34583 7.86518 5.25106 8.42001 5.33333C8.98596 5.41725 9.50991 5.68097 9.91447 6.08553C10.319 6.4901 10.5828 7.01405 10.6667 7.58Z" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M11.6667 4.33333H11.6733" stroke="currentColor" strokeWidth="1.33333" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

export const XIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M3.75714 0.5C4.064 0.5 4.35386 0.640881 4.54345 0.882161L8.88477 6.40723L14.5056 0.787392C14.5958 0.697169 14.7182 0.646484 14.8458 0.646484C15.2734 0.646484 15.4886 1.1626 15.1876 1.46636L9.50684 7.19922L14.7573 13.8822C15.2728 14.5383 14.8054 15.5 13.971 15.5H12.2428C11.936 15.5 11.6461 15.3591 11.4566 15.1179L7.11719 9.5957L1.65919 15.3327C1.55754 15.4395 1.41652 15.5 1.26905 15.5H0.92338C0.577551 15.5 0.401306 15.0846 0.641602 14.8359L6.49414 8.80273L1.24255 2.11775C0.727104 1.46161 1.19453 0.5 2.02893 0.5H3.75714ZM12.2432 14.5H13.9707L3.75684 1.5H2.0293L12.2432 14.5Z" fill="currentColor" stroke="currentColor" strokeWidth="0.25"/>
    </svg>
);