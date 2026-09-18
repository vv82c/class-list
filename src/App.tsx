import { Navigate, Route, Routes } from 'react-router-dom';
import SideNav from './components/SideNav';
import SchedulePage from './pages/SchedulePage';
import CapturePage from './pages/CapturePage';
import ArchivePage from './pages/ArchivePage';
import CourseDetailPage from './pages/CourseDetailPage';
import CourseFormPage from './pages/CourseFormPage';
import SyncPage from './pages/SyncPage';

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl items-stretch bg-slate-50 text-slate-900">
      <SideNav />
      <div className="min-w-0 flex-1">
        <Routes>
          <Route path="/" element={<SchedulePage />} />
          <Route path="/capture" element={<CapturePage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/course-form" element={<CourseFormPage />} />
          <Route path="/course/:id" element={<CourseDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}
