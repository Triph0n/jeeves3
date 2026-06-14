import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import { createRequire } from "module";
import * as cheerio from "cheerio";
import { spawn } from "child_process";
import { resolveFamilyCalendar } from "./src/lib/familyCalendars";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const TOKEN_DIR = path.join(process.cwd(), ".auth");
const TOKEN_FILE = path.join(TOKEN_DIR, "google-calendar-token.json");
const USAGE_DB_FILE = path.join(TOKEN_DIR, "jeeves-usage.sqlite");
const DISCORD_BOT_LOG_FILE = path.join(TOKEN_DIR, "discord-bot-log.json");
const DISCORD_ALERT_FILE = path.join(TOKEN_DIR, "discord-message-alerts.json");
const GMAIL_BRIEF_FILE = path.join(TOKEN_DIR, "baxter-gmail-briefs.json");
const GMAIL_LOW_PRIORITY_SENDERS_FILE = path.join(TOKEN_DIR, "baxter-gmail-low-priority-senders.json");
const GMAIL_TRIAGE_STATE_FILE = path.join(TOKEN_DIR, "baxter-gmail-triage-state.json");
const MET_ARTWORK_CACHE_FILE = path.join(TOKEN_DIR, "met-artwork-of-the-day.json");
const DEFAULT_WEATHER_LOCATION = {
  name: "Kloten, Švýcarsko",
  latitude: 47.4515,
  longitude: 8.5849,
};
const MET_USER_AGENT = "Jeeves 3.0 weather widget/1.0";
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const USAGE_TIME_ZONE = process.env.JEEVES_USAGE_TIME_ZONE || "Europe/Zurich";
const GOOGLE_CALENDAR_TIME_ZONE = process.env.JEEVES_CALENDAR_TIME_ZONE || "Europe/Prague";
const GOOGLE_CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const REQUIRED_GOOGLE_CALENDAR_SCOPES = [
  GOOGLE_CALENDAR_READONLY_SCOPE,
  GOOGLE_CALENDAR_EVENTS_SCOPE,
];
const CELLO_TERMS = ["cello", "violoncello", "violoncelle", "violoncelo"];
const MKZ_JOBS_URL = "https://www.stadt-zuerich.ch/mkz/de/ueber-mkz/jobs.html?search=q%3D%26stellentyp%3D%26dienstabteilung%3DMusikschule%2BKonservatorium%2BZ%25C3%25BCrich%26beschaeftigungsgrad%3D%26lang%3Dde%26compResource%3D%252Fcontent%252Fbetriebssites%252Fmkz%252Fde%252Fueber-mkz%252Fjobs%252Fjcr%253Acontent%252Fmainparsys%252Fjobsearch%26variant%3Ddefault%26limit%3D1";
const DISCORD_LISTING_URL = "https://discord.com/channels/@me/1505505323723788329/1505854691026927686";
const DISCORD_LISTING_CHANNEL_ID = "1505505323723788329";
const DISCORD_LISTING_MESSAGE_ID = "1505854691026927686";
const MET_COLLECTION_API_URL = "https://collectionapi.metmuseum.org/public/collection/v1";
const ARTWORK_OF_THE_DAY_TIME_ZONE = process.env.JEEVES_ARTWORK_TIME_ZONE || "Europe/Zurich";
const AGATHA_TIME_ZONE = process.env.JEEVES_AGATHA_TIME_ZONE || "Asia/Jerusalem";
const AGATHA_VERB_SOURCE_URL = "file:///C:/Users/Vladimir/Downloads/2878-nejfrekventovanejsi-nepravidelna-slovesa.pdf";
const NETFLIX_BROWSE_URL = "https://www.netflix.com/browse";
const NETFLIX_SEARCH_URL = "https://www.netflix.com/search";
const NETFLIX_PROFILES_GATE_URL = "https://www.netflix.com/ProfilesGate";
const NETFLIX_SWITCH_PROFILE_URL = "https://www.netflix.com/SwitchProfile";
const NETFLIX_PROFILE_NAME = process.env.NETFLIX_PROFILE_NAME || "V";
const NETFLIX_PROFILE_TOKEN = process.env.NETFLIX_PROFILE_TOKEN || "";
const BAXTER_URL = "http://127.0.0.1:8765";
const BAXTER_HEALTH_URL = `${BAXTER_URL}/api/health`;
const BAXTER_ROOT = path.join(process.cwd(), "Baxter");
const BAXTER_PYTHON = path.join(BAXTER_ROOT, ".venv", "Scripts", "python.exe");
type AgathaCatalogVerb = {
  id: string;
  infinitive: string;
  translationCs: string;
  present3?: string;
  preterite: string;
  perfect: string;
  example?: string;
};
type AgathaB2LessonTemplate = {
  week: number;
  day: number;
  theme: string;
  target: string;
  inputText: string;
  questions: string[];
  phrases: string[];
  grammarFocus: string;
  outputTask: string;
  transferTask: string;
};
const AGATHA_PDF_VERBS: AgathaCatalogVerb[] = [
  { id: "backen", infinitive: "backen", preterite: "backte", perfect: "hat gebacken", translationCs: "péct" },
  { id: "beginnen", infinitive: "beginnen", preterite: "begann", perfect: "hat begonnen", translationCs: "začít" },
  { id: "bieten", infinitive: "bieten", preterite: "bot", perfect: "hat geboten", translationCs: "nabídnout, nabízet" },
  { id: "bitten", infinitive: "bitten", preterite: "bat", perfect: "hat gebeten", translationCs: "prosit" },
  { id: "bleiben", infinitive: "bleiben", preterite: "blieb", perfect: "ist geblieben", translationCs: "zůstat" },
  { id: "bringen", infinitive: "bringen", preterite: "brachte", perfect: "hat gebracht", translationCs: "přinést, zavést" },
  { id: "denken", infinitive: "denken", preterite: "dachte", perfect: "hat gedacht", translationCs: "myslet" },
  { id: "empfehlen", infinitive: "empfehlen", preterite: "empfahl", perfect: "hat empfohlen", translationCs: "doporučit" },
  { id: "essen", infinitive: "essen", preterite: "aß", perfect: "hat gegessen", translationCs: "jíst" },
  { id: "fahren", infinitive: "fahren", preterite: "fuhr", perfect: "ist gefahren", translationCs: "jet" },
  { id: "fallen", infinitive: "fallen", preterite: "fiel", perfect: "ist gefallen", translationCs: "padat, spadnout" },
  { id: "finden", infinitive: "finden", preterite: "fand", perfect: "hat gefunden", translationCs: "najít, shledávat" },
  { id: "fliegen", infinitive: "fliegen", preterite: "flog", perfect: "ist geflogen", translationCs: "letět" },
  { id: "frieren", infinitive: "frieren", preterite: "fror", perfect: "hat gefroren", translationCs: "mrznout" },
  { id: "geben", infinitive: "geben", preterite: "gab", perfect: "hat gegeben", translationCs: "dát" },
  { id: "gehen", infinitive: "gehen", preterite: "ging", perfect: "ist gegangen", translationCs: "jít" },
  { id: "genießen", infinitive: "genießen", preterite: "genoss", perfect: "hat genossen", translationCs: "užívat si, užít si" },
  { id: "gewinnen", infinitive: "gewinnen", preterite: "gewann", perfect: "hat gewonnen", translationCs: "získat, vyhrát" },
  { id: "haben", infinitive: "haben", preterite: "hatte", perfect: "hat gehabt", translationCs: "mít" },
  { id: "halten", infinitive: "halten", preterite: "hielt", perfect: "hat gehalten", translationCs: "držet" },
  { id: "heißen", infinitive: "heißen", preterite: "hieß", perfect: "hat geheißen", translationCs: "jmenovat se" },
  { id: "helfen", infinitive: "helfen", preterite: "half", perfect: "hat geholfen", translationCs: "pomoct" },
  { id: "kennen", infinitive: "kennen", preterite: "kannte", perfect: "hat gekannt", translationCs: "znát" },
  { id: "kommen", infinitive: "kommen", preterite: "kam", perfect: "ist gekommen", translationCs: "přijít, přijet" },
  { id: "lassen", infinitive: "lassen", preterite: "ließ", perfect: "hat gelassen", translationCs: "nechat" },
  { id: "laufen", infinitive: "laufen", preterite: "lief", perfect: "ist gelaufen", translationCs: "běžet, běhat" },
  { id: "leihen", infinitive: "leihen", preterite: "lieh", perfect: "hat geliehen", translationCs: "půjčit" },
  { id: "lesen", infinitive: "lesen", preterite: "las", perfect: "hat gelesen", translationCs: "číst" },
  { id: "liegen", infinitive: "liegen", preterite: "lag", perfect: "hat gelegen", translationCs: "ležet" },
  { id: "lügen", infinitive: "lügen", preterite: "log", perfect: "hat gelogen", translationCs: "lhát" },
  { id: "nehmen", infinitive: "nehmen", preterite: "nahm", perfect: "hat genommen", translationCs: "vzít" },
  { id: "nennen", infinitive: "nennen", preterite: "nannte", perfect: "hat genannt", translationCs: "jmenovat, nazývat" },
  { id: "reiten", infinitive: "reiten", preterite: "ritt", perfect: "ist geritten", translationCs: "jezdit na koni" },
  { id: "rufen", infinitive: "rufen", preterite: "rief", perfect: "hat gerufen", translationCs: "volat, zvolat" },
  { id: "scheinen", infinitive: "scheinen", preterite: "schien", perfect: "hat geschienen", translationCs: "zdát se" },
  { id: "schlafen", infinitive: "schlafen", preterite: "schlief", perfect: "hat geschlafen", translationCs: "spát" },
  { id: "schlagen", infinitive: "schlagen", preterite: "schlug", perfect: "hat geschlagen", translationCs: "bít, udeřit" },
  { id: "schließen", infinitive: "schließen", preterite: "schloss", perfect: "hat geschlossen", translationCs: "zavřít, zamknout" },
  { id: "schmeißen", infinitive: "schmeißen", preterite: "schmiss", perfect: "hat geschmissen", translationCs: "hodit, házet" },
  { id: "schneiden", infinitive: "schneiden", preterite: "schnitt", perfect: "hat geschnitten", translationCs: "krájet" },
  { id: "schreiben", infinitive: "schreiben", preterite: "schrieb", perfect: "hat geschrieben", translationCs: "psát" },
  { id: "schreien", infinitive: "schreien", preterite: "schrie", perfect: "hat geschrien", translationCs: "křičet" },
  { id: "schweigen", infinitive: "schweigen", preterite: "schwieg", perfect: "hat geschwiegen", translationCs: "mlčet" },
  { id: "schwimmen", infinitive: "schwimmen", preterite: "schwamm", perfect: "ist geschwommen", translationCs: "plavat" },
  { id: "sehen", infinitive: "sehen", preterite: "sah", perfect: "hat gesehen", translationCs: "vidět" },
  { id: "sein", infinitive: "sein", preterite: "war", perfect: "ist gewesen", translationCs: "být" },
  { id: "singen", infinitive: "singen", preterite: "sang", perfect: "hat gesungen", translationCs: "zpívat" },
  { id: "sitzen", infinitive: "sitzen", preterite: "saß", perfect: "hat gesessen", translationCs: "sedět" },
  { id: "sprechen", infinitive: "sprechen", preterite: "sprach", perfect: "hat gesprochen", translationCs: "mluvit" },
  { id: "springen", infinitive: "springen", preterite: "sprang", perfect: "ist gesprungen", translationCs: "skákat" },
  { id: "stehen", infinitive: "stehen", preterite: "stand", perfect: "hat gestanden", translationCs: "stát" },
  { id: "stehlen", infinitive: "stehlen", preterite: "stahl", perfect: "hat gestohlen", translationCs: "ukrást" },
  { id: "steigen", infinitive: "steigen", preterite: "stieg", perfect: "ist gestiegen", translationCs: "stoupat" },
  { id: "sterben", infinitive: "sterben", preterite: "starb", perfect: "ist gestorben", translationCs: "zemřít" },
  { id: "stinken", infinitive: "stinken", preterite: "stank", perfect: "hat gestunken", translationCs: "smrdět" },
  { id: "streiten", infinitive: "streiten", preterite: "stritt", perfect: "hat gestritten", translationCs: "hádat se" },
  { id: "tragen", infinitive: "tragen", preterite: "trug", perfect: "hat getragen", translationCs: "nést, nosit" },
  { id: "treffen", infinitive: "treffen", preterite: "traf", perfect: "hat getroffen", translationCs: "potkat" },
  { id: "trinken", infinitive: "trinken", preterite: "trank", perfect: "hat getrunken", translationCs: "pít" },
  { id: "tun", infinitive: "tun", preterite: "tat", perfect: "hat getan", translationCs: "dělat" },
  { id: "vergessen", infinitive: "vergessen", preterite: "vergaß", perfect: "hat vergessen", translationCs: "zapomenout" },
  { id: "verlieren", infinitive: "verlieren", preterite: "verlor", perfect: "hat verloren", translationCs: "ztratit" },
  { id: "wachsen", infinitive: "wachsen", preterite: "wuchs", perfect: "ist gewachsen", translationCs: "růst" },
  { id: "waschen", infinitive: "waschen", preterite: "wusch", perfect: "hat gewaschen", translationCs: "umývat" },
  { id: "werden", infinitive: "werden", preterite: "wurde", perfect: "ist geworden", translationCs: "stát se" },
  { id: "werfen", infinitive: "werfen", preterite: "warf", perfect: "hat geworfen", translationCs: "hodit, házet" },
  { id: "ziehen", infinitive: "ziehen", preterite: "zog", perfect: "hat gezogen", translationCs: "táhnout" },
  { id: "zwingen", infinitive: "zwingen", preterite: "zwang", perfect: "hat gezwungen", translationCs: "nutit" },
];
const AGATHA_VERBS: AgathaCatalogVerb[] = [
  { id: "gehen", infinitive: "gehen", translationCs: "jít", present3: "geht", preterite: "ging", perfect: "ist gegangen", example: "Sie ist gestern nach Hause gegangen." },
  { id: "sehen", infinitive: "sehen", translationCs: "vidět", present3: "sieht", preterite: "sah", perfect: "hat gesehen", example: "Er hat den Film schon gesehen." },
  { id: "kommen", infinitive: "kommen", translationCs: "přijít, přijíždět", present3: "kommt", preterite: "kam", perfect: "ist gekommen", example: "Meine Tante ist um acht gekommen." },
  { id: "nehmen", infinitive: "nehmen", translationCs: "vzít, brát", present3: "nimmt", preterite: "nahm", perfect: "hat genommen", example: "Ich habe den Zug genommen." },
  { id: "sprechen", infinitive: "sprechen", translationCs: "mluvit", present3: "spricht", preterite: "sprach", perfect: "hat gesprochen", example: "Wir haben lange Deutsch gesprochen." },
  { id: "essen", infinitive: "essen", translationCs: "jíst", present3: "isst", preterite: "aß", perfect: "hat gegessen", example: "Das Kind hat Suppe gegessen." },
  { id: "geben", infinitive: "geben", translationCs: "dát, dávat", present3: "gibt", preterite: "gab", perfect: "hat gegeben", example: "Sie hat mir ein Buch gegeben." },
  { id: "finden", infinitive: "finden", translationCs: "najít, shledat", present3: "findet", preterite: "fand", perfect: "hat gefunden", example: "Er hat den Schlüssel gefunden." },
  { id: "bleiben", infinitive: "bleiben", translationCs: "zůstat", present3: "bleibt", preterite: "blieb", perfect: "ist geblieben", example: "Wir sind zu Hause geblieben." },
  { id: "fahren", infinitive: "fahren", translationCs: "jet, řídit", present3: "fährt", preterite: "fuhr", perfect: "ist gefahren", example: "Sie ist nach Zürich gefahren." },
  { id: "lesen", infinitive: "lesen", translationCs: "číst", present3: "liest", preterite: "las", perfect: "hat gelesen", example: "Ich habe den Brief gelesen." },
  { id: "schreiben", infinitive: "schreiben", translationCs: "psát", present3: "schreibt", preterite: "schrieb", perfect: "hat geschrieben", example: "Er hat eine Nachricht geschrieben." },
  { id: "trinken", infinitive: "trinken", translationCs: "pít", present3: "trinkt", preterite: "trank", perfect: "hat getrunken", example: "Sie hat Wasser getrunken." },
  { id: "schlafen", infinitive: "schlafen", translationCs: "spát", present3: "schläft", preterite: "schlief", perfect: "hat geschlafen", example: "Das Baby hat gut geschlafen." },
  { id: "laufen", infinitive: "laufen", translationCs: "běžet, chodit", present3: "läuft", preterite: "lief", perfect: "ist gelaufen", example: "Er ist schnell gelaufen." },
  { id: "rufen", infinitive: "rufen", translationCs: "volat", present3: "ruft", preterite: "rief", perfect: "hat gerufen", example: "Die Lehrerin hat meinen Namen gerufen." },
  { id: "helfen", infinitive: "helfen", translationCs: "pomoci", present3: "hilft", preterite: "half", perfect: "hat geholfen", example: "Wir haben dem Nachbarn geholfen." },
  { id: "treffen", infinitive: "treffen", translationCs: "potkat, trefit", present3: "trifft", preterite: "traf", perfect: "hat getroffen", example: "Ich habe Ursula im Café getroffen." },
  { id: "wissen", infinitive: "wissen", translationCs: "vědět", present3: "weiß", preterite: "wusste", perfect: "hat gewusst", example: "Sie hat die Antwort gewusst." },
  { id: "denken", infinitive: "denken", translationCs: "myslet", present3: "denkt", preterite: "dachte", perfect: "hat gedacht", example: "Ich habe an dich gedacht." },
  { id: "bringen", infinitive: "bringen", translationCs: "přinést", present3: "bringt", preterite: "brachte", perfect: "hat gebracht", example: "Er hat Blumen gebracht." },
  { id: "singen", infinitive: "singen", translationCs: "zpívat", present3: "singt", preterite: "sang", perfect: "hat gesungen", example: "Sie hat ein Lied gesungen." },
  { id: "stehen", infinitive: "stehen", translationCs: "stát", present3: "steht", preterite: "stand", perfect: "hat gestanden", example: "Das Glas hat auf dem Tisch gestanden." },
  { id: "liegen", infinitive: "liegen", translationCs: "ležet", present3: "liegt", preterite: "lag", perfect: "hat gelegen", example: "Das Buch hat auf dem Bett gelegen." },
];
const AGATHA_B2_COURSE_START = process.env.JEEVES_AGATHA_B2_START || "2026-06-14";
const AGATHA_B2_WEEK_THEMES = [
  "Opinions and reasons",
  "Work, duties, and boundaries",
  "Conflict and compromise",
  "Culture, media, and taste",
  "Formal writing",
  "Narrating past events",
  "Hypotheses and nuance",
  "Fluency and transfer",
];
const AGATHA_B2_LESSON_TEMPLATES: AgathaB2LessonTemplate[] = [
  {
    week: 1,
    day: 1,
    theme: "Meinung klar begründen",
    target: "Vyjádřit názor a přidat dva přesvědčivé důvody.",
    inputText: "Viele Menschen möchten im Alltag mehr Zeit sparen. Einige bestellen deshalb fast alles online, andere kaufen lieber in kleinen Geschäften ein. Online-Shopping ist bequem und oft günstiger, aber man verliert den persönlichen Kontakt und unterstützt lokale Anbieter weniger. Für mich hängt die Entscheidung davon ab, ob ich etwas dringend brauche oder ob Beratung wichtig ist.",
    questions: [
      "Welche zwei Vorteile des Online-Shoppings nennt der Text?",
      "Warum kaufen manche Menschen lieber in kleinen Geschäften?",
      "Wann würdest du online kaufen und wann nicht?",
    ],
    phrases: ["Meiner Ansicht nach", "ein entscheidender Vorteil ist", "andererseits", "es hängt davon ab"],
    grammarFocus: "Nebensätze mit weil/obwohl/dass: konjugované sloveso na konec.",
    outputTask: "Napiš 6-8 vět: Soll man mehr online oder lokal einkaufen? Begründe deine Meinung.",
    transferTask: "Použij stejné fráze zítra na téma Lernen mit Apps.",
  },
  {
    week: 1,
    day: 2,
    theme: "Abwägen: einerseits/andererseits",
    target: "Porovnat dvě možnosti bez černobílého závěru.",
    inputText: "Wer eine neue Sprache lernt, braucht sowohl Disziplin als auch Freude. Einerseits helfen feste Lernzeiten, weil man nicht jeden Tag neu entscheiden muss. Andererseits kann ein zu strenger Plan schnell demotivieren. Sinnvoll ist deshalb ein Rhythmus, der verbindlich ist, aber kleine Pausen erlaubt.",
    questions: [
      "Warum helfen feste Lernzeiten?",
      "Was kann an einem zu strengen Plan problematisch sein?",
      "Wie sieht ein guter Rhythmus für dich aus?",
    ],
    phrases: ["einerseits", "andererseits", "sinnvoll ist deshalb", "nicht nur ... sondern auch"],
    grammarFocus: "Dvojdílné spojky: nicht nur ... sondern auch.",
    outputTask: "Napiš krátký názor: Ist ein fester Lernplan gut oder schlecht?",
    transferTask: "Převeď argument na téma Sport oder Musik üben.",
  },
  {
    week: 2,
    day: 1,
    theme: "Pflichten freundlich formulieren",
    target: "Mluvit o povinnostech bez tvrdého tónu.",
    inputText: "In einer Familie oder in einem Team entstehen Konflikte oft nicht wegen der Aufgabe selbst, sondern wegen des Tons. Wenn jemand sagt: Du musst das sofort machen, reagiert der andere schnell defensiv. Freundlicher klingt: Es wäre hilfreich, wenn du das heute noch erledigen könntest. So bleibt die Bitte klar, aber respektvoll.",
    questions: [
      "Warum entstehen Konflikte laut Text oft?",
      "Welche Formulierung klingt freundlicher?",
      "Welche Bitte könntest du heute höflich formulieren?",
    ],
    phrases: ["es wäre hilfreich, wenn", "könntest du bitte", "ich würde vorschlagen", "bis spätestens"],
    grammarFocus: "Konjunktiv II pro zdvořilost: könnte, würde, wäre.",
    outputTask: "Napiš zdvořilou zprávu člověku, který má něco dokončit.",
    transferTask: "Zítra použij Konjunktiv II v jedné pracovní situaci.",
  },
  {
    week: 3,
    day: 1,
    theme: "Konflikt entschärfen",
    target: "Popsat konflikt a navrhnout kompromis.",
    inputText: "Ein guter Kompromiss bedeutet nicht, dass beide Seiten völlig zufrieden sind. Er bedeutet eher, dass beide Seiten das Wichtigste behalten können. Dafür muss man zuerst verstehen, was der andere wirklich braucht. Erst danach lohnt es sich, über konkrete Lösungen zu sprechen.",
    questions: [
      "Was bedeutet ein guter Kompromiss laut Text?",
      "Was sollte man zuerst verstehen?",
      "Beschreibe einen kleinen Kompromiss aus deinem Alltag.",
    ],
    phrases: ["aus meiner Sicht", "ich kann nachvollziehen, dass", "wichtig wäre mir", "wir könnten uns darauf einigen"],
    grammarFocus: "Infinitiv mit zu: Es lohnt sich, ... zu ...",
    outputTask: "Napiš 8 vět: Ein Konflikt und ein möglicher Kompromiss.",
    transferTask: "Použij frázi ich kann nachvollziehen, dass v jiné situaci.",
  },
  {
    week: 4,
    day: 1,
    theme: "Kultur und Geschmack",
    target: "Vysvětlit vkus a reagovat na jiný názor.",
    inputText: "Über Geschmack lässt sich leicht streiten, weil Musik, Filme oder Kunst sehr persönliche Erinnerungen wecken. Trotzdem kann man über Geschmack sinnvoll sprechen. Man kann erklären, welche Stimmung ein Werk erzeugt, welche Details auffallen und warum es einen berührt oder kalt lässt.",
    questions: [
      "Warum ist Geschmack persönlich?",
      "Wie kann man sinnvoll über Geschmack sprechen?",
      "Welches Werk hat dich zuletzt berührt?",
    ],
    phrases: ["mich spricht besonders an", "auffällig ist", "es erinnert mich an", "ich sehe das anders, weil"],
    grammarFocus: "Adjektivdeklination po ein/kein/der v krátkých popisech.",
    outputTask: "Popiš film, obraz nebo hudbu v 7 větách a přidej vlastní hodnocení.",
    transferTask: "Zkus stejné fráze při popisu jídla nebo místa.",
  },
  {
    week: 5,
    day: 1,
    theme: "Formelle E-Mail",
    target: "Napsat formální e-mail s jasnou prosbou.",
    inputText: "Eine gute formelle E-Mail ist kurz, freundlich und konkret. Der Betreff sollte zeigen, worum es geht. Im ersten Satz erklärt man den Anlass, danach folgt die Bitte oder Information. Am Ende bedankt man sich und nennt, falls nötig, eine Frist.",
    questions: [
      "Welche drei Eigenschaften hat eine gute formelle E-Mail?",
      "Was gehört in den ersten Satz?",
      "Welche Frist würdest du in einer Anfrage nennen?",
    ],
    phrases: ["ich wende mich an Sie, weil", "ich wäre Ihnen dankbar, wenn", "für eine kurze Rückmeldung", "mit freundlichen Grüssen"],
    grammarFocus: "Formální register: Sie/Ihnen/Ihre velkým písmenem.",
    outputTask: "Napiš formální e-mail s prosbou o termín nebo informaci.",
    transferTask: "Zítra přepiš krátkou neformální prosbu formálně.",
  },
  {
    week: 6,
    day: 1,
    theme: "Vergangenheit erzählen",
    target: "Vyprávět minulou událost v jasném pořadí.",
    inputText: "Eine verständliche Erzählung braucht Orientierung. Zuerst nennt man die Situation: Wann und wo war es? Danach beschreibt man, was passiert ist. Am Ende erklärt man, warum die Erfahrung wichtig war oder was man daraus gelernt hat.",
    questions: [
      "Welche Orientierung braucht eine Erzählung?",
      "Was kommt nach der Situation?",
      "Welche Erfahrung würdest du kurz erzählen?",
    ],
    phrases: ["zunächst", "danach", "schliesslich", "daraus habe ich gelernt"],
    grammarFocus: "Perfekt vs. Präteritum v běžném vyprávění.",
    outputTask: "Napiš 8-10 vět o události z minulého týdne.",
    transferTask: "Řekni stejný příběh stručněji ve 4 větách.",
  },
  {
    week: 7,
    day: 1,
    theme: "Hypothetisch sprechen",
    target: "Mluvit o možnostech a důsledcích.",
    inputText: "Wenn man hypothetisch spricht, wirkt die Aussage oft vorsichtiger und reifer. Statt zu sagen: Das ist falsch, kann man sagen: Es könnte problematisch sein, wenn ... Dadurch öffnet man Raum für Diskussion und vermeidet unnötige Härte.",
    questions: [
      "Warum wirken hypothetische Aussagen vorsichtiger?",
      "Welche Alternative nennt der Text zu Das ist falsch?",
      "Formuliere eine vorsichtige Kritik.",
    ],
    phrases: ["es könnte sein, dass", "falls", "unter diesen Umständen", "das würde bedeuten"],
    grammarFocus: "Konjunktiv II: würde + Infinitiv.",
    outputTask: "Napiš 6 hypotetických vět k rozhodnutí, které tě čeká.",
    transferTask: "Použij falls a unter diesen Umständen v jiné situaci.",
  },
  {
    week: 8,
    day: 1,
    theme: "Flüssig zusammenfassen",
    target: "Shrnout text a přidat vlastní stanovisko.",
    inputText: "Auf B2-Niveau reicht es nicht, einzelne Sätze korrekt zu bilden. Man muss Gedanken verbinden, Beispiele geben und die eigene Position verständlich machen. Flüssigkeit entsteht, wenn man bekannte Strukturen in neuen Situationen wiederverwendet.",
    questions: [
      "Was reicht auf B2-Niveau nicht mehr?",
      "Wie entsteht Flüssigkeit laut Text?",
      "Welche Struktur möchtest du öfter wiederverwenden?",
    ],
    phrases: ["zusammenfassend lässt sich sagen", "ein Beispiel dafür ist", "im Gegensatz dazu", "für mich persönlich"],
    grammarFocus: "Textkohärenz: spojovací výrazy na začátku věty.",
    outputTask: "Shrň text ve 3 větách a přidej vlastní názor ve 5 větách.",
    transferTask: "Použij čtyři spojovací výrazy v novém tématu.",
  },
];
let lastNetflixOpenAt = 0;
let lastNetflixUrl = "";
let lastBaxterOpenAt = 0;
let lastBaxterAdvertUrl = "";
let lastBaxterAdvertAt = 0;
let gmailTriageRunPromise: Promise<any> | null = null;
const GEMINI_LIVE_PRICING_USD_PER_1M = {
  input: {
    text: 0.75,
    audio: 3.00,
    image: 1.00,
    video: 1.00,
    unknown: 0.75,
  },
  output: {
    text: 4.50,
    audio: 12.00,
    image: 4.50,
    video: 4.50,
    unknown: 4.50,
  },
};

