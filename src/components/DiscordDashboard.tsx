import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bell, BellRing, Check, ChevronDown, ExternalLink, Loader2 } from 'lucide-react';

interface DiscordAlert {
  id: string;
  at: string;
  author: string;
  content: string;
  url: string;
}

const SEEN_MESSAGE_KEY = 'jeeves.discord.lastSeenMessageId';

export function DiscordDashboard() {
  const [alerts, setAlerts] = useState<DiscordAlert[]>([]);
  const [seenMessageId, setSeenMessageId] = useState(() => localStorage.getItem(SEEN_MESSAGE_KEY) || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await fetch('/api/discord/alerts');
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok) throw new Error('Nepodařilo se načíst Discord zprávy');
        if (!contentType.includes('application/json')) {
          throw new Error('Server ještě neběží s upozorněními Discordu. Restartuj Jeeves server.');
        }
        const data = await res.json();
        setAlerts(Array.isArray(data) ? data : []);
        setError(null);
      } catch (err: any) {
        console.warn('Discord alerts unavailable', err);
        setError(err.message || 'Nepodařilo se načíst Discord zprávy');
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 3000);
    return () => clearInterval(interval);
  }, []);

  const latestAlert = alerts[0];
  const unreadAlerts = useMemo(() => {
    if (!latestAlert) return [];
    if (!seenMessageId) return alerts;
    const seenIndex = alerts.findIndex(alert => alert.id === seenMessageId);
    return seenIndex === -1 ? alerts : alerts.slice(0, seenIndex);
  }, [alerts, latestAlert, seenMessageId]);
  const hasUnread = unreadAlerts.length > 0;

  const markAsSeen = () => {
    if (!latestAlert) return;
    localStorage.setItem(SEEN_MESSAGE_KEY, latestAlert.id);
    setSeenMessageId(latestAlert.id);
  };

  if (loading && alerts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-xs text-zinc-500">
        <Loader2 className="mb-2 h-5 w-5 animate-spin text-sky-400" />
        <p>Hlídám Discord zprávy...</p>
      </div>
    );
  }

  if (error && alerts.length === 0) {
    return (
      <div className="flex h-full items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <h3 className="font-medium">Chyba při načítání</h3>
          <p className="mt-1 line-clamp-3 text-xs opacity-80">{error}</p>
        </div>
      </div>
    );
  }

  const statusClass = hasUnread
    ? 'border-red-500/50 bg-red-500/15 text-red-100 hover:bg-red-500/25'
    : alerts.length > 0
      ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25'
      : 'border-sky-500/50 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25';

  const statusText = hasUnread
    ? `${unreadAlerts.length} nových`
    : alerts.length > 0
      ? 'vše přečteno'
      : 'nic';

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden rounded-lg border ${
      hasUnread
        ? 'border-red-400 bg-red-950/30 shadow-[0_0_0_1px_rgba(248,113,113,0.35),0_0_24px_rgba(248,113,113,0.18)]'
        : 'border-zinc-800 bg-zinc-950/40'
    }`}>
      <button
        type="button"
        onClick={() => setIsOpen(value => !value)}
        className={`flex h-8 shrink-0 items-center justify-between gap-2 border-b px-3 text-left transition-colors ${statusClass}`}
        title={isOpen ? 'Sbalit Discord' : 'Rozbalit Discord'}
      >
        <h2 className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          {hasUnread ? (
            <BellRing className="h-4 w-4 shrink-0 animate-pulse text-red-300" />
          ) : (
            <Bell className="h-4 w-4 shrink-0 text-indigo-400" />
          )}
          <span className="truncate">Discord zprávy</span>
        </h2>
        <div className="flex shrink-0 items-center gap-1 text-[11px] font-medium">
          {statusText}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      <div className={`${isOpen ? 'max-h-56 overflow-y-auto p-2' : 'hidden'} min-h-0 space-y-1.5`}>
        {latestAlert && (
          <a
            href={latestAlert.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`group block rounded-md border px-2.5 py-2 transition-colors ${
              hasUnread
                ? 'border-red-400/40 bg-red-950/40 hover:border-red-300'
                : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-800/80'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
                  {latestAlert.author}
                  <span className="font-normal text-zinc-500">
                    {new Date(latestAlert.at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-[12px] leading-snug text-zinc-100">
                  {latestAlert.content}
                </div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition-colors group-hover:text-sky-300" />
            </div>
          </a>
        )}

        {latestAlert && (
          <button
            type="button"
            onClick={markAsSeen}
            className={`inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border text-[11px] font-medium transition-colors ${
              hasUnread
                ? 'border-red-300/40 bg-red-400 text-red-950 hover:bg-red-300'
                : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            <Check className="h-3.5 w-3.5" />
            Označit jako přečtené
          </button>
        )}

        {!latestAlert && (
          <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-3 text-xs text-emerald-300">
            Žádný nový vzkaz
          </div>
        )}
      </div>
    </div>
  );
}
