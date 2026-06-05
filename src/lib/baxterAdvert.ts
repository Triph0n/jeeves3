export interface BaxterVacancyLike {
  id: string | number;
  title: string;
  institution?: string;
  url: string;
}

export interface CachedBaxterVacancy {
  id: string;
  title: string;
  institution: string;
  url: string;
  source: string;
  sourceLabel: string;
  rank: number;
  updatedAt: number;
}

interface BaxterAdvertResponse {
  success?: boolean;
  status?: string;
  message?: string;
  result?: string;
  url?: string;
  details?: Record<string, unknown>;
}

const CACHE_KEY = 'jeeves.baxter.vacancies';
const BAXTER_BASE_URL = 'http://127.0.0.1:8765';
const SOURCE_ORDER = ['muvac', 'musikzeitung', 'vzm', 'mkz', 'discord'];

const SOURCE_ALIASES: Record<string, string[]> = {
  muvac: ['muvac'],
  musikzeitung: ['musikzeitung', 'musik', 'smz'],
  vzm: ['vzm', 'stellenanzeiger'],
  mkz: ['mkz', 'konservatorium', 'zürich', 'zurich'],
  discord: ['discord'],
};

const normalizeText = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const readCache = (): CachedBaxterVacancy[] => {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const sortVacancies = (vacancies: CachedBaxterVacancy[]) =>
  [...vacancies].sort((a, b) => {
    const sourceDiff = SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source);
    if (sourceDiff !== 0) return sourceDiff;
    return a.rank - b.rank;
  });

export const rememberBaxterVacancies = (
  source: string,
  sourceLabel: string,
  vacancies: BaxterVacancyLike[]
) => {
  if (typeof window === 'undefined') return;

  const updatedAt = Date.now();
  const retained = readCache().filter(item => item.source !== source);
  const nextItems = vacancies
    .filter(vacancy => vacancy.url)
    .map((vacancy, rank) => ({
      id: String(vacancy.id || vacancy.url),
      title: vacancy.title || 'Inzerát',
      institution: vacancy.institution || '',
      url: vacancy.url,
      source,
      sourceLabel,
      rank,
      updatedAt,
    }));

  window.localStorage.setItem(CACHE_KEY, JSON.stringify(sortVacancies([...retained, ...nextItems])));
};

export const getCachedBaxterVacancies = () => sortVacancies(readCache());

export const isBaxterAdvertRequest = (text: string) => {
  const normalized = normalizeText(text);
  if (!normalized.includes('baxter')) return false;

  const hasSendVerb = /(posli|poslat|predej|predat|dej|odesli|zpracuj|priprav|vytvor|udel(ej)?)/.test(normalized);
  const mentionsAdvert = /(inzer|odkaz|pozic|nabid|job|stellen|tenhle|tento|tohle|to\b)/.test(normalized);
  return hasSendVerb && mentionsAdvert;
};

const getRequestedSource = (text: string) => {
  const normalized = normalizeText(text);
  return Object.entries(SOURCE_ALIASES).find(([, aliases]) =>
    aliases.some(alias => normalized.includes(normalizeText(alias)))
  )?.[0] || '';
};

const getRequestedIndex = (text: string, count: number) => {
  const normalized = normalizeText(text);
  if (/(posledni|spodni)/.test(normalized)) return Math.max(0, count - 1);
  if (/(druhy|druhe|2\.?)/.test(normalized)) return 1;
  if (/(treti|3\.?)/.test(normalized)) return 2;
  if (/(ctvrty|ctvrte|4\.?)/.test(normalized)) return 3;
  return 0;
};

const extractUrlFromText = (text: string) =>
  text.match(/https?:\/\/[^\s"'<>]+/i)?.[0]?.replace(/[),.;!?]+$/g, '') || '';

export const resolveBaxterAdvertFromText = (text: string): CachedBaxterVacancy | null => {
  const explicitUrl = extractUrlFromText(text);
  if (explicitUrl) {
    return {
      id: explicitUrl,
      title: 'Inzerát',
      institution: '',
      url: explicitUrl,
      source: 'manual',
      sourceLabel: 'Odkaz',
      rank: 0,
      updatedAt: Date.now(),
    };
  }

  const source = getRequestedSource(text);
  const vacancies = getCachedBaxterVacancies()
    .filter(vacancy => !source || vacancy.source === source);
  if (vacancies.length === 0) return null;

  return vacancies[Math.min(getRequestedIndex(text, vacancies.length), vacancies.length - 1)] || null;
};

export const toBaxterUrl = (url: unknown) => {
  const value = String(url || '');
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${BAXTER_BASE_URL}${value.startsWith('/') ? '' : '/'}${value}`;
};

export const sendAdvertToBaxter = async (vacancy: BaxterVacancyLike) => {
  const res = await fetch('/api/baxter/applications/from-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: vacancy.url }),
  });
  const data: BaxterAdvertResponse = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false || data.status === 'failed') {
    throw new Error(data.message || data.result || 'Baxter inzerát nepřijal.');
  }

  return data;
};

export const formatBaxterAdvertResult = (data: BaxterAdvertResponse, vacancy?: BaxterVacancyLike) => {
  const details = data.details || {};
  const links = [
    ['PDF', details.pdf_url],
    ['Koncept', details.draft_file_url],
    ['Gmail', details.compose_url || details.draft_url],
  ]
    .map(([label, value]) => {
      const url = toBaxterUrl(value);
      return url ? `${label}: ${url}` : '';
    })
    .filter(Boolean);

  return [
    data.message || data.result || 'Baxter převzal inzerát.',
    vacancy?.title ? `${vacancy.title}` : '',
    ...links,
  ].filter(Boolean).join('\n');
};