app.use(express.json());
app.use(cookieParser());

const require = createRequire(import.meta.url);
let usageDb: any = null;

const getUsageDb = () => {
  if (!usageDb) {
    const { DatabaseSync } = require("node:sqlite");
    fsSync.mkdirSync(TOKEN_DIR, { recursive: true });
    usageDb = new DatabaseSync(USAGE_DB_FILE);
    usageDb.exec(`
      CREATE TABLE IF NOT EXISTS usage_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        month TEXT NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        total_token_count INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usage_sessions (
        session_id TEXT NOT NULL,
        month TEXT NOT NULL,
        model TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        prompt_text_tokens INTEGER NOT NULL DEFAULT 0,
        prompt_audio_tokens INTEGER NOT NULL DEFAULT 0,
        prompt_image_tokens INTEGER NOT NULL DEFAULT 0,
        prompt_video_tokens INTEGER NOT NULL DEFAULT 0,
        prompt_unknown_tokens INTEGER NOT NULL DEFAULT 0,
        response_text_tokens INTEGER NOT NULL DEFAULT 0,
        response_audio_tokens INTEGER NOT NULL DEFAULT 0,
        response_image_tokens INTEGER NOT NULL DEFAULT 0,
        response_video_tokens INTEGER NOT NULL DEFAULT 0,
        response_unknown_tokens INTEGER NOT NULL DEFAULT 0,
        total_token_count INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        metadata_json TEXT NOT NULL,
        PRIMARY KEY (session_id, month)
      );

      CREATE TABLE IF NOT EXISTS agatha_daily_verbs (
        day_key TEXT PRIMARY KEY,
        verb_id TEXT NOT NULL,
        shown_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agatha_verb_catalog (
        verb_id TEXT PRIMARY KEY,
        infinitive TEXT NOT NULL,
        preterite TEXT NOT NULL,
        participle TEXT NOT NULL,
        translation_cs TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL,
        imported_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agatha_catalog_imports (
        source_url TEXT PRIMARY KEY,
        imported_at TEXT NOT NULL,
        verb_count INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agatha_known_verbs (
        verb_id TEXT PRIMARY KEY,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        seen_count INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS agatha_review_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        verb_id TEXT NOT NULL,
        prompt_kind TEXT NOT NULL,
        answer TEXT NOT NULL,
        expected TEXT NOT NULL,
        correct INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agatha_chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agatha_b2_lessons (
        lesson_id TEXT PRIMARY KEY,
        day_key TEXT NOT NULL UNIQUE,
        day_index INTEGER NOT NULL,
        week_number INTEGER NOT NULL,
        theme TEXT NOT NULL,
        target TEXT NOT NULL,
        input_text TEXT NOT NULL,
        questions_json TEXT NOT NULL,
        phrases_json TEXT NOT NULL,
        grammar_focus TEXT NOT NULL,
        output_task TEXT NOT NULL,
        transfer_task TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agatha_b2_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_id TEXT NOT NULL,
        step TEXT NOT NULL,
        answer TEXT NOT NULL,
        feedback TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agatha_b2_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_id TEXT NOT NULL,
        category TEXT NOT NULL,
        note TEXT NOT NULL,
        source_step TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agatha_b2_review_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        due_date TEXT NOT NULL,
        source_step TEXT NOT NULL,
        completed_at TEXT
      );
    `);

    const agathaCatalogColumns = usageDb.prepare("PRAGMA table_info(agatha_verb_catalog)").all() as any[];
    if (!agathaCatalogColumns.some(column => column.name === "translation_cs")) {
      usageDb.exec("ALTER TABLE agatha_verb_catalog ADD COLUMN translation_cs TEXT NOT NULL DEFAULT ''");
    }
  }

  return usageDb;
};

const getMonthKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: USAGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value || String(date.getFullYear());
  const month = parts.find(part => part.type === "month")?.value || String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const normalizeModality = (value: unknown) => {
  const modality = String(value || "unknown").toLowerCase();
  if (modality.includes("text")) return "text";
  if (modality.includes("audio")) return "audio";
  if (modality.includes("image")) return "image";
  if (modality.includes("video")) return "video";
  return "unknown";
};

const normalizeSearchText = (value: unknown) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const hasCelloTerm = (...values: unknown[]) => {
  const haystack = normalizeSearchText(values.filter(Boolean).join(" "));
  return CELLO_TERMS.some(term => haystack.includes(term));
};

const MET_ARTWORKS = [
  {
    objectID: 436535,
    description: "Van Gogh maloval tuto krajinu během pobytu v Saint-Rémy. Cypřiše a zvlněné pole patří k jeho nejrozpoznatelnějším motivům.",
    fact: "Zajímavost: existují tři blízké verze tohoto námětu; Met vlastní jednu z nejznámějších.",
  },
  {
    objectID: 436105,
    description: "Jacques-Louis David proměnil Platónovo vyprávění o Sókratově smrti v jeden z ikonických obrazů neoklasicismu.",
    fact: "Zajímavost: obraz vznikl roku 1787, těsně před Francouzskou revolucí, a často se čte jako oslava občanské odvahy.",
  },
  {
    objectID: 437881,
    description: "Vermeerova tichá scéna s mladou ženou a mapou je slavná pro průzračné světlo a téměř filmovou zdrženlivost.",
    fact: "Zajímavost: je to první Vermeerův obraz, který se dostal do americké sbírky.",
  },
  {
    objectID: 436575,
    description: "El Grecův pohled na Toledo je jednou z nejslavnějších krajin evropského malířství, dramatická a skoro vizionářská.",
    fact: "Zajímavost: krajina je v dějinách umění výjimečná, protože není jen pozadím, ale hlavním tématem obrazu.",
  },
  {
    objectID: 437394,
    description: "Rembrandt zde neukazuje Aristotela jako suchou autoritu, ale jako člověka přemýšlejícího o slávě, moudrosti a paměti.",
    fact: "Zajímavost: když Met obraz získal v roce 1961, šlo o jednu z nejsledovanějších akvizic muzea.",
  },
  {
    objectID: 438817,
    description: "Degasův taneční sál zachycuje balet jako práci: čekání, únava, trénink a drobné pohyby místo jevištního lesku.",
    fact: "Zajímavost: Degas byl posedlý zákulisím baletu a tanečnice kreslil znovu a znovu jako studii pohybu.",
  },
  {
    objectID: 12127,
    description: "Sargentův portrét Madame X patří k nejslavnějším společenským portrétům 19. století a zároveň k největším skandálům Salonu.",
    fact: "Zajímavost: původně spadlé ramínko šatů vyvolalo rozruch; Sargent ho později na obraze přemaloval.",
  },
  {
    objectID: 11417,
    description: "Leutzeho monumentální Washington se stal jedním z nejznámějších obrazů americké historické paměti.",
    fact: "Zajímavost: obraz vznikl v Německu, přesto se stal téměř učebnicovým symbolem Spojených států.",
  },
  {
    objectID: 435809,
    description: "Bruegelovi Ženci patří do cyklu ročních dob a ukazují venkovský svět s neobyčejnou šíří i lidskostí.",
    fact: "Zajímavost: obraz je často považován za jeden z vrcholů severní renesanční krajinomalby.",
  },
  {
    objectID: 436282,
    description: "Dvojice panelů Jana van Eycka spojuje Ukřižování a Poslední soud s mimořádně jemnou malířskou přesností.",
    fact: "Zajímavost: malé měřítko panelů kontrastuje s obrovskou hustotou detailu, typickou pro van Eyckovu dílnu.",
  },
  {
    objectID: 436947,
    description: "Manetovo Boating patří k obrazům, které pomohly modernímu malířství opustit akademickou vážnost a přiblížit se současnému životu.",
    fact: "Zajímavost: ploché barevné plochy a odvážné oříznutí obrazu ukazují Manetův moderní pohled.",
  },
  {
    objectID: 437980,
    description: "Van Goghův obraz Cypresses patří mezi jeho pozdní krajiny, v nichž se příroda mění v rytmus barev a tahů štětce.",
    fact: "Zajímavost: cypřiše Van Gogha fascinovaly podobně jako slunečnice; považoval je za silný, osobní motiv.",
  },
];

const getArtworkDayParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARTWORK_OF_THE_DAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find(part => part.type === "year")?.value || date.getUTCFullYear());
  const month = Number(parts.find(part => part.type === "month")?.value || date.getUTCMonth() + 1);
  const day = Number(parts.find(part => part.type === "day")?.value || date.getUTCDate());

  return { year, month, day };
};

