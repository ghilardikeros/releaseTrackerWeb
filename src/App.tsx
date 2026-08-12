import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './Dashboard';
import SearchPage from './SearchPage';
import './index.css';

// 🔥 Export the component
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/search" element={<SearchPage />} />
      </Routes>
    </Router>
  );
}

// 🔥 Ensure this export statement exists
export default App;