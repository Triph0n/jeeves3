export interface FamilyCalendar {
  ownerKey: string;
  displayName: string;
  calendarId: string;
  aliases: string[];
  color?: string;
}

export const FAMILY_CALENDARS: FamilyCalendar[] = [
  {
    ownerKey: 'vlada',
    displayName: 'Vladimir',
    calendarId: 'primary',
    aliases: ['vlada', 'vladimir', 'vlado', 'vladimir.fortin@gmail.com'],
    color: '#3b82f6',
  },
  {
    ownerKey: 'ursula',
    displayName: 'Ursula',
    calendarId: 'ursulafortin@gmail.com',
    aliases: ['ursula', 'ursuly', 'ulinka', 'ulinky', 'uliana', 'uliany', 'ulca', 'ulci', 'ursulafortin@gmail.com'],
    color: '#f97316',
  },
  {
    ownerKey: 'max',
    displayName: 'Max',
    calendarId: 'maxrafaelfortin@gmail.com',
    aliases: ['max', 'maxim', 'maxrafaelfortin@gmail.com'],
    color: '#22c55e',
  },
  {
    ownerKey: 'avi',
    displayName: 'Avi',
    calendarId: 'avifortin@gmail.com',
    aliases: ['avi', 'avifortin@gmail.com'],
    color: '#ef4444',
  },
  {
    ownerKey: 'beatrix',
    displayName: 'Beatrix',
    calendarId: 'beatrixeleanorfortin@gmail.com',
    aliases: ['beatrix', 'bea', 'betka', 'beatrixeleanorfortin@gmail.com'],
    color: '#ec4899',
  },
];

export const FAMILY_CALENDAR_DISPLAY_NAMES = FAMILY_CALENDARS.map(calendar => calendar.displayName);

export const normalizeCalendarLookup = (value: unknown) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const resolveFamilyCalendar = (value: unknown) => {
  const normalizedValue = normalizeCalendarLookup(value);
  if (!normalizedValue) return null;

  return FAMILY_CALENDARS.find(calendar =>
    [calendar.displayName, calendar.ownerKey, calendar.calendarId, ...calendar.aliases]
      .some(alias => normalizeCalendarLookup(alias) === normalizedValue)
  ) || null;
};