const getArtworkDayKey = (date = new Date()) => {
  const { year, month, day } = getArtworkDayParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const getArtworkForDate = (date = new Date()) => {
  const { year, month, day } = getArtworkDayParts(date);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  return MET_ARTWORKS[dayNumber % MET_ARTWORKS.length];
};

const readCachedMetArtwork = async () => {
  try {
    return JSON.parse(await fs.readFile(MET_ARTWORK_CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
};

const writeCachedMetArtwork = async (artwork: any) => {
  try {
    await fs.mkdir(TOKEN_DIR, { recursive: true });
    await fs.writeFile(MET_ARTWORK_CACHE_FILE, JSON.stringify(artwork, null, 2), "utf8");
  } catch (error: any) {
    console.warn("Met artwork cache write failed", error.message);
  }
};

const fetchMetArtwork = async () => {
  const curatedArtwork = getArtworkForDate();
  const dayKey = getArtworkDayKey();
  const response = await fetch(`${MET_COLLECTION_API_URL}/objects/${curatedArtwork.objectID}`, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Jeeves 3.0 artwork of the day/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Met API error: ${response.status}`);
  }

  const object: any = await response.json();
  const image = object.primaryImage || object.primaryImageSmall || "";
  if (!image) {
    throw new Error("Met API nevrátil obrázek pro dnešní dílo.");
  }

  return {
    objectID: object.objectID,
    title: object.title || "Bez názvu",
    artist: object.artistDisplayName || "Neznámý autor",
    date: object.objectDate || "",
    medium: object.medium || "",
    department: object.department || "",
    image,
    imageSmall: object.primaryImageSmall || image,
    metUrl: object.objectURL || `https://www.metmuseum.org/art/collection/search/${object.objectID}`,
    description: curatedArtwork.description,
    fact: curatedArtwork.fact,
    dayKey,
    source: "The Metropolitan Museum of Art Collection API",
  };
};

const isBaxterRunning = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(BAXTER_HEALTH_URL, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const openUrlInWindows = (url: string) => {
  const opener = spawn("cmd", ["/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  opener.unref();
};

const buildNetflixUrl = (title?: string) => {
  const cleanTitle = String(title || "").trim().replace(/^film\s+/i, "").trim();
  const targetUrl = cleanTitle
    ? (() => {
        const url = new URL(NETFLIX_SEARCH_URL);
        url.searchParams.set("q", cleanTitle);
        return url.toString();
      })()
    : NETFLIX_BROWSE_URL;

  if (!NETFLIX_PROFILE_TOKEN) {
    const profileGateUrl = new URL(NETFLIX_PROFILES_GATE_URL);
    profileGateUrl.searchParams.set("nextpage", targetUrl);
    return { url: profileGateUrl.toString(), title: cleanTitle, profileName: NETFLIX_PROFILE_NAME, profileSelected: false };
  }

  const profileUrl = new URL(NETFLIX_SWITCH_PROFILE_URL);
  profileUrl.searchParams.set("tkn", NETFLIX_PROFILE_TOKEN);
  profileUrl.searchParams.set("nextpage", targetUrl);
  return { url: profileUrl.toString(), title: cleanTitle, profileName: NETFLIX_PROFILE_NAME, profileSelected: true };
};

const openNetflix = (title?: string) => {
  const { url, title: cleanTitle, profileSelected } = buildNetflixUrl(title);
  const profilePhrase = profileSelected
    ? `na profilu ${NETFLIX_PROFILE_NAME}`
    : `s výběrem profilu ${NETFLIX_PROFILE_NAME}`;
  const now = Date.now();
  if (url === lastNetflixUrl && now - lastNetflixOpenAt < 3000) {
    return {
      url,
      title: cleanTitle,
      profileName: NETFLIX_PROFILE_NAME,
      profileSelected,
      result: cleanTitle
        ? `Netflix se už otevírá ${profilePhrase} s hledáním: ${cleanTitle}`
        : `Netflix se už otevírá ${profilePhrase}: ${NETFLIX_BROWSE_URL}`,
    };
  }

  lastNetflixOpenAt = now;
  lastNetflixUrl = url;
  openUrlInWindows(url);

  return {
    url,
    title: cleanTitle,
    profileName: NETFLIX_PROFILE_NAME,
    profileSelected,
    result: cleanTitle
      ? `Otevřel jsem Netflix ${profilePhrase} a vyhledal "${cleanTitle}".`
      : `Otevřel jsem Netflix ${profilePhrase}: ${NETFLIX_BROWSE_URL}`,
  };
};

const ensureBaxterRunning = async () => {
  let startedNow = false;
  if (!(await isBaxterRunning())) {
    if (!fsSync.existsSync(BAXTER_PYTHON)) {
      throw new Error(`Nenašel jsem lokální Python pro Baxtera: ${BAXTER_PYTHON}`);
    }

    const child = spawn(
      BAXTER_PYTHON,
      ["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "8765"],
      {
        cwd: BAXTER_ROOT,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }
    );
    child.unref();
    startedNow = true;

    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (await isBaxterRunning()) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (!(await isBaxterRunning())) {
      throw new Error("Baxter se spustil, ale health endpoint nezačal odpovídat.");
    }
  }

  return startedNow;
};

const openBaxter = async () => {
  const now = Date.now();
  if (now - lastBaxterOpenAt < 4000) {
    return `Baxter se už otevírá: ${BAXTER_URL}`;
  }
  lastBaxterOpenAt = now;

  const startedNow = await ensureBaxterRunning();

  openUrlInWindows(BAXTER_URL);
  return startedNow
    ? `Spustil jsem Baxtera a otevřel jeho aplikaci: ${BAXTER_URL}`
    : `Baxter už běžel, otevřel jsem jeho aplikaci: ${BAXTER_URL}`;
};

const toBaxterAbsoluteUrl = (value: unknown) => {
  const url = String(value || "");
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${BAXTER_URL}${url.startsWith("/") ? "" : "/"}${url}`;
};

const enrichBaxterApplicationResponse = (payload: any) => {
  const details = payload?.details && typeof payload.details === "object" ? { ...payload.details } : {};
  for (const key of ["pdf_url", "draft_file_url"]) {
    if (details[key]) details[key] = toBaxterAbsoluteUrl(details[key]);
  }
  return {
    ...payload,
    details,
    url: BAXTER_URL,
  };
};

const normalizeBriefItems = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === "object")
    .map((item: any) => ({
      id: String(item.id || item.messageId || item.message_id || item.url || "").trim(),
      sender: String(item.sender || item.from || item.from_ || "").trim(),
      subject: String(item.subject || item.title || "").trim(),
      summary: String(item.summary || item.reason || item.why || item.body || "").trim(),
      nextAction: String(item.nextAction || item.next_action || item.action || "").trim(),
      bucket: String(item.bucket || item.category || "").trim(),
      url: String(item.url || item.display_url || "").trim(),
      date: String(item.date || item.receivedAt || item.received_at || "").trim(),
      audit: String(item.audit || item.auditNote || item.audit_note || item.status || "").trim(),
    }));
};

const briefSummaryToText = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return normalizeBriefItems(value)
      .map(item => [item.sender, item.subject, item.summary || item.nextAction].filter(Boolean).join(": "))
      .filter(Boolean)
      .join(" | ");
  }
  if (value && typeof value === "object") {
    const item = normalizeBriefItems([value])[0];
    return item ? [item.sender, item.subject, item.summary || item.nextAction].filter(Boolean).join(": ") : "";
  }
  return "";
};

const normalizeGmailBriefPayload = (payload: any) => {
  const source = payload?.brief && typeof payload.brief === "object" ? payload.brief : payload || {};
  const timestamp = String(source.timestamp || source.runTimestamp || source.run_timestamp || new Date().toISOString());
  const attentionNeeded = normalizeBriefItems(source.attentionNeeded || source.attention_needed || source.needsAttention);
  const draftsCreated = normalizeBriefItems(source.draftsCreated || source.drafts_created || source.drafts);
  const lowPriorityActions = normalizeBriefItems(source.lowPriorityActions || source.low_priority_actions || source.lowPriority);
  const uncertainItems = normalizeBriefItems(source.uncertainItems || source.uncertain_items || source.risks);
  const counts = source.counts && typeof source.counts === "object" ? source.counts : {};

  return {
    id: String(source.id || `gmail-${Date.parse(timestamp) || Date.now()}`),
    timestamp,
    source: String(source.source || "gmail-attention-brief"),
    counts: {
      scanned: Number(counts.scanned ?? counts.messagesScanned ?? source.scanned ?? 0),
      attentionNeeded: Number(counts.attentionNeeded ?? counts.attention_needed ?? attentionNeeded.length),
      draftsCreated: Number(counts.draftsCreated ?? counts.drafts_created ?? draftsCreated.length),
      lowPriorityActions: Number(counts.lowPriorityActions ?? counts.low_priority_actions ?? lowPriorityActions.length),
      uncertainItems: Number(counts.uncertainItems ?? counts.uncertain_items ?? uncertainItems.length),
    },
    attentionNeeded,
    draftsCreated,
    lowPriorityActions,
    uncertainItems,
    nextFollowUps: normalizeBriefItems(source.nextFollowUps || source.next_follow_ups),
    summary: briefSummaryToText(source.summary || source.finalOutput || source.final_output),
  };
};

const readGmailBriefs = async () => {
  try {
    const raw = await fs.readFile(GMAIL_BRIEF_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.briefs) ? parsed.briefs : [];
  } catch {
    return [];
  }
};

const getLocalDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: USAGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value || String(date.getFullYear());
  const month = parts.find(part => part.type === "month")?.value || String(date.getMonth() + 1).padStart(2, "0");
  const day = parts.find(part => part.type === "day")?.value || String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getAgathaDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AGATHA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value || String(date.getFullYear());
  const month = parts.find(part => part.type === "month")?.value || String(date.getMonth() + 1).padStart(2, "0");
  const day = parts.find(part => part.type === "day")?.value || String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const stripGermanAuxiliary = (value: unknown) =>
  String(value || "").trim().replace(/^(?:hat|ist)\s+/i, "");

const fallbackAgathaVerbPayload = (verb: typeof AGATHA_VERBS[number], dayKey?: string) => ({
  id: verb.id,
  infinitive: verb.infinitive,
  translationCs: verb.translationCs,
  present3: verb.present3,
  preterite: verb.preterite,
  perfect: verb.perfect,
  example: verb.example,
  sourceUrl: "fallback",
  dayKey,
});

const importAgathaVerbCatalog = async ({ force = false } = {}) => {
  const db = getUsageDb();
  const verbs = AGATHA_PDF_VERBS;
  const existing = db.prepare("SELECT COUNT(*) AS count FROM agatha_verb_catalog").get() as any;
  const lastImport = db.prepare(`
    SELECT source_url, verb_count
    FROM agatha_catalog_imports
    ORDER BY imported_at DESC
    LIMIT 1
  `).get() as any;
  const missingTranslations = db.prepare(`
    SELECT COUNT(*) AS count
    FROM agatha_verb_catalog
    WHERE COALESCE(translation_cs, '') = ''
  `).get() as any;

  if (
    !force
    && Number(existing?.count || 0) === verbs.length
    && lastImport?.source_url === AGATHA_VERB_SOURCE_URL
    && Number(missingTranslations?.count || 0) === 0
  ) {
    return { imported: false, count: Number(existing.count || 0), sourceUrl: AGATHA_VERB_SOURCE_URL };
  }

  try {
    if (verbs.length < 50) throw new Error(`Import našel jen ${verbs.length} sloves.`);

    const importedAt = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO agatha_verb_catalog (verb_id, infinitive, preterite, participle, translation_cs, source_url, imported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(verb_id) DO UPDATE SET
        infinitive = excluded.infinitive,
        preterite = excluded.preterite,
        participle = excluded.participle,
        translation_cs = excluded.translation_cs,
        source_url = excluded.source_url,
        imported_at = excluded.imported_at
    `);

    db.exec("BEGIN TRANSACTION");
    try {
      db.prepare("DELETE FROM agatha_verb_catalog").run();
      for (const verb of verbs) {
        insert.run(
          verb.id,
          verb.infinitive,
          verb.preterite,
          verb.perfect,
          verb.translationCs,
          AGATHA_VERB_SOURCE_URL,
          importedAt
        );
      }

      db.prepare(`
        INSERT INTO agatha_catalog_imports (source_url, imported_at, verb_count)
        VALUES (?, ?, ?)
        ON CONFLICT(source_url) DO UPDATE SET
          imported_at = excluded.imported_at,
          verb_count = excluded.verb_count
      `).run(AGATHA_VERB_SOURCE_URL, importedAt, verbs.length);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    return { imported: true, count: verbs.length, sourceUrl: AGATHA_VERB_SOURCE_URL };
  } catch (error: any) {
    console.warn("Aunt Agatha verb import failed", error.message);
    return { imported: false, count: Number(existing?.count || 0), sourceUrl: AGATHA_VERB_SOURCE_URL, error: error.message };
  }
};

const getAgathaCatalogRows = () => {
  const db = getUsageDb();
  const rows = db.prepare(`
    SELECT verb_id, infinitive, preterite, participle, translation_cs, source_url, imported_at
    FROM agatha_verb_catalog
    ORDER BY infinitive ASC
  `).all() as any[];

  if (rows.length > 0) return rows;

  return AGATHA_VERBS.map(verb => ({
    verb_id: verb.id,
    infinitive: verb.infinitive,
    preterite: verb.preterite,
    participle: verb.perfect,
    translation_cs: verb.translationCs,
    source_url: "fallback",
    imported_at: "",
  }));
};

const getAgathaCatalogMeta = () => {
  const db = getUsageDb();
  const count = db.prepare("SELECT COUNT(*) AS count FROM agatha_verb_catalog").get() as any;
  const lastImport = db.prepare(`
    SELECT source_url, imported_at, verb_count
    FROM agatha_catalog_imports
    ORDER BY imported_at DESC
    LIMIT 1
  `).get() as any;

  return {
    sourceUrl: lastImport?.source_url || AGATHA_VERB_SOURCE_URL,
    importedAt: lastImport?.imported_at || "",
    catalogSize: Number(count?.count || 0) || AGATHA_VERBS.length,
    usingFallback: Number(count?.count || 0) === 0,
  };
};

const getAgathaVerbById = (verbId: unknown) => {
  const id = String(verbId || "");
  const db = getUsageDb();
  const row = db.prepare(`
    SELECT verb_id, infinitive, preterite, participle, translation_cs, source_url
    FROM agatha_verb_catalog
    WHERE verb_id = ?
  `).get(id) as any;

  if (row) {
    return {
      id: row.verb_id,
      infinitive: row.infinitive,
      translationCs: row.translation_cs || "",
      present3: "",
      preterite: row.preterite,
      perfect: row.participle,
      example: `${row.infinitive} - ${row.preterite} - ${row.participle}`,
      sourceUrl: row.source_url,
    };
  }

  const fallback = AGATHA_VERBS.find(verb => verb.id === id);
  return fallback ? fallbackAgathaVerbPayload(fallback) : null;
};

const getAgathaVerbPayload = (verb: any, dayKey?: string) => ({
  id: verb.id,
  infinitive: verb.infinitive,
  translationCs: verb.translationCs || "",
  present3: verb.present3 || "",
  preterite: verb.preterite,
  perfect: verb.perfect,
  example: verb.example || `${verb.infinitive} - ${verb.preterite} - ${verb.perfect}`,
  sourceUrl: verb.sourceUrl || AGATHA_VERB_SOURCE_URL,
  dayKey,
});

const ensureTodayAgathaVerb = () => {
  const db = getUsageDb();
  const dayKey = getAgathaDateKey();
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT verb_id FROM agatha_daily_verbs WHERE day_key = ?").get(dayKey) as any;
  const existingVerb = existing ? getAgathaVerbById(existing.verb_id) : null;
  if (existingVerb) return getAgathaVerbPayload(existingVerb, dayKey);

  const knownRows = db.prepare("SELECT verb_id FROM agatha_known_verbs").all() as any[];
  const knownIds = new Set(knownRows.map(row => String(row.verb_id)));
  const totalDays = db.prepare("SELECT COUNT(*) AS count FROM agatha_daily_verbs").get() as any;
  const catalog = getAgathaCatalogRows();
  const nextRow = catalog.find(row => !knownIds.has(row.verb_id))
    || catalog[Number(totalDays?.count || 0) % catalog.length];
  const nextVerb = getAgathaVerbById(nextRow.verb_id);
  if (!nextVerb) throw new Error("Aunt Agatha nemá žádné sloveso k zobrazení.");

  db.prepare(`
    INSERT INTO agatha_daily_verbs (day_key, verb_id, shown_at)
    VALUES (?, ?, ?)
  `).run(dayKey, nextVerb.id, now);

  db.prepare(`
    INSERT INTO agatha_known_verbs (verb_id, first_seen_at, last_seen_at, seen_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(verb_id) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      seen_count = seen_count + 1
  `).run(nextVerb.id, now, now);

  return getAgathaVerbPayload(nextVerb, dayKey);
};

const getAgathaKnownVerbs = () => {
  ensureTodayAgathaVerb();
  const db = getUsageDb();
  const rows = db.prepare(`
    SELECT verb_id, first_seen_at, last_seen_at, seen_count
    FROM agatha_known_verbs
    ORDER BY first_seen_at ASC
  `).all() as any[];

  return rows
    .map(row => {
      const verb = getAgathaVerbById(row.verb_id);
      return verb ? {
        ...getAgathaVerbPayload(verb),
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        seenCount: Number(row.seen_count || 0),
      } : null;
    })
    .filter(Boolean);
};

const getAgathaStats = () => {
  const db = getUsageDb();
  const attempts = db.prepare(`
    SELECT COUNT(*) AS total, COALESCE(SUM(correct), 0) AS correct
    FROM agatha_review_attempts
  `).get() as any;
  const known = db.prepare("SELECT COUNT(*) AS total FROM agatha_known_verbs").get() as any;

  return {
    knownVerbs: Number(known?.total || 0),
    attempts: Number(attempts?.total || 0),
    correct: Number(attempts?.correct || 0),
  };
};

const getAgathaMessages = () => {
  const db = getUsageDb();
  return (db.prepare(`
    SELECT id, role, text, created_at
    FROM agatha_chat_messages
    ORDER BY id DESC
    LIMIT 40
  `).all() as any[])
    .reverse()
    .map(row => ({
      id: Number(row.id),
      role: row.role,
      text: row.text,
      createdAt: row.created_at,
    }));
};

const getAgathaState = () => ({
  today: ensureTodayAgathaVerb(),
  knownVerbs: getAgathaKnownVerbs(),
  stats: getAgathaStats(),
  messages: getAgathaMessages(),
  catalog: getAgathaCatalogMeta(),
});

const dateKeyToUtcTime = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year || 1970, (month || 1) - 1, day || 1);
};

const addDaysToDateKey = (dateKey: string, days: number) => {
  const date = new Date(dateKeyToUtcTime(dateKey));
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getAgathaB2DayIndex = (dayKey = getAgathaDateKey()) => {
  const diffDays = Math.floor((dateKeyToUtcTime(dayKey) - dateKeyToUtcTime(AGATHA_B2_COURSE_START)) / 86400000);
  return Math.max(0, diffDays);
};

const getAgathaB2Template = (dayIndex: number) => {
  const weekIndex = Math.floor(dayIndex / 7) % 8;
  const dayOfWeek = dayIndex % 7;
  const preferred = AGATHA_B2_LESSON_TEMPLATES.find(template => template.week === weekIndex + 1 && template.day === dayOfWeek + 1)
    || AGATHA_B2_LESSON_TEMPLATES.find(template => template.week === weekIndex + 1)
    || AGATHA_B2_LESSON_TEMPLATES[dayIndex % AGATHA_B2_LESSON_TEMPLATES.length];
  return {
    ...preferred,
    week: weekIndex + 1,
    day: dayOfWeek + 1,
    theme: dayOfWeek === 0
      ? preferred.theme
      : `${AGATHA_B2_WEEK_THEMES[weekIndex]}: practice ${dayOfWeek + 1}`,
  };
};

const ensureAgathaB2Lesson = (dayKey = getAgathaDateKey()) => {
  const db = getUsageDb();
  const existing = db.prepare(`
    SELECT *
    FROM agatha_b2_lessons
    WHERE day_key = ?
  `).get(dayKey) as any;
  if (existing) return existing;

  const dayIndex = getAgathaB2DayIndex(dayKey);
  const template = getAgathaB2Template(dayIndex);
  const lessonId = `b2-${dayKey}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO agatha_b2_lessons (
      lesson_id, day_key, day_index, week_number, theme, target, input_text,
      questions_json, phrases_json, grammar_focus, output_task, transfer_task, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    lessonId,
    dayKey,
    dayIndex,
    template.week,
    template.theme,
    template.target,
    template.inputText,
    JSON.stringify(template.questions),
    JSON.stringify(template.phrases),
    template.grammarFocus,
    template.outputTask,
    template.transferTask,
    now
  );

  return db.prepare("SELECT * FROM agatha_b2_lessons WHERE lesson_id = ?").get(lessonId) as any;
};

const parseJsonList = (value: unknown) => {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : [];
  } catch {
    return [];
  }
};

const agathaB2LessonPayload = (row: any) => ({
  id: row.lesson_id,
  dayKey: row.day_key,
  dayIndex: Number(row.day_index || 0),
  weekNumber: Number(row.week_number || 1),
  theme: row.theme,
  target: row.target,
  inputText: row.input_text,
  questions: parseJsonList(row.questions_json),
  phrases: parseJsonList(row.phrases_json),
  grammarFocus: row.grammar_focus,
  outputTask: row.output_task,
  transferTask: row.transfer_task,
  createdAt: row.created_at,
});

const detectAgathaB2Error = (answer: string, step: string) => {
  const clean = answer.trim();
  const lower = clean.toLowerCase();
  if (clean.length < 40) {
    return {
      category: "production",
      note: "Odpověď je zatím krátká. Na B2 míř na celé věty s důvodem nebo příkladem.",
    };
  }
  if (/\bweil\s+\w+\s+(bin|bist|ist|sind|seid|war|waren|habe|hat|haben|kann|können|muss|müssen)\b/i.test(clean)) {
    return {
      category: "word_order",
      note: "Zkontroluj slovosled ve větě s weil/dass/obwohl: určité sloveso má být na konci.",
    };
  }
  if (/\bich bin (interessiert|interessiere)\b/i.test(clean)) {
    return {
      category: "preposition",
      note: "Pozor na vazbu: sich interessieren für + Akkusativ nebo an etwas interessiert sein.",
    };
  }
  if (!/[.!?]$/.test(clean)) {
    return {
      category: "style",
      note: "Ukonči myšlenku jasnou interpunkcí; u delší B2 odpovědi to pomáhá čitelnosti.",
    };
  }
  return {
    category: step === "output" ? "cohesion" : "activation",
    note: "Dobrá pracovní odpověď. Při opakování přidej spojku, příklad a přesnější sloveso.",
  };
};

const buildAgathaB2Feedback = (answer: string, step: string, lesson: any) => {
  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  const phraseHits = parseJsonList(lesson.phrases_json).filter(phrase =>
    answer.toLowerCase().includes(phrase.toLowerCase())
  );
  const next = step === "retrieval"
    ? "Teď přejdi k cílovým frázím a použij je ve vlastních větách."
    : step === "activation"
      ? "Teď napiš delší výstup a spoj argumenty do souvislého textu."
      : "Zítra se k tomu vrátíme přes review frontu.";

  if (wordCount < 8) {
    return `Je to příliš krátké pro B2 trénink. Přidej aspoň dvě celé věty, důvod a konkrétní příklad. ${next}`;
  }

  const phraseNote = phraseHits.length
    ? `Použil jste ${phraseHits.length} cílové fráze: ${phraseHits.join(", ")}.`
    : "Zkus příště vědomě zapojit aspoň jednu cílovou frázi z lekce.";
  return `Uloženo. ${phraseNote} ${next}`;
};

const createAgathaB2ReviewItems = (lessonId: string, step: string, answer: string, dayKey = getAgathaDateKey()) => {
  const db = getUsageDb();
  const cleanAnswer = answer.trim().replace(/\s+/g, " ");
  const preview = cleanAnswer.length > 90 ? `${cleanAnswer.slice(0, 90)}...` : cleanAnswer;
  const insert = db.prepare(`
    INSERT INTO agatha_b2_review_items (lesson_id, prompt, due_date, source_step, completed_at)
    VALUES (?, ?, ?, ?, NULL)
  `);
  for (const days of [1, 3, 7]) {
    insert.run(
      lessonId,
      `Retell and improve this ${step} answer: ${preview}`,
      addDaysToDateKey(dayKey, days),
      step
    );
  }
};

const getAgathaB2State = () => {
  const db = getUsageDb();
  const todayKey = getAgathaDateKey();
  const lesson = ensureAgathaB2Lesson(todayKey);
  const attempts = (db.prepare(`
    SELECT id, lesson_id, step, answer, feedback, created_at
    FROM agatha_b2_attempts
    WHERE lesson_id = ?
    ORDER BY id ASC
  `).all(lesson.lesson_id) as any[]).map(row => ({
    id: Number(row.id),
    lessonId: row.lesson_id,
    step: row.step,
    answer: row.answer,
    feedback: row.feedback,
    createdAt: row.created_at,
  }));
  const dueReview = (db.prepare(`
    SELECT id, lesson_id, prompt, due_date, source_step, completed_at
    FROM agatha_b2_review_items
    WHERE completed_at IS NULL AND due_date <= ?
    ORDER BY due_date ASC, id ASC
    LIMIT 12
  `).all(todayKey) as any[]).map(row => ({
    id: Number(row.id),
    lessonId: row.lesson_id,
    prompt: row.prompt,
    dueDate: row.due_date,
    sourceStep: row.source_step,
    completedAt: row.completed_at,
  }));
  const recentErrors = (db.prepare(`
    SELECT id, lesson_id, category, note, source_step, created_at
    FROM agatha_b2_errors
    ORDER BY id DESC
    LIMIT 8
  `).all() as any[]).map(row => ({
    id: Number(row.id),
    lessonId: row.lesson_id,
    category: row.category,
    note: row.note,
    sourceStep: row.source_step,
    createdAt: row.created_at,
  }));
  const progress = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM agatha_b2_lessons) AS lessonsStarted,
      (SELECT COUNT(*) FROM agatha_b2_attempts) AS attempts,
      (SELECT COUNT(*) FROM agatha_b2_review_items WHERE completed_at IS NOT NULL) AS reviewsDone,
      (SELECT COUNT(*) FROM agatha_b2_review_items WHERE completed_at IS NULL AND due_date <= ?) AS reviewsDue
  `).get(todayKey) as any;

  return {
    lesson: agathaB2LessonPayload(lesson),
    attempts,
    dueReview,
    recentErrors,
    progress: {
      lessonsStarted: Number(progress?.lessonsStarted || 0),
      attempts: Number(progress?.attempts || 0),
      reviewsDone: Number(progress?.reviewsDone || 0),
      reviewsDue: Number(progress?.reviewsDue || 0),
      courseWeek: Number(lesson.week_number || 1),
      courseDay: (Number(lesson.day_index || 0) % 7) + 1,
      weekThemes: AGATHA_B2_WEEK_THEMES,
    },
  };
};

const normalizeAgathaAnswer = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?()[\]"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getAgathaExpectedAnswers = (verb: any, promptKind: string) => {
  if (promptKind === "present3") return [verb.present3];
  if (promptKind === "preterite") return [verb.preterite];
  if (promptKind === "perfect") {
    const participle = stripGermanAuxiliary(verb.perfect);
    return [verb.perfect, participle].filter(Boolean);
  }
  if (promptKind === "translationCs") {
    return verb.translationCs.split(/[,;]/).map(item => item.trim()).filter(Boolean);
  }
  return [verb.infinitive];
};

const getAgathaPromptLabel = (promptKind: string) => {
  if (promptKind === "present3") return "3. osoba jednotného čísla";
  if (promptKind === "preterite") return "Präteritum";
  if (promptKind === "perfect") return "Partizip II";
  if (promptKind === "translationCs") return "český význam";
  return "infinitiv";
};

const storeAgathaChatMessage = (role: "user" | "assistant", text: string) => {
  const db = getUsageDb();
  const cleanText = text.trim();
  if (!cleanText) return;
  db.prepare(`
    INSERT INTO agatha_chat_messages (role, text, created_at)
    VALUES (?, ?, ?)
  `).run(role, cleanText, new Date().toISOString());
};

const buildAgathaReply = (message: string) => {
  const cleanMessage = message.trim();
  const normalized = normalizeSearchText(cleanMessage);
  const today = ensureTodayAgathaVerb();
  const stats = getAgathaStats();

  if (!cleanMessage) return "Napište celou odpověď, prosím. Hádat pohledem se nepočítá.";
  if (normalized.includes("zkous") || normalized.includes("kart") || normalized.includes("flash")) {
    return `Gut. V kartičce napište tvar slovesa ${today.infinitive}; odpověď musí být napsaná, ne jen odkliknutá.`;
  }
  if (normalized.includes("dnes") || normalized.includes("sloves")) {
    return `Dnešní sloveso je ${today.infinitive}: ${today.preterite}, ${today.perfect}. Věta: ${today.example}`;
  }
  if (normalized.includes("stat") || normalized.includes("kolik")) {
    return `V databázi máte ${stats.knownVerbs} sloves a ${stats.correct}/${stats.attempts} správných písemných odpovědí.`;
  }
  if (normalized.includes("ahoj") || normalized.includes("hallo") || normalized.includes("guten")) {
    return `Guten Tag. Dnes pracujeme se slovesem ${today.infinitive}. Žádné slavnostní obcházení, rovnou psát.`;
  }

  return `Rozumím. Zapište to německy pokud možno celou větou. Dnešní opora: ${today.infinitive}, ${today.preterite}, ${today.perfect}.`;
};

const readGmailTriageState = async () => {
  try {
    const raw = await fs.readFile(GMAIL_TRIAGE_STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const storeGmailTriageState = async (state: any) => {
  await fs.mkdir(TOKEN_DIR, { recursive: true });
  await fs.writeFile(GMAIL_TRIAGE_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  return state;
};

const getHeaderValue = (headers: any[] | undefined, name: string) =>
  headers?.find(header => String(header?.name || "").toLowerCase() === name.toLowerCase())?.value || "";

const gmailMessageUrl = (messageId: string) => `https://mail.google.com/mail/#all/${encodeURIComponent(messageId)}`;

const classifyGmailMessage = (message: any, lowPrioritySenders: string[]) => {
  const headers = message.payload?.headers || [];
  const sender = String(getHeaderValue(headers, "From")).trim();
  const subject = String(getHeaderValue(headers, "Subject") || "(Bez předmětu)").trim();
  const date = String(getHeaderValue(headers, "Date")).trim();
  const snippet = String(message.snippet || "").trim();
  const haystack = normalizeSearchText([sender, subject, snippet].join(" "));
  const senderRuleMatched = lowPrioritySenders.some(senderRule =>
    senderRule && haystack.includes(normalizeSearchText(senderRule))
  );
  const isUnread = Array.isArray(message.labelIds) && message.labelIds.includes("UNREAD");
  const securityTerms = ["otp", "one-time", "security", "verification", "overeni", "ověření", "password", "heslo", "kod", "kód"];
  const actionTerms = ["invoice", "rechnung", "payment", "zahlung", "reminder", "erinnerung", "deadline", "frist", "termin", "invitation", "einladung", "confirm", "potvr", "reply", "antwort", "bewerbung", "order", "objednavka"];
  const newsletterTerms = ["newsletter", "sale", "sleva", "aktion", "angebot", "digest", "unsubscribe", "promo", "marketing"];
  const uncertainTerms = ["maybe", "depends", "frage", "question", "angebot", "nabidka", "nabídka", "information", "info"];
  const item = {
    id: String(message.id || ""),
    sender,
    subject,
    summary: snippet,
    nextAction: "",
    bucket: "",
    date,
    url: gmailMessageUrl(String(message.id || "")),
    audit: "Read-only daily triage; no Gmail labels were changed.",
  };

  if (senderRuleMatched || newsletterTerms.some(term => haystack.includes(term))) {
    return {
      bucket: "lowPriorityActions",
      item: {
        ...item,
        bucket: senderRuleMatched ? "sender rule" : "newsletter",
        nextAction: "Suggested low priority; left unchanged in Gmail.",
      },
    };
  }

  if (securityTerms.some(term => haystack.includes(term))) {
    return {
      bucket: "attentionNeeded",
      item: {
        ...item,
        bucket: "security",
        nextAction: "Verify whether this security or verification message was expected.",
      },
    };
  }

  if (isUnread || actionTerms.some(term => haystack.includes(term))) {
    return {
      bucket: "attentionNeeded",
      item: {
        ...item,
        bucket: isUnread ? "unread/action" : "action",
        nextAction: "Review and decide whether a reply or concrete action is needed.",
      },
    };
  }

  if (uncertainTerms.some(term => haystack.includes(term))) {
    return {
      bucket: "uncertainItems",
      item: {
        ...item,
        bucket: "uncertain",
        nextAction: "Check context before filing or replying.",
      },
    };
  }

  return {
    bucket: "lowPriorityActions",
    item: {
      ...item,
      bucket: "can wait",
      nextAction: "No immediate action detected; left unchanged in Gmail.",
    },
  };
};

const runGmailDailyTriageNow = async ({ force = false, source = "manual" } = {}) => {
  if (gmailTriageRunPromise) return gmailTriageRunPromise;

  gmailTriageRunPromise = (async () => {
    const today = getLocalDateKey();
    const state = await readGmailTriageState();
    if (!force && state.lastSuccessfulDay === today) {
      const briefs = await readGmailBriefs();
      return {
        skipped: true,
        reason: "Gmail triage už dnes proběhla.",
        day: today,
        latest: briefs[0] || null,
      };
    }

    const oauth2Client = await getAuthenticatedClient();
    if (!oauth2Client) {
      throw new Error("Google účet není připojený. Připoj Google znovu, aby Jeeves mohl číst Gmail.");
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const lowPrioritySenders = await readGmailLowPrioritySenders();
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      maxResults: 30,
      q: "newer_than:14d",
    });
    const messageRefs = listResponse.data.messages || [];
    const messages = await Promise.all(
      messageRefs.map(async ref => {
        const response = await gmail.users.messages.get({
          userId: "me",
          id: String(ref.id),
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        return response.data;
      })
    );
    const buckets: Record<string, any[]> = {
      attentionNeeded: [],
      draftsCreated: [],
      lowPriorityActions: [],
      uncertainItems: [],
    };

    for (const message of messages) {
      const classified = classifyGmailMessage(message, lowPrioritySenders);
      buckets[classified.bucket].push(classified.item);
    }

    const attentionTop = buckets.attentionNeeded.slice(0, 5);
    const brief = await storeGmailBrief({
      id: `gmail-daily-${today}`,
      timestamp: new Date().toISOString(),
      source: `jeeves-daily-gmail-triage:${source}`,
      counts: {
        scanned: messages.length,
        attentionNeeded: buckets.attentionNeeded.length,
        draftsCreated: buckets.draftsCreated.length,
        lowPriorityActions: buckets.lowPriorityActions.length,
        uncertainItems: buckets.uncertainItems.length,
      },
      attentionNeeded: buckets.attentionNeeded,
      draftsCreated: buckets.draftsCreated,
      lowPriorityActions: buckets.lowPriorityActions,
      uncertainItems: buckets.uncertainItems,
      nextFollowUps: attentionTop.map(item => `${item.subject}: ${item.nextAction}`),
      summary: `Daily Gmail triage scanned ${messages.length} recent messages. No Gmail labels were changed.`,
    });
    const baxter = await forwardGmailBriefToBaxter(brief);
    await storeGmailTriageState({
      lastSuccessfulDay: today,
      lastSuccessfulAt: new Date().toISOString(),
      lastBriefId: brief.id,
      scanned: messages.length,
      source,
    });

    return { skipped: false, day: today, brief, baxter };
  })().finally(() => {
    gmailTriageRunPromise = null;
  });

  return gmailTriageRunPromise;
};

const runGmailDailyTriageOnStartup = () => {
  setTimeout(() => {
    runGmailDailyTriageNow({ force: false, source: "startup" })
      .then(result => {
        if (result?.skipped) {
          console.log(`Gmail triage skipped: ${result.reason}`);
        } else {
          console.log(`Gmail triage completed for ${result.day}`);
        }
      })
      .catch(error => console.warn("Gmail daily triage did not run", error.message));
  }, 2500);
};

const buildGmailQuickBrief = (brief: any) => {
  if (!brief) return null;

  const counts = brief.counts || {};
  const attentionNeeded = Array.isArray(brief.attentionNeeded) ? brief.attentionNeeded : [];
  const uncertainItems = Array.isArray(brief.uncertainItems) ? brief.uncertainItems : [];
  const draftsCreated = Array.isArray(brief.draftsCreated) ? brief.draftsCreated : [];
  const lowPriorityActions = Array.isArray(brief.lowPriorityActions) ? brief.lowPriorityActions : [];
  const nextFollowUps = Array.isArray(brief.nextFollowUps) ? brief.nextFollowUps : [];
  const topItems = attentionNeeded.slice(0, 5).map((item: any) => ({
    id: item.id,
    sender: item.sender,
    subject: item.subject || "Bez předmětu",
    summary: item.nextAction || item.summary || "Zkontrolovat a rozhodnout další krok.",
    url: item.url,
  }));
  const nextActions = nextFollowUps.slice(0, 3);
  const attentionCount = Number(counts.attentionNeeded ?? attentionNeeded.length);
  const uncertainCount = Number(counts.uncertainItems ?? uncertainItems.length);
  const draftsCount = Number(counts.draftsCreated ?? draftsCreated.length);
  const lowPriorityCount = Number(counts.lowPriorityActions ?? lowPriorityActions.length);
  const scannedCount = Number(counts.scanned ?? 0);
  const headlineParts = [];

  if (attentionCount > 0) headlineParts.push(`${attentionCount} věcí chce pozornost`);
  if (draftsCount > 0) headlineParts.push(`${draftsCount} návrhů čeká na kontrolu`);
  if (uncertainCount > 0) headlineParts.push(`${uncertainCount} nejisté`);
  if (headlineParts.length === 0) headlineParts.push("Inbox je bez rychlé akce");

  return {
    id: brief.id,
    lastRunAt: brief.timestamp,
    headline: headlineParts.join(", ") + ".",
    summary: String(brief.summary || "").trim(),
    counts: {
      scanned: scannedCount,
      attentionNeeded: attentionCount,
      draftsCreated: draftsCount,
      lowPriorityActions: lowPriorityCount,
      uncertainItems: uncertainCount,
    },
    topItems,
    nextActions,
    baxterUrl: BAXTER_URL,
  };
};

const normalizeSenderRule = (value: unknown) =>
  String(value || "")
    .replace(/^from:\s*/i, "")
    .trim();

const readGmailLowPrioritySenders = async () => {
  try {
    const raw = await fs.readFile(GMAIL_LOW_PRIORITY_SENDERS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    const senders = Array.isArray(parsed?.senders) ? parsed.senders : [];
    return senders
      .map(normalizeSenderRule)
      .filter(Boolean)
      .filter((sender: string, index: number, all: string[]) =>
        all.findIndex(item => item.toLowerCase() === sender.toLowerCase()) === index
      );
  } catch {
    return [];
  }
};

const storeGmailLowPrioritySenders = async (senders: string[]) => {
  const cleanSenders = senders
    .map(normalizeSenderRule)
    .filter(Boolean)
    .filter((sender, index, all) =>
      all.findIndex(item => item.toLowerCase() === sender.toLowerCase()) === index
    )
    .sort((a, b) => a.localeCompare(b, "cs"));

  await fs.mkdir(TOKEN_DIR, { recursive: true });
  await fs.writeFile(
    GMAIL_LOW_PRIORITY_SENDERS_FILE,
    JSON.stringify({ updatedAt: new Date().toISOString(), senders: cleanSenders }, null, 2),
    "utf-8"
  );
  return cleanSenders;
};

const addGmailLowPrioritySender = async (sender: unknown) => {
  const cleanSender = normalizeSenderRule(sender);
  if (!cleanSender) {
    throw new Error("Chybí odesílatel pro uklízení.");
  }

  const currentSenders = await readGmailLowPrioritySenders();
  return storeGmailLowPrioritySenders([...currentSenders, cleanSender]);
};

const storeGmailBrief = async (payload: any) => {
  const brief = normalizeGmailBriefPayload(payload);
  await fs.mkdir(TOKEN_DIR, { recursive: true });
  const briefs = [brief, ...(await readGmailBriefs()).filter((item: any) => item?.id !== brief.id)].slice(0, 20);
  await fs.writeFile(GMAIL_BRIEF_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), briefs }, null, 2), "utf-8");
  return brief;
};

const forwardGmailBriefToBaxter = async (brief: any) => {
  try {
    await ensureBaxterRunning();
    const response = await fetch(`${BAXTER_URL}/api/gmail-briefs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(brief),
    });
    const data = await response.json().catch(() => ({}));
    return { forwarded: response.ok, status: response.status, data };
  } catch (error: any) {
    return { forwarded: false, reason: error.message };
  }
};

const sendAdvertToBaxter = async (advertUrl: string) => {
  const cleanUrl = advertUrl.trim();
  if (!/^https?:\/\//i.test(cleanUrl)) {
    throw new Error("URL inzerátu musí začínat http:// nebo https://.");
  }

  const now = Date.now();
  if (cleanUrl === lastBaxterAdvertUrl && now - lastBaxterAdvertAt < 5000) {
    return {
      status: "done",
      message: "Tenhle inzerát už Baxter zpracovává.",
      details: { source_url: cleanUrl },
      url: BAXTER_URL,
    };
  }
  lastBaxterAdvertUrl = cleanUrl;
  lastBaxterAdvertAt = now;

  await ensureBaxterRunning();

  const response = await fetch(`${BAXTER_URL}/api/applications/from-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: cleanUrl }),
  });
  const data = await response.json().catch(() => ({}));
  const enriched = enrichBaxterApplicationResponse(data);

  if (!response.ok || data.status === "failed") {
    throw new Error(data.message || `Baxter vrátil chybu ${response.status}.`);
  }

  return enriched;
};

const toAbsoluteUrl = (url: string, baseUrl: string) => {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
};

const addTokenDetails = (target: Record<string, number>, details: any[] | undefined, fallbackTokens = 0, fallbackModality = "unknown") => {
  if (Array.isArray(details) && details.length > 0) {
    for (const detail of details) {
      const modality = normalizeModality(detail?.modality);
      target[modality] = (target[modality] || 0) + Number(detail?.tokenCount || 0);
    }
    return;
  }

  if (fallbackTokens > 0) {
    target[fallbackModality] = (target[fallbackModality] || 0) + fallbackTokens;
  }
};

const calculateUsageCost = (usageMetadata: any) => {
  const inputTokens = { text: 0, audio: 0, image: 0, video: 0, unknown: 0 };
  const outputTokens = { text: 0, audio: 0, image: 0, video: 0, unknown: 0 };

  addTokenDetails(inputTokens, usageMetadata.promptTokensDetails, Number(usageMetadata.promptTokenCount || 0), "unknown");
  addTokenDetails(inputTokens, usageMetadata.toolUsePromptTokensDetails, Number(usageMetadata.toolUsePromptTokenCount || 0), "text");
  addTokenDetails(outputTokens, usageMetadata.responseTokensDetails, Number(usageMetadata.responseTokenCount || usageMetadata.candidatesTokenCount || 0), "audio");

  const thoughtsTokenCount = Number(usageMetadata.thoughtsTokenCount || 0);
  if (thoughtsTokenCount > 0) {
    outputTokens.text += thoughtsTokenCount;
  }

  const inputCostUsd = Object.entries(inputTokens).reduce((sum, [modality, tokens]) => {
    return sum + (tokens / 1_000_000) * GEMINI_LIVE_PRICING_USD_PER_1M.input[modality as keyof typeof GEMINI_LIVE_PRICING_USD_PER_1M.input];
  }, 0);
  const outputCostUsd = Object.entries(outputTokens).reduce((sum, [modality, tokens]) => {
    return sum + (tokens / 1_000_000) * GEMINI_LIVE_PRICING_USD_PER_1M.output[modality as keyof typeof GEMINI_LIVE_PRICING_USD_PER_1M.output];
  }, 0);

  return {
    inputTokens,
    outputTokens,
    totalTokenCount: Number(usageMetadata.totalTokenCount || 0),
    costUsd: inputCostUsd + outputCostUsd,
  };
};

const getMonthlyUsage = (month = getMonthKey()) => {
  const db = getUsageDb();
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(cost_usd), 0) AS costUsd,
      COALESCE(SUM(total_token_count), 0) AS totalTokenCount,
      COALESCE(SUM(prompt_text_tokens), 0) AS promptTextTokens,
      COALESCE(SUM(prompt_audio_tokens), 0) AS promptAudioTokens,
      COALESCE(SUM(prompt_image_tokens), 0) AS promptImageTokens,
      COALESCE(SUM(prompt_video_tokens), 0) AS promptVideoTokens,
      COALESCE(SUM(prompt_unknown_tokens), 0) AS promptUnknownTokens,
      COALESCE(SUM(response_text_tokens), 0) AS responseTextTokens,
      COALESCE(SUM(response_audio_tokens), 0) AS responseAudioTokens,
      COALESCE(SUM(response_image_tokens), 0) AS responseImageTokens,
      COALESCE(SUM(response_video_tokens), 0) AS responseVideoTokens,
      COALESCE(SUM(response_unknown_tokens), 0) AS responseUnknownTokens
    FROM usage_sessions
    WHERE month = ?
  `).get(month) as any;

  return {
    month,
    currency: "USD",
    totalCostUsd: Number(row?.costUsd || 0),
    totalTokenCount: Number(row?.totalTokenCount || 0),
    promptTokens: {
      text: Number(row?.promptTextTokens || 0),
      audio: Number(row?.promptAudioTokens || 0),
      image: Number(row?.promptImageTokens || 0),
      video: Number(row?.promptVideoTokens || 0),
      unknown: Number(row?.promptUnknownTokens || 0),
    },
    responseTokens: {
      text: Number(row?.responseTextTokens || 0),
      audio: Number(row?.responseAudioTokens || 0),
      image: Number(row?.responseImageTokens || 0),
      video: Number(row?.responseVideoTokens || 0),
      unknown: Number(row?.responseUnknownTokens || 0),
    },
  };
};

const getRedirectUri = () => {
  const appUrl = process.env.APP_URL?.replace(/\/$/, '') || `http://localhost:${PORT}`;
  return `${appUrl}/auth/callback`;
};

const getOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
};

const readStoredTokens = async () => {
  try {
    return JSON.parse(await fs.readFile(TOKEN_FILE, "utf8"));
  } catch {
    return null;
  }
};

const hasUsableGoogleTokens = (tokens: any) => {
  if (!tokens) return false;
  if (tokens.refresh_token) return true;
  return false;
};

const hasAnyGoogleTokens = (tokens: any) => !!tokens?.refresh_token || !!tokens?.access_token;
const hasGoogleScope = (tokens: any, scope: string) => String(tokens?.scope || "").split(/\s+/).includes(scope);
const hasGoogleScopes = (tokens: any, scopes: string[]) => scopes.every(scope => hasGoogleScope(tokens, scope));
const hasUsableCalendarTokens = (tokens: any) =>
  hasUsableGoogleTokens(tokens) && hasGoogleScopes(tokens, REQUIRED_GOOGLE_CALENDAR_SCOPES);

const storeTokens = async (tokens: any) => {
  const existingTokens = await readStoredTokens();
  const mergedTokens = {
    ...existingTokens,
    ...tokens,
    refresh_token: tokens.refresh_token || existingTokens?.refresh_token,
  };

  await fs.mkdir(TOKEN_DIR, { recursive: true });
  await fs.writeFile(TOKEN_FILE, JSON.stringify(mergedTokens, null, 2), "utf8");
  return mergedTokens;
};

const getAuthenticatedClient = async () => {
  const storedTokens = await readStoredTokens();
  if (!storedTokens) return null;
  if (!hasUsableGoogleTokens(storedTokens)) return null;

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials(storedTokens);
  oauth2Client.on("tokens", (tokens) => {
    storeTokens(tokens).catch((error) => console.error("Failed to store refreshed Google tokens", error));
  });

  return oauth2Client;
};

app.get("/api/auth/url", (req, res) => {
  const oauth2Client = getOAuth2Client();
  const forceConsent = req.query.force === "true";
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    scope: [
      GOOGLE_CALENDAR_READONLY_SCOPE,
      GOOGLE_CALENDAR_EVENTS_SCOPE
    ],
    ...(forceConsent ? { prompt: "consent" } : {})
  });
  res.json({ url });
});

app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
    const { code } = req.query;
  try {
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);
    await storeTokens(tokens);
    res.cookie("google_tokens", JSON.stringify(tokens), {
      secure: true,
      sameSite: "none",
      httpOnly: true,
    });
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autentizace proběhla úspěšně. Toto okno se automaticky zavře.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("OAuth error", error);
    res.status(500).send("Authentication failed");
  }
});

