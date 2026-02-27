import type {
  StudentProfile,
  StudentProject,
  ProjectBrief,
  Milestone,
  CourseProgram,
} from '../types/student';
import type { CanvasGenerationContext } from './canvasService';
import { getCoursesByIds } from '../data/coursePrograms';
import {
  getAIConfigSnapshot,
  setGroqActiveModel,
  updateGroqRateTelemetry,
} from '../store/aiConfigStore';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_MAX_RETRIES = 4;
const GROQ_BASE_BACKOFF_MS = 1200;

interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ProjectFocusMode = 'shortcomings' | 'strengths' | 'balanced';

export interface ProjectGenerationRequest {
  selectedCourseIds: string[];
  projectCount: number;
  focusMode: ProjectFocusMode;
  customPrompt?: string;
  difficultyRange: [number, number];
  durationRangeWeeks: [number, number];
  includeCanvasContext: boolean;
  canvasContext?: CanvasGenerationContext | null;
}

export interface ProjectCandidateValidation {
  score: number;
  verdict: 'approved' | 'revised' | 'rejected';
  issues: string[];
  summary: string;
}

export interface GeneratedProjectCandidate {
  id: string;
  courseIds: string[];
  brief: ProjectBrief;
  validation: ProjectCandidateValidation;
  hidden: boolean;
}

