import { Suspense } from 'react';
import { demoGames } from '../../../../services/demo/demoData';
import Client from './Client';

export async function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return demoGames
      .filter(g => g.platform === 'playstation')
      .map(game => ({
        id: game._id,
      }));
  }
  return [];
}

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <Client params={params} />
    </Suspense>
  );
}
