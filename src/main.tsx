import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initVisualScale } from './lib/visualScale';

// Initialize global visual accessibility scale on bootstrap
initVisualScale();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
