import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Download,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useStudentStore } from '../store/studentStore';
import { generateICS, downloadICS, type ICSEvent } from '../utils/ics';

type MilestoneStatus = 'completed' | 'in-progress' | 'upcoming';

interface CalendarEntry {
  projectId: string;
  projectTitle: string;
  milestoneId: string;
  milestoneTitle: string;
  milestoneDescription: string;
  milestoneDeliverables: string[];
  dueDate: string; // YYYY-MM-DD
  milestoneStatus: MilestoneStatus;
  estimatedHours: number;
  isOverdue: boolean;
  courses: string[];
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const TODAY = toLocalDateString(new Date());

function buildCalendarDays(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];

  for (let i = 0; i < firstDay; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const value = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push(value);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function statusIcon(status: MilestoneStatus, isOverdue: boolean) {
  if (isOverdue) return <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />;
  if (status === 'completed') return <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5" />;
  if (status === 'in-progress') return <Clock className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />;
  return <Circle className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />;
}

function statusLabel(status: MilestoneStatus): string {
  if (status === 'in-progress') return 'In Progress';
  if (status === 'completed') return 'Completed';
  return 'Upcoming';
}

export default function DeliverableCalendar() {
  const student = useStudentStore((s) => s.student);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [pinnedDay, setPinnedDay] = useState<string | null>(null);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

  const entries = useMemo<CalendarEntry[]>(() => {
    const result: CalendarEntry[] = [];
    for (const project of student.projects) {
      for (const milestone of project.brief.milestones) {
        if (!milestone.dueDate) continue;
        const isOverdue = milestone.dueDate < TODAY && milestone.status !== 'completed';
        result.push({
          projectId: project.id,
          projectTitle: project.brief.title,
          milestoneId: milestone.id,
          milestoneTitle: milestone.title,
          milestoneDescription: milestone.description,
          milestoneDeliverables: milestone.deliverables,
          dueDate: milestone.dueDate,
          milestoneStatus: milestone.status,
          estimatedHours: milestone.estimatedHours,
          isOverdue,
          courses: project.selectedCourseIds,
        });
      }
    }
    return result;
  }, [student.projects]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.dueDate) ?? [];
      list.push(entry);
      map.set(entry.dueDate, list);
    }
    return map;
  }, [entries]);

  const calendarCells = useMemo(
    () => buildCalendarDays(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const activeDay = pinnedDay ?? hoveredDay;
  const activeEntries = activeDay ? entriesByDate.get(activeDay) ?? [] : [];

  const overdueCount = entries.filter((entry) => entry.isOverdue).length;
  const thisMonthCount = entries.filter((entry) => {
    const [year, month] = entry.dueDate.split('-').map(Number);
    return year === viewYear && month === viewMonth + 1;
  }).length;

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((v) => v - 1);
      setViewMonth(11);
    } else {
      setViewMonth((v) => v - 1);
    }
    setPinnedDay(null);
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((v) => v + 1);
      setViewMonth(0);
    } else {
      setViewMonth((v) => v + 1);
    }
    setPinnedDay(null);
  };

  const handleExport = () => {
    const events: ICSEvent[] = entries.map((entry) => {
      const description: string[] = [];
      if (entry.milestoneDescription) description.push(entry.milestoneDescription);
      if (entry.milestoneDeliverables.length > 0) {
        description.push(`Deliverables: ${entry.milestoneDeliverables.join('; ')}`);
      }
      description.push(`Estimated: ${entry.estimatedHours}h`);
      return {
        uid: `${entry.projectId}-${entry.milestoneId}`,
        summary: `${entry.milestoneTitle} - ${entry.projectTitle}`,
        description: description.join('\n'),
        dtstart: entry.dueDate,
      };
    });

    const ics = generateICS(events, 'LMS-AI Milestones');
    const month = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    downloadICS(ics, `milestones-${month}.ics`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Milestone Calendar
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Timeline view of project deliverable deadlines.</p>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
        >
          <Download className="w-4 h-4" />
          Export .ics
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium">
          <CalendarDays className="w-3.5 h-3.5" />
          {entries.length} milestone{entries.length === 1 ? '' : 's'} tracked
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium">
          <Clock className="w-3.5 h-3.5 text-amber-500" />
          {thisMonthCount} due this month
        </div>
        {overdueCount > 0 && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-700 text-xs font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            {overdueCount} overdue
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-semibold text-slate-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </h2>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-100">
          {DAY_NAMES.map((name) => (
            <div key={name} className="py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wide">
              {name}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarCells.map((date, idx) => {
            if (!date) {
              return <div key={`empty-${idx}`} className="min-h-[72px] bg-slate-50/40 border-b border-r border-slate-100/60" />;
            }

            const dayEntries = entriesByDate.get(date) ?? [];
            const count = dayEntries.length;
            const hasOverdue = dayEntries.some((entry) => entry.isOverdue);
            const isToday = date === TODAY;
            const isPinned = pinnedDay === date;
            const isHovered = hoveredDay === date;
            const isActive = isPinned || isHovered;

            return (
              <div
                key={date}
                onMouseEnter={() => setHoveredDay(date)}
                onMouseLeave={() => setHoveredDay(null)}
                onClick={() => setPinnedDay(isPinned ? null : date)}
                className={clsx(
                  'min-h-[72px] border-b border-r border-slate-100 p-1.5 relative transition-colors',
                  count > 0 ? 'cursor-pointer' : 'cursor-default',
                  isActive && count > 0 ? 'bg-indigo-50/60' : 'hover:bg-slate-50/70',
                )}
              >
                <div
                  className={clsx(
                    'w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-1',
                    isToday ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600',
                  )}
                >
                  {Number(date.split('-')[2])}
                </div>

                {hasOverdue && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-300" />}

                {count > 0 && (
                  <span
                    className={clsx(
                      'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                      hasOverdue ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700',
                    )}
                  >
                    {count}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeDay && activeEntries.length > 0 && (
          <motion.div
            key={activeDay}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.14 }}
            className={clsx(
              'bg-white rounded-2xl border shadow-md p-4',
              pinnedDay ? 'border-indigo-200 shadow-indigo-100/60' : 'border-slate-200',
            )}
          >
            <DayDetailContent
              date={activeDay}
              entries={activeEntries}
              pinned={Boolean(pinnedDay)}
              onClose={pinnedDay ? () => setPinnedDay(null) : null}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          Overdue item exists on that day
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 bg-indigo-100 text-indigo-700 font-semibold text-[10px]">3</span>
          Milestone count badge
        </div>
        <div className="text-slate-400 italic">Hover to preview and click to pin details.</div>
      </div>
    </div>
  );
}

interface DayDetailContentProps {
  date: string;
  entries: CalendarEntry[];
  pinned: boolean;
  onClose: (() => void) | null;
}

function DayDetailContent({ date, entries, pinned, onClose }: DayDetailContentProps) {
  const [y, m, d] = date.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{label}</p>
          <span
            className={clsx(
              'inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full',
              pinned ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500',
            )}
          >
            {pinned ? 'Pinned' : 'Hover preview'}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors text-xs"
            aria-label="Unpin"
          >
            x
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {entries.map((entry) => (
          <li
            key={`${entry.projectId}-${entry.milestoneId}`}
            className={clsx(
              'p-2 rounded-lg',
              entry.isOverdue
                ? 'bg-red-50'
                : entry.milestoneStatus === 'completed'
                  ? 'bg-emerald-50'
                  : 'bg-slate-50',
            )}
          >
            <div className="flex items-start gap-2">
              {statusIcon(entry.milestoneStatus, entry.isOverdue)}
              <div className="min-w-0 flex-1">
                <p className={clsx('text-xs font-semibold leading-tight truncate', entry.isOverdue ? 'text-red-700' : 'text-slate-800')}>
                  {entry.milestoneTitle}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{entry.projectTitle}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {statusLabel(entry.milestoneStatus)} | {entry.estimatedHours}h
                </p>
                {entry.courses.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {entry.courses.map((courseId) => (
                      <span
                        key={courseId}
                        className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-100 text-violet-700"
                      >
                        {courseId}
                      </span>
                    ))}
                  </div>
                )}
                <Link
                  to={`/project/${entry.projectId}`}
                  className="inline-block mt-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Open project
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
