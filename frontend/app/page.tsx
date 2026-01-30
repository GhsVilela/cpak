'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Profile {
  _id: string;
  platform: string;
  profileId: string;
  displayName: string;
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function checkProfiles() {
      try {
        const response = await fetch('/api/profiles');
        if (!response.ok) {
          throw new Error('Failed to fetch profiles');
        }

        const profiles: Profile[] = await response.json();

        if (profiles.length === 0) {
          // No profiles configured, redirect to settings
          router.push('/settings');
          return;
        }

        // Check which platforms have profiles
        const platforms = new Set(profiles.map(p => p.platform));

        // Priority: steam > xbox > playstation
        if (platforms.has('steam')) {
          router.push('/steam');
        } else if (platforms.has('xbox')) {
          router.push('/xbox');
        } else if (platforms.has('playstation')) {
          router.push('/playstation');
        } else {
          // Fallback to settings if unknown platform
          router.push('/settings');
        }
      } catch (error) {
        console.error('Error checking profiles:', error);
        // On error, default to settings page
        router.push('/settings');
      }
    }

    checkProfiles();
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <main className="flex flex-col gap-8 items-center">
        <h1 className="text-4xl font-bold">cpak</h1>
        <p className="text-xl text-center">Cross Platform Achievement Keeper</p>
        <p className="text-sm text-gray-400">Loading...</p>
      </main>
    </div>
  );
}
