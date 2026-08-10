/**
 * main.jsx — React Entry Point
 *
 * PURPOSE:
 * This is the very first React file that runs. It:
 *   1. Imports the root App component.
 *   2. Imports the global CSS styles.
 *   3. Mounts the React app into the <div id="root"> in index.html.
 *
 * React.StrictMode enables additional development warnings and checks.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
