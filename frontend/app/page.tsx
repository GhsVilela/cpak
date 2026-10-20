'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setupMockApi } from '../services/demo/mockApi';

interface Profile {
  _id: string;
  platform: string;
  profileId: string;
  displayName: string;
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
      (window as any).__DEMO_MODE__ = true;
      setupMockApi();
    }
    async function checkProfiles() {
      try {
        const response = await fetch('/api/profiles');
        if (!response.ok) {
          throw new Error('Failed to fetch profiles');
        }

        const profiles: Profile[] = await response.json();

        if (profiles.length === 0) {
          router.push('/settings');
          return;
        }

        const platforms = new Set(profiles.map(p => p.platform));

        if (platforms.has('steam')) {
          router.push('/steam');
        } else if (platforms.has('xbox')) {
          router.push('/xbox');
        } else if (platforms.has('playstation')) {
          router.push('/playstation');
        } else {
          router.push('/settings');
        }
      } catch (error) {
        console.error('Error checking profiles:', error);
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
