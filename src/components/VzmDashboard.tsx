import { useEffect, useState } from 'react';
import { AlertCircle, Briefcase, ChevronDown, ExternalLink, Loader2, MapPin, Timer } from 'lucide-react';
import { BaxterAdvertButton } from './BaxterAdvertButton';
import { rememberBaxterVacancies } from '../lib/baxterAdvert';

interface Vacancy {
  id: string;
  title: string;
  institution: string;
  workload: string;
  location: string;
  deadline: string;
  url: string;
}

export function VzmDashboard() {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchVacancies = async () => {
      try {
        const res = await fetch('/api/vzm/vacancies');
        if (!res.ok) {
          const message = await res.json().then(data => data.error).catch(() => null);
          throw new Error(message || 'Nepodařilo se načíst inzeráty z VZM');
        }
        const data = await res.json();
        setVacancies(data);
        setError(null);
      } catch (err: any) {
        console.warn('VZM feed unavailable', err);
        setVacancies([]);
        setError(err.message || 'Nepodařilo se načíst inzeráty z VZM');
      } finally {
        setLoading(false);
      }
    };

    fetchVacancies();
    const interval = setInterval(fetchVacancies, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    rememberBaxterVacancies('vzm', 'VZM', vacancies);
  }, [vacancies]);

  if (loading && vacancies.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-500">
        <Loader2 className="mb-3 h-6 w-6 animate-spin text-emerald-400" />
        <p>Načítám inzeráty z VZM...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <h3 className="font-medium">Chyba při načítání</h3>
          <p className="mt-1 text-xs opacity-80">{error}</p>
        </div>
      </div>
    );
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowTokens = [
    tomorrow.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
    tomorrow.toLocaleDateString('cs-CZ', { day: '2-digit', month: '2-digit' }),
    tomorrow.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
    'zítra',
    'morgen',
  ].map(token => token.toLowerCase());
  const hasTomorrow = vacancies.some(vacancy =>
    tomorrowTokens.some(token => vacancy.deadline.toLowerCase().includes(token))
  );
  const statusClass = hasTomorrow
    ? 'border-red-500/50 bg-red-500/15 text-red-100'
    : vacancies.length > 0
      ? 'border-amber-500/50 bg-amber-500/15 text-amber-100'
      : 'border-sky-500/50 bg-sky-500/15 text-sky-100';
  const statusText = hasTomorrow ? 'zítra' : vacancies.length > 0 ? `${vacancies.length} pozic` : 'nic';

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/40">
      <button
        type="button"
        onClick={() => setIsOpen(value => !value)}
        className={`flex h-8 shrink-0 items-center justify-between gap-2 border-b px-3 text-left transition-colors ${statusClass}`}
        title={isOpen ? 'Sbalit VZM' : 'Rozbalit VZM'}
      >
        <h2 className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <Briefcase className="h-4 w-4 shrink-0 text-emerald-400" />
          <span className="truncate">VZM - Stellenanzeiger</span>
        </h2>
        <div className="flex shrink-0 items-center gap-1 text-[11px] font-medium">
          {statusText}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <div className={`${isOpen ? 'max-h-56 overflow-y-auto p-2' : 'hidden'} min-h-0 space-y-1.5`}>
        {vacancies.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-500">
            Žádné aktuální inzeráty.
          </div>
        ) : (
          vacancies.map(vacancy => (
            <div
              key={vacancy.id}
              className="group rounded-md border border-zinc-800 bg-zinc-900/50 p-2.5 transition-colors hover:border-zinc-700 hover:bg-zinc-800/80"
            >
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <h3 className="text-[13px] font-medium leading-tight text-zinc-100 transition-colors group-hover:text-emerald-300">
                  {vacancy.title}
                </h3>
                <div className="flex shrink-0 items-center gap-1">
                  <BaxterAdvertButton vacancy={vacancy} />
                  <a
                    href={vacancy.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-950/60 hover:text-emerald-400"
                    title="Otevřít inzerát"
                    aria-label="Otevřít inzerát"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>

              <div className="mb-2 text-xs leading-snug text-zinc-400">
                {vacancy.institution}
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500">
                {vacancy.location && (
                  <div className="flex items-center gap-1 text-zinc-400">
                    <MapPin className="h-3 w-3" />
                    <span>{vacancy.location}</span>
                  </div>
                )}
                {vacancy.workload && (
                  <div className="flex items-center gap-1 text-zinc-400">
                    <Briefcase className="h-3 w-3" />
                    <span>{vacancy.workload}</span>
                  </div>
                )}
                {vacancy.deadline && (
                  <div className="ml-auto flex items-center gap-1 text-amber-300">
                    <Timer className="h-3 w-3" />
                    <span>{vacancy.deadline}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
