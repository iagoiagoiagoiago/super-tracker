import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { requestPersistentStorage } from './db/storage'
import { ActiveWorkout } from './pages/ActiveWorkout'
import { Bjj } from './pages/Bjj'
import { ExerciseDetail } from './pages/ExerciseDetail'
import { Exercises } from './pages/Exercises'
import { Gym } from './pages/Gym'
import { History } from './pages/History'
import { Home } from './pages/Home'
import { ImportStrong } from './pages/ImportStrong'
import { Settings } from './pages/Settings'
import { TemplateEditor } from './pages/TemplateEditor'
import { Train } from './pages/Train'
import { WorkoutDetail } from './pages/WorkoutDetail'

export default function App() {
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:id" element={<WorkoutDetail />} />
        <Route path="/train" element={<Train />} />
        <Route path="/workout" element={<ActiveWorkout />} />
        <Route path="/template/:id" element={<TemplateEditor />} />
        <Route path="/gym" element={<Gym />} />
        <Route path="/gym/exercises" element={<Exercises />} />
        <Route path="/gym/exercises/:id" element={<ExerciseDetail />} />
        <Route path="/bjj" element={<Bjj />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/import/strong" element={<ImportStrong />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </BrowserRouter>
  )
}
