import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Type, Modality, LiveServerMessage } from '@google/genai';
import { AudioRecorder, AudioPlayer } from '../lib/audioUtils';
import { VideoRecorder } from '../lib/videoUtils';
import {
  formatBaxterAdvertResult,
  isBaxterAdvertRequest,
  resolveBaxterAdvertFromText,
  sendAdvertToBaxter,
} from '../lib/baxterAdvert';
import {
  FAMILY_CALENDAR_DISPLAY_NAMES,
  resolveFamilyCalendar,
} from '../lib/familyCalendars';

export interface ToolLog {
  id: string;
  name: string;
  args: any;
  result?: any;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  isStreaming?: boolean;
}

const GEMINI_LIVE_MODEL = "gemini-3.1-flash-live-preview";
const CALENDAR_TARGET_DESCRIPTION = `${FAMILY_CALENDAR_DISPLAY_NAMES.join(', ')} (aliasy: Vlada, Ulinka)`;
const JEEVES_VOICE_STORAGE_KEY = "jeeves.voiceName";
const BAXTER_MENTION_RE = /baxter/i;
const NETFLIX_MENTION_RE = /netflix/i;

export const JEEVES_VOICE_OPTIONS = [
  { name: "Sulafat", label: "Sulafat", tone: "teplý" },
  { name: "Achird", label: "Achird", tone: "přátelský" },
  { name: "Algieba", label: "Algieba", tone: "hladký" },
  { name: "Puck", label: "Puck", tone: "živý" },
  { name: "Kore", label: "Kore", tone: "pevný" },
  { name: "Charon", label: "Charon", tone: "věcný" },
] as const;

export type JeevesVoiceName = typeof JEEVES_VOICE_OPTIONS[number]["name"];

const getStoredVoiceName = (): JeevesVoiceName => {
  if (typeof window === "undefined") return "Sulafat";
  const storedVoiceName = window.localStorage.getItem(JEEVES_VOICE_STORAGE_KEY);
  return JEEVES_VOICE_OPTIONS.some(option => option.name === storedVoiceName)
    ? storedVoiceName as JeevesVoiceName
    : "Sulafat";
};

const JEEVES_SYSTEM_INSTRUCTION = [
  "Jsi Jeeves, vysoce schopný osobní AI asistent. Vidíš a slyšíš uživatele.",
  "Odpovídej vždy česky, přirozeně a klidně. Buď stručný, konkrétní a lidsky příjemný.",
  "Mluv jako spolehlivý komorník pro každodenní provoz domácnosti: teple, sebejistě, bez přehnaného nadšení a bez dlouhých úvodů.",
  "Když je odpověď jednoduchá, řekni jednu krátkou větu. Když je potřeba rozhodnutí nebo postup, nabídni nejvýše tři jasné body.",
  "Nepopisuj, že jsi AI model. Neopakuj zbytečně zadání. Ptej se jen tehdy, když bez doplnění nejde bezpečně pokračovat.",
  "Máš přístup k nástrojům: počasí, ovládání médií, YouTube vyhledávání/spuštění, spuštění Netflixu s vyhledáním konkrétního filmu, zobrazení odkazů v chatu a správa Google Kalendáře.",
  "Když chceš uživateli poslat nebo ukázat odkaz, vždy zavolej displayLink s kompletní URL včetně https://; můžeš k tomu krátce promluvit.",
  "Kdykoliv uživatel v hlasu nebo chatu zmíní Baxter, Baxtera nebo Baxterovi, otevři lokální aplikaci Baxter nástrojem openBaxter a stručně potvrď otevření.",
  "Když uživatel požádá o poslání, předání, zpracování nebo přípravu inzerátu Baxterovi, použij nástroj sendAdvertToBaxter. Pokud uživatel neřekne konkrétní URL, nech nástroj vybrat aktuální inzerát z výpisu.",
  "Když uživatel požádá 'pusť na YouTube', 'najdi na YouTube', 'zahraj', 'spusť skladbu' nebo podobně a uvede skladbu/interpreta, zavolej playYouTube s přesným vyhledávacím dotazem.",
  "Když uživatel požádá 'spusť Netflix', 'otevři Netflix', 'zapni Netflix' nebo podobně, zavolej openNetflix. Pokud řekne název filmu nebo seriálu, pošli ho v argumentu title.",
  "Když uživatel řekne 'Zavolej Shauna', 'zavolej šóna', 'česk šóna' nebo něco podobného, použij nástroj callShaun ke spuštění tréninkového videa.",
  "Pro počasí vždy použij getWeather; pokud uživatel neřekne jiné místo, předpokládej Kloten ve Švýcarsku.",
  "Pro získání seznamu kalendářů použij listCalendars.",
  "KALENDÁŘOVÉ PŘÍKAZY: Uživatel bude říkat jen 'create', 'delete' nebo 'edit'. Po příkazu následuje jméno cílového kalendáře Vladimir/Vlada, Ursula/Ulinka, Max, Avi nebo Beatrix a den/datum.",
  "Slovo create znamená vytvořit událost nástrojem addCalendarEvent. Slovo delete znamená najít událost v daném kalendáři a dni pomocí getCalendarEvents a potom ji smazat nástrojem deleteCalendarEvent.",
  "Slovo edit znamená najít událost v daném kalendáři a dni pomocí getCalendarEvents a potom ji změnit nástrojem editCalendarEvent.",
  "Jméno po příkazu vždy znamená kalendář, nikdy ho nepiš do názvu události. Do calendarId, calendarName nebo personName pošli toto jméno.",
  "Zbytek věty po jménu a dni použij jako obsah, popis nebo změnu události.",
  "ABSOLUTNÍ PRAVIDLO PRO KALENDÁŘ: Kdykoliv uživatel požádá o zápis, přidání, změnu nebo smazání události, pouze spusť příslušný nástroj a zůstaň zcela zticha.",
  "Nesmíš říct vůbec nic, ani 'hotovo', 'zapsal jsem' nebo 'rozumím' - na žádosti o úpravu kalendáře odpověz výhradně jen zavoláním nástroje a jinak mlč.",
].join("\n");

