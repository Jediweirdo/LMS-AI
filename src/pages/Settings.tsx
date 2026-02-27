import { motion } from 'framer-motion';
import {
  Settings,
  Database,
  Bell,
  Volume2,
  Globe,
  CalendarDays,
  Clock3,
  Accessibility,
  Bot,
  KeyRound,
  Gauge,
} from 'lucide-react';
import { useState } from 'react';
import { getCanvasUser, getCanvasCourses } from '../services/canvasService';
import clsx from 'clsx';
import { useCourseStore } from '../store/courseStore';
import { useProjectStore } from '../store/projectStore';
import { useStudentCore } from '../store/studentCore';
import { COURSE_PROGRAMS } from '../data/coursePrograms';
import { useProfile, useIsAppLoading } from '../store/hooks';
import { usePreferencesStore } from '../store/preferencesStore';
import { toDateOnlyString } from '../utils/dateFormat';
import { GROQ_MODEL_SUGGESTIONS, useAIConfigStore } from '../store/aiConfigStore';
import type { GroqRateTelemetry } from '../store/aiConfigStore';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

function hasRateValues(telemetry: GroqRateTelemetry | null): boolean {
  return Boolean(
    telemetry &&
      (typeof telemetry.tpdLimit === 'number' ||
        typeof telemetry.tpdRemaining === 'number' ||
        typeof telemetry.retryAfterSeconds === 'number'),
  );
}

