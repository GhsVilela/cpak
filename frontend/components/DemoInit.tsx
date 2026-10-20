'use client';

import { useEffect } from 'react';
import { setupMockApi } from '../services/demo/mockApi';

export function DemoInit() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
      (window as any).__DEMO_MODE__ = true;
      setupMockApi();
    }
  }, []);

  return null;
}
