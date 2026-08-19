// Bundled, not fetched: see the privacy claim in README.md. The variable
// builds carry every weight the interface uses in one file each.
import '@fontsource-variable/oswald';
import '@fontsource-variable/inter';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
