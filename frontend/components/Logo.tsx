'use client';

import { usePathname } from 'next/navigation';

export default function Logo() {
  const pathname = usePathname();
  
  // Determine group class based on current page for hover effect
  let groupClass = 'group';
  if (pathname?.startsWith('/steam')) {
    groupClass = 'group group-steam';
  } else if (pathname?.startsWith('/xbox')) {
    groupClass = 'group group-xbox';
  } else if (pathname?.startsWith('/playstation')) {
    groupClass = 'group group-playstation';
  }

  return (
    <a href="/" className={groupClass}>
      <h1 className="text-2xl font-black tracking-tight logo-text">
        <span className="logo-bracket">[</span>
        <span className="logo-gradient">cpak</span>
        <span className="logo-bracket">]</span>
      </h1>
    </a>
  );
}
