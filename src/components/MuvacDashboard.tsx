import { useEffect, useState } from 'react';
import { Briefcase, MapPin, Clock, ExternalLink, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { BaxterAdvertButton } from './BaxterAdvertButton';
import { rememberBaxterVacancies } from '../lib/baxterAdvert';

interface Vacancy {
  id: number;
  title: string;
  institution: string;
  country: string;
  city: string;
  subType: string;
  applicationEnd: number | null;
  url: string;
}

export function MuvacDashboard() {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchVacancies = async () => {
      try {
        const res = await fetch('/api/muvac/vacancies');
        if (!res.ok) {
          const message = await res.json().then(data => data.error).catch(() => null);
          throw new Error(message || 'Nepodařilo se načíst inzeráty z Muvac');
        }
        const data = await res.json();
        setVacancies(data);
        setError(null);
      } catch (err: any) {
        console.warn('Muvac feed unavailable', err);
        setVacancies([]);
        setError(err.message || 'Nepodařilo se načíst inzeráty z Muvac');
      } finally {
        setLoading(false);
      }
    };

    fetchVacancies();
    // Refresh every 30 minutes
    const interval = setInterval(fetchVacancies, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    rememberBaxterVacancies('muvac', 'Muvac', vacancies);
  }, [vacancies]);

  if (loading && vacancies.length === 0) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5 flex flex-col items-center justify-center text-sm text-zinc-500 h-full">
        <Loader2 className="w-6 h-6 mb-3 animate-spin text-indigo-400" />
        <p>Načítám inzeráty z Muvac...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-2 text-sm text-red-400 h-full">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-medium">Chyba při načítání</h3>
          <p className="text-xs opacity-80 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const formatDeadline = (timestamp: number | null) => {
    if (!timestamp) return 'Neurčeno';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Vypršelo';
    if (diffDays === 0) return 'Dnes';
    if (diffDays === 1) return 'Zítra';
    if (diffDays < 7) return `Za ${diffDays} dny`;
    
    return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
  };

  const getDeadlineColor = (timestamp: number | null) => {
    if (!timestamp) return 'text-zinc-500';
    const diffDays = Math.ceil((timestamp - Date.now()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'text-red-500/50';
    if (diffDays <= 3) return 'text-red-400';
    if (diffDays <= 7) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const hasTomorrow = vacancies.some(vacancy => {
    if (!vacancy.applicationEnd) return false;
    return Math.ceil((vacancy.applicationEnd - Date.now()) / (1000 * 60 * 60 * 24)) === 1;
  });
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
        title={isOpen ? 'Sbalit Muvac' : 'Rozbalit Muvac'}
      >
        <h2 className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <Briefcase className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="truncate">Muvac - Violoncello</span>
        </h2>
        <div className="flex shrink-0 items-center gap-1 text-[11px] font-medium">
          {statusText}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <div className={`${isOpen ? 'max-h-56 overflow-y-auto p-2' : 'hidden'} min-h-0 space-y-1.5`}>
        {vacancies.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-xs">
            Žádné aktuální inzeráty.
          </div>
        ) : (
          vacancies.map(vacancy => (
            <div
              key={vacancy.id}
              className="group rounded-md border border-zinc-800 bg-zinc-900/50 p-2.5 transition-colors hover:border-zinc-700 hover:bg-zinc-800/80"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <h3 className="text-[13px] font-medium text-zinc-100 group-hover:text-indigo-300 transition-colors leading-tight">
                  {vacancy.title}
                </h3>
                <div className="flex shrink-0 items-center gap-1">
                  <BaxterAdvertButton vacancy={vacancy} />
                  <a
                    href={vacancy.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-950/60 hover:text-indigo-400"
                    title="Otevřít inzerát"
                    aria-label="Otevřít inzerát"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
              
              <div className="text-xs text-zinc-400 mb-2 leading-snug">
                {vacancy.institution}
              </div>
              
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                {vacancy.city && (
                  <div className="flex items-center gap-1 text-zinc-500">
                    <MapPin className="w-3 h-3" />
                    <span>{vacancy.city}{vacancy.country ? `, ${vacancy.country}` : ''}</span>
                  </div>
                )}
                
                <div className="flex items-center gap-1 text-zinc-500">
                  <Briefcase className="w-3 h-3" />
                  <span className="capitalize">{vacancy.subType === 'temporary' ? 'Dočasný' : 'Stálý'}</span>
                </div>
                
                <div className={`flex items-center gap-1 ml-auto font-medium ${getDeadlineColor(vacancy.applicationEnd)}`}>
                  <Clock className="w-3 h-3" />
                  <span>{formatDeadline(vacancy.applicationEnd)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
