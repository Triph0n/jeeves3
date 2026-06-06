import { useEffect, useState } from 'react';
import { AlertCircle, ExternalLink, Image as ImageIcon, Loader2, Palette } from 'lucide-react';

interface MetArtwork {
  objectID: number;
  title: string;
  artist: string;
  date: string;
  medium: string;
  department: string;
  image: string;
  imageSmall: string;
  metUrl: string;
  description: string;
  fact: string;
  dayKey: string;
}

const readArtworkResponse = async (res: Response): Promise<MetArtwork> => {
  const contentType = res.headers.get('content-type') || '';
  const body = await res.text();

  if (!contentType.includes('application/json')) {
    const textPreview = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    throw new Error(
      textPreview || `Server vrátil odpověď ${res.status}, ale ne data obrazu.`
    );
  }

  let data: any;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    throw new Error('Server vrátil nečitelná data obrazu.');
  }

  if (!res.ok) {
    throw new Error(data?.error || 'Nepodařilo se načíst obraz dne');
  }

  return data;
};

export function MetArtworkDashboard() {
  const [artwork, setArtwork] = useState<MetArtwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchArtwork = async () => {
      try {
        const res = await fetch('/api/met/artwork-of-the-day');
        const data = await readArtworkResponse(res);
        setArtwork(data);
        setError(null);
      } catch (err: any) {
        console.warn('Met artwork unavailable', err);
        setError(err.message || 'Nepodařilo se načíst obraz dne');
      } finally {
        setLoading(false);
      }
    };

    fetchArtwork();
    const interval = setInterval(fetchArtwork, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !artwork) {
    return (
      <div className="flex min-h-[12rem] flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-xs text-zinc-500">
        <Loader2 className="mb-2 h-5 w-5 animate-spin text-amber-500" />
        <p>Vybírám obraz dne z Metu...</p>
      </div>
    );
  }

  if (error && !artwork) {
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

  if (!artwork) return null;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-visible rounded-lg border border-zinc-800 bg-zinc-950/40">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/70 px-3 py-2">
        <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <Palette className="h-4 w-4 shrink-0 text-amber-500" />
          Obraz dne
        </h2>
        <div className="shrink-0 text-[11px] font-medium text-zinc-500">
          The Met
        </div>
      </div>

      <div className="grid h-full min-h-0 gap-3 p-3 sm:grid-cols-[9rem_1fr]">
        <a
          href={artwork.metUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex h-full min-h-[9rem] items-center justify-center overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/50"
          title="Otevřít obraz v Metu"
        >
          {(artwork.imageSmall || artwork.image) ? (
            <img
              src={artwork.imageSmall || artwork.image}
              alt={`${artwork.title}, ${artwork.artist}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-500">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
        </a>

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-tight text-zinc-100">
                {artwork.title}
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                {artwork.artist}{artwork.date ? `, ${artwork.date}` : ''}
              </p>
            </div>
            <a
              href={artwork.metUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-950/60 hover:text-amber-500"
              title="Otevřít v Metu"
              aria-label="Otevřít v Metu"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <p className="mt-2 text-[12px] leading-snug text-zinc-400">
            {artwork.description}
          </p>

          <div className="mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[12px] leading-snug text-amber-100">
            {artwork.fact}
          </div>

          {(artwork.medium || artwork.department) && (
            <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-zinc-500">
              {artwork.medium && <span>{artwork.medium}</span>}
              {artwork.department && <span>{artwork.department}</span>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