export class AIRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message?: string) {
    super(message ?? `Rate limit reached. Please wait ${retryAfterSeconds} seconds before retrying.`);
    this.name = 'AIRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const DEFAULT_VALIDATION: ProjectCandidateValidation = {
  score: 55,
  verdict: 'revised',
  issues: ['Validator response unavailable; used fallback scoring.'],
  summary: 'Fallback validation applied.',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(header: string | null): number {
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const dateMs = Date.parse(header);
  if (!Number.isFinite(dateMs)) return 0;
  const delta = dateMs - Date.now();
  return delta > 0 ? delta : 0;
}

function parseHeaderNumber(headers: Headers, headerNames: string[]): number | null {
  for (const name of headerNames) {
    const raw = headers.get(name);
    if (!raw) continue;
    const normalised = raw.trim();
    const parsed = Number(normalised);
    if (Number.isFinite(parsed)) return parsed;
    if (!/^-?\d/.test(normalised)) continue;
    const numericToken = normalised.match(/-?\d+(?:\.\d+)?/);
    if (!numericToken) continue;
    const tokenParsed = Number(numericToken[0]);
    if (Number.isFinite(tokenParsed)) return tokenParsed;
  }
  return null;
}

function parseRateResetMs(headers: Headers): number {
  const seconds = parseHeaderNumber(headers, [
    'x-ratelimit-reset',
    'x-ratelimit-reset-requests',
    'x-ratelimit-reset-tokens',
    'x-ratelimit-reset-day',
    'x-ratelimit-reset-tpd',
    'x-ratelimit-reset-tokens-day',
    'x-ratelimit-reset-requests-day',
    'x-ratelimit-reset-requests-per-day',
  ]);
  if (typeof seconds === 'number' && seconds > 0) {
    return Math.ceil(seconds * 1000);
  }
  const resetDate = headers.get('x-ratelimit-reset-date');
  if (!resetDate) return 0;
  const parsedDate = Date.parse(resetDate);
  if (!Number.isFinite(parsedDate)) return 0;
  const delta = parsedDate - Date.now();
  return delta > 0 ? delta : 0;
}

function extractGroqTpdTelemetry(headers: Headers): {
  tpdLimit: number | null;
  tpdRemaining: number | null;
} {
  // Groq header variants differ by model/endpoint; prefer explicit token/day headers first.
  const tpdLimit = parseHeaderNumber(headers, [
    'x-ratelimit-limit-tpd',
    'x-ratelimit-limit-tokens-day',
    'x-ratelimit-limit-day',
    'x-ratelimit-limit-tokens',
    'x-ratelimit-limit-requests-day',
    'x-ratelimit-limit-requests-per-day',
    'x-ratelimit-limit-requests',
  ]);
  const tpdRemaining = parseHeaderNumber(headers, [
    'x-ratelimit-remaining-tpd',
    'x-ratelimit-remaining-tokens-day',
    'x-ratelimit-remaining-day',
    'x-ratelimit-remaining-tokens',
    'x-ratelimit-remaining-requests-day',
    'x-ratelimit-remaining-requests-per-day',
    'x-ratelimit-remaining-requests',
  ]);
  return { tpdLimit, tpdRemaining };
}

function isDailyQuotaExceeded(body: string, tpdRemaining: number | null): boolean {
  if (typeof tpdRemaining === 'number' && tpdRemaining <= 0) return true;
  return /tpd|daily token|tokens per day|quota exceeded|limit.*day/i.test(body);
}

function telemetryHasSignals(telemetry: {
  tpdLimit: number | null;
  tpdRemaining: number | null;
}): boolean {
  return typeof telemetry.tpdLimit === 'number' || typeof telemetry.tpdRemaining === 'number';
}

async function callGroq(messages: GroqMessage[], temperature = 0.7, maxTokens = 2048): Promise<string> {
  const config = getAIConfigSnapshot();
  const apiKey = (config.userGroqApiKey || GROQ_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('No Groq API key set. Add one in Settings or via VITE_GROQ_API_KEY.');
  }
  let modelInUse = config.selectedModel || DEFAULT_GROQ_MODEL;
  const fallbackModel = config.fallbackModel || DEFAULT_GROQ_MODEL;
  let canAutoFallback =
    config.autoFallbackToCompletions &&
    fallbackModel.trim().length > 0 &&
    fallbackModel !== modelInUse;
  setGroqActiveModel(modelInUse);

  let lastError = '';
  let lastRateLimitWaitMs = 0;
  for (let attempt = 0; attempt <= GROQ_MAX_RETRIES; attempt += 1) {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelInUse,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    });
    const headerRetryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
    const resetRetryAfterMs = parseRateResetMs(res.headers);
    const retryAfterMs = Math.max(headerRetryAfterMs, resetRetryAfterMs);
    const tpdTelemetry = extractGroqTpdTelemetry(res.headers);
    const telemetryPatch: {
      tpdLimit?: number;
      tpdRemaining?: number;
      retryAfterSeconds: number | null;
      updatedAt: string;
    } = {
      retryAfterSeconds: retryAfterMs > 0 ? Math.ceil(retryAfterMs / 1000) : null,
      updatedAt: new Date().toISOString(),
    };
    if (typeof tpdTelemetry.tpdLimit === 'number') {
      telemetryPatch.tpdLimit = tpdTelemetry.tpdLimit;
    }
    if (typeof tpdTelemetry.tpdRemaining === 'number') {
      telemetryPatch.tpdRemaining = tpdTelemetry.tpdRemaining;
    }
    updateGroqRateTelemetry(modelInUse, telemetryPatch);
    if (!telemetryHasSignals(tpdTelemetry) && modelInUse !== config.selectedModel) {
      // Keep selected-model card alive when fallback path is active and headers are sparse.
      updateGroqRateTelemetry(config.selectedModel, {
        retryAfterSeconds: retryAfterMs > 0 ? Math.ceil(retryAfterMs / 1000) : null,
        updatedAt: new Date().toISOString(),
      });
    }

    if (res.ok) {
      setGroqActiveModel(modelInUse);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? '';
    }

    const body = await res.text();
    lastError = `Groq API ${res.status}: ${body}`;
    const jitter = Math.floor(Math.random() * 300);
    const fallbackBackoff = GROQ_BASE_BACKOFF_MS * 2 ** attempt + jitter;
    const waitMs = Math.max(retryAfterMs, fallbackBackoff);
    if (res.status === 429) {
      lastRateLimitWaitMs = Math.max(lastRateLimitWaitMs, waitMs);
    }
    if (
      res.status === 429 &&
      canAutoFallback &&
      isDailyQuotaExceeded(body, tpdTelemetry.tpdRemaining)
    ) {
      modelInUse = fallbackModel;
      canAutoFallback = false;
      setGroqActiveModel(modelInUse);
      continue;
    }

