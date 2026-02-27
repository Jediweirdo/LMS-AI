import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Folder,
  Search,
  Target,
  Clock,
  Package,
  MessageCircle,
  Trash2,
  ArrowRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useStudentStore } from '../store/studentStore';
import type { StudentProject } from '../types/student';

type LibraryStatus = 'NotStarted' | 'InProgress' | 'Finished';
type LibraryTab = 'All' | LibraryStatus;

const STATUS_LABEL: Record<LibraryStatus, string> = {
  NotStarted: 'Not Started',
  InProgress: 'In Progress',
  Finished: 'Finished',
};

const STATUS_BADGE: Record<LibraryStatus, string> = {
  NotStarted: 'bg-slate-100 text-slate-600',
  InProgress: 'bg-indigo-100 text-indigo-700',
  Finished: 'bg-emerald-100 text-emerald-700',
};

const TABS: LibraryTab[] = ['All', 'NotStarted', 'InProgress', 'Finished'];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function getProjectStatus(project: StudentProject): LibraryStatus {
  const milestones = project.brief.milestones;
  if (milestones.length === 0) return 'NotStarted';

  const completed = milestones.filter((m) => m.status === 'completed').length;
  const hasInProgress = milestones.some((m) => m.status === 'in-progress');

  if (completed === milestones.length) return 'Finished';
  if (completed > 0 || hasInProgress) return 'InProgress';
  return 'NotStarted';
}

function progress(project: StudentProject): { completed: number; total: number; pct: number } {
  const total = project.brief.milestones.length;
  const completed = project.brief.milestones.filter((m) => m.status === 'completed').length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, pct };
}

export default function ProjectLibrary() {
  const student = useStudentStore((s) => s.student);
  const deleteProject = useStudentStore((s) => s.deleteProject);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<LibraryTab>('All');

  const sortedProjects = useMemo(() => {
    return [...student.projects].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
  }, [student.projects]);

  const displayed = useMemo(() => {
    let list = sortedProjects;
    if (tab !== 'All') {
      list = list.filter((project) => getProjectStatus(project) === tab);
    }

    const q = query.trim().toLowerCase();
    if (q.length > 0) {
      list = list.filter((project) => {
        return (
          project.brief.title.toLowerCase().includes(q) ||
          project.brief.context.toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [sortedProjects, query, tab]);

  const tabCounts = useMemo(() => {
    const counts: Record<LibraryTab, number> = {
      All: sortedProjects.length,
      NotStarted: 0,
      InProgress: 0,
      Finished: 0,
    };

    for (const project of sortedProjects) {
      counts[getProjectStatus(project)] += 1;
    }

    return counts;
  }, [sortedProjects]);

  const handleDelete = (project: StudentProject) => {
    const confirmed = window.confirm(`Delete "${project.brief.title}"? This cannot be undone.`);
    if (!confirmed) return;
    deleteProject(project.id);
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div
        variants={item}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-6 sm:p-8 text-white"
      >
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full -translate-y-1/4 translate-x-1/4" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Folder className="w-5 h-5 text-indigo-300" />
            <span className="text-indigo-200 text-xs font-semibold uppercase tracking-wider">
              Project Library
            </span>
          </div>
          <h1
            className="text-2xl sm:text-3xl font-bold mb-2"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            All Saved Projects
          </h1>
          <p className="text-slate-300 text-sm max-w-2xl">
            Browse everything you generated, filter by completion state, and jump directly into
            detail or mentor.
          </p>
        </div>
      </motion.div>

      <motion.div variants={item}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search project title or context"
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition"
          />
        </div>
      </motion.div>

      <motion.div variants={item} className="flex flex-wrap gap-2">
        {TABS.map((filter) => (
          <button
            key={filter}
            onClick={() => setTab(filter)}
            className={clsx(
              'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all',
              tab === filter
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-500 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600',
            )}
          >
            {filter === 'All' ? 'All' : STATUS_LABEL[filter]}
            <span
              className={clsx(
                'px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                tab === filter ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500',
              )}
            >
              {tabCounts[filter]}
            </span>
          </button>
        ))}
      </motion.div>

      {displayed.length === 0 ? (
        <motion.div
          variants={item}
          className="bg-white rounded-2xl p-10 border border-slate-100 shadow-sm text-center"
        >
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Folder className="w-7 h-7 text-slate-400" />
          </div>
          <h3
            className="text-base font-semibold text-slate-900 mb-1"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            No projects found
          </h3>
          <p className="text-sm text-slate-500 mb-5">
            {student.projects.length === 0
              ? "You haven't generated a project yet."
              : 'No projects match your current filter.'}
          </p>
          <button
            onClick={() => navigate('/project')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Generate a Project
          </button>
        </motion.div>
      ) : (
        <motion.div variants={container} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map((project) => {
            const status = getProjectStatus(project);
            const stats = progress(project);

            return (
              <motion.div
                key={project.id}
                variants={item}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="p-5 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={clsx(
                        'inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide',
                        STATUS_BADGE[status],
                      )}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                    <button
                      onClick={() => handleDelete(project)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Delete project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <h3
                    className="text-sm font-bold text-slate-900 leading-snug line-clamp-2"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {project.brief.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-3">{project.brief.context}</p>

                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-4">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(project.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Target className="w-3 h-3" />
                      {stats.completed}/{stats.total}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 mt-3">
                    <span className="flex items-center gap-1">
                      <Package className="w-3 h-3" />
                      {project.brief.deliverables.length} deliverables
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />
                      {project.chatHistory.length} messages
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-400">Milestone Progress</span>
                      <span className="font-semibold text-slate-600">{stats.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={clsx('h-full rounded-full', {
                          'bg-slate-300': stats.pct === 0,
                          'bg-indigo-400': stats.pct > 0 && stats.pct < 100,
                          'bg-emerald-400': stats.pct === 100,
                        })}
                        style={{ width: `${stats.pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4 pt-0 border-t border-slate-50 flex gap-2">
                  <button
                    onClick={() => navigate(`/project/${project.id}`)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors"
                  >
                    Open
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => navigate(`/project/${project.id}/mentor`)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Mentor
                  </button>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );
}
