import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AppLayout from './layouts/AppLayout';
import Dashboard from './pages/Dashboard';
import CourseProgress from './pages/CourseProgress';
import ProjectHub from './pages/ProjectHub';
import ProjectLibrary from './pages/ProjectLibrary';
import ProjectDetail from './pages/ProjectDetail';
import ProjectMentor from './pages/ProjectMentor';
import Mentor from './pages/Mentor';
import DeliverableCalendar from './pages/DeliverableCalendar';
import Settings from './pages/Settings';
import Setup from './pages/Setup';
import { initializeAllStores, useIsAppLoading } from './store/hooks';

function App() {
  const isLoading = useIsAppLoading();
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    const hasSeenSetup = localStorage.getItem('lms-setup-complete');
    if (!hasSeenSetup) {
      setShowSetup(true);
    }
    (async () => {
      try {
        await initializeAllStores();
        // eslint-disable-next-line no-console
        console.log('All stores initialized');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Store initialization error:', e);
      }
    })();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (showSetup) {
    return (
      <BrowserRouter>
        <Routes>
          <Route
            path="/setup"
            element={
              <Setup
                onComplete={() => {
                  setShowSetup(false);
                  localStorage.setItem('lms-setup-complete', 'true');
                }}
              />
            }
          />
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/course" element={<CourseProgress />} />
          <Route path="/project" element={<ProjectHub />} />
          <Route path="/project/:projectId" element={<ProjectDetail />} />
          <Route path="/project/:projectId/mentor" element={<ProjectMentor />} />
          <Route path="/projects" element={<ProjectLibrary />} />
          <Route path="/calendar" element={<DeliverableCalendar />} />
          <Route path="/mentor" element={<Mentor />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="/setup" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