    const retryable = res.status === 429 || (res.status >= 500 && res.status <= 599);
    if (!retryable || attempt === GROQ_MAX_RETRIES) {
      console.error('Groq API error:', res.status, body);
      if (res.status === 429) {
        const retrySeconds = Math.max(1, Math.ceil((lastRateLimitWaitMs || waitMs) / 1000));
        throw new AIRateLimitError(
          retrySeconds,
          `Groq rate limit reached. Please wait about ${retrySeconds} seconds and try again.`,
        );
      }
      throw new Error(lastError);
    }

    await sleep(waitMs);
  }

  throw new Error(lastError || 'Groq API failed');
}

export function getAIErrorMessage(
  error: unknown,
  fallback = 'AI request failed. Please try again.',
): string {
  if (error instanceof AIRateLimitError) {
    return `Rate limit reached. Please wait about ${error.retryAfterSeconds} second${error.retryAfterSeconds === 1 ? '' : 's'} before trying again.`;
  }
  if (error instanceof Error && /429|rate limit|too many requests/i.test(error.message)) {
    return 'Rate limit reached. Please wait a short time and try again.';
  }
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }
  return fallback;
}

function clamp(num: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num));
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return trimmed;
}

function tryParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function extractBalancedJsonCandidate(
  source: string,
  startIndex: number,
): { value: string; endIndex: number } | null {
  const opener = source[startIndex];
  const closer = opener === '{' ? '}' : opener === '[' ? ']' : '';
  if (!closer) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < source.length; i += 1) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === opener) {
      depth += 1;
      continue;
    }

    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return {
          value: source.slice(startIndex, i + 1),
          endIndex: i,
        };
      }
    }
  }

  return null;
}

function parseJsonLoose<T>(raw: string): T {
  const cleaned = extractJsonBlock(raw).trim();
  const direct = tryParseJson<T>(cleaned);
  if (direct !== null) return direct;

  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    if (char !== '{' && char !== '[') continue;

    const candidate = extractBalancedJsonCandidate(cleaned, i);
    if (!candidate) continue;

    const parsed = tryParseJson<T>(candidate.value);
    if (parsed !== null) {
      return parsed;
    }

    i = candidate.endIndex;
  }

  throw new Error('Could not parse JSON response from model');
}

function serialiseCourses(courses: CourseProgram[]): string {
  return courses
    .map((c) => {
      const completed = c.weekModules.filter((w) => w.status === 'completed');
      const current = c.weekModules.find((w) => w.status === 'current');
      return `
COURSE: ${c.code} - ${c.title}
  Description: ${c.description}
  Completed modules (${completed.length}/${c.totalWeeks}):
${completed
  .map(
    (w) =>
      `    Week ${w.week}: ${w.title} (Score: ${w.score ?? 'N/A'}%) - Topics: ${w.topics.join(', ')}`,
  )
  .join('\n')}
  Current module: Week ${current?.week ?? '?'}: ${current?.title ?? 'N/A'} - Topics: ${
        current?.topics.join(', ') ?? 'N/A'
      }
  Skills:
${c.skills.map((s) => `    ${s.name}: ${s.score}/100 (${s.trend})`).join('\n')}`;
    })
    .join('\n\n');
}