const startOfLocalDay = (date = new Date()) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

const hasExplicitTime = (value: unknown) =>
  typeof value === 'string' && /(?:T|\d{1,2}:\d{2})/.test(value);

const getCalendarQueryWindow = (args: any) => {
  const days = Math.max(1, Number(args.days || 1));
  const timeMin = args.timeMin ? new Date(args.timeMin) : startOfLocalDay();
  if (!args.timeMin || !hasExplicitTime(args.timeMin)) {
    timeMin.setHours(0, 0, 0, 0);
  }

  const timeMax = args.timeMax ? new Date(args.timeMax) : new Date(timeMin);
  if (args.timeMax && !hasExplicitTime(args.timeMax)) {
    timeMax.setHours(0, 0, 0, 0);
  }
  if (!args.timeMax || timeMax <= timeMin) {
    timeMax.setTime(timeMin.getTime());
    timeMax.setDate(timeMax.getDate() + days);
  }

  return { timeMin, timeMax };
};

const prepareCalendarEventArgs = async (args: any) => {
  const preparedArgs = { ...args };
  let familyCalendar = resolveFamilyCalendar(preparedArgs.calendarId)
    || resolveFamilyCalendar(preparedArgs.calendarName)
    || resolveFamilyCalendar(preparedArgs.personName);

  if (!familyCalendar && typeof preparedArgs.summary === 'string') {
    const [firstWord, ...rest] = preparedArgs.summary.trim().split(/\s+/);
    familyCalendar = resolveFamilyCalendar(firstWord);
    if (familyCalendar && rest.length > 0) {
      preparedArgs.summary = rest.join(' ');
    }
  }

  if (!familyCalendar) return preparedArgs;

  preparedArgs.calendarId = familyCalendar.calendarId;
  delete preparedArgs.calendarName;
  delete preparedArgs.personName;
  return preparedArgs;
};

