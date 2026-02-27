import { motion } from 'framer-motion';
import { useParams, Link, Navigate } from 'react-router-dom';
import {
  Rocket, FileText, CheckCircle2, Circle, Clock, AlertTriangle,
  ChevronDown, ChevronUp, Target, Wrench, Package, Calendar, MessageCircle, ArrowLeft,
} from 'lucide-react';
import { useStudentStore } from '../store/studentStore';
import { usePreferencesStore } from '../store/preferencesStore';
import { COURSE_PROGRAMS } from '../data/coursePrograms';
import clsx from 'clsx';
import { useState } from 'react';
import { formatReadableDate } from '../utils/dateFormat';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const student = useStudentStore((s) => s.student);
  const { language, dateFormat } = usePreferencesStore((s) => ({
    language: s.language,
    dateFormat: s.dateFormat,
  }));
  const project = student.projects.find((p) => p.id === projectId);

  const [expandedMilestone, setExpandedMilestone] = useState<string | null>(
    project?.brief.milestones.find((m) => m.status === 'in-progress')?.id ?? null
  );
  const [activeTab, setActiveTab] = useState<'brief' | 'requirements' | 'milestones'>('brief');

  if (!project) return <Navigate to="/project" replace />;

  const brief = project.brief;
  const courses = project.selectedCourseIds
    .map((id) => COURSE_PROGRAMS.find((c) => c.id === id))
    .filter(Boolean);
  const completedMs = brief.milestones.filter((m) => m.status === 'completed').length;
  const totalHoursCompleted = brief.milestones.filter((m) => m.status === 'completed').reduce((a, m) => a + m.estimatedHours, 0);

  const tabs = [
    { id: 'brief' as const, label: 'Project Brief', icon: FileText },
    { id: 'requirements' as const, label: 'Requirements', icon: Wrench },
    { id: 'milestones' as const, label: 'Milestones', icon: Target },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Back nav */}
      <motion.div variants={item} className="flex items-center gap-4">
        <Link to="/project" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> All Projects
        </Link>
      </motion.div>

      {/* Header */}
      <motion.div variants={item}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-6 sm:p-8 text-white">
        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full -translate-y-1/4 translate-x-1/4" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Rocket className="w-5 h-5 text-indigo-400" />
            {courses.map((c) => c && (
              <span key={c.id} className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-indigo-200 border border-white/10">
                {c.code}
              </span>
            ))}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {brief.title}
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl leading-relaxed">{brief.context}</p>
          <div className="flex flex-wrap gap-4 mt-5">
            <span className="flex items-center gap-2 text-sm"><Target className="w-4 h-4 text-indigo-400" /><span className="text-slate-300">{completedMs}/{brief.milestones.length} Milestones</span></span>
            <span className="flex items-center gap-2 text-sm"><Clock className="w-4 h-4 text-amber-400" /><span className="text-slate-300">~{brief.totalEstimatedHours}h Total</span></span>
            <span className="flex items-center gap-2 text-sm"><Package className="w-4 h-4 text-emerald-400" /><span className="text-slate-300">{brief.deliverables.length} Deliverables</span></span>
          </div>
          <Link to={`/project/${project.id}/mentor`}
            className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-all border border-white/10">
            <MessageCircle className="w-4 h-4" /> Open Project Mentor
          </Link>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={item} className="flex gap-1 p-1 bg-slate-100 rounded-xl">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={clsx('flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </motion.div>

      {/* Brief Tab */}
      {activeTab === 'brief' && (
        <motion.div variants={item} className="space-y-4">
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-semibold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Problem Statement</h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{brief.problemStatement}</p>
          </div>
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-100 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900 mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Project Goals</h3>
            <div className="space-y-3">
              {brief.goals.map((goal, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">{i + 1}</div>
                  <p className="text-sm text-slate-700 leading-relaxed">{goal}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-100 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900 mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Constraints</h3>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {brief.constraints.map((c, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50/50 border border-rose-100">
                  <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-slate-700">{c}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-100 shadow-sm">
            <h3 className="text-base font-semibold text-slate-900 mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Final Deliverables</h3>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {brief.deliverables.map((d, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <Package className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                  <p className="text-sm text-slate-700 font-medium">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Requirements Tab */}
      {activeTab === 'requirements' && (
        <motion.div variants={item} className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-100 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900 mb-5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Technical Requirements</h3>
          <div className="space-y-3">
            {brief.technicalRequirements.map((req, i) => (
              <div key={i} className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0 text-xs font-bold">{i + 1}</div>
                <p className="text-sm text-slate-700 leading-relaxed pt-0.5">{req}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Milestones Tab */}
      {activeTab === 'milestones' && (
        <motion.div variants={item} className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Project Timeline</h3>
            <span className="flex items-center gap-2 text-xs text-slate-500"><Clock className="w-3.5 h-3.5" />{totalHoursCompleted}h / {brief.totalEstimatedHours}h</span>
          </div>
          <div className="flex items-center gap-1 mb-6">
            {brief.milestones.map((ms, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className={clsx('w-full h-2 rounded-full', {
                  'bg-emerald-400': ms.status === 'completed',
                  'bg-indigo-400 animate-pulse': ms.status === 'in-progress',
                  'bg-slate-200': ms.status === 'upcoming',
                })} />
                <span className="text-[10px] text-slate-400 hidden sm:block">MS{i + 1}</span>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {brief.milestones.map((ms) => {
              const isExp = expandedMilestone === ms.id;
              return (
                <div key={ms.id} className={clsx('rounded-xl border transition-all', {
                  'border-emerald-200 bg-emerald-50/30': ms.status === 'completed',
                  'border-indigo-200 bg-indigo-50/30 shadow-sm': ms.status === 'in-progress',
                  'border-slate-200 bg-slate-50/30': ms.status === 'upcoming',
                })}>
                  <button onClick={() => setExpandedMilestone(isExp ? null : ms.id)} className="w-full flex items-center gap-4 p-4 text-left">
                    <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', {
                      'bg-emerald-100 text-emerald-600': ms.status === 'completed',
                      'bg-indigo-100 text-indigo-600': ms.status === 'in-progress',
                      'bg-slate-100 text-slate-400': ms.status === 'upcoming',
                    })}>
                      {ms.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> :
                        ms.status === 'in-progress' ? <div className="relative"><Circle className="w-5 h-5" /><div className="absolute inset-0 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" /></div></div> :
                          <Circle className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{ms.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatReadableDate(ms.dueDate, {
                            locale: language,
                            dateFormat,
                            includeYear: dateFormat === 'long',
                          })}
                        </span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />~{ms.estimatedHours}h</span>
                      </div>
                    </div>
                    <div className={clsx('px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide', {
                      'bg-emerald-100 text-emerald-700': ms.status === 'completed',
                      'bg-indigo-100 text-indigo-700': ms.status === 'in-progress',
                      'bg-slate-100 text-slate-500': ms.status === 'upcoming',
                    })}>{ms.status === 'in-progress' ? 'Active' : ms.status}</div>
                    {isExp ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>
                  {isExp && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} transition={{ duration: 0.3 }} className="px-4 pb-4 overflow-hidden">
                      <div className="ml-14 space-y-3 pt-1">
                        <p className="text-sm text-slate-600 leading-relaxed">{ms.description}</p>
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Deliverables</p>
                          {ms.deliverables.map((d, i) => (
                            <div key={i} className="flex items-center gap-2 text-sm text-slate-700 mb-1.5">
                              <div className={clsx('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0', ms.status === 'completed' ? 'border-emerald-300 bg-emerald-100' : 'border-slate-300')}>
                                {ms.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                              </div>
                              {d}
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