function serialiseProject(project: StudentProject, courses: CourseProgram[]): string {
  const courseNames = courses.map((c) => `${c.code} (${c.title})`).join(' + ');
  const b = project.brief;
  return `
PROJECT: "${b.title}"
  ID: ${project.id}
  Created: ${project.createdAt}
  Courses combined: ${courseNames}
  Problem Statement: ${b.problemStatement}
  Goals: ${b.goals.map((g, i) => `\n    ${i + 1}. ${g}`).join('')}
  Technical Requirements: ${b.technicalRequirements.map((r, i) => `\n    ${i + 1}. ${r}`).join('')}
  Constraints: ${b.constraints.join('; ')}
  Deliverables: ${b.deliverables.join('; ')}
  Milestones:
${b.milestones
  .map((m) => `    - ${m.title} (${m.status}) due ${m.dueDate}, ~${m.estimatedHours}h`)
  .join('\n')}
  Total estimated hours: ${b.totalEstimatedHours}`;
}

function serialiseCanvasContext(context: CanvasGenerationContext | null | undefined): string {
  if (!context || context.courses.length === 0) return 'No Canvas context available.';

  return `
Canvas Context (student-work only):
Fetched at: ${context.fetchedAt}
${context.courses
  .map(
    (course) => `Course ID ${course.courseId}
  Graded assignments: ${course.gradedCount}
  Average score: ${course.averageScore ?? 'N/A'}
  Assignment signals:
${course.assignmentSignals
  .map(
    (signal) => `    - ${signal.name} | due ${signal.dueAt ?? 'N/A'} | score ${
      signal.score ?? 'N/A'
    } | rubric criteria ${signal.rubricCriteriaCount} | workflow ${signal.workflowState}
      feedback snippets: ${signal.feedbackSnippets.join(' || ') || 'none'}`,
  )
  .join('\n')}`,
  )
  .join('\n')}`;
}

function computeSkillPriority(courses: CourseProgram[], focusMode: ProjectFocusMode): string {
  const weighted = courses.flatMap((course, index) =>
    course.skills.map((skill) => {
      const priorityWeight = courses.length - index;
      const focusBias =
        focusMode === 'strengths'
          ? skill.score
          : focusMode === 'shortcomings'
          ? 100 - skill.score
          : 60 - Math.abs(skill.score - 60);
      return {
        name: skill.name,
        source: course.code,
        score: skill.score,
        weight: focusBias * priorityWeight,
      };
    }),
  );

  return weighted
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12)
    .map((entry) => `${entry.name} (${entry.source}, score ${entry.score})`)
    .join(', ');
}

