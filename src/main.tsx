import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 1. Core Variables (Colors/Fonts)
import './styles/variables.css';
// 2. Animations
import './styles/animations.css';
// 3. Global Styles (Tailwind directives)
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);