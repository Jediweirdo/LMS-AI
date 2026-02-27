import { motion } from 'framer-motion';
import { useCallback, useMemo, useState, type ElementType } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Brain,
  Loader2,
  CheckCircle2,
  Plus,
  Clock,
  Target,
  Package,
  MessageCircle,
  Trash2,
  AlertCircle,
  Cpu,
  Activity,
  Bot,
  Eye,
  EyeOff,
} from 'lucide-react';
import clsx from 'clsx';
import { useStudentStore } from '../store/studentStore';
import { usePreferencesStore } from '../store/preferencesStore';
import { useCourseStore } from '../store/courseStore';
import { useProfile } from '../store/hooks';
import { COURSE_PROGRAMS } from '../data/coursePrograms';
import {
  generateProjectCandidates,
  getAIErrorMessage,
  type GeneratedProjectCandidate,
  type ProjectFocusMode,
} from '../services/aiService';
import {
  buildCanvasGenerationContext,
  getCanvasCourses,
  organizeCanvasCourses,
  type CanvasCourse,
} from '../services/canvasService';

const ICON_MAP: Record<string, ElementType> = { Cpu, Activity, Microchip: Cpu, Bot };
const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
const COLOR_MAP: Record<string, { bg: string; text: string; border: string; light: string }> = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', light: 'bg-indigo-100' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', light: 'bg-emerald-100' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', light: 'bg-amber-100' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', light: 'bg-rose-100' },
};

function playUiChime(success: boolean): void {
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  const gain = ctx.createGain();
  gain.gain.value = 0.02;
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  const sequence = success ? [523.25, 659.25, 783.99] : [392.0, 329.63, 261.63];
  sequence.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * 0.08);
    osc.connect(gain);
    osc.start(now + idx * 0.08);
    osc.stop(now + idx * 0.08 + 0.07);
  });

  setTimeout(() => {
    void ctx.close();
  }, 450);
}