function normaliseBrief(
  parsed: Record<string, unknown>,
  index: number,
  difficultyRange: [number, number],
  durationRangeWeeks: [number, number],
): ProjectBrief {
  const rawMilestones = Array.isArray(parsed.milestones) ? parsed.milestones : [];
  const today = startOfLocalDay();
  const maxDueOffsetDays = Math.max(7, durationRangeWeeks[1] * 7);
  const defaultSpacingDays = Math.max(
    3,
    Math.round(maxDueOffsetDays / Math.max(rawMilestones.length, 1)),
  );
  let previousOffset = 0;

  const milestones: Milestone[] = rawMilestones.map((m, i) => {
    const entry = (m ?? {}) as Record<string, unknown>;
    const difficulty = clamp(
      Number(entry.difficulty) || Math.round((difficultyRange[0] + difficultyRange[1]) / 2),
      difficultyRange[0],
      difficultyRange[1],
    );

    const parsedDue = parseDateOnly(entry.dueDate);
    const rawOffsetDays = parsedDue
      ? Math.floor((startOfLocalDay(parsedDue).getTime() - today.getTime()) / DAY_MS)
      : Number.NaN;

    let dueOffsetDays = Number.isFinite(rawOffsetDays)
      ? Number(rawOffsetDays)
      : (i + 1) * defaultSpacingDays;

    if (dueOffsetDays < 1) {
      dueOffsetDays = (i + 1) * defaultSpacingDays;
    }

    dueOffsetDays = clamp(Math.round(dueOffsetDays), 1, maxDueOffsetDays);
    if (dueOffsetDays <= previousOffset) {
      const minStep = Math.max(2, Math.floor(defaultSpacingDays / 2));
      dueOffsetDays = Math.min(maxDueOffsetDays, previousOffset + minStep);
      if (dueOffsetDays <= previousOffset) dueOffsetDays = previousOffset + 1;
    }
    previousOffset = dueOffsetDays;

    return {
      id: String(entry.id ?? `ms-${i + 1}`),
      title: String(entry.title ?? `Milestone ${i + 1}`),
      description: String(entry.description ?? ''),
      dueDate: formatDateOnly(addDays(today, dueOffsetDays)),
      status: i === 0 ? 'in-progress' : 'upcoming',
      estimatedHours: clamp(Number(entry.estimatedHours) || 8, 2, 80),
      deliverables: Array.isArray(entry.deliverables)
        ? entry.deliverables.map((d) => String(d))
        : [],
      difficulty,
      durationDays: clamp(Number(entry.durationDays) || 7, 2, 42),
      rationale: String(entry.rationale ?? ''),
      learningResources: Array.isArray(entry.learningResources)
        ? entry.learningResources.map((r) => String(r))
        : [],
      skillCoverage: Array.isArray(entry.skillCoverage)
        ? entry.skillCoverage.map((s) => String(s))
        : [],
    };
  });

  const totalEstimatedHours =
    Number(parsed.totalEstimatedHours) ||
    milestones.reduce((sum, milestone) => sum + (milestone.estimatedHours || 0), 0) ||
    40;

  return {
    title: String(parsed.title ?? `AI Project Option ${index + 1}`),
    context: String(parsed.context ?? ''),
    problemStatement: String(parsed.problemStatement ?? ''),
    goals: Array.isArray(parsed.goals) ? parsed.goals.map((g) => String(g)) : [],
    constraints: Array.isArray(parsed.constraints) ? parsed.constraints.map((c) => String(c)) : [],
    technicalRequirements: Array.isArray(parsed.technicalRequirements)
      ? parsed.technicalRequirements.map((r) => String(r))
      : [],
    deliverables: Array.isArray(parsed.deliverables)
      ? parsed.deliverables.map((d) => String(d))
      : [],
    milestones,
    totalEstimatedHours,
  };
}

