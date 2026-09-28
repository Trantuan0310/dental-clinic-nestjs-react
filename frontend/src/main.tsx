import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AppRoutes } from '@/routes/AppRoutes';
import { AppToaster } from '@/components/ui/Toast';
import '@/locales';
import '@/index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
      {/* Renders every notify.*() toast; without it they were silently dropped. */}
      <AppToaster />
    </QueryClientProvider>
  </React.StrictMode>,
);
