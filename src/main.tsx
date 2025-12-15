import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// ENSURE THESE ARE IMPORTED:
import './styles/variables.css';
import './styles/animations.css';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);