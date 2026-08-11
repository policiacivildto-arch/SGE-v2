import React from 'react';

/**
 * Realistic Glock 17 / 19 Pistol Vector Icon
 */
export const GlockIcon = ({ size = 28, className = "", style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      <linearGradient id="glockSlideGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#475569" />
        <stop offset="30%" stopColor="#334155" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>
      <linearGradient id="glockFrameGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#1e293b" />
        <stop offset="100%" stopColor="#020617" />
      </linearGradient>
      <linearGradient id="glockBarrelGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#f1f5f9" />
        <stop offset="50%" stopColor="#94a3b8" />
        <stop offset="100%" stopColor="#475569" />
      </linearGradient>
    </defs>
    
    {/* Barrel Tip */}
    <rect x="4" y="20" width="8" height="5" rx="1" fill="url(#glockBarrelGrad)" />
    
    {/* Main Glock Slide */}
    <path d="M10 18 H52 C53.8 18 55 19.2 55 20.8 V27 C55 28.2 54 29 52.8 29 H10 V18 Z" fill="url(#glockSlideGrad)" stroke="#020617" strokeWidth="0.8" />
    
    {/* Ejection Port & Silver Barrel Block */}
    <rect x="33" y="19" width="10" height="5" rx="0.5" fill="url(#glockBarrelGrad)" stroke="#1e293b" strokeWidth="0.5" />
    
    {/* Rear Slide Serrations */}
    <line x1="46" y1="20" x2="46" y2="27" stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
    <line x1="48" y1="20" x2="48" y2="27" stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
    <line x1="50" y1="20" x2="50" y2="27" stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
    <line x1="52" y1="20" x2="52" y2="27" stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
    
    {/* Sights */}
    <rect x="51" y="15" width="3.5" height="3" fill="#020617" />
    <rect x="52.2" y="16" width="1.2" height="1.2" fill="#ffffff" />
    <rect x="13" y="16" width="2.5" height="2" fill="#020617" />
    <rect x="13.7" y="16.3" width="1" height="1" fill="#ffffff" />

    {/* Glock Polymer Frame & Dust Cover */}
    <path d="M10 29 H52 V32 C52 33 50.5 33.5 49 33.5 H37 C34 33.5 32 35.5 31 38 L24 53 C23.2 54.8 21.5 56 19.5 56 H12 C10 56 8.5 54.5 9 52.5 L15 33.5 H10 V29 Z" fill="url(#glockFrameGrad)" stroke="#020617" strokeWidth="0.8" />
    
    {/* Picatinny Accessory Rail */}
    <line x1="12" y1="32" x2="12" y2="33.5" stroke="#475569" strokeWidth="1" />
    <line x1="15" y1="32" x2="15" y2="33.5" stroke="#475569" strokeWidth="1" />
    <line x1="18" y1="32" x2="18" y2="33.5" stroke="#475569" strokeWidth="1" />
    
    {/* Trigger Guard Cutout */}
    <path d="M30 33.5 C29 38.5 24 41.5 19 40 H25 C28 40 29.5 38 30 33.5 Z" fill="#0f172a" stroke="#020617" strokeWidth="0.5" />
    {/* Dual Stage Trigger */}
    <path d="M26 34 C25 36.5 23 38 22 38" stroke="#cbd5e1" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    {/* Red Safety Blade */}
    <path d="M25.2 34.5 C24.5 36 23.2 37.2 22.5 37.2" stroke="#ef4444" strokeWidth="0.8" strokeLinecap="round" fill="none" />

    {/* Textured Grip Pattern */}
    <path d="M15 42 L20 54 M12 45 L17 55 M17 38 L22 50" stroke="#334155" strokeWidth="0.8" strokeDasharray="1 1.5" />

    {/* Magazine Baseplate */}
    <path d="M11 55.5 L19.5 55.5 L20.5 58.5 L10 58.5 Z" fill="#334155" stroke="#020617" strokeWidth="0.5" />

    {/* Glock Logo Emblem */}
    <rect x="14" y="44" width="4.5" height="4.5" rx="0.5" fill="#334155" />
    <text x="16.2.5" y="47.3" fontSize="3" fontWeight="bold" fill="#ffffff" textAnchor="middle" fontFamily="sans-serif">G</text>
  </svg>
);

/**
 * Three Ammunition Cartridges of Different Calibers Vector Icon (9mm, .40, 5.56mm)
 */
export const MunicoesIcon = ({ size = 28, className = "", style = {} }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
  >
    <defs>
      {/* Metallic Brass Casing Gradient */}
      <linearGradient id="brassGradMun" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#b45309" />
        <stop offset="20%" stopColor="#f59e0b" />
        <stop offset="50%" stopColor="#fef08a" />
        <stop offset="80%" stopColor="#d97706" />
        <stop offset="100%" stopColor="#78350f" />
      </linearGradient>

      {/* Copper FMJ Projectile Gradient */}
      <linearGradient id="copperGradMun" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#7c2d12" />
        <stop offset="25%" stopColor="#ea580c" />
        <stop offset="60%" stopColor="#fed7aa" />
        <stop offset="85%" stopColor="#ea580c" />
        <stop offset="100%" stopColor="#431407" />
      </linearGradient>

      {/* Silver / Lead / Steel Tip Gradient */}
      <linearGradient id="silverGradMun" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#334155" />
        <stop offset="40%" stopColor="#e2e8f0" />
        <stop offset="70%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#1e293b" />
      </linearGradient>
    </defs>

    {/* ---------------- 1. LEFT BULLET: 9mm Luger (Pistol) ---------------- */}
    <g id="bullet-9mm">
      <path d="M8 55 H18 V57 H8 Z" fill="url(#brassGradMun)" />
      <path d="M9 52 H17 V55 H9 Z" fill="#78350f" />
      <rect x="8.5" y="32" width="9" height="20" rx="0.5" fill="url(#brassGradMun)" stroke="#78350f" strokeWidth="0.4" />
      <line x1="8.5" y1="32" x2="17.5" y2="32" stroke="#451a03" strokeWidth="0.6" />
      {/* 9mm FMJ Rounded Nose */}
      <path d="M8.8 32 C8.8 23 17.2 23 17.2 32 Z" fill="url(#copperGradMun)" stroke="#431407" strokeWidth="0.4" />
      <text x="13" y="62" fontSize="5.5" fontWeight="900" fill="#475569" textAnchor="middle" fontFamily="sans-serif">9mm</text>
    </g>

    {/* ---------------- 2. CENTER BULLET: .40 S&W Hollow Point ---------------- */}
    <g id="bullet-40">
      <path d="M25 55 H37 V57 H25 Z" fill="url(#brassGradMun)" />
      <path d="M26.5 52 H35.5 V55 H26.5 Z" fill="#78350f" />
      <rect x="26" y="27" width="10" height="25" rx="0.5" fill="url(#brassGradMun)" stroke="#78350f" strokeWidth="0.4" />
      <line x1="26" y1="27" x2="36" y2="27" stroke="#451a03" strokeWidth="0.6" />
      {/* .40 Jacketed Hollow Point */}
      <path d="M26.3 27 L27.8 18 H34.2 L35.7 27 Z" fill="url(#copperGradMun)" stroke="#431407" strokeWidth="0.4" />
      <ellipse cx="31" cy="18" rx="3.2" ry="1.2" fill="url(#silverGradMun)" />
      <ellipse cx="31" cy="18.3" rx="1.8" ry="0.6" fill="#0f172a" />
      <text x="31" y="62" fontSize="5.5" fontWeight="900" fill="#d97706" textAnchor="middle" fontFamily="sans-serif">.40</text>
    </g>

    {/* ---------------- 3. RIGHT BULLET: 5.56mm Rifle Spitzer ---------------- */}
    <g id="bullet-556">
      <path d="M44 55 H54 V57 H44 Z" fill="url(#brassGradMun)" />
      <path d="M45 52 H53 V55 H45 Z" fill="#78350f" />
      {/* Bottleneck casing */}
      <path d="M44.5 35 H53.5 V52 H44.5 Z" fill="url(#brassGradMun)" stroke="#78350f" strokeWidth="0.4" />
      <path d="M44.5 35 L46.5 28 H51.5 L53.5 35 Z" fill="url(#brassGradMun)" stroke="#78350f" strokeWidth="0.4" />
      <rect x="46.5" y="22" width="5" height="6" fill="url(#brassGradMun)" stroke="#78350f" strokeWidth="0.4" />
      {/* Spitzer pointed tip */}
      <path d="M46.7 22 C46.7 14 49 5 49 5 C49 5 51.3 14 51.3 22 Z" fill="url(#copperGradMun)" stroke="#431407" strokeWidth="0.4" />
      <path d="M48 10 C48 7.5 49 5 49 5 C49 5 50 7.5 50 10 Z" fill="url(#silverGradMun)" />
      <text x="49" y="62" fontSize="5.5" fontWeight="900" fill="#2563eb" textAnchor="middle" fontFamily="sans-serif">5.56</text>
    </g>
  </svg>
);