export default function SettingsPage() {
  const { addCourse } = useCourseStore.getState();
  const { createProject } = useProjectStore.getState();
  const { updateStudent } = useStudentCore.getState();

  const getTemplateCourseId = (courseId: string, index: number) => {
    const digits = courseId.replace(/\D/g, '');
    if (digits) return Number(digits);
    return 5000 + index;
  };

  const handleAddTestData = async () => {
    await updateStudent({ name: 'Alex Morgan', studentId: 'ENG-2026-0482' });

    await useCourseStore.getState().clearAllCourses();
    while (useProjectStore.getState().projects.length > 0) {
      await useProjectStore.getState().deleteProject(0);
    }

    for (const [index, course] of COURSE_PROGRAMS.entries()) {
      const completedWeeks = course.weekModules.filter((w) => w.status === 'completed').length;
      const overallProgress =
        course.totalWeeks > 0 ? Math.round((completedWeeks / course.totalWeeks) * 100) : 0;
      const currentWeek =
        course.weekModules.find((w) => w.status === 'current')?.week || completedWeeks + 1;
      const isActive = course.weekModules.some((w) => w.status === 'current');

      await addCourse({
        id: getTemplateCourseId(course.id, index),
        course: course.title,
        courseCode: course.code,
        semester: course.semester,
        currentWeek,
        totalWeeks: course.totalWeeks,
        overallProgress,
        isActive,
        skills: course.skills.map((s) => ({
          name: s.name,
          score: s.score,
          trend: s.trend,
          source: [],
        })),
        assignmentModules: course.weekModules.map((w, i) => ({
          id: i + 1,
          title: w.title,
          topics: w.topics,
          status:
            w.status === 'completed'
              ? 'completed'
              : w.status === 'current'
              ? 'ungraded'
              : 'missing',
          score: w.score,
          completedAt: w.completedAt,
        })),
      });
    }

    const primary = COURSE_PROGRAMS[0];
    if (primary) {
      const projectId = `proj-${Date.now()}-template`;
      await createProject({
        id: projectId,
        createdAt: new Date().toISOString(),
        selectedCourseIds: [primary.id],
        title: `${primary.title} Capstone`,
        context: `An integrative capstone project based on ${primary.code} - ${primary.title}.`,
        problemStatement:
          'Design and implement a realistic engineering project that demonstrates mastery of the course learning outcomes.',
        totalEstimatedHours: 60,
        chatHistory: [],
        goals: [
          'Synthesize core concepts from the course into a cohesive project',
          'Practice realistic engineering workflows and documentation',
        ],
        constraints: [
          'Limited time within the semester',
          'Use only tools and platforms approved for the course',
        ],
        technicalRequirements: [
          'Apply at least three major concepts from the course modules',
          'Produce a working prototype and supporting documentation',
        ],
        deliverables: [
          'Technical design document',
          'Working prototype or simulation',
          'Final presentation or report',
        ],
        milestones: [
          {
            id: 'm1',
            title: 'Project Definition',
            description:
              'Clarify the problem, context, constraints, and success criteria for the capstone.',
            dueDate: toDateOnlyString(),
            status: 'in-progress',
            estimatedHours: 8,
            deliverables: ['Problem definition', 'Initial requirements list'],
            difficulty: 2,
          },
        ],
        difficulty: 3,
      });
    }

    alert('Template test data added from the course catalog.');
  };

  const student = useProfile();
  const courses = useCourseStore((s) => s.courses);
  const activeCount = courses.filter((c) => c.isActive).length;
  const archivedCount = courses.filter((c) => !c.isActive).length;
  const isLoading = useIsAppLoading();

  const preferences = usePreferencesStore((s) => ({
    notifications: s.notifications,
    soundEnabled: s.soundEnabled,
    language: s.language,
    dateFormat: s.dateFormat,
    reminderWindowDays: s.reminderWindowDays,
    reduceMotion: s.reduceMotion,
  }));
  const setPreferences = usePreferencesStore((s) => s.setPreferences);
  const resetPreferences = usePreferencesStore((s) => s.resetPreferences);
  const {
    selectedModel,
    fallbackModel,
    autoFallbackToCompletions,
    userGroqApiKey,
    activeModel,
    rateTelemetryByModel,
    setSelectedModel,
    setFallbackModel,
    setAutoFallbackToCompletions,
    setUserGroqApiKey,
  } = useAIConfigStore((s) => ({
    selectedModel: s.selectedModel,
    fallbackModel: s.fallbackModel,
    autoFallbackToCompletions: s.autoFallbackToCompletions,
    userGroqApiKey: s.userGroqApiKey,
    activeModel: s.activeModel,
    rateTelemetryByModel: s.rateTelemetryByModel,
    setSelectedModel: s.setSelectedModel,
    setFallbackModel: s.setFallbackModel,
    setAutoFallbackToCompletions: s.setAutoFallbackToCompletions,
    setUserGroqApiKey: s.setUserGroqApiKey,
  }));
  const selectedTelemetry = rateTelemetryByModel[selectedModel] ?? null;
  const activeTelemetry = rateTelemetryByModel[activeModel] ?? null;
  const displayTelemetry = hasRateValues(selectedTelemetry)
    ? selectedTelemetry
    : hasRateValues(activeTelemetry)
    ? activeTelemetry
    : selectedTelemetry ?? activeTelemetry;
  const telemetryModel =
    hasRateValues(selectedTelemetry) || !activeTelemetry ? selectedModel : activeModel;

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showGroqApiKey, setShowGroqApiKey] = useState(false);

  const handleClearLocalData = () => {
    if (
      window.confirm('Are you sure? This will delete all local data. This action cannot be undone.')
    ) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert('Browser notifications are not supported in this browser.');
      return;
    }
    const permission = await Notification.requestPermission();
    alert(`Notification permission: ${permission}`);
  };

  const [canvasApiKey, setCanvasApiKey] = useState(
    () => student?.canvasApiKey || localStorage.getItem('canvas_api_key') || '',
  );
  const [canvasStatus, setCanvasStatus] = useState<string | null>(null);

  const handleCanvasApiConnect = async () => {
    setCanvasStatus('Connecting...');
    try {
      localStorage.setItem('canvas_api_key', canvasApiKey);
      await updateStudent({ canvasApiKey });
      const user = await getCanvasUser(canvasApiKey);
      const fetchedCourses = await getCanvasCourses(canvasApiKey);

      await useCourseStore.getState().clearAllCourses();
      await useCourseStore.getState().initialize();
      const { addCourse: addCanvasCourse } = useCourseStore.getState();

      for (const course of fetchedCourses) {
        if (!course.id || useCourseStore.getState().courses.some((c) => c.id === course.id)) {
          continue;
        }
        await addCanvasCourse({
          course: course.name,
          courseCode: course.course_code,
          semester: '',
          currentWeek: 1,
          totalWeeks: 8,
          overallProgress: 0,
          skills: [],
          assignmentModules: [],
          isActive: course.status === 'active',
          id: course.id,
        });
      }

      const login = user.login || user.email || user.id;
      setCanvasStatus(
        `Connected as ${user.name} (${login}), ${fetchedCourses.length} total courses found.`,
      );
    } catch {
      setCanvasStatus('Failed to connect. Check your API key and Canvas URL.');
    }
  };

  if (isLoading || !student) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your settings...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 max-w-2xl">
      <div className="absolute top-4 right-4 z-50">
        <button
          className="px-4 py-2 rounded bg-emerald-600 text-white font-semibold shadow hover:bg-emerald-700"
          onClick={handleAddTestData}
        >
          Copy Template Test Data
        </button>
      </div>

      <motion.div variants={item}>
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-8 h-8 text-indigo-600" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
            <p className="text-slate-600 mt-1">Manage your preferences and account</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={item}
        className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Bot className="w-5 h-5 text-indigo-600" />
          AI Provider (Groq)
        </h2>

        <div className="py-4 border-b border-slate-100">
          <label className="block text-sm font-medium text-slate-900 mb-2">
            Model ID
          </label>
          <input
            list="groq-model-options"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            placeholder="e.g. llama-3.3-70b-versatile"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
          <datalist id="groq-model-options">
            {GROQ_MODEL_SUGGESTIONS.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
          <p className="text-xs text-slate-500 mt-1">
            Active model in runtime: <span className="font-mono">{activeModel}</span>
          </p>
        </div>

        <div className="py-4 border-b border-slate-100">
          <label className="block text-sm font-medium text-slate-900 mb-2">
            Groq API Key (Optional override)
          </label>
          <div className="flex gap-2">
            <input
              type={showGroqApiKey ? 'text' : 'password'}
              value={userGroqApiKey}
              onChange={(e) => setUserGroqApiKey(e.target.value)}
              placeholder="Leave blank to use VITE_GROQ_API_KEY from .env"
              className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
            <button
              onClick={() => setShowGroqApiKey((prev) => !prev)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              title={showGroqApiKey ? 'Hide key' : 'Show key'}
            >
              <KeyRound className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {userGroqApiKey.trim().length > 0
              ? 'Using custom key from Settings.'
              : 'Using fallback key from .env (VITE_GROQ_API_KEY).'}
          </p>
        </div>

        <div className="py-4 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900">Auto fallback on TPD exhaustion</p>
              <p className="text-sm text-slate-600">
                If selected model hits daily quota, retry on a fallback completions model.
              </p>
            </div>
            <button
              onClick={() =>
                setAutoFallbackToCompletions(!autoFallbackToCompletions)
              }
              className={clsx(
                'relative inline-flex h-8 w-14 items-center rounded-full transition-colors',
                autoFallbackToCompletions ? 'bg-indigo-600' : 'bg-slate-300',
              )}
            >
              <span
                className={clsx(
                  'inline-block h-6 w-6 transform rounded-full bg-white transition-transform',
                  autoFallbackToCompletions ? 'translate-x-7' : 'translate-x-1',
                )}
              />
            </button>
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Fallback model
            </label>
            <input
              list="groq-model-options"
              value={fallbackModel}
              onChange={(e) => setFallbackModel(e.target.value)}
              placeholder="e.g. llama-3.1-8b-instant"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-600"
            />
          </div>
        </div>

        <div className="py-2">
          <p className="font-medium text-slate-900 flex items-center gap-2 mb-3">
            <Gauge className="w-4 h-4" />
            Selected model quota telemetry
          </p>
          <p className="text-xs text-slate-500 mb-3">
            Showing telemetry for <span className="font-mono">{telemetryModel}</span>
            {selectedTelemetry ? '' : ' (active model fallback)'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">TPD limit</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                {displayTelemetry?.tpdLimit ?? '-'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">TPD remaining</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                {displayTelemetry?.tpdRemaining ?? '-'}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Retry-After (s)</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                {displayTelemetry?.retryAfterSeconds ?? '-'}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Last updated: {displayTelemetry?.updatedAt ? new Date(displayTelemetry.updatedAt).toLocaleString() : 'No telemetry yet'}
          </p>
          {displayTelemetry?.updatedAt && !hasRateValues(displayTelemetry) && (
            <p className="text-xs text-slate-500 mt-1">
              No rate-limit numbers were returned for this request. Values appear after Groq sends
              rate headers.
            </p>
          )}
        </div>
      </motion.div>

      <motion.div
        variants={item}
        className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Bell className="w-5 h-5 text-indigo-600" />
          Preferences
        </h2>

        <div className="flex items-center justify-between py-4 border-b border-slate-100">
          <div>
            <p className="font-medium text-slate-900 flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Due-date notifications
            </p>
            <p className="text-sm text-slate-600">
              Show due-soon reminders and optionally trigger browser notifications.
            </p>
          </div>
          <button
            onClick={() => setPreferences({ notifications: !preferences.notifications })}
            className={clsx(
              'relative inline-flex h-8 w-14 items-center rounded-full transition-colors',
              preferences.notifications ? 'bg-indigo-600' : 'bg-slate-300',
            )}
          >
            <span
              className={clsx(
                'inline-block h-6 w-6 transform rounded-full bg-white transition-transform',
                preferences.notifications ? 'translate-x-7' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        <div className="flex items-center justify-between py-4 border-b border-slate-100">
          <div>
            <p className="font-medium text-slate-900 flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              Sound effects
            </p>
            <p className="text-sm text-slate-600">Play a short sound on generation success/failure.</p>
          </div>
          <button
            onClick={() => setPreferences({ soundEnabled: !preferences.soundEnabled })}
            className={clsx(
              'relative inline-flex h-8 w-14 items-center rounded-full transition-colors',
              preferences.soundEnabled ? 'bg-indigo-600' : 'bg-slate-300',
            )}
          >
            <span
              className={clsx(
                'inline-block h-6 w-6 transform rounded-full bg-white transition-transform',
                preferences.soundEnabled ? 'translate-x-7' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        <div className="flex items-center justify-between py-4 border-b border-slate-100">
          <div>
            <p className="font-medium text-slate-900 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Language
            </p>
            <p className="text-sm text-slate-600">Used for date labels and localized formatting.</p>
          </div>
          <select
            value={preferences.language}
            onChange={(e) =>
              setPreferences({
                language: e.target.value as 'en-US' | 'es-ES' | 'fr-FR',
              })
            }
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <option value="en-US">English (US)</option>
            <option value="es-ES">Espanol</option>
            <option value="fr-FR">Francais</option>
          </select>
        </div>

        <div className="flex items-center justify-between py-4 border-b border-slate-100">
          <div>
            <p className="font-medium text-slate-900 flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Due-date format
            </p>
            <p className="text-sm text-slate-600">Switch between concise and long date labels.</p>
          </div>
          <select
            value={preferences.dateFormat}
            onChange={(e) =>
              setPreferences({
                dateFormat: e.target.value as 'short' | 'long',
              })
            }
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <option value="short">Short (Jan 12)</option>
            <option value="long">Long (January 12, 2026)</option>
          </select>
        </div>

        <div className="flex items-center justify-between py-4 border-b border-slate-100">
          <div>
            <p className="font-medium text-slate-900 flex items-center gap-2">
              <Clock3 className="w-4 h-4" />
              Reminder window
            </p>
            <p className="text-sm text-slate-600">Flag milestones due within this many days.</p>
          </div>
          <select
            value={preferences.reminderWindowDays}
            onChange={(e) =>
              setPreferences({
                reminderWindowDays: Number(e.target.value),
              })
            }
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-600"
          >
            <option value={3}>3 days</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={21}>21 days</option>
          </select>
        </div>

        <div className="flex items-center justify-between py-4">
          <div>
            <p className="font-medium text-slate-900 flex items-center gap-2">
              <Accessibility className="w-4 h-4" />
              Reduce motion
            </p>
            <p className="text-sm text-slate-600">Minimize animation intensity across the UI.</p>
          </div>
          <button
            onClick={() => setPreferences({ reduceMotion: !preferences.reduceMotion })}
            className={clsx(
              'relative inline-flex h-8 w-14 items-center rounded-full transition-colors',
              preferences.reduceMotion ? 'bg-indigo-600' : 'bg-slate-300',
            )}
          >
            <span
              className={clsx(
                'inline-block h-6 w-6 transform rounded-full bg-white transition-transform',
                preferences.reduceMotion ? 'translate-x-7' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={handleNotificationPermission}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Enable browser notifications
          </button>
          <button
            onClick={resetPreferences}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Reset preferences
          </button>
        </div>
      </motion.div>

      <motion.div
        variants={item}
        className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-600" />
          Account & Data
        </h2>

        <div className="py-4 border-b border-slate-100">
          <p className="text-sm text-slate-600">Student Name</p>
          <input
            type="text"
            value={student.name}
            onChange={(e) => updateStudent({ name: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-600 mb-2"
          />
          <p className="text-sm text-slate-600 mt-2">Student ID</p>
          <p className="font-medium text-slate-900 mt-1">{student.studentId}</p>
        </div>

        <div className="py-4 border-b border-slate-100">
          <p className="text-sm text-slate-600">Canvas Courses</p>
          <div className="flex gap-4 mt-1">
            <span className="font-medium text-slate-900">Active: {activeCount}</span>
            <span className="font-medium text-slate-900">Archived: {archivedCount}</span>
          </div>
        </div>

        <div className="py-4 border-b border-slate-100">
          <p className="text-sm text-slate-600 mb-2">Canvas Personal API Key</p>
          <input
            type="text"
            value={canvasApiKey}
            onChange={(e) => setCanvasApiKey(e.target.value)}
            placeholder="Paste your Canvas API key here"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-600 mb-2"
          />
          <button
            onClick={handleCanvasApiConnect}
            className="w-full py-3 px-4 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors"
          >
            Connect with API Key
          </button>
          {canvasStatus && <div className="mt-2 text-sm text-slate-600">{canvasStatus}</div>}
        </div>

        <button
          onClick={() => setShowClearConfirm(true)}
          className="w-full py-3 px-4 rounded-lg bg-red-50 text-red-600 font-medium hover:bg-red-100 transition-colors"
        >
          Clear Local Data
        </button>
      </motion.div>

      {showClearConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowClearConfirm(false)}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="bg-white rounded-2xl p-6 max-w-sm mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Clear All Data?</h3>
            <p className="text-slate-600 mb-6">
              This will delete all local data including your progress, notes, and chat history. This
              action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-900 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearLocalData}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
