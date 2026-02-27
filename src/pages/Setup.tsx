import { motion } from 'framer-motion';
import { Zap, BookOpen, ArrowRight, Check } from 'lucide-react';
import { useState } from 'react';
import { useUpdateStudent, useIsAppLoading } from '../store/hooks';
import { useNavigate } from 'react-router-dom';
import { useCourseStore } from '../store/courseStore';
import { getCanvasUser, getCanvasCourses } from '../services/canvasService';
import { useProjectStore } from '../store/projectStore';
import { COURSE_PROGRAMS } from '../data/coursePrograms';
import { toDateOnlyString } from '../utils/dateFormat';
import asuLogoFull from '../assets/branding/asu-logo-full.png';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.15 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

type SetupStep = 'welcome' | 'source' | 'manual' | 'complete';

interface SetupPageProps {
  onComplete?: () => void;
}

export default function Setup({ onComplete }: SetupPageProps) {
  const { addCourse } = useCourseStore.getState();
  const { createProject } = useProjectStore.getState();
  const updateStudent = useUpdateStudent();

  const getTemplateCourseId = (courseId: string, index: number) => {
    const digits = courseId.replace(/\D/g, '');
    if (digits) return Number(digits);
    return 5000 + index;
  };

  const handleAddTestData = async () => {
    // Basic profile seeded from catalog theme
    await updateStudent({ name: 'Alex Morgan', studentId: 'ENG-2026-0482' });

    // Reset existing local courses/projects so template data matches coursePrograms exactly
    await useCourseStore.getState().clearAllCourses();
    while (useProjectStore.getState().projects.length > 0) {
      await useProjectStore.getState().deleteProject(0);
    }

    // Seed courses from the static COURSE_PROGRAMS template
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
      // handleFinishSetup();
    }

    // Seed a single example project tied to the first catalog course
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

    completeSetupFlow();
  };

  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [setupData, setSetupData] = useState({
    name: '',
    studentId: '',
    course: '',
    email: '',
  });
  const navigate = useNavigate();
  const isLoading = useIsAppLoading();

  const completeSetupFlow = () => {
    localStorage.setItem('lms-setup-complete', 'true');
    if (onComplete) {
      onComplete();
    }
    navigate('/');
  };

  // Canvas API key for setup
  const [canvasApiKey, setCanvasApiKey] = useState('');
  const [canvasStatus, setCanvasStatus] = useState<string | null>(null);

  const handleCanvasLogin = async () => {
    setCanvasStatus('Connecting to Canvas...');
    try {
      localStorage.setItem('canvas_api_key', canvasApiKey);
      const user = await getCanvasUser(canvasApiKey);
      const courses = await getCanvasCourses(canvasApiKey);

      for (const course of courses) {
        await addCourse({
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

      setSetupData((prev) => ({
        ...prev,
        name: user.name,
        email: user.email,
        studentId: user.id.toString(),
      }));
      setCanvasStatus(
        `Connected as ${user.name} (${user.login || user.email || user.id}), ${courses.length} total courses found.`,
      );
      setCurrentStep('complete');
    } catch (err) {
      setCanvasStatus('Failed to connect. Check your API key and Canvas URL.');
    }
  };

  const handleManualSetup = () => {
    setCurrentStep('manual');
  };

  const handleFinishSetup = async () => {
    try {
      await updateStudent({ name: setupData.name, studentId: setupData.studentId });
    } catch (err) {
      console.error('Failed saving setup data', err);
    }

    completeSetupFlow();
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading setup...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700">
      <div className="absolute top-4 right-4 z-50">
        <button
          className="px-4 py-2 rounded bg-emerald-600 text-white font-semibold shadow hover:bg-emerald-700"
          onClick={handleAddTestData}
        >
          Copy Template Test Data
        </button>
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-white/10 rounded-full translate-y-1/2" />
      </div>

      <div className="relative min-h-screen flex items-center justify-center px-4">
        <motion.div variants={container} initial="hidden" animate="show" className="w-full max-w-md">
          {currentStep === 'welcome' && (
            <motion.div variants={item} className="text-center text-white space-y-8">
              <div>
                <div className="mb-5 flex justify-center">
                  <div className="bg-white rounded-xl px-4 py-2 shadow-lg">
                    <img src={asuLogoFull} alt="Arizona State University" className="h-6 w-auto object-contain" />
                  </div>
                </div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-lg"
                >
                  <Zap className="w-10 h-10" />
                </motion.div>
                <h1
                  className="text-4xl font-bold mb-4"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Welcome to ProjectForge Studio
                </h1>
                <p className="text-xl text-white/80">
                  Let's set up your learning profile to get started
                </p>
              </div>

              <motion.div variants={item} className="space-y-4">
                <div className="space-y-2">
                  <input
                    type="text"
                    value={canvasApiKey}
                    onChange={(e) => setCanvasApiKey(e.target.value)}
                    placeholder="Paste your Canvas API key here"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-900 placeholder:text-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-600 mb-2"
                  />
                  <button
                    onClick={handleCanvasLogin}
                    className="w-full py-4 px-6 rounded-xl bg-white text-indigo-600 font-semibold hover:bg-white/90 transition-all duration-200 shadow-2xl hover:shadow-3xl flex items-center justify-center gap-3"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                    </svg>
                    Connect Your Canvas Account
                  </button>
                  {canvasStatus && (
                    <div className="mt-2 text-xs text-white/80">{canvasStatus}</div>
                  )}
                </div>
                <div className="text-xs text-white/80 mt-2">
                  <strong>Note:</strong> Both your active and archived (completed) Canvas classes
                  will be imported and available in your dashboard.
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/30" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 text-white/80">
                      or
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleManualSetup}
                  className="w-full py-4 px-6 rounded-xl border-2 border-white text-white font-semibold hover:bg-white/10 transition-all duration-200"
                >
                  Manual Setup
                </button>
              </motion.div>

              <motion.div
                variants={item}
                className="flex gap-4 justify-center text-white/70 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Auto-sync courses
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  Instant setup
                </div>
              </motion.div>
            </motion.div>
          )}

          {currentStep === 'manual' && (
            <motion.div variants={item} className="bg-white rounded-2xl shadow-2xl p-8 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Setup Your Profile</h2>
                <p className="text-slate-600 mt-1">Enter your information</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="Alex Morgan"
                    value={setupData.name}
                    onChange={(e) =>
                      setSetupData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-900 mb-2">
                    Student ID
                  </label>
                  <input
                    type="text"
                    placeholder="ENG-2026-0482"
                    value={setupData.studentId}
                    onChange={(e) =>
                      setSetupData((prev) => ({ ...prev, studentId: e.target.value }))
                    }
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                  />
                </div>
              </div>
              <button
                onClick={handleFinishSetup}
                className="w-full py-3 px-6 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all duration-200"
              >
                Continue
              </button>
            </motion.div>
          )}

          {currentStep === 'complete' && (
            <motion.div
              variants={item}
              className="bg-white rounded-2xl shadow-2xl p-12 text-center space-y-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 }}
                className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto"
              >
                <Check className="w-10 h-10 text-emerald-600" />
              </motion.div>

              <div>
                <h2 className="text-2xl font-bold text-slate-900">All Set!</h2>
                <p className="text-slate-600 mt-2">
                  Your profile is ready. Let's start learning.
                </p>
              </div>

              <button
                onClick={handleFinishSetup}
                className="w-full py-3 px-6 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all duration-200 flex items-center justify-center gap-2"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

