import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { requestPersistentStorage } from './db/storage'
import { Bjj } from './pages/Bjj'
import { Gym } from './pages/Gym'
import { History } from './pages/History'
import { Home } from './pages/Home'
import { Settings } from './pages/Settings'
import { Train } from './pages/Train'

export default function App() {
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/history" element={<History />} />
        <Route path="/train" element={<Train />} />
        <Route path="/gym" element={<Gym />} />
        <Route path="/bjj" element={<Bjj />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </BrowserRouter>
  )
}
