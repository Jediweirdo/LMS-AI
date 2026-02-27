import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  BookOpen,
  MessageCircle,
  Menu,
  X,
  ChevronRight,
  Folder,
  CalendarDays,
  FolderOpen,
  Settings,
} from 'lucide-react';
import { useStudentStore } from '../store/studentStore';
import clsx from 'clsx';
import asuLogoShort from '../assets/branding/asu-logo-short.png';
import asuLogoFull from '../assets/branding/asu-logo-full.png';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/course', icon: BookOpen, label: 'Course Progress' },
  { to: '/project', icon: FolderOpen, label: 'My Projects' },
  { to: '/projects', icon: Folder, label: 'Project Library' },
  { to: '/calendar', icon: CalendarDays, label: 'Milestone Calendar' },
  { to: '/mentor', icon: MessageCircle, label: 'AI Mentors' },
];

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const student = useStudentStore((s) => s.student);
  const location = useLocation();
  const isProjectRoute = location.pathname === '/project' || location.pathname.startsWith('/project/');

  const getPageTitle = () => {
    if (location.pathname.startsWith('/project/') && location.pathname.endsWith('/mentor')) return 'Project Mentor';
    if (location.pathname.startsWith('/project/') && location.pathname !== '/project') return 'Project Detail';
    return navItems.find((item) => item.to === location.pathname)?.label || 'Dashboard';
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}
      </AnimatePresence>

      <aside className={clsx(
        'fixed lg:static inset-y-0 left-0 z-50 w-72 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )} style={{ background: 'var(--color-sidebar)' }}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div>
              <img src={asuLogoFull} alt="Arizona State University" className="h-5 w-auto object-contain" />
              <p className="font-semibold text-slate-400 text-xs mt-1">ProjectForge Studio</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
              {student.name.split(' ').map((n) => n[0]).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{student.name}</p>
              <p className="text-slate-400 text-xs truncate">
                {student.projects.length} project{student.projects.length !== 1 ? 's' : ''} · Week {student.currentWeek}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-slate-400">Overall Progress</span>
              <span className="text-indigo-400 font-medium">{student.overallProgress}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${student.overallProgress}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                (isActive || (item.to === '/project' && isProjectRoute))
                  ? 'bg-white/10 text-white shadow-lg shadow-black/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              )}>
              {({ isActive }) => (
                <>
                  <item.icon className={clsx('w-5 h-5 transition-colors',
                    (isActive || (item.to === '/project' && isProjectRoute))
                      ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300')} />
                  <span className="flex-1">{item.label}</span>
                  {item.to === '/project' && student.projects.length > 0 && (
                    <span className="text-[10px] font-bold bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded-md">
                      {student.projects.length}
                    </span>
                  )}
                  {(isActive || (item.to === '/project' && isProjectRoute)) && (
                    <ChevronRight className="w-4 h-4 text-indigo-400" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-6 py-4 border-t border-white/10 flex items-end justify-between gap-3">
          <div>
            <p className="text-slate-500 text-xs">{student.semester}</p>
            <p className="text-slate-400 text-xs mt-0.5">Week {student.currentWeek} of 14</p>
          </div>
          <NavLink
            to="/settings"
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              clsx(
                'w-9 h-9 rounded-lg border flex items-center justify-center transition-colors',
                isActive
                  ? 'border-indigo-400/70 bg-indigo-500/20 text-indigo-300'
                  : 'border-white/15 text-slate-400 hover:text-white hover:bg-white/10',
              )
            }
            aria-label="Open Settings"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </NavLink>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/60">
          <div className="flex items-center justify-between px-4 sm:px-6 h-16">
            <div className="flex items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-600 hover:text-slate-900 p-1">
                <Menu className="w-6 h-6" />
              </button>
              <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {getPageTitle()}
              </h2>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Week {student.currentWeek} Active
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