app.get("/api/auth/status", (req, res) => {
  readStoredTokens()
    .then((tokens) => {
      const cookieTokens = req.cookies.google_tokens ? JSON.parse(req.cookies.google_tokens) : null;
      const connected = hasUsableCalendarTokens(tokens) || hasUsableCalendarTokens(cookieTokens);
      const hasTokens = hasAnyGoogleTokens(tokens) || hasAnyGoogleTokens(cookieTokens);
      res.json({
        connected,
        reconnectRequired: !connected && hasTokens,
        missingCalendarWriteScope: hasTokens && !connected,
      });
    })
    .catch(() => res.json({ connected: false, reconnectRequired: true }));
});

app.post("/api/auth/disconnect", async (req, res) => {
  res.clearCookie("google_tokens", { secure: true, sameSite: "none", httpOnly: true });
  await fs.rm(TOKEN_FILE, { force: true });
  res.json({ success: true });
});

app.get("/api/usage/current-month", (req, res) => {
  try {
    res.json(getMonthlyUsage());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/baxter/open", async (req, res) => {
  try {
    const result = await openBaxter();
    res.json({ success: true, result, url: BAXTER_URL });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/aunt-agatha/open", async (req, res) => {
  try {
    res.json({
      success: true,
      result: "Aunt Agatha je připravená přímo v Jeevesovi.",
      ...getAgathaState(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/aunt-agatha/state", (req, res) => {
  try {
    res.json(getAgathaState());
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/aunt-agatha/import-verbs", async (req, res) => {
  try {
    const result = await importAgathaVerbCatalog({ force: Boolean(req.body?.force) });
    res.json({ success: true, ...result, state: getAgathaState() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/aunt-agatha/b2/today", (req, res) => {
  try {
    res.json({ success: true, ...getAgathaB2State() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/aunt-agatha/b2/attempt", (req, res) => {
  try {
    const lessonId = String(req.body?.lessonId || "").trim();
    const step = String(req.body?.step || "").trim();
    const answer = String(req.body?.answer || "").trim();
    if (!lessonId) return res.status(400).json({ success: false, error: "Chybí lekce." });
    if (!["retrieval", "activation", "output"].includes(step)) {
      return res.status(400).json({ success: false, error: "Neznámý krok lekce." });
    }
    if (!answer) return res.status(400).json({ success: false, error: "Odpověď musí být napsaná." });

    const db = getUsageDb();
    const lesson = db.prepare("SELECT * FROM agatha_b2_lessons WHERE lesson_id = ?").get(lessonId) as any;
    if (!lesson) return res.status(404).json({ success: false, error: "Lekce nebyla nalezena." });

    const feedback = buildAgathaB2Feedback(answer, step, lesson);
    const createdAt = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO agatha_b2_attempts (lesson_id, step, answer, feedback, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(lessonId, step, answer, feedback, createdAt) as any;
    const errorItem = detectAgathaB2Error(answer, step);
    db.prepare(`
      INSERT INTO agatha_b2_errors (lesson_id, category, note, source_step, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(lessonId, errorItem.category, errorItem.note, step, createdAt);
    createAgathaB2ReviewItems(lessonId, step, answer, lesson.day_key);

    res.json({
      success: true,
      attempt: {
        id: Number(result?.lastInsertRowid || 0),
        lessonId,
        step,
        answer,
        feedback,
        createdAt,
      },
      errorItem,
      ...getAgathaB2State(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/aunt-agatha/b2/review/:id", (req, res) => {
  try {
    const reviewId = Number(req.params.id);
    if (!Number.isFinite(reviewId)) return res.status(400).json({ success: false, error: "Neplatné review ID." });
    const db = getUsageDb();
    db.prepare(`
      UPDATE agatha_b2_review_items
      SET completed_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), reviewId);
    res.json({ success: true, ...getAgathaB2State() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/aunt-agatha/chat", (req, res) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (!message) {
      return res.status(400).json({ success: false, error: "Chybí zpráva." });
    }

    storeAgathaChatMessage("user", message);
    const reply = buildAgathaReply(message);
    storeAgathaChatMessage("assistant", reply);
    res.json({
      success: true,
      reply,
      ...getAgathaState(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/aunt-agatha/review", (req, res) => {
  try {
    const verbId = String(req.body?.verbId || "").trim();
    const promptKind = String(req.body?.promptKind || "").trim();
    const answer = String(req.body?.answer || "").trim();
    const verb = getAgathaVerbById(verbId);
    if (!verb) return res.status(404).json({ success: false, error: "Sloveso nebylo nalezeno." });
    if (!answer) return res.status(400).json({ success: false, error: "Odpověď musí být napsaná." });

    const expectedAnswers = getAgathaExpectedAnswers(verb, promptKind);
    const normalizedAnswer = normalizeAgathaAnswer(answer);
    const correct = expectedAnswers.some(expected => normalizeAgathaAnswer(expected) === normalizedAnswer);
    const expected = expectedAnswers[0] || "";
    const createdAt = new Date().toISOString();
    const db = getUsageDb();

    db.prepare(`
      INSERT INTO agatha_review_attempts (verb_id, prompt_kind, answer, expected, correct, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(verb.id, promptKind, answer, expected, correct ? 1 : 0, createdAt);

    const label = getAgathaPromptLabel(promptKind);
    const reply = correct
      ? `Správně. ${verb.infinitive}, ${label}: ${expected}.`
      : `Ne. ${verb.infinitive}, ${label}: ${expected}. Napsal jste: ${answer}.`;
    storeAgathaChatMessage("assistant", reply);

    res.json({
      success: true,
      correct,
      expected,
      expectedAnswers,
      reply,
      stats: getAgathaStats(),
      messages: getAgathaMessages(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/baxter/applications/from-url", async (req, res) => {
  try {
    const advertUrl = typeof req.body?.url === "string" ? req.body.url : "";
    const result = await sendAdvertToBaxter(advertUrl);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, status: "failed", message: error.message });
  }
});

app.get("/api/baxter/gmail-brief/latest", async (req, res) => {
  try {
    const briefs = await readGmailBriefs();
    const lowPrioritySenders = await readGmailLowPrioritySenders();
    res.json({ latest: briefs[0] || null, briefs, lowPrioritySenders });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/baxter/gmail-brief/quick", async (req, res) => {
  try {
    const briefs = await readGmailBriefs();
    const lowPrioritySenders = await readGmailLowPrioritySenders();
    res.json({
      latest: buildGmailQuickBrief(briefs[0] || null),
      sourceBriefId: briefs[0]?.id || null,
      lowPrioritySenders,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/baxter/gmail-triage/run", async (req, res) => {
  res.status(410).json({
    success: false,
    error: "Lokální Gmail triage v Jeeves je vypnutá. Použij Codex Gmail automatizaci a pošli brief do Baxtera.",
  });
});

app.get("/api/baxter/gmail-triage/status", async (req, res) => {
  try {
    res.json(await readGmailTriageState());
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/baxter/gmail-brief", async (req, res) => {
  try {
    const briefs = await readGmailBriefs();
    const lowPrioritySenders = await readGmailLowPrioritySenders();
    res.json({ latest: briefs[0] || null, briefs, lowPrioritySenders });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/baxter/gmail-brief", async (req, res) => {
  try {
    const brief = await storeGmailBrief(req.body);
    const baxter = await forwardGmailBriefToBaxter(brief);
    res.json({ success: true, brief, baxter });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/baxter/gmail-brief/low-priority-senders", async (req, res) => {
  try {
    res.json({ senders: await readGmailLowPrioritySenders() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/baxter/gmail-brief/low-priority-senders", async (req, res) => {
  try {
    const senders = await addGmailLowPrioritySender(req.body?.sender);
    res.json({ success: true, senders });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post("/api/netflix/open", (req, res) => {
  const { title } = req.body;
  const result = openNetflix(title);
  res.json({ success: true, ...result });
});

app.post("/api/video/shaun", (req, res) => {
  openUrlInWindows("C:\\Users\\Vladimir\\Documents\\Max30\\Max Out Sweat.mp4");
  res.json({ success: true, result: "Video se Shaunem bylo spuštěno." });
});

app.post("/api/folder/max30", (req, res) => {
  openUrlInWindows("C:\\Users\\Vladimir\\Documents\\Max30");
  res.json({ success: true, result: "Složka Max30 byla otevřena." });
});

app.post("/api/usage/live", (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();
    const model = String(req.body?.model || "gemini-3.1-flash-live-preview").trim();
    const usageMetadata = req.body?.usageMetadata;

    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId" });
    }
    if (!usageMetadata || typeof usageMetadata !== "object") {
      return res.status(400).json({ error: "Missing usageMetadata" });
    }

    const month = getMonthKey();
    const createdAt = new Date().toISOString();
    const summary = calculateUsageCost(usageMetadata);
    const metadataJson = JSON.stringify(usageMetadata);
    const db = getUsageDb();

    db.prepare(`
      INSERT INTO usage_snapshots (
        session_id,
        month,
        model,
        created_at,
        total_token_count,
        cost_usd,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      month,
      model,
      createdAt,
      summary.totalTokenCount,
      summary.costUsd,
      metadataJson
    );

    db.prepare(`
      INSERT INTO usage_sessions (
        session_id,
        month,
        model,
        updated_at,
        prompt_text_tokens,
        prompt_audio_tokens,
        prompt_image_tokens,
        prompt_video_tokens,
        prompt_unknown_tokens,
        response_text_tokens,
        response_audio_tokens,
        response_image_tokens,
        response_video_tokens,
        response_unknown_tokens,
        total_token_count,
        cost_usd,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, month) DO UPDATE SET
        model = excluded.model,
        updated_at = excluded.updated_at,
        prompt_text_tokens = excluded.prompt_text_tokens,
        prompt_audio_tokens = excluded.prompt_audio_tokens,
        prompt_image_tokens = excluded.prompt_image_tokens,
        prompt_video_tokens = excluded.prompt_video_tokens,
        prompt_unknown_tokens = excluded.prompt_unknown_tokens,
        response_text_tokens = excluded.response_text_tokens,
        response_audio_tokens = excluded.response_audio_tokens,
        response_image_tokens = excluded.response_image_tokens,
        response_video_tokens = excluded.response_video_tokens,
        response_unknown_tokens = excluded.response_unknown_tokens,
        total_token_count = excluded.total_token_count,
        cost_usd = excluded.cost_usd,
        metadata_json = excluded.metadata_json
    `).run(
      sessionId,
      month,
      model,
      createdAt,
      summary.inputTokens.text,
      summary.inputTokens.audio,
      summary.inputTokens.image,
      summary.inputTokens.video,
      summary.inputTokens.unknown,
      summary.outputTokens.text,
      summary.outputTokens.audio,
      summary.outputTokens.image,
      summary.outputTokens.video,
      summary.outputTokens.unknown,
      summary.totalTokenCount,
      summary.costUsd,
      metadataJson
    );

    res.json(getMonthlyUsage(month));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Middleware to check auth
const requireAuth = async (req: any, res: any, next: any) => {
  try {
    const rejectReconnect = () => res.status(401).json({
      error: "Google Calendar needs reconnect",
      reconnectRequired: true,
      missingCalendarWriteScope: true,
    });

    const storedTokens = await readStoredTokens();
    const storedClient = await getAuthenticatedClient();
    if (storedClient) {
      if (!hasUsableCalendarTokens(storedTokens)) {
        return rejectReconnect();
      }
      req.oauth2Client = storedClient;
      return next();
    }

    if (!req.cookies.google_tokens) {
      return res.status(401).json({ error: "Not authenticated with Google" });
    }

    const tokens = JSON.parse(req.cookies.google_tokens);
    if (!hasUsableCalendarTokens(tokens)) {
      return rejectReconnect();
    }

    req.oauth2Client = getOAuth2Client();
    req.oauth2Client.setCredentials(tokens);
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid tokens" });
  }
};

type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

type CalendarTimeParts = {
  hour: number;
  minute: number;
};

const padCalendarPart = (value: number) => String(value).padStart(2, "0");

const getCalendarDatePartsInPrague = (date = new Date()): CalendarDateParts => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GOOGLE_CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find(part => part.type === "year")?.value || date.getFullYear()),
    month: Number(parts.find(part => part.type === "month")?.value || date.getMonth() + 1),
    day: Number(parts.find(part => part.type === "day")?.value || date.getDate()),
  };
};

const parseCalendarDateParts = (value: unknown): CalendarDateParts | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return getCalendarDatePartsInPrague(value);
  }

  const text = String(value ?? "").trim();
  const isoMatch = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return { year: Number(year), month: Number(month), day: Number(day) };
  }

  const compactMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})/);
  if (compactMatch) {
    const [, day, month, rawYear] = compactMatch;
    const year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
    return { year, month: Number(month), day: Number(day) };
  }

  return null;
};

const parseCalendarTimeParts = (value: unknown): CalendarTimeParts | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const hour = Math.trunc(value);
    return hour >= 0 && hour <= 23 ? { hour, minute: 0 } : null;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const standaloneMatch = text.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  const dateTimeMatch = text.match(/(?:T|\s)(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i);
  const match = standaloneMatch || dateTimeMatch;
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
};

const isValidCalendarDate = (parts: CalendarDateParts) => {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return date.getUTCFullYear() === parts.year
    && date.getUTCMonth() === parts.month - 1
    && date.getUTCDate() === parts.day;
};

const formatCalendarDateTime = (dateParts: CalendarDateParts, timeParts: CalendarTimeParts) =>
  `${dateParts.year}-${padCalendarPart(dateParts.month)}-${padCalendarPart(dateParts.day)}T${padCalendarPart(timeParts.hour)}:${padCalendarPart(timeParts.minute)}:00`;

const calendarDateTimeToComparable = (dateTime: string) => {
  const match = dateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return Number.NaN;
  const [, year, month, day, hour, minute] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
};

const getCalendarDateTimeParts = (dateTime: string) => {
  const match = dateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
};

const getTimeZoneOffsetMs = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value || 0);
  const zonedAsUtc = Date.UTC(
    partValue("year"),
    partValue("month") - 1,
    partValue("day"),
    partValue("hour"),
    partValue("minute"),
    partValue("second"),
  );

  return zonedAsUtc - date.getTime();
};

const pragueWallDateTimeToUtcDate = (dateTime: string) => {
  const parts = getCalendarDateTimeParts(dateTime);
  if (!parts) throw new Error("Neplatný čas kalendářního vyhledávání.");

  const wallTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let utcTime = wallTime;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    utcTime = wallTime - getTimeZoneOffsetMs(new Date(utcTime), GOOGLE_CALENDAR_TIME_ZONE);
  }

  return new Date(utcTime);
};

const normalizeCalendarQueryDateTime = (value: unknown, fallbackDateParts: CalendarDateParts, fallbackHour: number) =>
  pragueWallDateTimeToUtcDate(
    normalizeCalendarDateTime(value, parseCalendarDateParts(value) || fallbackDateParts, { hour: fallbackHour, minute: 0 })
  ).toISOString();

const addMinutesToCalendarDateTime = (dateTime: string, minutes: number) => {
  const value = calendarDateTimeToComparable(dateTime);
  const date = new Date(value + minutes * 60000);
  return formatCalendarDateTime(
    {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    },
    {
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    }
  );
};

const normalizeCalendarDateTime = (
  value: unknown,
  fallbackDateParts: CalendarDateParts,
  fallbackTimeParts: CalendarTimeParts,
) => {
  const dateParts = parseCalendarDateParts(value) || fallbackDateParts;
  const timeParts = parseCalendarTimeParts(value) || fallbackTimeParts;

  if (!isValidCalendarDate(dateParts)) {
    throw new Error("Neplatné datum kalendářní události.");
  }

  return formatCalendarDateTime(dateParts, timeParts);
};

const buildCalendarEventDateTime = (dateTime: string) => ({
  dateTime,
  timeZone: GOOGLE_CALENDAR_TIME_ZONE,
});

const resolveCalendarId = (calendarId: unknown) => {
  const rawCalendarId = String(calendarId || "primary").trim();
  return resolveFamilyCalendar(rawCalendarId)?.calendarId || rawCalendarId || "primary";
};

const normalizeCalendarEventTimes = (start: unknown, end: unknown) => {
  const fallbackDateParts = parseCalendarDateParts(start)
    || parseCalendarDateParts(end)
    || getCalendarDatePartsInPrague();
  const startDateTime = normalizeCalendarDateTime(start, fallbackDateParts, { hour: 9, minute: 0 });
  let endDateTime = normalizeCalendarDateTime(end, parseCalendarDateParts(end) || parseCalendarDateParts(start) || fallbackDateParts, { hour: 10, minute: 0 });

  if (!end || calendarDateTimeToComparable(endDateTime) <= calendarDateTimeToComparable(startDateTime)) {
    endDateTime = addMinutesToCalendarDateTime(startDateTime, 60);
  }

  return {
    start: buildCalendarEventDateTime(startDateTime),
    end: buildCalendarEventDateTime(endDateTime),
  };
};

const normalizeCalendarSingleEventTime = (value: unknown, fallbackHour: number) => {
  const fallbackDateParts = parseCalendarDateParts(value) || getCalendarDatePartsInPrague();
  const dateTime = normalizeCalendarDateTime(value, fallbackDateParts, { hour: fallbackHour, minute: 0 });
  return buildCalendarEventDateTime(dateTime);
};

const getCalendarApiErrorReason = (error: any) => {
  const reason = error.response?.data?.error
    || error.response?.data?.error_description
    || error.message
    || "Calendar API error";
  return typeof reason === "string" ? reason : JSON.stringify(reason);
};

const isCalendarReconnectError = (error: any, status: number, reason: string) => {
  const errorText = [
    reason,
    error.message,
    error.code,
    error.response?.data?.error,
    error.response?.data?.error_description,
  ].filter(Boolean).map(String).join(" ").toLowerCase();

  return status === 401
    || status === 403
    || errorText.includes("invalid_grant")
    || errorText.includes("unauthorized_client")
    || errorText.includes("invalid token");
};

const sendCalendarApiError = async (res: any, error: any) => {
  const rawStatus = Number(error.response?.status || error.status || error.code || 500);
  const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
  const reason = getCalendarApiErrorReason(error);
  const reconnectRequired = isCalendarReconnectError(error, status, reason);

  if (reconnectRequired) {
    res.clearCookie("google_tokens", { secure: true, sameSite: "none", httpOnly: true });
    await fs.rm(TOKEN_FILE, { force: true }).catch((removeError) => {
      console.error("Failed to remove invalid Google token", removeError);
    });
  }

  res.status(reconnectRequired ? 401 : status).json({
    error: reason,
    reconnectRequired,
  });
};

app.get("/api/calendar/list", requireAuth, async (req: any, res: any) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  try {
    const calendar = google.calendar({ version: "v3", auth: req.oauth2Client });
    const response = await calendar.calendarList.list();
    res.json(response.data.items);
  } catch (error: any) {
    console.error("Calendar API Error:", error.message, error.code, error.response?.status);
    await sendCalendarApiError(res, error);
  }
});

app.get("/api/calendar/events", requireAuth, async (req: any, res: any) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  try {
    const { calendarId = "primary", timeMin, timeMax } = req.query;
    const resolvedCalendarId = resolveCalendarId(calendarId);
    const defaultDateParts = getCalendarDatePartsInPrague();
    const calendar = google.calendar({ version: "v3", auth: req.oauth2Client });
    const response = await calendar.events.list({
      calendarId: resolvedCalendarId,
      timeMin: timeMin
        ? normalizeCalendarQueryDateTime(timeMin, defaultDateParts, 0)
        : normalizeCalendarQueryDateTime(undefined, defaultDateParts, 0),
      timeMax: timeMax ? normalizeCalendarQueryDateTime(timeMax, defaultDateParts, 0) : undefined,
      timeZone: GOOGLE_CALENDAR_TIME_ZONE,
      maxResults: 50,
      singleEvents: true,
      orderBy: "startTime",
    });
    res.json(response.data.items);
  } catch (error: any) {
    await sendCalendarApiError(res, error);
  }
});

app.post("/api/calendar/events", requireAuth, async (req: any, res: any) => {
  try {
    const { calendarId = "primary", summary, description, start, end } = req.body;
    const resolvedCalendarId = resolveCalendarId(calendarId);
    const normalizedTimes = normalizeCalendarEventTimes(start, end);
    const calendar = google.calendar({ version: "v3", auth: req.oauth2Client });
    const response = await calendar.events.insert({
      calendarId: resolvedCalendarId,
      requestBody: {
        summary,
        description,
        start: normalizedTimes.start,
        end: normalizedTimes.end,
      },
    });
    res.json(response.data);
  } catch (error: any) {
    await sendCalendarApiError(res, error);
  }
});

app.patch("/api/calendar/events/:eventId", requireAuth, async (req: any, res: any) => {
  try {
    const { calendarId = "primary", summary, description, start, end } = req.body;
    const resolvedCalendarId = resolveCalendarId(calendarId);
    const { eventId } = req.params;
    const requestBody: any = {};

    if (summary !== undefined) requestBody.summary = summary;
    if (description !== undefined) requestBody.description = description;
    if (start !== undefined && end !== undefined) {
      const normalizedTimes = normalizeCalendarEventTimes(start, end);
      requestBody.start = normalizedTimes.start;
      requestBody.end = normalizedTimes.end;
    } else {
      if (start !== undefined) requestBody.start = normalizeCalendarSingleEventTime(start, 9);
      if (end !== undefined) requestBody.end = normalizeCalendarSingleEventTime(end, 10);
    }

    const calendar = google.calendar({ version: "v3", auth: req.oauth2Client });
    const response = await calendar.events.patch({
      calendarId: resolvedCalendarId,
      eventId: eventId as string,
      requestBody,
    });
    res.json(response.data);
  } catch (error: any) {
    await sendCalendarApiError(res, error);
  }
});

app.delete("/api/calendar/events/:eventId", requireAuth, async (req: any, res: any) => {
  try {
    const { calendarId = "primary" } = req.query;
    const resolvedCalendarId = resolveCalendarId(calendarId);
    const { eventId } = req.params;
    const calendar = google.calendar({ version: "v3", auth: req.oauth2Client });
    await calendar.events.delete({
      calendarId: resolvedCalendarId,
      eventId: eventId as string,
    });
    res.json({ success: true });
  } catch (error: any) {
    await sendCalendarApiError(res, error);
  }
});

app.get("/api/met/artwork-of-the-day", async (_req, res) => {
  const dayKey = getArtworkDayKey();
  const cachedArtwork = await readCachedMetArtwork();

  if (cachedArtwork?.dayKey === dayKey) {
    return res.json(cachedArtwork);
  }

  try {
    const artwork = await fetchMetArtwork();
    await writeCachedMetArtwork(artwork);
    res.json(artwork);
  } catch (error: any) {
    console.warn("Met artwork unavailable", error.message);
    if (cachedArtwork) {
      return res.json({
        ...cachedArtwork,
        stale: true,
        warning: error.message,
      });
    }

    res.status(500).json({ error: error.message || "Nepodařilo se načíst Picture of the Day z Metu." });
  }
});

app.get("/api/weather", async (req, res) => {
  try {
    const requestedLocation = String(req.query.location || "").trim();
    let location = DEFAULT_WEATHER_LOCATION;

    if (requestedLocation && !requestedLocation.toLowerCase().includes("kloten")) {
      const geocodeUrl = new URL("https://nominatim.openstreetmap.org/search");
      geocodeUrl.searchParams.set("q", requestedLocation);
      geocodeUrl.searchParams.set("format", "json");
      geocodeUrl.searchParams.set("limit", "1");

      const geocodeRes = await fetch(geocodeUrl, {
        headers: { "User-Agent": MET_USER_AGENT },
      });
      if (!geocodeRes.ok) throw new Error(`Geocoding error: ${geocodeRes.status}`);

      const geocodeData: any[] = await geocodeRes.json();
      if (!geocodeData.length) {
        throw new Error(`Místo "${requestedLocation}" nebylo nalezeno.`);
      }

      location = {
        name: geocodeData[0].display_name || requestedLocation,
        latitude: Number(geocodeData[0].lat),
        longitude: Number(geocodeData[0].lon),
      };
    }

    const forecastUrl = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
    forecastUrl.searchParams.set("lat", location.latitude.toFixed(4));
    forecastUrl.searchParams.set("lon", location.longitude.toFixed(4));

    const forecastRes = await fetch(forecastUrl, {
      headers: { "User-Agent": MET_USER_AGENT },
    });
    if (!forecastRes.ok) throw new Error(`MET Norway error: ${forecastRes.status}`);

    const forecast = await forecastRes.json();
    const current = forecast.properties?.timeseries?.[0];
    if (!current) throw new Error("Předpověď není dostupná.");

    const details = current.data?.instant?.details || {};
    const nextHour = current.data?.next_1_hours;
    const symbol = nextHour?.summary?.symbol_code || "neznámé";
    const precipitation = nextHour?.details?.precipitation_amount ?? 0;

    res.json({
      location: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      time: current.time,
      temperature: details.air_temperature,
      windSpeed: details.wind_speed,
      windDirection: details.wind_from_direction,
      humidity: details.relative_humidity,
      symbol,
      precipitation,
      source: "MET Norway Locationforecast",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/youtube/play", async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Missing YouTube search query" });
  }

  const searchUrl = new URL("https://www.youtube.com/results");
  searchUrl.searchParams.set("search_query", query);

  try {
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`YouTube search error: ${response.status}`);

    const html = await response.text();
    const videoIds = [...html.matchAll(/"videoId":"([^"]{11})"/g)]
      .map(match => match[1])
      .filter((videoId, index, all) => all.indexOf(videoId) === index);
    const videoId = videoIds[0];

    if (!videoId) {
      return res.json({
        query,
        url: searchUrl.toString(),
        searchUrl: searchUrl.toString(),
        direct: false,
      });
    }

    const url = `https://www.youtube.com/watch?v=${videoId}&autoplay=1`;
    res.json({
      query,
      videoId,
      url,
      searchUrl: searchUrl.toString(),
      direct: true,
    });
  } catch (error: any) {
    res.json({
      query,
      url: searchUrl.toString(),
      searchUrl: searchUrl.toString(),
      direct: false,
      warning: error.message,
    });
  }
});

app.get("/api/muvac/vacancies", async (req, res) => {
  try {
    const response = await fetch('https://api.muvac.com/browse/opportunities/vacancy', {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://www.muvac.com',
        'Referer': 'https://www.muvac.com/'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Muvac API error: ${response.status}`);
    }
    
    const json = await response.json();
    const items = Array.isArray(json?.data?.items)
      ? json.data.items
      : Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.data)
          ? json.data
          : [];
    
    const celloVacancies = items
      .filter((i: any) => !i.subType || ['temporary', 'permanent'].includes(i.subType))
      .filter((i: any) => {
        const expertiseText = Array.isArray(i.expertises)
          ? i.expertises.map((e: any) => [e.group, e.id, e.name, e.label, e.title].filter(Boolean).join(' ')).join(' ')
          : '';
        return hasCelloTerm(i.title, i.name, i.description, expertiseText);
      })
      .map((i: any) => ({
        id: i.id,
        title: i.title || i.name || 'Bez názvu',
        institution: i.profile?.name || i.organization?.name || i.institution?.name || 'Unknown',
        country: (i.profile?.countryCode || i.countryCode || '').toUpperCase(),
        city: i.profile?.city || i.city || '',
        subType: i.subType || 'permanent',
        applicationEnd: typeof i.applicationEnd === 'number' && i.applicationEnd < 1_000_000_000_000
          ? i.applicationEnd * 1000
          : i.applicationEnd,
        url: i.slug
          ? `https://www.muvac.com/en/vacancy/${i.slug}`
          : `https://www.muvac.com/en/browse/opportunities/vacancy/${i.id}`
      }))
      .sort((a: any, b: any) => {
        if (!a.applicationEnd) return 1;
        if (!b.applicationEnd) return -1;
        return a.applicationEnd - b.applicationEnd;
      });
      
    res.json(celloVacancies);
  } catch (error: any) {
    console.warn("Muvac unavailable", error.message);
    res.json([]);
  }
});

const parseMusikzeitungHtmlVacancies = (html: string) => {
  const $ = cheerio.load(html);
  const results: any[] = [];

  $('a[href*="/stellen/"]').each((_, element) => {
    const rawUrl = $(element).attr('href') || '';
    if (!rawUrl || rawUrl.includes('?_sf_s') || rawUrl.replace(/\/$/, '').endsWith('/stellen')) return;

    const url = toAbsoluteUrl(rawUrl, 'https://www.musikzeitung.ch');
    const lines = $(element).text().split('\n').map(line => line.trim()).filter(Boolean);
    const text = $(element).text().replace(/\s+/g, ' ').trim();
    const parentText = $(element).parent().text().replace(/\s+/g, ' ').trim();
    const cardText = $(element).closest('article, .post, .elementor-post, .jet-listing-grid__item, div').text().replace(/\s+/g, ' ').trim();
    const sourceText = [text, parentText, cardText].find(value => hasCelloTerm(value)) || '';

    if (!sourceText) return;
    if (results.some(item => item.url === url)) return;

    const date = sourceText.match(/\d{2}\.\d{2}\.\d{2,4}/)?.[0] || '';
    const title = lines.find(line => hasCelloTerm(line))
      || lines.find(line => !/Lehrpersonen|Dozentinnen|Orchestermusiker/i.test(line))
      || sourceText.replace(/\s*\|\s*\d{2}\.\d{2}\.\d{2,4}.*/, '').trim()
      || 'Inzerát Musikzeitung';
    const detailLine = lines[lines.length - 1] || '';
    const institution = detailLine.includes('|')
      ? detailLine.split('|')[0].trim()
      : 'Více na webu';

    results.push({
      id: url,
      title,
      url,
      institution,
      date,
    });
  });

  return results;
};

const parseMusikzeitungFeedVacancies = (xml: string) => {
  const $ = cheerio.load(xml, { xmlMode: true });

  return $('item').toArray()
    .map((item) => {
      const element = $(item);
      const title = element.find('title').first().text().trim();
      const url = element.find('link').first().text().trim();
      const pubDate = element.find('pubDate').first().text().trim();
      const description = element.find('description').first().text();
      const content = element.find('content\\:encoded').first().text();

      return {
        id: url,
        title: title || 'Inzerát Musikzeitung',
        url,
        institution: 'Více na webu',
        date: pubDate ? new Date(pubDate).toLocaleDateString('cs-CZ') : '',
        searchText: [title, url, description, content].join(' '),
      };
    })
    .filter(item => item.url && hasCelloTerm(item.searchText))
    .map(({ searchText, ...item }) => item);
};

const parseVzmVacancies = (html: string) => {
  const $ = cheerio.load(html);
  const textLines = $('body').text().split('\n').map(line => line.trim()).filter(Boolean);
  const startIndex = textLines.findIndex(line => line === 'Stellenanzeiger');
  const footerIndex = textLines.findIndex(line => line === 'Verband Zürcher Musikschulen');
  const lines = textLines.slice(
    startIndex === -1 ? 0 : startIndex + 1,
    footerIndex === -1 ? undefined : footerIndex
  );
  const links = $('a[href]').toArray()
    .map(element => {
      const href = $(element).attr('href') || '';
      const label = $(element).text().replace(/\s+/g, ' ').trim();
      return { href: toAbsoluteUrl(href, 'https://vzm.ch'), label };
    })
    .filter(link =>
      /stellen|pdf|successfactors|stadt-zuerich/i.test(link.href + ' ' + link.label)
        && !/datenschutz/i.test(link.href + ' ' + link.label)
    );
  const vacancies: any[] = [];
  let linkIndex = 0;
  let index = 0;

  while (index < lines.length - 1) {
    const institution = lines[index];
    const title = lines[index + 1];
    if (!institution || !title || /^(Pensum|Bewerbung|Stellenantritt|Ansprechperson|Stelleninserat):?$/.test(institution)) {
      index += 1;
      continue;
    }

    const details: string[] = [];
    index += 2;
    while (index < lines.length) {
      const line = lines[index];
      details.push(line);
      index += 1;
      if (line === 'Stelleninserat:') {
        if (index < lines.length && /^(pdf|Link)/i.test(lines[index])) index += 1;
        break;
      }
    }

    const detailText = details.join(' ');
    const workload = detailText.match(/Pensum:\s*(.*?)(?:\s+(?:Arbeitsort|Unterrichtsort|Unterrichtstage|Bewerbung|Stellenantritt|Ansprechperson|Stelleninserat):|$)/)?.[1]?.trim() || '';
    const deadline = detailText.match(/Bewerbung:\s*(.*?)(?:\s+(?:Stellenantritt|Ansprechperson|Stelleninserat):|$)/)?.[1]?.trim() || '';
    const location = detailText.match(/(?:Arbeitsort|Unterrichtsort):\s*(.*?)(?:\s+(?:Bewerbung|Stellenantritt|Ansprechperson|Stelleninserat):|$)/)?.[1]?.trim() || '';
    const link = links[linkIndex];
    linkIndex += 1;

    vacancies.push({
      id: link?.href || `${institution}-${title}-${vacancies.length}`,
      title,
      institution,
      workload,
      location,
      deadline,
      url: link?.href || 'https://vzm.ch/stellenanzeiger/',
    });
  }

  return vacancies;
};

const parseMkzVacancies = (html: string) => {
  const $ = cheerio.load(html);
  const bodyText = $('body').text();
  const lines = bodyText
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const links = $('a[href]').toArray()
    .map(element => {
      const href = $(element).attr('href') || '';
      const label = $(element).text().replace(/\s+/g, ' ').trim();
      return { href: toAbsoluteUrl(href, 'https://www.stadt-zuerich.ch'), label };
    })
    .filter(link => /job|stellen|bewerb|smartrecruiters|successfactors|stadt-zuerich/i.test(link.href + ' ' + link.label));
  const vacancies: any[] = [];

  const addVacancy = (title: string, institution: string, date: string, url?: string) => {
    const cleanTitle = title.replace(/^#+\s*/, '').trim();
    if (!cleanTitle || /^Job$|^Jobs$|^Suchergebnis/i.test(cleanTitle)) return;
    if (vacancies.some(item => normalizeSearchText(item.title) === normalizeSearchText(cleanTitle))) return;

    const matchingLink = links.find(link =>
      normalizeSearchText(link.label).includes(normalizeSearchText(cleanTitle))
        || normalizeSearchText(cleanTitle).includes(normalizeSearchText(link.label))
    );

    vacancies.push({
      id: matchingLink?.href || url || `${cleanTitle}-${vacancies.length}`,
      title: cleanTitle,
      institution: institution || 'Musikschule Konservatorium Zürich',
      date,
      url: matchingLink?.href || url || MKZ_JOBS_URL,
    });
  };

  $('a[href]').each((_, element) => {
    const anchor = $(element);
    const href = anchor.attr('href') || '';
    const cardText = anchor.closest('article, li, .mod, .component, .teaser, div').text().replace(/\s+/g, ' ').trim();
    if (!/Musikschule Konservatorium Zürich|Lehrperson|Musikalische Leitung/i.test(cardText)) return;

    const title = anchor.text().replace(/\s+/g, ' ').trim()
      || cardText.match(/(?:Lehrperson|Musikalische Leitung)[^.!?]*(?:%|$)/i)?.[0]
      || '';
    const date = cardText.match(/\d{1,2}\.\s+[A-Za-zÄÖÜäöüéû]+\s+\d{4}/)?.[0] || '';
    addVacancy(title, 'Musikschule Konservatorium Zürich', date, toAbsoluteUrl(href, 'https://www.stadt-zuerich.ch'));
  });

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index];
    const nextLine = lines[index + 1] || '';
    if (!/Musikschule Konservatorium Zürich/i.test(nextLine)) continue;
    if (!/(Lehrperson|Musikalische Leitung|Dozent|Leitung|Klavier|Violine|Cello|Saxophon|Querflöte|Orchester)/i.test(line)) continue;

    const date = lines[index + 2]?.match(/\d{1,2}\.\s+[A-Za-zÄÖÜäöüéû]+\s+\d{4}/)?.[0] || '';
    addVacancy(line, nextLine, date);
  }

  return vacancies;
};

const stripDiscordMarkup = (value: unknown) =>
  String(value || "")
    .replace(/<@!?\d+>/g, "")
    .replace(/<#\d+>/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

const parseDiscordMessages = (messages: any[]) => {
  const sortedMessages = [...messages].sort((a, b) =>
    new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
  );

  return sortedMessages
    .map((message) => {
      const content = stripDiscordMarkup(message.content);
      const attachment = Array.isArray(message.attachments) ? message.attachments[0] : null;
      const firstUrl = content.match(/https?:\/\/\S+/)?.[0] || attachment?.url || DISCORD_LISTING_URL;
      const cleanTitle = content.replace(/https?:\/\/\S+/g, "").trim();

      return {
        id: message.id,
        title: cleanTitle.slice(0, 140) || attachment?.filename || "Zpráva z Discord vlákna",
        author: message.author?.global_name || message.author?.username || "Discord",
        date: message.timestamp ? new Date(message.timestamp).toLocaleDateString("cs-CZ") : "",
        url: firstUrl,
        sourceUrl: DISCORD_LISTING_URL,
      };
    })
    .filter(item => item.title || item.url);
};

const fallbackDiscordListing = (note = "Otevřít vlákno v přihlášeném Discordu.") => ([{
  id: DISCORD_LISTING_MESSAGE_ID,
  title: "Discord vlákno s inzeráty",
  author: "Discord",
  date: "",
  url: DISCORD_LISTING_URL,
  sourceUrl: DISCORD_LISTING_URL,
  note,
}]);

app.get("/api/musikzeitung/vacancies", async (req, res) => {
  try {
    const htmlResponse = await fetch('https://www.musikzeitung.ch/stellen/?_sf_s=cello', {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'cs-CZ,cs;q=0.9,de;q=0.8,en;q=0.7',
        'User-Agent': BROWSER_USER_AGENT,
      },
    });
    if (!htmlResponse.ok) throw new Error(`Musikzeitung HTML error: ${htmlResponse.status}`);

    const html = await htmlResponse.text();
    let vacancies = parseMusikzeitungHtmlVacancies(html);

    if (vacancies.length === 0) {
      const feedResponse = await fetch('https://www.musikzeitung.ch/stellen/feed?_sf_s=cello', {
        headers: {
          'Accept': 'application/rss+xml, application/xml, text/xml',
          'User-Agent': BROWSER_USER_AGENT,
        },
      });
      if (feedResponse.ok) {
        vacancies = parseMusikzeitungFeedVacancies(await feedResponse.text());
      }
    }

    res.json(vacancies);
  } catch (error: any) {
    console.warn("Musikzeitung unavailable", error.message);
    res.json([]);
  }
});

app.get("/api/vzm/vacancies", async (req, res) => {
  try {
    const response = await fetch('https://vzm.ch/stellenanzeiger/', {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-CH,de;q=0.9,cs;q=0.8,en;q=0.7',
        'User-Agent': BROWSER_USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`VZM error: ${response.status}`);

    res.json(parseVzmVacancies(await response.text()));
  } catch (error: any) {
    console.warn("VZM unavailable", error.message);
    res.json([]);
  }
});

app.get("/api/mkz/vacancies", async (req, res) => {
  try {
    const response = await fetch(MKZ_JOBS_URL, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'de-CH,de;q=0.9,cs;q=0.8,en;q=0.7',
        'User-Agent': BROWSER_USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`MKZ error: ${response.status}`);

    res.json(parseMkzVacancies(await response.text()));
  } catch (error: any) {
    console.warn("MKZ unavailable", error.message);
    res.json([]);
  }
});

app.get("/api/discord/vacancies", async (req, res) => {
  const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!token) {
    return res.json(fallbackDiscordListing());
  }

  try {
    const messageResponse = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_LISTING_CHANNEL_ID}/messages/${DISCORD_LISTING_MESSAGE_ID}`,
      {
        headers: {
          Authorization: token.startsWith("Bot ") ? token : `Bot ${token}`,
          "User-Agent": "Jeeves 3.0 Discord listing/1.0",
        },
      }
    );

    if (!messageResponse.ok) {
      if (messageResponse.status === 401 || messageResponse.status === 403) {
        return res.json(fallbackDiscordListing(
          "Bot nemá přístup k tomuto soukromému @me vláknu. Otevřít ručně v přihlášeném Discordu."
        ));
      }
      throw new Error(`Discord message error: ${messageResponse.status}`);
    }

    const messagesResponse = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_LISTING_CHANNEL_ID}/messages?limit=20`,
      {
        headers: {
          Authorization: token.startsWith("Bot ") ? token : `Bot ${token}`,
          "User-Agent": "Jeeves 3.0 Discord listing/1.0",
        },
      }
    );

    if (!messagesResponse.ok) {
      const message = await messageResponse.json();
      return res.json(parseDiscordMessages([message]));
    }

    const messages = await messagesResponse.json();
    const parsedMessages = parseDiscordMessages(Array.isArray(messages) ? messages : []);
    res.json(parsedMessages.length > 0 ? parsedMessages : fallbackDiscordListing());
  } catch (error: any) {
    console.info("Discord listing fallback", error.message);
    res.json(fallbackDiscordListing());
  }
});

app.get("/api/discord/bot-log", async (req, res) => {
  try {
    const rawLog = await fs.readFile(DISCORD_BOT_LOG_FILE, "utf8");
    const entries = JSON.parse(rawLog);
    res.json(Array.isArray(entries) ? entries.slice(-20).reverse() : []);
  } catch {
    res.json([]);
  }
});

app.get("/api/discord/alerts", async (req, res) => {
  try {
    const rawAlerts = await fs.readFile(DISCORD_ALERT_FILE, "utf8");
    const entries = JSON.parse(rawAlerts);
    res.json(Array.isArray(entries) ? entries.slice(-20).reverse() : []);
  } catch {
    res.json([]);
  }
});

async function startServer() {
  await importAgathaVerbCatalog();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      configFile: false,
      root: process.cwd(),
      plugins: [react(), tailwindcss()],
      define: {
        "process.env.GEMINI_API_KEY": JSON.stringify(process.env.GEMINI_API_KEY || ""),
      },
      resolve: {
        alias: {
          "@": path.resolve(process.cwd(), "."),
        },
      },
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
