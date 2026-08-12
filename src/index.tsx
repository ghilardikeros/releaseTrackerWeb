import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App'; // Or './RoutesContainer' if using Option B
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reportWebVitals();