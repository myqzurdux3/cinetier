// Bundled, not fetched: see the privacy claim in README.md. Latin subset
// only (see src/fonts.css for why) rather than the packages' full entry
// points, which ship every unicode-range subset the upstream fonts carry.
import './fonts.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