function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text: string): Set<string> {
  const tokens = normaliseText(text)
    .split(' ')
    .filter((t) => t.length > 2);
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function briefVector(brief: ProjectBrief): Set<string> {
  const signature = [
    brief.title,
    brief.problemStatement,
    ...brief.goals.slice(0, 3),
    ...brief.deliverables.slice(0, 4),
    ...brief.milestones.slice(0, 3).map((m) => m.title),
  ].join(' ');
  return tokenSet(signature);
}

function briefSimilarity(a: ProjectBrief, b: ProjectBrief): number {
  return jaccard(briefVector(a), briefVector(b));
}

function verdictOrder(v: ProjectCandidateValidation['verdict']): number {
  return v === 'approved' ? 0 : v === 'revised' ? 1 : 2;
}

function applyDiversityPenalty(
  candidates: Array<{
    brief: ProjectBrief;
    validation: ProjectCandidateValidation;
  }>,
): ProjectCandidateValidation[] {
  const adjusted: ProjectCandidateValidation[] = candidates.map((c) => ({ ...c.validation }));
  const picked: number[] = [];
  const sortedIndexes = candidates
    .map((_, i) => i)
    .sort((a, b) => adjusted[b].score - adjusted[a].score);

  for (const idx of sortedIndexes) {
    let maxSim = 0;
    for (const chosen of picked) {
      const sim = briefSimilarity(candidates[idx].brief, candidates[chosen].brief);
      if (sim > maxSim) maxSim = sim;
    }

    if (maxSim > 0.55) {
      const penalty = Math.round((maxSim - 0.55) * 120);
      adjusted[idx] = {
        ...adjusted[idx],
        score: clamp(adjusted[idx].score - penalty, 0, 100),
        issues: [...adjusted[idx].issues, `Too similar to another candidate (${Math.round(maxSim * 100)}%).`],
        summary: adjusted[idx].summary || 'Similarity penalty applied.',
        verdict:
          maxSim > 0.72
            ? 'rejected'
            : adjusted[idx].verdict === 'approved'
            ? 'revised'
            : adjusted[idx].verdict,
      };
    }

    if (adjusted[idx].verdict !== 'rejected') {
      picked.push(idx);
    }
  }

  return adjusted;
}

function collectAvoidBriefs(existing: ProjectBrief[]): string {
  if (existing.length === 0) return 'None.';
  return existing
    .slice(0, 5)
    .map((b, i) => `${i + 1}) ${b.title} :: ${b.problemStatement.slice(0, 180)}`)
    .join('\n');
}

async function generateBriefBatchCandidates(
  student: StudentProfile,
  courses: CourseProgram[],
  request: ProjectGenerationRequest,
  batchSize: number,
  avoidBriefs: ProjectBrief[],
): Promise<ProjectBrief[]> {
  const prioritySkills = computeSkillPriority(courses, request.focusMode);
  const courseData = serialiseCourses(courses);
  const canvasData =
    request.includeCanvasContext && request.canvasContext
      ? serialiseCanvasContext(request.canvasContext)
      : 'Canvas context disabled.';

  const [difficultyMin, difficultyMax] = request.difficultyRange;
  const [durationMinWeeks, durationMaxWeeks] = request.durationRangeWeeks;
  const todayDate = formatDateOnly(startOfLocalDay());
  const latestDueDate = formatDateOnly(addDays(startOfLocalDay(), durationMaxWeeks * 7 + 7));

  const systemPrompt = `You design project-based learning plans for engineering students.
Return only valid JSON.

Generate EXACTLY ${batchSize} DISTINCT project briefs as a JSON array.

Strict diversity rules:
1) Each candidate must have a meaningfully different title and industry context.
2) Each candidate must use a different primary project artifact (e.g. embedded prototype, analysis pipeline, control simulator, dashboard, etc).
3) Milestone sequencing and deliverables should differ across candidates.
4) Avoid near-duplicates of "problem statement + deliverables".
5) If two candidates look similar, rewrite one before outputting.

Quality rules:
1) Integrate all selected courses in exact user-selected priority order.
2) Prioritize earlier selected courses when conflicts occur, but include skills from all.
3) Respect focus mode ${request.focusMode}.
4) Respect difficulty range ${difficultyMin}-${difficultyMax} and duration range ${durationMinWeeks}-${durationMaxWeeks} weeks.
5) Use only student-centric context (course progress + student submissions/feedback signals). Do not rely on assignment instructions or teacher resources.
6) Include milestone rationale and skill coverage.
7) Every milestone dueDate must be between ${todayDate} and ${latestDueDate} (inclusive).
8) Milestone due dates must be chronological (non-decreasing by milestone order).

Each array item schema:
{
  "title": "string",
  "context": "string",
  "problemStatement": "string",
  "goals": ["string"],
  "constraints": ["string"],
  "technicalRequirements": ["string"],
  "deliverables": ["string"],
  "milestones": [
    {
      "id": "ms-1",
      "title": "string",
      "description": "string",
      "dueDate": "YYYY-MM-DD",
      "estimatedHours": number,
      "deliverables": ["string"],
      "difficulty": number,
      "durationDays": number,
      "rationale": "string",
      "learningResources": ["string"],
      "skillCoverage": ["string"]
    }
  ],
  "totalEstimatedHours": number
}`;

  const userPrompt = `Student: ${student.name} (${student.studentId}), GPA ${student.gpa}
Requested project count: ${request.projectCount}
Custom prompt: ${request.customPrompt?.trim() || 'none'}
Today date: ${todayDate}

Skill priorities:
${prioritySkills}

Courses (ordered by priority):
${courseData}

Canvas student-work context:
${canvasData}

Avoid similarity with these existing candidates:
${collectAvoidBriefs(avoidBriefs)}

Output the JSON array only.`;

  const raw = await callGroq(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    0.95,
    4200,
  );

  const parsed = parseJsonLoose<unknown>(raw);
  const arrayPayload = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { candidates?: unknown[] }).candidates)
    ? (parsed as { candidates: unknown[] }).candidates
    : [];

  return arrayPayload
    .filter((item) => item && typeof item === 'object')
    .map((item, index) =>
      normaliseBrief(
        item as Record<string, unknown>,
        index,
        request.difficultyRange,
        request.durationRangeWeeks,
      ),
    );
}

