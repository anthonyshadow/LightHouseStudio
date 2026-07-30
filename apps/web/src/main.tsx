import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from './app/AppRouter';
import { StudioDesignProvider } from './ui/StudioDesignProvider';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Application root is unavailable.');
}

createRoot(root).render(
  <StrictMode>
    <StudioDesignProvider>
      <AppRouter />
    </StudioDesignProvider>
  </StrictMode>,
);
