import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StudioApp } from './studio/StudioApp';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Application root is unavailable.');
}

createRoot(root).render(
  <StrictMode>
    <StudioApp />
  </StrictMode>,
);
