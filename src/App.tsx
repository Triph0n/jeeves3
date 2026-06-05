import { FormEvent, useEffect, useState } from 'react';
import { Calendar, Send } from 'lucide-react';
import { useGeminiLive } from './hooks/useGeminiLive';
import { CalendarDashboard } from './components/CalendarDashboard';
import { MuvacDashboard } from './components/MuvacDashboard';
import { MusikzeitungDashboard } from './components/MusikzeitungDashboard';
import { MkzDashboard } from './components/MkzDashboard';
import { VzmDashboard } from './components/VzmDashboard';
import { DiscordDashboard } from './components/DiscordDashboard';
import { MetArtworkDashboard } from './components/MetArtworkDashboard';
import jeevesIcon from '../assets/jeeves3-icon.png';
import auntAgathaPortrait from '../assets/aunt-agatha-period-portrait.png';
import baxterPortrait from '../assets/baxter-period-portrait.png';

export default function App() {
  const {
    isConnected,
    isSpeaking,
    connect,
    disconnect,
    sendTextMessage,
    monthlyUsageCostUsd,
  } = useGeminiLive();
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);
  const [calendarReconnectRequired, setCalendarReconnectRequired] = useState(false);
  const [isBaxterOpening, setIsBaxterOpening] = useState(false);
  const [isAuntAgathaOpening, setIsAuntAgathaOpening] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatMentionsBaxter = /baxter/i.test(chatInput);
  const chatMentionsNetflix = /netflix/i.test(chatInput);
  const formattedMonthlyUsageCost = monthlyUsageCostUsd < 0.01 && monthlyUsageCostUsd > 0
    ? `$${monthlyUsageCostUsd.toFixed(4)}`
    : `$${monthlyUsageCostUsd.toFixed(2)}`;

  useEffect(() => {
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => {
        setIsCalendarConnected(data.connected);
        setCalendarReconnectRequired(!!data.reconnectRequired);
      })
      .catch(err => console.error("Failed to fetch auth status", err));

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsCalendarConnected(true);
        setCalendarReconnectRequired(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectCalendar = async () => {
    try {
      const authUrl = calendarReconnectRequired ? '/api/auth/url?force=true' : '/api/auth/url';
      const res = await fetch(authUrl);
      const { url } = await res.json();
      window.open(url, 'oauth_popup', 'width=600,height=700');
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenBaxter = async () => {
    setIsBaxterOpening(true);
    try {
      const res = await fetch('/api/baxter/open', { method: 'POST' });
      if (!res.ok) throw new Error('Baxtera se nepodařilo otevřít');
    } catch (e) {
      console.error(e);
    } finally {
      setIsBaxterOpening(false);
    }
  };

  const handleOpenAuntAgatha = async () => {
    setIsAuntAgathaOpening(true);
    try {
      const res = await fetch('/api/aunt-agatha/open', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Aunt Agatha se nepodařila otevřít');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAuntAgathaOpening(false);
    }
  };

  const handleSendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sendTextMessage(chatInput)) {
      setChatInput('');
    }
  };

  return (
    <div className="jeeves-club h-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans flex flex-col">
      {/* Header */}
      <header className="jeeves-header shrink-0 border-b border-zinc-800 bg-zinc-900/50 p-4 flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className={`jeeves-crest-mark w-8 h-8 rounded-full bg-zinc-950 flex items-center justify-center border border-indigo-500/50 overflow-hidden ${isSpeaking ? 'ring-2 ring-indigo-400/70' : ''}`}>
            <img src={jeevesIcon} alt="" className="h-full w-full object-cover" />
          </div>
          <h1 className="jeeves-titleplate shrink-0 text-xl font-medium tracking-tight">Jeeves 3.0</h1>
          <form onSubmit={handleSendMessage} className="ml-3 flex min-w-[16rem] max-w-xl flex-1 items-center gap-2">
            <input
              id="jeeves-chat-input"
              name="jeevesChat"
              type="text"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              autoComplete="off"
              placeholder={isConnected ? "Napište Jeevesovi..." : "Baxtera můžete otevřít i bez Gemini..."}
              className="h-9 min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || (!isConnected && !chatMentionsBaxter && !chatMentionsNetflix)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-indigo-500 text-white transition-colors hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              title="Odeslat Jeevesovi"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <div
            className="shrink-0 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-400"
            title="Odhad ceny tokenů Jeevese za aktuální měsíc podle Gemini API ceníku."
          >
            <span className="text-zinc-500">mzda:</span>{' '}
            <span className="font-medium text-zinc-100">{formattedMonthlyUsageCost}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <button
            onClick={isCalendarConnected ? undefined : handleConnectCalendar}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-2 ${
              isCalendarConnected
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default'
                : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20'
            }`}
          >
            <Calendar className="w-3 h-3" />
            {isCalendarConnected
              ? 'Google připojen'
              : calendarReconnectRequired
                ? 'Znovu připojit Google'
                : 'Připojit Google'}
          </button>
          <div className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
            <span className="text-zinc-400">{isConnected ? 'Připojeno' : 'Odpojeno'}</span>
          </div>
          <button
            onClick={isConnected ? disconnect : connect}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              isConnected 
                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20' 
                : 'bg-indigo-500 text-white hover:bg-indigo-600'
            }`}
          >
            {isConnected ? 'Odpojit' : 'Připojit k Gemini'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="jeeves-desk flex-1 min-h-0 flex overflow-hidden">
        <div className="jeeves-parchment-panel min-h-0 flex-1 p-6 flex flex-col overflow-hidden">
          <CalendarDashboard isConnected={isCalendarConnected} />
        </div>

        {/* Right Column: Job Boards */}
        <div className="jeeves-blue-ledger jeeves-overview-black-text h-[calc(100vh-5rem)] w-[38rem] shrink-0 self-start overflow-hidden border-l border-b border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="grid min-h-0 grid-cols-2 gap-2 overflow-auto">
              <div className="min-w-0 overflow-hidden">
                <MuvacDashboard />
              </div>
              <div className="min-w-0 overflow-hidden">
                <MusikzeitungDashboard />
              </div>
              <div className="min-w-0 overflow-hidden">
                <VzmDashboard />
              </div>
              <div className="min-w-0 overflow-hidden">
                <MkzDashboard />
              </div>
              <div className="min-w-0 overflow-hidden">
                <DiscordDashboard />
              </div>
              <div className="col-span-2 min-w-0 overflow-hidden">
                <MetArtworkDashboard />
              </div>
            </div>
          </div>
        </div>
      </main>
      <div className="companion-buttons">
        <button
          type="button"
          onClick={handleOpenBaxter}
          disabled={isBaxterOpening}
          className="companion-button"
          title={isBaxterOpening ? 'Otevírám Výkonného Baxtera' : 'Otevřít Výkonného Baxtera'}
        >
          <span className="companion-button__icon">
            <img src={baxterPortrait} alt="" className="companion-button__portrait" />
          </span>
          <span>{isBaxterOpening ? 'Otevírám...' : 'Baxter'}</span>
        </button>
        <button
          type="button"
          onClick={handleOpenAuntAgatha}
          disabled={isAuntAgathaOpening}
          className="companion-button"
          title={isAuntAgathaOpening ? 'Otevírám Aunt Agatha' : 'Otevřít Aunt Agatha'}
        >
          <span className="companion-button__icon">
            <img src={auntAgathaPortrait} alt="" className="companion-button__portrait" />
          </span>
          <span>{isAuntAgathaOpening ? 'Otevírám...' : 'Aunt Agatha'}</span>
        </button>
      </div>
    </div>
  );
}
