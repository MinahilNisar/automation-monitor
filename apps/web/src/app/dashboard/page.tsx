'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '@/components/monitor/dashboard';
import { ApiError } from '@/lib/api';
import './dashboard.css';
export default function DashboardPage() {
  // A fresh, memory-only cache for this route; never persist private query data.
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10000, gcTime: 60000, refetchOnWindowFocus: true, retry: (attempt, error) => !(error instanceof ApiError && error.status < 500) && attempt < 1 } } }));
  return <QueryClientProvider client={client}><Dashboard /></QueryClientProvider>;
}