export default function ProjectHub() {
  const student = useStudentStore((s) => s.student);
  const soundEnabled = usePreferencesStore((s) => s.soundEnabled);
  const addProject = useStudentStore((s) => s.addProject);
  const deleteProject = useStudentStore((s) => s.deleteProject);
  const isGenerating = useStudentStore((s) => s.isGeneratingProject);
  const setIsGenerating = useStudentStore((s) => s.setIsGeneratingProject);
  const storedCourses = useCourseStore((s) => s.courses);
  const profile = useProfile();

  const [showCreator, setShowCreator] = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<string[]>([]);
  const [projectCount, setProjectCount] = useState(3);
  const [focusMode, setFocusMode] = useState<ProjectFocusMode>('balanced');
  const [customPrompt, setCustomPrompt] = useState('');
  const [difficultyMin, setDifficultyMin] = useState(2);
  const [difficultyMax, setDifficultyMax] = useState(4);
  const [durationMin, setDurationMin] = useState(4);
  const [durationMax, setDurationMax] = useState(10);
  const [includeCanvasContext, setIncludeCanvasContext] = useState(false);

  const [genStage, setGenStage] = useState('');
  const [genError, setGenError] = useState<string | null>(null);
  const [canvasStatus, setCanvasStatus] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeneratedProjectCandidate[]>([]);
  const [savedCandidateIds, setSavedCandidateIds] = useState<string[]>([]);
  const [showRejected, setShowRejected] = useState(false);

  const enrolledCourses = COURSE_PROGRAMS.filter((c) => student.enrolledCourseIds.includes(c.id));
  const rejectedCount = candidates.filter((c) => c.hidden).length;
  const visibleCandidates = useMemo(
    () => candidates.filter((c) => !c.hidden || showRejected),
    [candidates, showRejected],
  );

  const toggleCourse = (id: string) => {
    setSelectedCourses((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const resolveCanvasCourseIds = useCallback(
    (canvasCourses: CanvasCourse[]): number[] => {
      const ids = selectedCourses
        .map((id) => {
          const program = COURSE_PROGRAMS.find((c) => c.id === id);
          if (!program) return null;

          const local = storedCourses.find(
            (c) =>
              (c.courseCode || '').toLowerCase() === program.code.toLowerCase() ||
              (c.course || '').toLowerCase() === program.title.toLowerCase(),
          );
          if (local?.id && local.id > 0) return local.id;

          const remote = canvasCourses.find(
            (c) =>
              (c.course_code || '').toLowerCase() === program.code.toLowerCase() ||
              (c.name || '').toLowerCase() === program.title.toLowerCase(),
          );
          return remote?.id ?? null;
        })
        .filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
      return [...new Set(ids)];
    },
    [selectedCourses, storedCourses],
  );

  const handleGenerate = useCallback(async () => {
    if (selectedCourses.length === 0) return;
    setGenError(null);
    setCanvasStatus(null);
    setCandidates([]);
    setSavedCandidateIds([]);
    setIsGenerating(true);

    const stages = includeCanvasContext
      ? [
          'Fetching Canvas courses...',
          'Organizing active/completed courses...',
          'Collecting assignment and feedback signals...',
          'Generating candidate projects...',
          'Validating and revising candidates...',
          'Ranking final results...',
        ]
      : ['Generating candidate projects...', 'Validating and revising candidates...', 'Ranking final results...'];
    let idx = 0;
    setGenStage(stages[0]);
    const interval = setInterval(() => {
      idx += 1;
      if (idx < stages.length) setGenStage(stages[idx]);
    }, 1500);

    try {
      const difficultyRange: [number, number] =
        difficultyMin <= difficultyMax ? [difficultyMin, difficultyMax] : [difficultyMax, difficultyMin];
      const durationRangeWeeks: [number, number] =
        durationMin <= durationMax ? [durationMin, durationMax] : [durationMax, durationMin];

      let canvasContext = null;
      if (includeCanvasContext) {
        const token = profile?.canvasApiKey || localStorage.getItem('canvas_api_key') || '';
        if (!token) {
          setCanvasStatus('Canvas context skipped: no Canvas API key found.');
        } else {
          const canvasCourses = await getCanvasCourses(token);
          const organized = organizeCanvasCourses(canvasCourses);
          const ids = resolveCanvasCourseIds(canvasCourses);
          if (ids.length > 0) {
            canvasContext = await buildCanvasGenerationContext(token, ids);
            setCanvasStatus(
              `Canvas context loaded from ${ids.length} course(s). ${organized.active.length} active / ${organized.completed.length} completed available.`,
            );
          } else {
            setCanvasStatus(
              `Canvas connected (${organized.active.length} active / ${organized.completed.length} completed), but selected courses did not map to Canvas IDs.`,
            );
          }
        }
      }

      const result = await generateProjectCandidates(student, {
        selectedCourseIds: selectedCourses,
        projectCount,
        focusMode,
        customPrompt,
        difficultyRange,
        durationRangeWeeks,
        includeCanvasContext,
        canvasContext,
      });

      if (!result.length) {
        setGenError('No candidates were produced. Try relaxing your constraints.');
        if (soundEnabled) playUiChime(false);
      } else {
        setCandidates(result);
        if (soundEnabled) playUiChime(true);
      }
    } catch (err) {
      console.error(err);
      setGenError(getAIErrorMessage(err, 'Failed to generate project candidates.'));
      if (soundEnabled) playUiChime(false);
    } finally {
      clearInterval(interval);
      setIsGenerating(false);
      setGenStage('');
    }
  }, [
    selectedCourses,
    includeCanvasContext,
    difficultyMin,
    difficultyMax,
    durationMin,
    durationMax,
    projectCount,
    focusMode,
    customPrompt,
    student,
    profile,
    soundEnabled,
    resolveCanvasCourseIds,
    setIsGenerating,
  ]);

  const saveCandidate = (candidate: GeneratedProjectCandidate) => {
    addProject(candidate.courseIds, candidate.brief);
    setSavedCandidateIds((prev) => [...prev, candidate.id]);
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            My Projects
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {student.projects.length} project{student.projects.length !== 1 ? 's' : ''} saved.
          </p>
        </div>
        {!showCreator && (
          <button
            onClick={() => setShowCreator(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" /> New Project
          </button>
        )}
      </motion.div>

      {showCreator && (
        <motion.div variants={item} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-indigo-900 px-6 py-5 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-5 h-5 text-indigo-300" />
              <span className="text-indigo-200 text-xs font-semibold uppercase tracking-wider">Project Generator</span>
            </div>
            <h2 className="text-lg font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Generate From Saved Courses
            </h2>
            <p className="text-indigo-200 text-sm mt-1">
              Choose ordered courses, set constraints, generate candidates, then save what you want.
            </p>
          </div>

          <div className="p-6 space-y-5">
            <div className="grid sm:grid-cols-2 gap-3">
              {enrolledCourses.map((course) => {
                const selectedIndex = selectedCourses.indexOf(course.id);
                const selected = selectedIndex >= 0;
                const cm = COLOR_MAP[course.color] || COLOR_MAP.indigo;
                const IconComp = ICON_MAP[course.icon] || Cpu;
                return (
                  <button
                    key={course.id}
                    onClick={() => !isGenerating && toggleCourse(course.id)}
                    disabled={isGenerating}
                    className={clsx(
                      'text-left p-4 rounded-xl border-2 transition-all',
                      selected ? `${cm.border} ${cm.bg}` : 'border-slate-200 hover:border-slate-300 bg-white',
                      isGenerating && 'opacity-60 cursor-not-allowed',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', selected ? cm.light : 'bg-slate-100')}>
                        <IconComp className={clsx('w-5 h-5', selected ? cm.text : 'text-slate-400')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-400">{course.code}</p>
                          {selected && <span className="text-xs font-semibold text-slate-600">#{selectedIndex + 1}</span>}
                        </div>
                        <p className="text-sm font-semibold text-slate-900 mt-0.5">{course.title}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <label className="block text-xs font-medium text-slate-600">Candidate count</label>
                <select value={projectCount} onChange={(e) => setProjectCount(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                  <option value={5}>5</option>
                </select>

                <label className="block text-xs font-medium text-slate-600">Focus mode</label>
                <select value={focusMode} onChange={(e) => setFocusMode(e.target.value as ProjectFocusMode)} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm">
                  <option value="balanced">Balanced</option>
                  <option value="shortcomings">Practice</option>
                  <option value="strengths">Refinement</option>
                </select>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Difficulty min</label>
                    <input type="number" min={1} max={5} value={difficultyMin} onChange={(e) => setDifficultyMin(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Difficulty max</label>
                    <input type="number" min={1} max={5} value={difficultyMax} onChange={(e) => setDifficultyMax(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Duration min (weeks)</label>
                    <input type="number" min={2} max={20} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Duration max (weeks)</label>
                    <input type="number" min={2} max={20} value={durationMax} onChange={(e) => setDurationMax(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <label className="block text-xs font-medium text-slate-600">Custom prompt</label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm resize-none"
                  placeholder="Tell the AI what kind of projects you want."
                />
                <button
                  onClick={() => setIncludeCanvasContext((prev) => !prev)}
                  className={clsx(
                    'w-full text-sm px-3 py-2 rounded-lg border',
                    includeCanvasContext ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-300 text-slate-700',
                  )}
                >
                  {includeCanvasContext ? 'Canvas context enabled' : 'Use Canvas context'}
                </button>
                {canvasStatus && <p className="text-xs text-indigo-700">{canvasStatus}</p>}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-indigo-50 border border-indigo-100">
              <p className="text-xs text-indigo-700">
                Ordered courses: {selectedCourses.map((id, i) => `${i + 1}. ${COURSE_PROGRAMS.find((c) => c.id === id)?.code}`).join(' -> ') || 'none'}
              </p>
              <button
                onClick={handleGenerate}
                disabled={isGenerating || selectedCourses.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-60"
              >
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isGenerating ? 'Generating...' : 'Generate Candidates'}
              </button>
            </div>

            {isGenerating && genStage && <p className="text-sm text-indigo-600 font-medium">{genStage}</p>}
            {genError && (
              <div className="flex items-center gap-2 text-rose-600 text-sm bg-rose-50 px-4 py-2.5 rounded-xl border border-rose-200">
                <AlertCircle className="w-4 h-4 flex-shrink-0" /> {genError}
              </div>
            )}
            {!isGenerating && (
              <button onClick={() => setShowCreator(false)} className="text-sm text-slate-500 hover:text-slate-700 font-medium">
                Close
              </button>
            )}
          </div>
        </motion.div>
      )}

      {candidates.length > 0 && (
        <motion.div variants={item} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Generated Projects</h3>
            {rejectedCount > 0 && (
              <button onClick={() => setShowRejected((prev) => !prev)} className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600">
                {showRejected ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showRejected ? 'Hide rejected' : `Show rejected (${rejectedCount})`}
              </button>
            )}
          </div>

          {visibleCandidates.map((candidate, i) => {
            const saved = savedCandidateIds.includes(candidate.id);
            return (
              <div key={candidate.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-slate-500">Option #{i + 1}</p>
                    <h4 className="text-lg font-semibold text-slate-900">{candidate.brief.title}</h4>
                    <p className="text-sm text-slate-500">{candidate.brief.context}</p>
                  </div>
                  <div className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full', candidate.validation.verdict === 'approved' ? 'bg-emerald-100 text-emerald-700' : candidate.validation.verdict === 'revised' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700')}>
                    {candidate.validation.verdict.toUpperCase()} ({candidate.validation.score})
                  </div>
                </div>
                {candidate.validation.issues.length > 0 && (
                  <p className="text-xs text-slate-600 mt-2">
                    Issues: {candidate.validation.issues.slice(0, 2).join(' | ')}
                  </p>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => saveCandidate(candidate)}
                    disabled={saved}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium',
                      saved ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100',
                    )}
                  >
                    {saved ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {saved ? 'Saved to Library' : 'Save to Library'}
                  </button>
                  <button onClick={() => setCustomPrompt(candidate.brief.problemStatement)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-100">
                    <Brain className="w-4 h-4" /> Re-Prompt from this
                  </button>
                </div>
              </div>
            );
          })}
        </motion.div>
      )}

      {student.projects.length === 0 && !showCreator && (
        <motion.div variants={item} className="text-center py-16">
          <h3 className="text-lg font-semibold text-slate-900">Saved Projects</h3>
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              No projects yet
            </h3>
            <button onClick={() => setShowCreator(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20">
              <Plus className="w-4 h-4" /> Create Your First Project
            </button>
        </motion.div>
      )}

      {student.projects.length > 0 && (
        <div className="space-y-4">
          {student.projects.map((proj) => {
            const completedMs = proj.brief.milestones.filter((m) => m.status === 'completed').length;
            return (
              <motion.div key={proj.id} variants={item} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <Link to={`/project/${proj.id}`} className="group">
                        <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          {proj.brief.title}
                        </h3>
                      </Link>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">{proj.brief.context}</p>
                    </div>
                    <button onClick={() => deleteProject(proj.id)} className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all" title="Delete project">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Target className="w-3.5 h-3.5" /> {completedMs}/{proj.brief.milestones.length} milestones</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> ~{proj.brief.totalEstimatedHours}h</span>
                    <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" /> {proj.brief.deliverables.length} deliverables</span>
                    <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> {proj.chatHistory.length} messages</span>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Link to={`/project/${proj.id}`} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors">
                      <Target className="w-4 h-4" /> View Brief
                    </Link>
                    <Link to={`/project/${proj.id}/mentor`} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-medium hover:bg-indigo-100 transition-colors">
                      <MessageCircle className="w-4 h-4" /> Open Mentor
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
