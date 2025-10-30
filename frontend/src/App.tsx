import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import TestPage from './pages/TestPage';
import HomePage from './pages/HomePage';
import CreateMarketPage from './pages/CreateMarketPage';
import MarketDetailPage from './pages/MarketDetailPage';
import MyPositionsPage from './pages/MyPositionsPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/test" element={<TestPage />} />
        <Route path="/create" element={<CreateMarketPage />} />
        <Route path="/market/:marketAddress" element={<MarketDetailPage />} />
        <Route path="/my-positions" element={<MyPositionsPage />} />
      </Routes>
    </Router>
  );
}

export default App;

