import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, Check, GraduationCap, Loader2 } from 'lucide-react';
import auntAgathaPortrait from '../../assets/aunt-agatha-period-portrait.png';

type AgathaVerb = {
  id: string;
  infinitive: string;
  preterite: string;
  perfect: string;
  example: string;
  translationCs?: string;
  dayKey?: string;
};

type AgathaState = {
  today: AgathaVerb;
  knownVerbs: AgathaVerb[];
  catalog?: {
    sourceUrl: string;
    importedAt: string;
    catalogSize: number;
    usingFallback: boolean;
  };
};

type B2Lesson = {
  id: string;
  dayKey: string;
  dayIndex: number;
  weekNumber: number;
  theme: string;
  target: string;
  inputText: string;
  questions: string[];
  phrases: string[];
  grammarFocus: string;
  outputTask: string;
  transferTask: string;
};

type B2Attempt = {
  id: number;
  step: 'retrieval' | 'activation' | 'output';
  answer: string;
  feedback: string;
  createdAt: string;
};

type B2ReviewItem = {
  id: number;
  prompt: string;
  dueDate: string;
  sourceStep: string;
};

type B2ErrorItem = {
  id: number;
  category: string;
  note: string;
  sourceStep: string;
  createdAt: string;
};

type B2State = {
  lesson: B2Lesson;
  attempts: B2Attempt[];
  dueReview: B2ReviewItem[];
  recentErrors: B2ErrorItem[];
  progress: {
    lessonsStarted: number;
    attempts: number;
    reviewsDone: number;
    reviewsDue: number;
    courseWeek: number;
    courseDay: number;
    weekThemes: string[];
  };
};

type AgathaPayload = AgathaState & {
  b2: B2State;
};

type TabKey = 'today' | 'review' | 'course' | 'errors';
type StepKey = 'retrieval' | 'activation' | 'output';

const readJsonResponse = async <T,>(res: Response, fallbackMessage: string): Promise<T> => {
  const contentType = res.headers.get('content-type') || '';
  const body = await res.text();

  if (!contentType.includes('application/json')) {
    const textPreview = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    throw new Error(textPreview || fallbackMessage);
  }

  let data: any;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    throw new Error('Server vrátil nečitelná data Agathy.');
  }

  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || fallbackMessage);
  }

  return data;
};

const stepLabels: Record<StepKey, string> = {
  retrieval: 'Recall',
  activation: 'Fráze',
  output: 'Výstup',
};

const tabLabels: Record<TabKey, string> = {
  today: 'Today',
  review: 'Review',
  course: 'Course',
  errors: 'Errors',
};

