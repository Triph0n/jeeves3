import { useEffect, useState } from 'react';
import { AlertCircle, BookOpen, Loader2 } from 'lucide-react';
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

export function AuntAgathaVerbDashboard() {
  const [state, setState] = useState<AgathaState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadState = async () => {
    try {
      const res = await fetch('/api/aunt-agatha/state');
      const data = await readAgathaResponse(res);
      setState(data);
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
  const verbLine = `${today.infinitive} - ${today.preterite} - ${today.perfect}`;

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

      <div className="grid items-center gap-3 p-3 sm:grid-cols-[4.5rem_1fr]">
        <div className="relative mx-auto flex aspect-square w-full max-w-[4.5rem] items-center justify-center overflow-hidden rounded-full border-2 border-zinc-700/40 bg-zinc-900/50 shadow-sm">
          <img
            src={auntAgathaPortrait}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-zinc-950/75 px-1 py-0.5 text-center text-[9px] font-medium leading-tight text-amber-100">
            {catalogLabel}
          </div>
        </div>

        <div className="min-w-0 self-center">
          <h3 className="break-words text-[18px] font-semibold leading-snug text-zinc-100">
            {verbLine}
          </h3>
          {today.translationCs && <div className="mt-0.5 truncate text-xs text-zinc-500">{today.translationCs}</div>}
        </div>
      </div>
    </section>
  );
}