const extractNetflixTitle = (text: string) => {
  const cleanText = text.trim();
  const patterns = [
    /(?:pusť|pust|spusť|spust|zapni|otevři|otevri|najdi|vyhledej)\s+(?:mi\s+)?(?:na\s+)?netflix(?:u)?\s+(?:film\s+|seriál\s+|serial\s+)?(.+)/i,
    /(?:pusť|pust|spusť|spust|zapni|otevři|otevri|najdi|vyhledej)\s+(?:mi\s+)?(?:film\s+|seriál\s+|serial\s+)?(.+?)\s+(?:na\s+)?netflix(?:u)?$/i,
    /netflix(?:u)?\s+(?:film\s+|seriál\s+|serial\s+)?(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanText.match(pattern);
    const title = match?.[1]
      ?.replace(/[.!?]+$/g, '')
      .trim();
    if (title) return title;
  }

  return "";
};

const buildNetflixUrl = (title?: string) => {
  const cleanTitle = String(title || "").trim().replace(/^film\s+/i, "").trim();
  if (!cleanTitle) {
    return { url: "https://www.netflix.com/browse", title: "" };
  }

  const url = new URL("https://www.netflix.com/search");
  url.searchParams.set("q", cleanTitle);
  return { url: url.toString(), title: cleanTitle };
};

const openNetflixInBrowser = (title?: string) => {
  const netflix = buildNetflixUrl(title);
  window.open(netflix.url, "_blank", "noopener,noreferrer");

  return {
    ...netflix,
    result: netflix.title
      ? `Otevřel jsem Netflix a vyhledal "${netflix.title}".`
      : "Otevřel jsem Netflix.",
  };
};

const openNetflixWithServerFallback = async (title?: string) => {
  try {
    const res = await fetch('/api/netflix/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || res.statusText);
    }

    return {
      url: String(data.url || buildNetflixUrl(title).url),
      title: String(data.title || title || ""),
      result: String(data.result || "Netflix byl otevřen."),
    };
  } catch {
    return openNetflixInBrowser(title);
  }
};

export function useGeminiLive() {
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [monthlyUsageCostUsd, setMonthlyUsageCostUsd] = useState(0);
  const [voiceName, setVoiceNameState] = useState<JeevesVoiceName>(getStoredVoiceName);
  
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioRecorder = useRef(new AudioRecorder());
  const audioPlayer = useRef(new AudioPlayer());
  const videoRecorder = useRef(new VideoRecorder());
  const aiRef = useRef<GoogleGenAI | null>(null);
  const currentInputTranscriptId = useRef<string | null>(null);
  const currentOutputTranscriptId = useRef<string | null>(null);
  const currentTextResponseId = useRef<string | null>(null);
  const currentInputTranscriptText = useRef('');
  const currentOutputTranscriptText = useRef('');
  const currentTextResponseText = useRef('');
  const usageSessionId = useRef('');
  const lastUsageSignature = useRef('');
  const speakingTimeoutRef = useRef<number | null>(null);
  const lastBaxterTriggerRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const lastBaxterAdvertTriggerRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const lastNetflixTriggerRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const lastUserCommandTextRef = useRef('');

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev.slice(-49), `${new Date().toLocaleTimeString()} - ${msg}`]);
  }, []);

  const createMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const clearSpeakingTimeout = () => {
    if (speakingTimeoutRef.current !== null) {
      window.clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }
  };

  const scheduleSpeakingEnd = () => {
    clearSpeakingTimeout();
    const queuedDurationMs = audioPlayer.current.getQueuedDurationMs();
    speakingTimeoutRef.current = window.setTimeout(() => {
      setIsSpeaking(false);
      speakingTimeoutRef.current = null;
    }, Math.max(500, queuedDurationMs + 350));
  };

  const setVoiceName = useCallback((nextVoiceName: JeevesVoiceName) => {
    setVoiceNameState(nextVoiceName);
    window.localStorage.setItem(JEEVES_VOICE_STORAGE_KEY, nextVoiceName);
  }, []);

  const mergeStreamText = (currentText: string, nextText: string) => {
    if (!currentText) return nextText;
    if (!nextText) return currentText;
    if (nextText.startsWith(currentText)) return nextText;
    if (currentText.endsWith(nextText)) return currentText;
    return `${currentText}${nextText}`;
  };

  const createUsageSessionId = () => `jeeves-live-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const refreshMonthlyUsage = useCallback(async () => {
    const res = await fetch('/api/usage/current-month');
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setMonthlyUsageCostUsd(Number(data.totalCostUsd || 0));
    return data;
  }, []);

  const recordUsageMetadata = useCallback(async (usageMetadata: any) => {
    if (!usageMetadata) return;
    if (!usageSessionId.current) usageSessionId.current = createUsageSessionId();

    const signature = JSON.stringify(usageMetadata);
    if (signature === lastUsageSignature.current) return;
    lastUsageSignature.current = signature;

    const res = await fetch('/api/usage/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: usageSessionId.current,
        model: GEMINI_LIVE_MODEL,
        usageMetadata,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    setMonthlyUsageCostUsd(Number(data.totalCostUsd || 0));
  }, []);

  useEffect(() => {
    refreshMonthlyUsage().catch((err) => addLog(`Mzdu se nepodařilo načíst: ${err.message || err}`));
  }, [addLog, refreshMonthlyUsage]);

  const addChatMessage = useCallback((role: ChatMessage['role'], text: string, isStreaming = false) => {
    const trimmedText = text.trim();
    if (!trimmedText) return null;

    const id = createMessageId();
    setChatMessages(prev => [...prev.slice(-79), {
      id,
      role,
      text: trimmedText,
      timestamp: Date.now(),
      isStreaming
    }]);
    return id;
  }, []);

  useEffect(() => {
    const handleSent = (event: Event) => {
      const message = (event as CustomEvent).detail?.message;
      if (message) {
        addChatMessage('assistant', String(message));
        addLog('Inzerát byl předán Baxterovi.');
      }
    };
    const handleError = (event: Event) => {
      const message = (event as CustomEvent).detail?.message;
      if (message) {
        addChatMessage('assistant', String(message));
        addLog(String(message));
      }
    };

    window.addEventListener('jeeves:baxter-advert-sent', handleSent);
    window.addEventListener('jeeves:baxter-advert-error', handleError);
    return () => {
      window.removeEventListener('jeeves:baxter-advert-sent', handleSent);
      window.removeEventListener('jeeves:baxter-advert-error', handleError);
    };
  }, [addChatMessage, addLog]);

  const sendAdvertToBaxterIfRequested = useCallback((text: string) => {
    const cleanText = text.trim();
    if (!isBaxterAdvertRequest(cleanText)) return false;

    const normalizedText = cleanText.toLowerCase();
    const now = Date.now();
    if (
      lastBaxterAdvertTriggerRef.current.text === normalizedText &&
      now - lastBaxterAdvertTriggerRef.current.time < 5000
    ) {
      return true;
    }

    const vacancy = resolveBaxterAdvertFromText(cleanText);
    if (!vacancy) {
      addChatMessage('assistant', 'Nenašel jsem v aktuálním výpisu inzerát, který bych mohl poslat Baxterovi.');
      addLog('Inzerát pro Baxtera nebyl nalezen.');
      return true;
    }

    lastBaxterAdvertTriggerRef.current = { text: normalizedText, time: now };
    sendAdvertToBaxter(vacancy)
      .then((data) => {
        const message = formatBaxterAdvertResult(data, vacancy);
        addChatMessage('assistant', message);
        addLog('Inzerát byl předán Baxterovi.');
      })
      .catch((err: any) => {
        const message = `Baxter inzerát nepřijal: ${err.message || err}`;
        addChatMessage('assistant', message);
        addLog(message);
      });

    return true;
  }, [addChatMessage, addLog]);

  const openBaxterIfMentioned = useCallback((text: string) => {
    const cleanText = text.trim();
    if (!BAXTER_MENTION_RE.test(cleanText)) return false;

    const normalizedText = cleanText.toLowerCase();
    const now = Date.now();
    if (
      lastBaxterTriggerRef.current.text === normalizedText &&
      now - lastBaxterTriggerRef.current.time < 5000
    ) {
      return true;
    }

    lastBaxterTriggerRef.current = { text: normalizedText, time: now };
    fetch('/api/baxter/open', { method: 'POST' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || res.statusText);
        }
        addChatMessage('assistant', data.result || 'Baxter byl otevřen.');
        addLog(data.result || 'Baxter byl otevřen.');
      })
      .catch((err: any) => {
        const message = `Baxtera se nepodařilo otevřít: ${err.message || err}`;
        addChatMessage('assistant', message);
        addLog(message);
      });

    return true;
  }, [addChatMessage, addLog]);

  const openNetflixIfRequested = useCallback((text: string) => {
    const cleanText = text.trim();
    if (!NETFLIX_MENTION_RE.test(cleanText)) return false;

    const normalizedText = cleanText.toLowerCase();
    const now = Date.now();
    if (
      lastNetflixTriggerRef.current.text === normalizedText &&
      now - lastNetflixTriggerRef.current.time < 5000
    ) {
      return true;
    }

    lastNetflixTriggerRef.current = { text: normalizedText, time: now };
    openNetflixWithServerFallback(extractNetflixTitle(cleanText))
      .then((data) => {
        addChatMessage('assistant', [data.result, data.url].filter(Boolean).join('\n'));
        addLog(data.result);
      })
      .catch((err: any) => {
        const message = `Netflix se nepodařilo otevřít: ${err.message || err}`;
        addChatMessage('assistant', message);
        addLog(message);
      });

    return true;
  }, [addChatMessage, addLog]);

  const updateStreamingMessage = useCallback((id: string, text: string, isStreaming: boolean) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    setChatMessages(prev => prev.map(message => (
      message.id === id
        ? { ...message, text: cleanText, isStreaming, timestamp: Date.now() }
        : message
    )));
  }, []);

  const sendTextMessage = useCallback((text: string) => {
    const cleanText = text.trim();
    if (!cleanText) return false;

    const isBaxterRequest = BAXTER_MENTION_RE.test(cleanText);
    const isNetflixRequest = NETFLIX_MENTION_RE.test(cleanText);
    if (!sessionPromiseRef.current && !isBaxterRequest && !isNetflixRequest) return false;

    lastUserCommandTextRef.current = cleanText;
    addChatMessage('user', cleanText);
    const sentAdvertToBaxter = sendAdvertToBaxterIfRequested(cleanText);
    const openedBaxter = sentAdvertToBaxter ? true : openBaxterIfMentioned(cleanText);

    if (!sessionPromiseRef.current) {
      if (!openedBaxter) openNetflixIfRequested(cleanText);
      return true;
    }

    sessionPromiseRef.current.then((session: any) => {
      session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: cleanText }] }],
        turnComplete: true
      });
    }).catch((err: any) => addLog(`Zprávu se nepodařilo odeslat: ${err.message || err}`));

    return true;
  }, [addChatMessage, addLog, openBaxterIfMentioned, openNetflixIfRequested, sendAdvertToBaxterIfRequested]);

  const connect = async () => {
    try {
      if (!aiRef.current) {
        aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      }
      
      audioPlayer.current.init();
      usageSessionId.current = createUsageSessionId();
      lastUsageSignature.current = '';

      const sessionPromise = aiRef.current.live.connect({
        model: GEMINI_LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          },
          systemInstruction: JEEVES_SYSTEM_INSTRUCTION,
          tools: [{
            functionDeclarations: [
              {
                name: "displayLink",
                description: "Zobrazí uživateli klikací odkaz v chatovacím okně.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    url: { type: Type.STRING, description: "Kompletní URL odkazu, včetně https:// nebo http://" },
                    title: { type: Type.STRING, description: "Krátký název odkazu (volitelné)" },
                    description: { type: Type.STRING, description: "Jedna krátká věta k odkazu (volitelné)" }
                  },
                  required: ["url"]
                }
              },
              {
                name: "getWeather",
                description: "Získej aktuální počasí z norského MET Norway API. Pokud uživatel nespecifikuje lokaci, použij Kloten ve Švýcarsku.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    location: { type: Type.STRING, description: "Název města. Výchozí hodnota je Kloten, Švýcarsko." }
                  }
                }
              },
              {
                name: "controlMedia",
                description: "Ovládej přehrávání médií (play, pause, next, prev).",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    action: { type: Type.STRING, description: "Akce k provedení: play, pause, next, prev" }
                  },
                  required: ["action"]
                }
              },
              {
                name: "playYouTube",
                description: "Najde na YouTube požadovanou skladbu, interpreta nebo video a pokusí se otevřít první výsledek přímo ke spuštění.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    query: { type: Type.STRING, description: "Přesný vyhledávací dotaz pro YouTube, například název skladby a interpret." }
                  },
                  required: ["query"]
                }
              },
              {
                name: "openNetflix",
                description: "Otevře Netflix v prohlížeči. Pokud je zadán název filmu nebo seriálu, otevře Netflix vyhledávání s tímto názvem.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: "Název filmu nebo seriálu, který má Netflix vyhledat." }
                  }
                }
              },
              {
                name: "openBaxter",
                description: "Otevře lokální aplikaci Baxter na tomto počítači. Použij okamžitě při zmínce Baxter, Baxtera nebo Baxterovi.",
                parameters: { type: Type.OBJECT, properties: {} }
              },
              {
                name: "callShaun",
                description: "Spustí video se Shaunem (Max Out Sweat). Použij když uživatel řekne 'Zavolej Shauna' nebo 'zavolej šóna' nebo 'česk šóna'.",
                parameters: { type: Type.OBJECT, properties: {} }
              },
              {
                name: "sendAdvertToBaxter",
                description: "Pošle URL pracovního inzerátu Baxterovi, aby připravil odpověď/žádost. Když URL chybí, Jeeves vybere aktuální inzerát z výpisu podle posledního pokynu uživatele.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    url: { type: Type.STRING, description: "Kompletní URL inzerátu, pokud ji uživatel řekl nebo napsal." }
                  }
                }
              },
              {
                name: "listCalendars",
                description: "Vypíše všechny dostupné kalendáře uživatele (včetně podkalendářů). Vrátí jejich ID a názvy.",
                parameters: { type: Type.OBJECT, properties: {} }
              },
              {
                name: "getCalendarEvents",
                description: "Získá události z kalendáře. Pro příkazy delete/edit použij jméno kalendáře a den z řeči uživatele.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    calendarId: { type: Type.STRING, description: `ID kalendáře nebo jméno cílového kalendáře: ${CALENDAR_TARGET_DESCRIPTION}.` },
                    calendarName: { type: Type.STRING, description: `Jméno cílového kalendáře, pokud je známo: ${CALENDAR_TARGET_DESCRIPTION}.` },
                    personName: { type: Type.STRING, description: `Jméno osoby/cílového kalendáře, pokud je známo: ${CALENDAR_TARGET_DESCRIPTION}.` },
                    timeMin: { type: Type.STRING, description: "Začátek hledaného dne/období v ISO 8601 formátu." },
                    timeMax: { type: Type.STRING, description: "Konec hledaného dne/období v ISO 8601 formátu." },
                    days: { type: Type.NUMBER, description: "Počet dní dopředu, pokud nejsou zadány timeMin/timeMax." }
                  }
                }
              },
              {
                name: "addCalendarEvent",
                description: "Přidá novou událost do kalendáře.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    summary: { type: Type.STRING, description: "Název události" },
                    start: { type: Type.STRING, description: "Začátek události (ISO 8601 formát, např. 2026-03-30T15:00:00Z)" },
                    end: { type: Type.STRING, description: "Konec události (ISO 8601 formát)" },
                    calendarId: { type: Type.STRING, description: `ID kalendáře nebo jméno cílového kalendáře: ${CALENDAR_TARGET_DESCRIPTION}. Pokud uživatel řekne toto jméno po 'vytvoř událost', použij ho zde a nepiš ho do názvu události.` },
                    calendarName: { type: Type.STRING, description: `Jméno cílového kalendáře, pokud je známo: ${CALENDAR_TARGET_DESCRIPTION}.` },
                    personName: { type: Type.STRING, description: `Jméno osoby/cílového kalendáře, pokud je známo: ${CALENDAR_TARGET_DESCRIPTION}.` },
                    description: { type: Type.STRING, description: "Popis události (volitelné)" }
                  },
                  required: ["summary", "start", "end"]
                }
              },
              {
                name: "deleteCalendarEvent",
                description: "Smaže událost z kalendáře podle jejího ID. Pro hlasový příkaz 'delete Vladimir/Vlada/Ursula/Ulinka/Max/Avi/Beatrix den ...' nejdřív najdi správnou událost pomocí getCalendarEvents.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    eventId: { type: Type.STRING, description: "ID události, kterou chceš smazat" },
                    calendarId: { type: Type.STRING, description: `ID kalendáře nebo jméno cílového kalendáře: ${CALENDAR_TARGET_DESCRIPTION}.` },
                    calendarName: { type: Type.STRING, description: `Jméno cílového kalendáře, pokud je známo: ${CALENDAR_TARGET_DESCRIPTION}.` },
                    personName: { type: Type.STRING, description: `Jméno osoby/cílového kalendáře, pokud je známo: ${CALENDAR_TARGET_DESCRIPTION}.` }
                  },
                  required: ["eventId"]
                }
              },
              {
                name: "editCalendarEvent",
                description: "Upraví existující událost v Google kalendáři. Pro hlasový příkaz 'edit Vladimir/Vlada/Ursula/Ulinka/Max/Avi/Beatrix den ...' nejdřív najdi správnou událost pomocí getCalendarEvents a potom pošli změněná pole sem.",
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    eventId: { type: Type.STRING, description: "ID události, kterou chceš upravit" },
                    calendarId: { type: Type.STRING, description: `ID kalendáře nebo jméno cílového kalendáře: ${CALENDAR_TARGET_DESCRIPTION}.` },
                    calendarName: { type: Type.STRING, description: `Jméno cílového kalendáře, pokud je známo: ${CALENDAR_TARGET_DESCRIPTION}.` },
                    personName: { type: Type.STRING, description: `Jméno osoby/cílového kalendáře, pokud je známo: ${CALENDAR_TARGET_DESCRIPTION}.` },
                    summary: { type: Type.STRING, description: "Nový název události, pokud se má změnit." },
                    start: { type: Type.STRING, description: "Nový začátek události v ISO 8601 formátu, pokud se má změnit." },
                    end: { type: Type.STRING, description: "Nový konec události v ISO 8601 formátu, pokud se má změnit." },
                    description: { type: Type.STRING, description: "Nový popis události, pokud se má změnit." }
                  },
                  required: ["eventId"]
                }
              }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            addLog("Připojeno k Gemini Live.");
            
            audioRecorder.current.start((base64) => {
              sessionPromise.then(session => {
                session.sendRealtimeInput({
                  audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
                });
              }).catch((err: any) => {
                addLog(`Audio se nepodařilo odeslat: ${err.message || err}`);
                audioRecorder.current.stop();
              });
            }).catch(err => addLog(`Chyba mikrofonu: ${err.message}`));

            videoRecorder.current.start((base64) => {
              sessionPromise.then(session => {
                session.sendRealtimeInput({
                  video: { data: base64, mimeType: 'image/jpeg' }
                });
              }).catch((err: any) => {
                addLog(`Video se nepodařilo odeslat: ${err.message || err}`);
                videoRecorder.current.stop();
              });
            }).catch(err => addLog(`Chyba kamery: ${err.message}`));
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.usageMetadata) {
              recordUsageMetadata(message.usageMetadata)
                .catch((err) => addLog(`Mzdu se nepodařilo uložit: ${err.message || err}`));
            }
            if (message.serverContent?.modelTurn) {
              setIsSpeaking(true);
              const parts = message.serverContent.modelTurn.parts;
              for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                  audioPlayer.current.play(part.inlineData.data);
                }
                if (part.text) {
                  currentTextResponseText.current = mergeStreamText(currentTextResponseText.current, part.text);
                  if (!currentTextResponseId.current) {
                    currentTextResponseId.current = addChatMessage('assistant', currentTextResponseText.current, true);
                  } else {
                    updateStreamingMessage(currentTextResponseId.current, currentTextResponseText.current, true);
                  }
                }
              }
              scheduleSpeakingEnd();
            }
            if (message.serverContent?.inputTranscription?.text) {
              const transcript = message.serverContent.inputTranscription;
              currentInputTranscriptText.current = mergeStreamText(currentInputTranscriptText.current, transcript.text);
              if (!currentInputTranscriptId.current) {
                currentInputTranscriptId.current = addChatMessage('user', currentInputTranscriptText.current, !transcript.finished);
              } else {
                updateStreamingMessage(currentInputTranscriptId.current, currentInputTranscriptText.current, !transcript.finished);
              }
              if (transcript.finished) {
                lastUserCommandTextRef.current = currentInputTranscriptText.current;
                if (!sendAdvertToBaxterIfRequested(currentInputTranscriptText.current)) {
                  openBaxterIfMentioned(currentInputTranscriptText.current);
                }
                currentInputTranscriptId.current = null;
                currentInputTranscriptText.current = '';
              }
            }
            if (message.serverContent?.outputTranscription?.text) {
              const transcript = message.serverContent.outputTranscription;
              currentOutputTranscriptText.current = mergeStreamText(currentOutputTranscriptText.current, transcript.text);
              if (!currentOutputTranscriptId.current) {
                currentOutputTranscriptId.current = addChatMessage('assistant', currentOutputTranscriptText.current, !transcript.finished);
              } else {
                updateStreamingMessage(currentOutputTranscriptId.current, currentOutputTranscriptText.current, !transcript.finished);
              }
              if (transcript.finished) {
                currentOutputTranscriptId.current = null;
                currentOutputTranscriptText.current = '';
              }
            }
            if (message.serverContent?.turnComplete) {
              if (currentTextResponseId.current) {
                setChatMessages(prev => prev.map(message => (
                  message.id === currentTextResponseId.current
                    ? { ...message, isStreaming: false }
                    : message
                )));
                currentTextResponseId.current = null;
                currentTextResponseText.current = '';
              }
            }
            if (message.serverContent?.interrupted) {
              audioPlayer.current.clearQueue();
              clearSpeakingTimeout();
              setIsSpeaking(false);
              currentOutputTranscriptId.current = null;
              currentTextResponseId.current = null;
              currentOutputTranscriptText.current = '';
              currentTextResponseText.current = '';
              addLog("Přerušeno uživatelem.");
            }
            if (message.toolCall) {
              const calls = message.toolCall.functionCalls;
              if (calls) {
                const responses: any[] = [];
                for (const call of calls) {
                  const logEntry: ToolLog = {
                    id: call.id,
                    name: call.name,
                    args: call.args,
                    timestamp: Date.now()
                  };
                  
                  let resultStr = "";
                  try {
                    if (call.name === "displayLink") {
                      const rawUrl = String(call.args.url || '').trim();
                      const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
                      const title = String(call.args.title || 'Odkaz').trim();
                      const description = String(call.args.description || '').trim();
                      addChatMessage('assistant', [title, description, url].filter(Boolean).join('\n'));
                      resultStr = "Odkaz byl zobrazen v chatu.";
                    } else if (call.name === "getWeather") {
                      const location = String(call.args.location || '').trim();
                      const res = await fetch(`/api/weather${location ? `?location=${encodeURIComponent(location)}` : ''}`);
                      if (!res.ok) throw new Error(await res.text());
                      const data = await res.json();
                      const parts = [
                        `Počasí: ${data.location}`,
                        data.temperature !== undefined ? `teplota ${data.temperature} °C` : null,
                        data.symbol ? `stav ${String(data.symbol).replace(/_/g, ' ')}` : null,
                        data.precipitation !== undefined ? `srážky ${data.precipitation} mm za hodinu` : null,
                        data.windSpeed !== undefined ? `vítr ${data.windSpeed} m/s` : null,
                        data.humidity !== undefined ? `vlhkost ${data.humidity} %` : null,
                      ].filter(Boolean);
                      resultStr = parts.join(', ') + '.';
                    } else if (call.name === "controlMedia") {
                      resultStr = `Akce médií '${call.args.action}' byla provedena.`;
                    } else if (call.name === "playYouTube") {
                      const query = String(call.args.query || '').trim();
                      if (!query) throw new Error("Chybí název skladby nebo vyhledávací dotaz.");

                      const fallbackUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
                      const res = await fetch(`/api/youtube/play?q=${encodeURIComponent(query)}`);
                      const data = res.ok ? await res.json() : { url: fallbackUrl, direct: false };
                      const url = data.url || fallbackUrl;
                      window.open(url, '_blank', 'noopener,noreferrer');
                      addChatMessage('assistant', `YouTube\n${query}\n${url}`);
                      resultStr = data.direct
                        ? `První YouTube výsledek pro "${query}" byl otevřen ke spuštění.`
                        : `YouTube vyhledávání pro "${query}" bylo otevřeno.`;
                    } else if (call.name === "openNetflix") {
                      const title = String(call.args.title || '').trim();
                      const data = await openNetflixWithServerFallback(title);
                      resultStr = data.result;
                      addChatMessage('assistant', [resultStr, data.url].filter(Boolean).join('\n'));
                    } else if (call.name === "openBaxter") {
                      const res = await fetch('/api/baxter/open', { method: 'POST' });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok || data.success === false) {
                        throw new Error(data.error || res.statusText);
                      }
                      resultStr = data.result || "Baxter byl otevřen.";
                      addChatMessage('assistant', resultStr);
                    } else if (call.name === "callShaun") {
                      const res = await fetch('/api/video/shaun', { method: 'POST' });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok || data.success === false) {
                        throw new Error(data.error || res.statusText);
                      }
                      resultStr = data.result || "Video se Shaunem bylo spuštěno.";
                      addChatMessage('assistant', resultStr);
                    } else if (call.name === "sendAdvertToBaxter") {
                      const url = String(call.args.url || '').trim();
                      const vacancy = url
                        ? { id: url, title: 'Inzerát', url }
                        : resolveBaxterAdvertFromText(lastUserCommandTextRef.current);
                      if (!vacancy) {
                        throw new Error("Nenašel jsem v aktuálním výpisu inzerát pro Baxtera.");
                      }

                      const data = await sendAdvertToBaxter(vacancy);
                      resultStr = formatBaxterAdvertResult(data, vacancy);
                      addChatMessage('assistant', resultStr);
                    } else if (call.name === "listCalendars") {
                      const res = await fetch('/api/calendar/list');
                      if (!res.ok) throw new Error(await res.text());
                      const data = await res.json();
                      resultStr = JSON.stringify(data.map((c: any) => ({ id: c.id, summary: c.summary })));
                    } else if (call.name === "getCalendarEvents") {
                      const eventArgs = await prepareCalendarEventArgs(call.args);
                      const { calendarId = "primary" } = eventArgs;
                      const { timeMin, timeMax } = getCalendarQueryWindow(eventArgs);
                      const res = await fetch(`/api/calendar/events?calendarId=${encodeURIComponent(String(calendarId))}&timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}`);
                      if (!res.ok) throw new Error(await res.text());
                      const data = await res.json();
                      resultStr = JSON.stringify(data.map((e: any) => ({ id: e.id, summary: e.summary, start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date })));
                    } else if (call.name === "addCalendarEvent") {
                      const eventArgs = await prepareCalendarEventArgs(call.args);
                      const res = await fetch('/api/calendar/events', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(eventArgs)
                      });
                      if (!res.ok) throw new Error(await res.text());
                      resultStr = "Událost byla úspěšně vytvořena.";
                      window.dispatchEvent(new CustomEvent('calendarUpdated'));
                    } else if (call.name === "deleteCalendarEvent") {
                      const eventArgs = await prepareCalendarEventArgs(call.args);
                      const { eventId, calendarId = "primary" } = eventArgs;
                      const res = await fetch(`/api/calendar/events/${encodeURIComponent(String(eventId))}?calendarId=${encodeURIComponent(String(calendarId))}`, {
                        method: 'DELETE'
                      });
                      if (!res.ok) throw new Error(await res.text());
                      resultStr = "Událost byla úspěšně smazána.";
                      window.dispatchEvent(new CustomEvent('calendarUpdated'));
                    } else if (call.name === "editCalendarEvent") {
                      const eventArgs = await prepareCalendarEventArgs(call.args);
                      const { eventId } = eventArgs;
                      const res = await fetch(`/api/calendar/events/${encodeURIComponent(String(eventId))}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(eventArgs)
                      });
                      if (!res.ok) throw new Error(await res.text());
                      resultStr = "Událost byla úspěšně upravena.";
                      window.dispatchEvent(new CustomEvent('calendarUpdated'));
                    } else {
                      resultStr = "Neznámý nástroj.";
                    }
                  } catch (e: any) {
                    resultStr = `Chyba při volání nástroje: ${e.message}`;
                  }
                  
                  logEntry.result = resultStr;
                  setToolLogs(prev => [logEntry, ...prev].slice(0, 10));
                  addLog(`Spuštěn nástroj: ${call.name}`);
                  
                  responses.push({
                    id: call.id,
                    name: call.name,
                    response: { result: resultStr }
                  });
                }
                sessionPromiseRef.current?.then((session: any) => {
                  session.sendToolResponse({ functionResponses: responses });
                });
              }
            }
          },
          onclose: () => {
            setIsConnected(false);
            clearSpeakingTimeout();
            setIsSpeaking(false);
            addLog("Odpojeno.");
            audioRecorder.current.stop();
            videoRecorder.current.stop();
            audioPlayer.current.stop();
          },
          onerror: (err: any) => {
            addLog(`Chyba: ${err.message || err}`);
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (err: any) {
      addLog(`Nepodařilo se připojit: ${err.message}`);
    }
  };

  const disconnect = () => {
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then((session: any) => session.close());
      sessionPromiseRef.current = null;
    }
    audioRecorder.current.stop();
    videoRecorder.current.stop();
    audioPlayer.current.stop();
    clearSpeakingTimeout();
    currentInputTranscriptId.current = null;
    currentOutputTranscriptId.current = null;
    currentTextResponseId.current = null;
    currentInputTranscriptText.current = '';
    currentOutputTranscriptText.current = '';
    currentTextResponseText.current = '';
    setIsSpeaking(false);
    setIsConnected(false);
  };

  return {
    isConnected,
    isSpeaking,
    connect,
    disconnect,
    logs,
    toolLogs,
    chatMessages,
    monthlyUsageCostUsd,
    sendTextMessage,
    voiceName,
    setVoiceName,
    voiceOptions: JEEVES_VOICE_OPTIONS,
    videoRecorder: videoRecorder.current
  };
}