export function AuntAgathaVerbDashboard() {
  const [payload, setPayload] = useState<AgathaPayload | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('today');
  const [answers, setAnswers] = useState<Record<StepKey, string>>({
    retrieval: '',
    activation: '',
    output: '',
  });
  const [submittingStep, setSubmittingStep] = useState<StepKey | null>(null);
  const [completingReviewId, setCompletingReviewId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadState = async () => {
    try {
      const [verbRes, b2Res] = await Promise.all([
        fetch('/api/aunt-agatha/state', { cache: 'no-store' }),
        fetch('/api/aunt-agatha/b2/today', { cache: 'no-store' }),
      ]);
      const agatha = await readJsonResponse<AgathaState>(verbRes, 'Nepodařilo se načíst sloveso dne');
      const b2 = await readJsonResponse<B2State>(b2Res, 'Nepodařilo se načíst B2 lekci');
      setPayload({ ...agatha, b2 });
      setError(null);
    } catch (err: any) {
      console.warn('Aunt Agatha unavailable', err);
      setError(err.message || 'Nepodařilo se načíst Agathu');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadState();
    const interval = setInterval(loadState, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const latestAttemptByStep = useMemo(() => {
    const result: Partial<Record<StepKey, B2Attempt>> = {};
    for (const attempt of payload?.b2.attempts || []) {
      result[attempt.step] = attempt;
    }
    return result;
  }, [payload?.b2.attempts]);

  const submitAttempt = async (event: FormEvent<HTMLFormElement>, step: StepKey) => {
    event.preventDefault();
    if (!payload?.b2.lesson || !answers[step].trim()) return;

    setSubmittingStep(step);
    try {
      const res = await fetch('/api/aunt-agatha/b2/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId: payload.b2.lesson.id,
          step,
          answer: answers[step],
        }),
      });
      const data = await readJsonResponse<B2State>(res, 'Odpověď se nepodařilo uložit.');
      setPayload(current => current ? { ...current, b2: data } : current);
      setAnswers(current => ({ ...current, [step]: '' }));
    } catch (err: any) {
      setError(err.message || 'Odpověď se nepodařilo uložit.');
    } finally {
      setSubmittingStep(null);
    }
  };

  const completeReview = async (reviewId: number) => {
    setCompletingReviewId(reviewId);
    try {
      const res = await fetch(`/api/aunt-agatha/b2/review/${reviewId}`, { method: 'POST' });
      const data = await readJsonResponse<B2State>(res, 'Review se nepodařilo označit jako hotové.');
      setPayload(current => current ? { ...current, b2: data } : current);
    } catch (err: any) {
      setError(err.message || 'Review se nepodařilo uložit.');
    } finally {
      setCompletingReviewId(null);
    }
  };

  if (loading && !payload) {
    return (
      <div className="flex min-h-[12rem] flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-xs text-zinc-500">
        <Loader2 className="mb-2 h-5 w-5 animate-spin text-amber-500" />
        <p>Připravuji Agathinu B2 lekci...</p>
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="flex min-h-[10rem] items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <h3 className="font-medium">Chyba při načítání</h3>
          <p className="mt-1 line-clamp-3 text-xs opacity-80">{error}</p>
        </div>
      </div>
    );
  }

  if (!payload?.today || !payload.b2?.lesson) return null;

  const { today, b2 } = payload;
  const catalogLabel = payload.catalog?.usingFallback
    ? 'záloha'
    : `${payload.catalog?.catalogSize || payload.knownVerbs.length} sloves`;
  const verbLine = `${today.infinitive} - ${today.preterite} - ${today.perfect}`;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/40">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/70 px-3 py-2">
        <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <BookOpen className="h-4 w-4 shrink-0 text-amber-500" />
          Aunt Agatha
        </h2>
        <div className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-zinc-500">
          <GraduationCap className="h-3.5 w-3.5 text-amber-500" />
          B2 Coach
        </div>
      </div>

      <div className="grid items-center gap-3 border-b border-zinc-800/80 p-3 sm:grid-cols-[4.5rem_1fr]">
        <div className="relative mx-auto flex aspect-square w-full max-w-[4.5rem] items-center justify-center overflow-hidden rounded-full border-2 border-zinc-700/40 bg-zinc-900/50 shadow-sm">
          <img src={auntAgathaPortrait} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-zinc-950/75 px-1 py-0.5 text-center text-[9px] font-medium leading-tight text-amber-100">
            {catalogLabel}
          </div>
        </div>

        <div className="min-w-0 self-center">
          <div className="text-[10px] font-medium uppercase tracking-wide text-amber-500">
            Woche {b2.progress.courseWeek}, Tag {b2.progress.courseDay}
          </div>
          <h3 className="mt-0.5 break-words text-[16px] font-semibold leading-snug text-zinc-100">
            {b2.lesson.theme}
          </h3>
          <div className="mt-1 truncate text-xs text-zinc-500">{verbLine}</div>
          {today.translationCs && <div className="truncate text-xs text-zinc-600">{today.translationCs}</div>}
        </div>
      </div>

      <div className="grid grid-cols-4 border-b border-zinc-800 bg-zinc-950/50 text-[11px]">
        {(Object.keys(tabLabels) as TabKey[]).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`h-8 border-r border-zinc-800 last:border-r-0 ${activeTab === tab ? 'bg-amber-500/10 text-amber-300' : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'}`}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="min-h-0 overflow-y-auto p-3">
        {activeTab === 'today' && (
          <div className="space-y-3">
            <div className="rounded-md border border-zinc-800 bg-zinc-900/45 p-3">
              <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">B2 target</div>
              <p className="mt-1 text-sm leading-snug text-zinc-200">{b2.lesson.target}</p>
            </div>

            <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Input</div>
              <p className="text-sm leading-relaxed text-zinc-300">{b2.lesson.inputText}</p>
            </div>

            <PracticeStep
              step="retrieval"
              title="Recall without looking"
              prompt={b2.lesson.questions.join(' ')}
              answer={answers.retrieval}
              latestAttempt={latestAttemptByStep.retrieval}
              loading={submittingStep === 'retrieval'}
              onChange={value => setAnswers(current => ({ ...current, retrieval: value }))}
              onSubmit={submitAttempt}
            />

            <PracticeStep
              step="activation"
              title="Activate phrases"
              prompt={b2.lesson.phrases.join(' / ')}
              answer={answers.activation}
              latestAttempt={latestAttemptByStep.activation}
              loading={submittingStep === 'activation'}
              onChange={value => setAnswers(current => ({ ...current, activation: value }))}
              onSubmit={submitAttempt}
            />

            <PracticeStep
              step="output"
              title="Output task"
              prompt={`${b2.lesson.outputTask} Focus: ${b2.lesson.grammarFocus}`}
              answer={answers.output}
              latestAttempt={latestAttemptByStep.output}
              loading={submittingStep === 'output'}
              onChange={value => setAnswers(current => ({ ...current, output: value }))}
              onSubmit={submitAttempt}
            />

            <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
              Transfer: {b2.lesson.transferTask}
            </div>
          </div>
        )}

        {activeTab === 'review' && (
          <div className="space-y-2">
            <div className="text-xs text-zinc-500">
              Due today: {b2.progress.reviewsDue} · Done: {b2.progress.reviewsDone}
            </div>
            {b2.dueReview.length === 0 ? (
              <EmptyState text="Dnes není žádné opakování. Agatha si to ovšem pamatuje." />
            ) : b2.dueReview.map(item => (
              <div key={item.id} className="flex items-start gap-2 rounded-md border border-zinc-800 bg-zinc-900/45 p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{item.dueDate} · {item.sourceStep}</div>
                  <p className="mt-1 text-sm leading-snug text-zinc-200">{item.prompt}</p>
                </div>
                <button
                  type="button"
                  onClick={() => completeReview(item.id)}
                  disabled={completingReviewId === item.id}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                  title="Hotovo"
                >
                  {completingReviewId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'course' && (
          <div className="space-y-2">
            <div className="rounded-md border border-zinc-800 bg-zinc-900/45 p-3 text-xs text-zinc-400">
              Started lessons: {b2.progress.lessonsStarted} · Attempts: {b2.progress.attempts}
            </div>
            {b2.progress.weekThemes.map((theme, index) => (
              <div
                key={theme}
                className={`rounded-md border p-2.5 text-sm ${index + 1 === b2.progress.courseWeek ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-zinc-800 bg-zinc-950/40 text-zinc-400'}`}
              >
                <span className="mr-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Week {index + 1}</span>
                {theme}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'errors' && (
          <div className="space-y-2">
            {b2.recentErrors.length === 0 ? (
              <EmptyState text="Zatím žádný error log. První odpověď ho založí." />
            ) : b2.recentErrors.map(item => (
              <div key={item.id} className="rounded-md border border-zinc-800 bg-zinc-900/45 p-2.5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-amber-500">{item.category} · {item.sourceStep}</div>
                <p className="mt-1 text-sm leading-snug text-zinc-300">{item.note}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PracticeStep({
  step,
  title,
  prompt,
  answer,
  latestAttempt,
  loading,
  onChange,
  onSubmit,
}: {
  step: StepKey;
  title: string;
  prompt: string;
  answer: string;
  latestAttempt?: B2Attempt;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>, step: StepKey) => void;
}) {
  return (
    <form onSubmit={event => onSubmit(event, step)} className="rounded-md border border-zinc-800 bg-zinc-900/45 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{stepLabels[step]}</div>
          <h4 className="text-sm font-semibold text-zinc-100">{title}</h4>
        </div>
        {latestAttempt && <span className="shrink-0 rounded border border-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">saved</span>}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">{prompt}</p>
      <textarea
        value={answer}
        onChange={event => onChange(event.target.value)}
        rows={3}
        className="mt-2 w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500"
        placeholder="Napište odpověď německy..."
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="line-clamp-2 min-w-0 text-xs text-zinc-500">{latestAttempt?.feedback || 'Agatha uloží odpověď a naplánuje review.'}</p>
        <button
          type="submit"
          disabled={!answer.trim() || loading}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-amber-500 px-2.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save
        </button>
      </div>
    </form>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-800 bg-zinc-950/40 p-4 text-center text-xs text-zinc-500">
      {text}
    </div>
  );
}