async function validateCandidatesBatch(
  request: ProjectGenerationRequest,
  courses: CourseProgram[],
  briefs: ProjectBrief[],
): Promise<ProjectCandidateValidation[]> {
  if (briefs.length === 0) return [];

  const systemPrompt = `You validate generated project briefs.
Return ONLY a JSON array of validation objects in the same order as input.

Validation object schema:
{
  "score": number,
  "verdict": "approved" | "revised" | "rejected",
  "issues": ["string"],
  "summary": "string"
}

Validation rules:
1) Must cover all selected courses.
2) Earlier selected courses should have stronger priority.
3) Difficulty must stay within ${request.difficultyRange[0]}-${request.difficultyRange[1]}.
4) Timeline must stay within ${request.durationRangeWeeks[0]}-${request.durationRangeWeeks[1]} weeks.
5) Must include milestone rationale and skill coverage.
6) Reject only if clearly poor/off-topic.
7) Mark revised if partially good but needs adjustment.
8) Penalize near-duplicates among candidates.`;

  const userPrompt = `Course order:
${courses.map((c, i) => `${i + 1}. ${c.code} - ${c.title}`).join('\n')}

Candidates:
${JSON.stringify(briefs)}`;

  try {
    const raw = await callGroq(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      0.2,
      2200,
    );

    const parsed = parseJsonLoose<unknown>(raw);
    const arrayPayload = Array.isArray(parsed) ? parsed : [];
    const mapped = arrayPayload.map((entry) => {
      const obj = (entry || {}) as {
        score?: number;
        verdict?: 'approved' | 'revised' | 'rejected';
        issues?: string[];
        summary?: string;
      };
      return {
        score: clamp(Number(obj.score) || DEFAULT_VALIDATION.score, 0, 100),
        verdict:
          obj.verdict === 'approved' || obj.verdict === 'revised' || obj.verdict === 'rejected'
            ? obj.verdict
            : DEFAULT_VALIDATION.verdict,
        issues: Array.isArray(obj.issues) ? obj.issues.map((i) => String(i)) : DEFAULT_VALIDATION.issues,
        summary: String(obj.summary || DEFAULT_VALIDATION.summary),
      } as ProjectCandidateValidation;
    });

    return briefs.map((_, i) => mapped[i] || DEFAULT_VALIDATION);
  } catch {
    return briefs.map(() => ({ ...DEFAULT_VALIDATION }));
  }
}

function dedupeByTitleAndProblem(briefs: ProjectBrief[]): ProjectBrief[] {
  const seen = new Set<string>();
  const unique: ProjectBrief[] = [];
  for (const brief of briefs) {
    const key = `${normaliseText(brief.title)}::${normaliseText(brief.problemStatement).slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(brief);
  }
  return unique;
}

// Project-scoped mentor
export async function getMentorResponse(
  student: StudentProfile,
  project: StudentProject,
  userMessage: string,
): Promise<string> {
  const courses = getCoursesByIds(project.selectedCourseIds);
  const courseData = serialiseCourses(courses);
  const projectData = serialiseProject(project, courses);

  const systemPrompt = `You are the dedicated AI mentor for project "${project.brief.title}".
You are strictly scoped to this project and its source courses.

Rules:
1) Discuss only this project and these source courses.
2) Do not invent facts.
3) Be Socratic. Do not provide full code solutions.
4) Reference exact course weeks/topics when guiding.
5) Keep responses concise, 1-3 paragraphs.

