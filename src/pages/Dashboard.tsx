import { motion } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Calendar, Clock, Target,
  Zap, Award, BookOpen, AlertCircle, FolderOpen, Rocket,
} from 'lucide-react';
import { useStudentStore } from '../store/studentStore';
import { usePreferencesStore } from '../store/preferencesStore';
import { COURSE_PROGRAMS } from '../data/coursePrograms';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { formatReadableDate, parseDateInput } from '../utils/dateFormat';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } } };

export default function Dashboard() {
  const student = useStudentStore((s) => s.student);
  const { notifications, reminderWindowDays, language, dateFormat } = usePreferencesStore((s) => ({
    notifications: s.notifications,
    reminderWindowDays: s.reminderWindowDays,
    language: s.language,
    dateFormat: s.dateFormat,
  }));
  const enrolledCourses = COURSE_PROGRAMS.filter((c) => student.enrolledCourseIds.includes(c.id));

  const allSkills = enrolledCourses.flatMap((c) => c.skills);
  const uniqueSkillNames = [...new Set(allSkills.map((s) => s.name))];
  const aggregatedSkills = uniqueSkillNames.map((name) => {
    const matches = allSkills.filter((s) => s.name === name);
    return { name, score: Math.round(matches.reduce((a, s) => a + s.score, 0) / matches.length), trend: matches[0].trend };
  }).sort((a, b) => b.score - a.score);

  const strongestSkill = aggregatedSkills[0];
  const weakestSkill = aggregatedSkills[aggregatedSkills.length - 1];

  const allCompleted = enrolledCourses.flatMap((c) => c.weekModules.filter((w) => w.status === 'completed'));
  const avgScore = allCompleted.length > 0
    ? Math.round(allCompleted.reduce((a, w) => a + (w.score ?? 0), 0) / allCompleted.length)
    : 0;

  const nextMilestone = student.projects
    .flatMap((p) => p.brief.milestones.map((m) => ({ ...m, projectTitle: p.brief.title, projectId: p.id })))
    .find((m) => m.status === 'in-progress' || m.status === 'upcoming');

  const dueSoonMilestones = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const max = today.getTime() + reminderWindowDays * 24 * 60 * 60 * 1000;

    return student.projects
      .flatMap((project) =>
        project.brief.milestones
          .filter((milestone) => milestone.status !== 'completed')
          .map((milestone) => ({
            ...milestone,
            projectTitle: project.brief.title,
            projectId: project.id,
          })),
      )
      .filter((milestone) => {
        const parsed = parseDateInput(milestone.dueDate);
        if (!parsed) return false;
        const due = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
        return due >= today.getTime() && due <= max;
      })
      .sort((a, b) => {
        const aTime = parseDateInput(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = parseDateInput(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
  }, [student.projects, reminderWindowDays]);

  useEffect(() => {
    if (!notifications || dueSoonMilestones.length === 0) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const todayKey = new Date().toISOString().slice(0, 10);
    const notifiedKey = `lms_due_notification_${todayKey}`;
    if (localStorage.getItem(notifiedKey)) return;

    const nearest = dueSoonMilestones[0];
    const dueLabel = formatReadableDate(nearest.dueDate, {
      locale: language,
      dateFormat,
      includeYear: dateFormat === 'long',
    });

    new Notification('Milestones Due Soon', {
      body: `${dueSoonMilestones.length} milestone(s) due in the next ${reminderWindowDays} day(s). Next: ${nearest.title} on ${dueLabel}.`,
    });
    localStorage.setItem(notifiedKey, '1');
  }, [notifications, dueSoonMilestones, reminderWindowDays, language, dateFormat]);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 p-6 sm:p-8 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-1/4 w-32 h-32 bg-white/5 rounded-full translate-y-1/2" />
        <div className="relative z-10">
          <p className="text-indigo-200 text-sm font-medium mb-1">Welcome back,</p>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {student.name} 👋
          </h1>
          <p className="text-indigo-100 text-sm sm:text-base max-w-xl leading-relaxed">
            You're enrolled in <strong>{enrolledCourses.length} courses</strong> with{' '}
            <strong>{student.projects.length} active project{student.projects.length !== 1 ? 's' : ''}</strong>.
            Week {student.currentWeek} — keep pushing forward!
          </p>
          <div className="flex flex-wrap gap-3 mt-5">
            <Link to="/project"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-indigo-700 text-sm font-semibold hover:bg-indigo-50 transition-colors shadow-lg shadow-black/10">
              <FolderOpen className="w-4 h-4" /> My Projects
            </Link>
            <Link to="/mentor"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/15 text-white text-sm font-medium hover:bg-white/25 transition-colors backdrop-blur-sm">
              <Zap className="w-4 h-4" /> AI Mentors
            </Link>
          </div>
        </div>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Overall Progress', value: `${student.overallProgress}%`, icon: Target, color: 'indigo', sub: `Week ${student.currentWeek} of 14` },
          { label: 'Average Score', value: `${avgScore}%`, icon: Award, color: 'amber', sub: `Across ${allCompleted.length} modules` },
          { label: 'Strongest Skill', value: strongestSkill?.name ?? 'N/A', icon: TrendingUp, color: 'emerald', sub: `${strongestSkill?.score ?? 0}%` },
          { label: 'Needs Growth', value: weakestSkill?.name ?? 'N/A', icon: AlertCircle, color: 'rose', sub: `${weakestSkill?.score ?? 0}%` },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center mb-3', {
              'bg-indigo-50 text-indigo-600': stat.color === 'indigo',
              'bg-amber-50 text-amber-600': stat.color === 'amber',
              'bg-emerald-50 text-emerald-600': stat.color === 'emerald',
              'bg-rose-50 text-rose-600': stat.color === 'rose',
            })}>
              <stat.icon className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-500 mb-1">{stat.label}</p>
            <p className="text-base sm:text-lg font-bold text-slate-900 truncate">{stat.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{stat.sub}</p>
          </div>
        ))}
      </motion.div>

      <div className="grid lg:grid-cols-5 gap-6">
        <motion.div variants={item} className="lg:col-span-3 bg-white rounded-2xl p-5 sm:p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Skill Proficiency</h3>
            <Link to="/course" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">View details →</Link>
          </div>
          <div className="space-y-3.5">
            {aggregatedSkills.slice(0, 8).map((skill, i) => (
              <div key={skill.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-slate-700 font-medium">{skill.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-slate-900">{skill.score}%</span>
                    {skill.trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
                    {skill.trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
                    {skill.trend === 'stable' && <Minus className="w-3.5 h-3.5 text-slate-400" />}
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${skill.score}%` }}
                    transition={{ duration: 1, delay: i * 0.08, ease: 'easeOut' }}
                    className={clsx('h-full rounded-full', {
                      'bg-gradient-to-r from-emerald-400 to-emerald-500': skill.score >= 80,
                      'bg-gradient-to-r from-indigo-400 to-indigo-500': skill.score >= 65 && skill.score < 80,
                      'bg-gradient-to-r from-amber-400 to-amber-500': skill.score >= 50 && skill.score < 65,
                      'bg-gradient-to-r from-rose-400 to-rose-500': skill.score < 50,
                    })} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={item} className="lg:col-span-2 space-y-4">
          {nextMilestone && (
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <h3 className="text-base font-semibold text-slate-900 mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Next Milestone</h3>
          <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{nextMilestone.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{nextMilestone.description}</p>
                    <p className="text-[10px] text-indigo-600 font-medium mt-1">Project: {nextMilestone.projectTitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Due: {formatReadableDate(nextMilestone.dueDate, {
                      locale: language,
                      dateFormat,
                      includeYear: dateFormat === 'long',
                    })}
                  </span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />~{nextMilestone.estimatedHours}h</span>
                </div>
                <Link to={`/project/${nextMilestone.projectId}`}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition-colors">
                  <BookOpen className="w-4 h-4" /> View Project
                </Link>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            {notifications && dueSoonMilestones.length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-semibold text-amber-800">
                  {dueSoonMilestones.length} milestone(s) due within {reminderWindowDays} day(s)
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Next: {dueSoonMilestones[0].title} (
                  {formatReadableDate(dueSoonMilestones[0].dueDate, {
                    locale: language,
                    dateFormat,
                    includeYear: dateFormat === 'long',
                  })}
                  )
                </p>
              </div>
            )}
            <h3 className="text-base font-semibold text-slate-900 mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Active Projects</h3>
            {student.projects.length === 0 ? (
              <div className="text-center py-4">
                <Rocket className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500 mb-3">No projects yet</p>
                <Link to="/project"
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  Create your first project →
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {student.projects.slice(0, 3).map((proj) => (
                  <Link key={proj.id} to={`/project/${proj.id}`}
                    className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0 hover:bg-slate-50 rounded-lg px-2 -mx-2 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
                      <Rocket className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 font-medium truncate">{proj.brief.title}</p>
                      <p className="text-xs text-slate-400">
                        {proj.brief.milestones.filter((m) => m.status === 'completed').length}/{proj.brief.milestones.length} milestones
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
