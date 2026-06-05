import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, Clock, Loader2, AlertCircle, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Pencil, Save, X } from 'lucide-react';

interface Calendar {
  id: string;
  summary: string;
  backgroundColor?: string;
}

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

interface CalendarData {
  calendar: Calendar;
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
}

const TARGET_CALENDARS = ['Vlada', 'Ulinka', 'Max', 'Avi', 'Beatrix'];
const TARGET_CALENDAR_ALIASES: Record<string, string[]> = {
  Vlada: ['vlada', 'vladimir', 'vlado'],
  Ulinka: ['ulinka', 'uliana', 'ulca'],
  Max: ['max', 'maxim'],
  Avi: ['avi'],
  Beatrix: ['beatrix', 'bea', 'betka'],
};
const CALENDAR_COLOR_OVERRIDES: Record<string, string> = {
  beatrix: '#ec4899',
};
const DAY_START_HOUR = 0;
const DAY_END_HOUR = 24;
const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, index) => DAY_START_HOUR + index
);
const VISIBLE_HOURS = DAY_END_HOUR - DAY_START_HOUR;

const normalizeCalendarName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const getTargetCalendarOrder = (calendar: Calendar) => {
  const normalizedSummary = normalizeCalendarName(calendar.summary);
  const index = TARGET_CALENDARS.findIndex(name =>
    TARGET_CALENDAR_ALIASES[name].some(alias => normalizedSummary.includes(alias))
  );

  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

const matchesTargetCalendar = (calendar: Calendar) => getTargetCalendarOrder(calendar) !== Number.MAX_SAFE_INTEGER;

interface EditingEvent {
  calendarId: string;
  eventId: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  startText: string;
  endText: string;
}

export function CalendarDashboard({ isConnected }: { isConnected: boolean }) {
  const [calendarsData, setCalendarsData] = useState<CalendarData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<EditingEvent | null>(null);
  const [savingEventId, setSavingEventId] = useState<string | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  useEffect(() => {
    if (!isConnected) {
      setCalendarsData([]);
      return;
    }

    const fetchCalendars = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/calendar/list');
        if (!res.ok) throw new Error('Nepodařilo se načíst seznam kalendářů');
        const allCalendars: Calendar[] = await res.json();
        
        // Filter calendars based on target names
        const matchingCalendars = allCalendars
          .filter(matchesTargetCalendar)
          .sort((a, b) => getTargetCalendarOrder(a) - getTargetCalendarOrder(b));
        const targetCals = matchingCalendars.length > 0 ? matchingCalendars : allCalendars;

        // Initialize state with loading for each calendar
        setCalendarsData(targetCals.map(cal => ({
          calendar: cal,
          events: [],
          loading: true,
          error: null
        })));

        // Fetch events for each calendar
        const dayStart = new Date(selectedDate);
        const dayEnd = new Date(selectedDate);
        dayEnd.setDate(dayEnd.getDate() + 1);

        await Promise.all(targetCals.map(async (cal) => {
          try {
            const eventsRes = await fetch(
              `/api/calendar/events?calendarId=${encodeURIComponent(cal.id)}&timeMin=${dayStart.toISOString()}&timeMax=${dayEnd.toISOString()}`
            );
            if (!eventsRes.ok) throw new Error('Nepodařilo se načíst události');
            const events: CalendarEvent[] = await eventsRes.json();
            
            setCalendarsData(prev => prev.map(data => 
              data.calendar.id === cal.id 
                ? { ...data, events, loading: false }
                : data
            ));
          } catch (err: any) {
            setCalendarsData(prev => prev.map(data => 
              data.calendar.id === cal.id 
                ? { ...data, loading: false, error: err.message }
                : data
            ));
          }
        }));

      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCalendars();
    
    // Listen for custom trigger from useGeminiLive
    const handleCalendarUpdate = () => {
      fetchCalendars();
    };
    window.addEventListener('calendarUpdated', handleCalendarUpdate);

    // Refresh every 5 minutes
    const interval = setInterval(fetchCalendars, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('calendarUpdated', handleCalendarUpdate);
      clearInterval(interval);
    };
  }, [isConnected, selectedDate]);

  if (!isConnected) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center text-zinc-500">
        <CalendarIcon className="w-12 h-12 mb-4 opacity-50" />
        <p>Pro zobrazení kalendářů se musíte připojit ke Google účtu.</p>
      </div>
    );
  }

  if (loading && calendarsData.length === 0) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center text-zinc-500">
        <Loader2 className="w-8 h-8 mb-4 animate-spin text-indigo-400" />
        <p>Načítám kalendáře...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 flex items-start gap-3 text-red-400">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-medium">Chyba při načítání</h3>
          <p className="text-sm opacity-80 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const formatTime = (dateString?: string) => {
    if (!dateString) return 'Celý den';
    return new Date(dateString).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  };

  const getVisibleEventLayout = (event: CalendarEvent) => {
    if (event.start.date || event.end.date) {
      return { visible: true, top: 0, height: 100 };
    }

    if (!event.start.dateTime || !event.end.dateTime) {
      return { visible: false, top: 0, height: 0 };
    }

    const visibleStart = new Date(selectedDate);
    visibleStart.setHours(DAY_START_HOUR, 0, 0, 0);
    const visibleEnd = new Date(selectedDate);
    visibleEnd.setHours(DAY_END_HOUR, 0, 0, 0);
    const eventStart = new Date(event.start.dateTime);
    const eventEnd = new Date(event.end.dateTime);

    if (eventEnd <= visibleStart || eventStart >= visibleEnd) {
      return { visible: false, top: 0, height: 0 };
    }

    const clippedStart = new Date(Math.max(eventStart.getTime(), visibleStart.getTime()));
    const clippedEnd = new Date(Math.min(eventEnd.getTime(), visibleEnd.getTime()));
    const startMinutes = (clippedStart.getTime() - visibleStart.getTime()) / 60000;
    const durationMinutes = Math.max(15, (clippedEnd.getTime() - clippedStart.getTime()) / 60000);

    return {
      visible: true,
      top: (startMinutes / (VISIBLE_HOURS * 60)) * 100,
      height: (durationMinutes / (VISIBLE_HOURS * 60)) * 100,
    };
  };

  const formatDateTimeInput = (dateString?: string, fallbackHour = 9) => {
    const date = dateString ? new Date(dateString) : new Date(selectedDate);
    if (!dateString) date.setHours(fallbackHour, 0, 0, 0);
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
  };

  const formatCompactDateTime = (dateTimeValue: string) => {
    if (!dateTimeValue) return '';

    const date = new Date(dateTimeValue);
    if (Number.isNaN(date.getTime())) return dateTimeValue;

    const pad = (value: number) => String(value).padStart(2, '0');
    const year = pad(date.getFullYear() % 100);
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${year} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const parseCompactDateTime = (value: string) => {
    const match = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})\s+(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const [, day, month, year, hour, minute] = match;
    const date = new Date(
      2000 + Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      0,
      0
    );

    if (Number.isNaN(date.getTime())) return null;
    return formatDateTimeInput(date.toISOString());
  };

  const shiftEditingTime = (field: 'start' | 'end', minutes: number) => {
    if (!editingEvent) return;

    const currentValue = editingEvent[field];
    const textField = field === 'start' ? 'startText' : 'endText';
    const date = currentValue ? new Date(currentValue) : new Date(selectedDate);
    if (!currentValue) date.setHours(field === 'start' ? 9 : 10, 0, 0, 0);
    date.setMinutes(date.getMinutes() + minutes);
    const shiftedValue = formatDateTimeInput(date.toISOString());

    setEditingEvent({
      ...editingEvent,
      [field]: shiftedValue,
      [textField]: formatCompactDateTime(shiftedValue),
    });
  };

  const updateEditingTimeText = (field: 'start' | 'end', value: string) => {
    if (!editingEvent) return;

    const textField = field === 'start' ? 'startText' : 'endText';
    const parsedValue = parseCompactDateTime(value);
    setEditingEvent({
      ...editingEvent,
      [textField]: value,
      ...(parsedValue ? { [field]: parsedValue } : {}),
    });
  };

  const normalizeEditingTimeText = (field: 'start' | 'end') => {
    if (!editingEvent) return;

    const textField = field === 'start' ? 'startText' : 'endText';
    const parsedValue = parseCompactDateTime(editingEvent[textField]);
    const normalizedValue = parsedValue || editingEvent[field];
    setEditingEvent({
      ...editingEvent,
      [field]: normalizedValue,
      [textField]: formatCompactDateTime(normalizedValue),
    });
  };

  const startEditing = (calendarId: string, event: CalendarEvent) => {
    const start = formatDateTimeInput(event.start.dateTime || event.start.date, 9);
    const end = formatDateTimeInput(event.end.dateTime || event.end.date, 10);

    setEditError(null);
    setEditingEvent({
      calendarId,
      eventId: event.id,
      summary: event.summary || '',
      description: event.description || '',
      start,
      end,
      startText: formatCompactDateTime(start),
      endText: formatCompactDateTime(end),
    });
  };

  const saveEditingEvent = async () => {
    if (!editingEvent) return;

    setSavingEventId(editingEvent.eventId);
    setEditError(null);
    try {
      const res = await fetch(`/api/calendar/events/${encodeURIComponent(editingEvent.eventId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calendarId: editingEvent.calendarId,
          summary: editingEvent.summary,
          description: editingEvent.description,
          start: editingEvent.start,
          end: editingEvent.end,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const updatedEvent: CalendarEvent = await res.json();

      setCalendarsData(prev => prev.map(data =>
        data.calendar.id === editingEvent.calendarId
          ? {
              ...data,
              events: data.events.map(event =>
                event.id === editingEvent.eventId ? updatedEvent : event
              ),
            }
          : data
      ));
      setEditingEvent(null);
      window.dispatchEvent(new CustomEvent('calendarUpdated'));
    } catch (err: any) {
      setEditError(err.message || 'Nepodařilo se uložit opravu.');
    } finally {
      setSavingEventId(null);
    }
  };

  const deleteEvent = async (calendarId: string, eventId: string) => {
    const confirmed = window.confirm('Smazat tuto událost z Google kalendáře?');
    if (!confirmed) return;

    setDeletingEventId(eventId);
    setEditError(null);
    try {
      const res = await fetch(
        `/api/calendar/events/${encodeURIComponent(eventId)}?calendarId=${encodeURIComponent(calendarId)}`,
        { method: 'DELETE' }
      );

      if (!res.ok) throw new Error(await res.text());

      setCalendarsData(prev => prev.map(data =>
        data.calendar.id === calendarId
          ? { ...data, events: data.events.filter(event => event.id !== eventId) }
          : data
      ));

      if (editingEvent?.eventId === eventId) {
        setEditingEvent(null);
      }
      window.dispatchEvent(new CustomEvent('calendarUpdated'));
    } catch (err: any) {
      setEditError(err.message || 'Nepodařilo se smazat událost.');
    } finally {
      setDeletingEventId(null);
    }
  };

  const changeDate = (days: number) => {
    setSelectedDate(prev => {
      const next = new Date(prev);
      next.setDate(next.getDate() + days);
      return next;
    });
  };

  const goToToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setSelectedDate(d);
  };

  const timelineGridTemplate = `4rem repeat(${Math.max(calendarsData.length, 1)}, minmax(9rem, 1fr))`;
  const editingCalendar = editingEvent
    ? calendarsData.find(data => data.calendar.id === editingEvent.calendarId)?.calendar
    : null;
  const getCalendarColor = (calendar: Calendar) => {
    const normalizedSummary = calendar.summary.toLowerCase();
    const overrideKey = Object.keys(CALENDAR_COLOR_OVERRIDES).find(name => normalizedSummary.includes(name));
    return overrideKey ? CALENDAR_COLOR_OVERRIDES[overrideKey] : (calendar.backgroundColor || '#6366f1');
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-indigo-400" />
          Přehled dne
        </h2>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-zinc-900/50 rounded-lg border border-zinc-800 p-1">
            <button 
              onClick={() => changeDate(-1)}
              className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={goToToday}
              className="px-3 py-1 text-sm font-medium hover:bg-zinc-800 rounded-md text-zinc-300 hover:text-zinc-100 transition-colors"
              title="Přejít na dnešek"
            >
              {selectedDate.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric' })}
            </button>
            <button 
              onClick={() => changeDate(1)}
              className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/40">
        {calendarsData.length === 0 && !loading ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-zinc-500">
            Google nevrátil žádný kalendář k vypsání.
          </div>
        ) : (
          <div className="flex h-full min-h-0 overflow-x-auto overflow-y-hidden">
            <div className="flex h-full min-w-[760px] flex-col">
              <div
                className="grid shrink-0 border-b border-zinc-800 bg-zinc-900/80"
                style={{ gridTemplateColumns: timelineGridTemplate }}
              >
                <div className="border-r border-zinc-800 px-2 py-3 text-[11px] font-medium uppercase text-zinc-500">
                  Čas
                </div>
                {calendarsData.map(({ calendar }) => (
                  <div
                    key={calendar.id}
                    className="min-w-0 border-r border-zinc-800 px-3 py-2"
                    style={{ borderTop: `3px solid ${getCalendarColor(calendar)}` }}
                  >
                    <h3 className="truncate text-sm font-medium text-zinc-100" title={calendar.summary}>
                      {calendar.summary}
                    </h3>
                  </div>
                ))}
              </div>

              <div
                className="grid h-full min-h-0 flex-1"
                style={{ gridTemplateColumns: timelineGridTemplate }}
              >
                <div className="relative h-full border-r border-zinc-800 bg-zinc-950/70">
                  {HOURS.map(hour => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-t border-zinc-800/80 pr-2 text-right text-[11px] text-zinc-500"
                      style={{ top: `${((hour - DAY_START_HOUR) / VISIBLE_HOURS) * 100}%` }}
                    >
                      {hour !== DAY_START_HOUR && hour !== DAY_END_HOUR && (
                        <span className="-translate-y-2.5 inline-block tabular-nums">{hour}:00</span>
                      )}
                    </div>
                  ))}
                </div>

                {calendarsData.map(({ calendar, events, loading, error }) => {
                  const calendarColor = getCalendarColor(calendar);
                  const visibleEvents = events
                    .map(event => ({ event, layout: getVisibleEventLayout(event) }))
                    .filter(({ layout }) => layout.visible);

                  return (
                    <div
                      key={calendar.id}
                      className="relative h-full border-r border-zinc-800/80"
                    >
                      {HOURS.map(hour => (
                        <div
                          key={hour}
                          className="absolute left-0 right-0 border-t border-zinc-800/60"
                          style={{ top: `${((hour - DAY_START_HOUR) / VISIBLE_HOURS) * 100}%` }}
                        />
                      ))}

                      {loading ? (
                        <div className="absolute inset-x-0 top-4 flex justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                        </div>
                      ) : error ? (
                        <div className="absolute inset-x-2 top-4 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-center text-xs text-red-400">
                          {error}
                        </div>
                      ) : visibleEvents.length === 0 ? (
                        <div className="absolute inset-x-2 top-4 text-center text-xs text-zinc-600">
                          Žádné události v tento den
                        </div>
                      ) : (
                        visibleEvents.map(({ event, layout }) => {
                          const isEditing = editingEvent?.eventId === event.id && editingEvent.calendarId === calendar.id;

                          return (
                            <div
                              key={event.id}
                              className={`absolute left-1.5 right-1.5 overflow-hidden rounded-lg border px-2 py-1.5 text-xs shadow-lg shadow-black/20 ${isEditing ? 'z-30 min-h-[15rem]' : 'z-10'}`}
                              style={{
                                top: `${layout.top}%`,
                                height: isEditing ? undefined : `${layout.height}%`,
                                minHeight: isEditing ? undefined : 44,
                                backgroundColor: `${calendarColor}66`,
                                borderColor: calendarColor,
                              }}
                            >
                              <div className="flex h-full min-h-0 items-start justify-between gap-1">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[11px] font-medium leading-tight text-zinc-100" title={event.summary || '(Bez názvu)'}>
                                    {event.summary || '(Bez názvu)'}
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-1 text-[10px] leading-tight text-zinc-200/80">
                                    <Clock className="h-2.5 w-2.5 shrink-0" />
                                    <span className="truncate">
                                      {event.start.date ? 'Celý den' : `${formatTime(event.start.dateTime)} - ${formatTime(event.end.dateTime)}`}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex shrink-0 flex-col items-center gap-0.5">
                                  <button
                                    onClick={() => startEditing(calendar.id, event)}
                                    className="rounded-md p-0.5 text-zinc-100/70 transition-colors hover:bg-black/20 hover:text-white"
                                    title="Opravit událost"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => deleteEvent(calendar.id, event.id)}
                                    disabled={deletingEventId === event.id}
                                    className="rounded-md p-0.5 text-zinc-100/70 transition-colors hover:bg-red-500/20 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    title="Smazat událost"
                                  >
                                    {deletingEventId === event.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              {isEditing && <div className="mt-1 text-[11px] font-medium text-zinc-100">Upravuje se...</div>}
                              {editError && <div className="mt-1 text-[11px] text-red-200">{editError}</div>}
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {editingEvent && (
          <div className="absolute right-4 top-16 z-50 w-[22rem] max-w-[calc(100%-2rem)] rounded-xl border border-zinc-700 bg-zinc-950/95 p-3 shadow-2xl shadow-black/40">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-100">Opravit událost</div>
                {editingCalendar && (
                  <div className="truncate text-xs text-zinc-500" title={editingCalendar.summary}>
                    {editingCalendar.summary}
                  </div>
                )}
              </div>
              <button
                onClick={() => setEditingEvent(null)}
                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                title="Zavřít"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <input
                id="calendar-event-summary"
                name="calendarEventSummary"
                value={editingEvent.summary}
                onChange={(e) => setEditingEvent({ ...editingEvent, summary: e.target.value })}
                autoComplete="off"
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-indigo-500"
                placeholder="Název události"
              />
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-stretch gap-1">
                  <input
                    id="calendar-event-start"
                    name="calendarEventStart"
                    type="text"
                    value={editingEvent.startText}
                    onChange={(e) => updateEditingTimeText('start', e.target.value)}
                    onBlur={() => normalizeEditingTimeText('start')}
                    autoComplete="off"
                    placeholder="dd.mm.rr hh:mm"
                    className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-indigo-500"
                  />
                  <div className="flex w-8 flex-col overflow-hidden rounded-md border border-zinc-700">
                    <button
                      type="button"
                      onClick={() => shiftEditingTime('start', 15)}
                      className="flex flex-1 items-center justify-center bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                      title="Začátek o 15 minut později"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => shiftEditingTime('start', -15)}
                      className="flex flex-1 items-center justify-center border-t border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                      title="Začátek o 15 minut dříve"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="flex items-stretch gap-1">
                  <input
                    id="calendar-event-end"
                    name="calendarEventEnd"
                    type="text"
                    value={editingEvent.endText}
                    onChange={(e) => updateEditingTimeText('end', e.target.value)}
                    onBlur={() => normalizeEditingTimeText('end')}
                    autoComplete="off"
                    placeholder="dd.mm.rr hh:mm"
                    className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-indigo-500"
                  />
                  <div className="flex w-8 flex-col overflow-hidden rounded-md border border-zinc-700">
                    <button
                      type="button"
                      onClick={() => shiftEditingTime('end', 15)}
                      className="flex flex-1 items-center justify-center bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                      title="Konec o 15 minut později"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => shiftEditingTime('end', -15)}
                      className="flex flex-1 items-center justify-center border-t border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                      title="Konec o 15 minut dříve"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
              <textarea
                id="calendar-event-description"
                name="calendarEventDescription"
                value={editingEvent.description}
                onChange={(e) => setEditingEvent({ ...editingEvent, description: e.target.value })}
                autoComplete="off"
                className="min-h-16 w-full resize-none rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-indigo-500"
                placeholder="Poznámka"
              />
              {editError && <div className="text-xs text-red-400">{editError}</div>}
              <div className="flex items-center gap-2">
                <button
                  onClick={saveEditingEvent}
                  disabled={savingEventId === editingEvent.eventId}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingEventId === editingEvent.eventId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Uložit
                </button>
                <button
                  onClick={() => setEditingEvent(null)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
                >
                  <X className="h-3 w-3" />
                  Zrušit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