STUDENT: ${student.name} (${student.studentId}), GPA ${student.gpa}

SOURCE COURSES:
${courseData}

PROJECT:
${projectData}`;

  const recent = project.chatHistory.slice(-20);
  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    ...recent.map((m) => ({
      role: (m.role === 'student' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userMessage },
  ];

  return callGroq(messages, 0.7, 1024);
}

export async function generateProjectCandidates(
  student: StudentProfile,
  request: ProjectGenerationRequest,
): Promise<GeneratedProjectCandidate[]> {
  const selectedCourseIds = request.selectedCourseIds.filter(Boolean);
  const courses = getCoursesByIds(selectedCourseIds);
  if (courses.length === 0) {
    throw new Error('No courses selected for project generation.');
  }

  const targetCount = clamp(request.projectCount || 1, 1, 5);
  const batchSize = clamp(targetCount + 2, 2, 7);

  const batchOne = dedupeByTitleAndProblem(
    await generateBriefBatchCandidates(student, courses, request, batchSize, []),
  );
  const validationOne = await validateCandidatesBatch(request, courses, batchOne);
  let combined = batchOne.map((brief, index) => ({
    brief,
    validation: validationOne[index] || { ...DEFAULT_VALIDATION },
  }));

  let nonRejected = combined.filter((c) => c.validation.verdict !== 'rejected').length;
  if (nonRejected < targetCount) {
    const batchTwo = dedupeByTitleAndProblem(
      await generateBriefBatchCandidates(
        student,
        courses,
        request,
        clamp(targetCount, 1, 4),
        combined.map((c) => c.brief),
      ),
    );
    const validationTwo = await validateCandidatesBatch(request, courses, batchTwo);
    combined = [
      ...combined,
      ...batchTwo.map((brief, index) => ({
        brief,
        validation: validationTwo[index] || { ...DEFAULT_VALIDATION },
      })),
    ];
    nonRejected = combined.filter((c) => c.validation.verdict !== 'rejected').length;
    if (nonRejected < 1) {
      throw new Error('Project generation quality was too low after retries.');
    }
  }

  const diversityAdjusted = applyDiversityPenalty(combined);
  const enriched: GeneratedProjectCandidate[] = combined.map((entry, index) => {
    const validation = diversityAdjusted[index];
    return {
      id: `candidate-${Date.now()}-${index}`,
      courseIds: selectedCourseIds,
      brief: entry.brief,
      validation,
      hidden: validation.verdict === 'rejected',
    };
  });

  const ranked = enriched.sort(
    (a, b) =>
      verdictOrder(a.validation.verdict) - verdictOrder(b.validation.verdict) ||
      b.validation.score - a.validation.score,
  );

  const preferred = ranked.filter((c) => c.validation.verdict !== 'rejected');
  const rejected = ranked.filter((c) => c.validation.verdict === 'rejected');
  const limited = preferred.slice(0, targetCount);
  if (limited.length < targetCount) {
    limited.push(...rejected.slice(0, targetCount - limited.length));
  }

  return limited;
}

// Backward-compatible single-project generation
export async function generateAIProject(
  student: StudentProfile,
  selectedCourseIds: string[],
): Promise<ProjectBrief> {
  const candidates = await generateProjectCandidates(student, {
    selectedCourseIds,
    projectCount: 1,
    focusMode: 'balanced',
    customPrompt: '',
    difficultyRange: [2, 4],
    durationRangeWeeks: [4, 8],
    includeCanvasContext: false,
    canvasContext: null,
  });

  if (candidates.length === 0) {
    throw new Error('Failed to generate project candidate');
  }
  return candidates[0].brief;
}
