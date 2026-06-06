import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, Check, Loader2, RefreshCw } from 'lucide-react';
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

type AgathaStats = {
  knownVerbs: number;
  attempts: number;
  correct: number;
};

type AgathaState = {
  today: AgathaVerb;
  knownVerbs: AgathaVerb[];
  stats: AgathaStats;
  catalog?: {
    sourceUrl: string;
    importedAt: string;
    catalogSize: number;
    usingFallback: boolean;
  };
};

type FlashcardPrompt = {
  verb: AgathaVerb;
  kind: 'preterite' | 'perfect';
};

const readAgathaResponse = async (res: Response): Promise<AgathaState> => {
  const contentType = res.headers.get('content-type') || '';
  const body = await res.text();

  if (!contentType.includes('application/json')) {
    const textPreview = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    throw new Error(textPreview || `Server vrátil odpověď ${res.status}, ale ne data Agathy.`);
  }

  let data: any;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    throw new Error('Server vrátil nečitelná data Agathy.');
  }

  if (!res.ok) {
    throw new Error(data?.error || 'Nepodařilo se načíst sloveso dne');
  }

  return data;
};

const createPrompt = (verbs: AgathaVerb[], today?: AgathaVerb): FlashcardPrompt | null => {
  const source = verbs.length > 0 ? verbs : today ? [today] : [];
  if (source.length === 0) return null;
  const verb = source[Math.floor(Math.random() * source.length)];
  const kind = Math.random() > 0.5 ? 'perfect' : 'preterite';
  return { verb, kind };
};

const promptLabel = (kind: FlashcardPrompt['kind']) =>
  kind === 'preterite' ? 'Präteritum' : 'Partizip II';

export function AuntAgathaVerbDashboard() {
  const [state, setState] = useState<AgathaState | null>(null);
  const [flashcard, setFlashcard] = useState<FlashcardPrompt | null>(null);
  const [answer, setAnswer] = useState('');
  const [reviewResult, setReviewResult] = useState('');
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const loadState = async () => {
    try {
      const res = await fetch('/api/aunt-agatha/state');
      const data = await readAgathaResponse(res);
      setState(data);
      setFlashcard(current => current || createPrompt(data.knownVerbs || [], data.today));
      setError(null);
    } catch (err: any) {
      console.warn('Aunt Agatha unavailable', err);
      setError(err.message || 'Nepodařilo se načíst sloveso dne');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadState();
    const interval = setInterval(loadState, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const nextFlashcard = () => {
    setIsTesting(false);
    setAnswer('');
    setReviewResult('');
    setFlashcard(createPrompt(state?.knownVerbs || [], state?.today));
  };

  const handleReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!flashcard || !answer.trim()) return;

    setChecking(true);
    try {
      const res = await fetch('/api/aunt-agatha/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verbId: flashcard.verb.id,
          promptKind: flashcard.kind,
          answer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Odpověď se nepodařilo uložit.');
      }

      setReviewResult(data.reply || '');
      if (data.correct) {
        setIsTesting(false);
      }
      setState(current => current ? {
        ...current,
        stats: data.stats || current.stats,
      } : current);
    } catch (err: any) {
      setReviewResult(err.message || 'Odpověď se nepodařilo uložit.');
    } finally {
      setChecking(false);
    }
  };

  if (loading && !state) {
    return (
      <div className="flex min-h-[12rem] flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-xs text-zinc-500">
        <Loader2 className="mb-2 h-5 w-5 animate-spin text-amber-500" />
        <p>Připravuji sloveso dne...</p>
      </div>
    );
  }

  if (error && !state) {
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

  if (!state?.today) return null;

  const { today } = state;
  const catalogLabel = state.catalog?.usingFallback
    ? 'záloha'
    : `${state.catalog?.catalogSize || state.knownVerbs.length} sloves`;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/40">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/70 px-3 py-2">
        <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <BookOpen className="h-4 w-4 shrink-0 text-amber-500" />
          Aunt Agatha
        </h2>
        <div className="shrink-0 text-[11px] font-medium text-zinc-500">
          Sloveso dne
        </div>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-[7.5rem_1fr]">
        <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/50">
          <img
            src={auntAgathaPortrait}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-zinc-950/75 px-2 py-1 text-center text-[11px] font-medium text-amber-100">
            {catalogLabel}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 text-2xl font-semibold leading-none text-zinc-100 flex items-baseline gap-2">
              {today.infinitive}
              {today.translationCs && <span className="text-[13px] font-normal text-zinc-400 truncate">{today.translationCs}</span>}
            </h3>
          </div>

          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2.5 py-1.5">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Präteritum</div>
              <div className={`mt-0.5 text-sm font-semibold text-zinc-100 transition-all duration-300 ${isTesting && flashcard?.verb.id === today.id ? 'blur-md' : ''}`}>{today.preterite}</div>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-2.5 py-1.5">
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Partizip II</div>
              <div className={`mt-0.5 text-sm font-semibold text-zinc-100 transition-all duration-300 ${isTesting && flashcard?.verb.id === today.id ? 'blur-md' : ''}`}>{today.perfect}</div>
            </div>
          </div>

          {today.example && today.example !== `${today.infinitive} - ${today.preterite} - ${today.perfect}` && (
            <div className="mt-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-100 line-clamp-2">
              {today.example}
            </div>
          )}

          {flashcard && !isTesting && (
            <div className="mt-2 flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5">
              <span className="text-[11px] font-medium text-zinc-400">
                Test: {promptLabel(flashcard.kind)} od <strong className="text-zinc-200">{flashcard.verb.infinitive}</strong>
              </span>
              <button
                type="button"
                onClick={() => setIsTesting(true)}
                className="inline-flex h-6 px-2.5 shrink-0 items-center justify-center rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-medium transition-colors hover:bg-indigo-500/20"
              >
                Testovat
              </button>
            </div>
          )}

          {flashcard && isTesting && (
            <form onSubmit={handleReview} className="mt-2">
              <label htmlFor="agatha-card-answer" className="block text-[11px] font-medium text-zinc-500">
                {promptLabel(flashcard.kind)} od <strong className="text-zinc-300">{flashcard.verb.infinitive}</strong>
              </label>
              <div className="mt-1 flex min-w-0 gap-1.5">
                <input
                  id="agatha-card-answer"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  autoComplete="off"
                  placeholder="Vaše odpověď..."
                  className="h-7 min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500"
                />
                <button
                  type="submit"
                  disabled={!answer.trim() || checking}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-indigo-500 px-2.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                  title="Zkontrolovat odpověď"
                >
                  <Check className="h-3.5 w-3.5" />
                  OK
                </button>
                <button
                  type="button"
                  onClick={nextFlashcard}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-950/60 hover:text-amber-500"
                  title="Nová kartička"
                  aria-label="Nová kartička"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </form>
          )}

          {reviewResult && (
            <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-zinc-400">
              {reviewResult}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

