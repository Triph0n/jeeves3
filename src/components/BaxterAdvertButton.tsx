import { useState } from 'react';
import { AlertCircle, Check, Loader2, Send } from 'lucide-react';
import {
  BaxterVacancyLike,
  formatBaxterAdvertResult,
  sendAdvertToBaxter,
} from '../lib/baxterAdvert';

interface BaxterAdvertButtonProps {
  vacancy: BaxterVacancyLike;
  compact?: boolean;
}

export function BaxterAdvertButton({ vacancy, compact = false }: BaxterAdvertButtonProps) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const handleClick = async () => {
    if (state === 'sending') return;
    setState('sending');

    try {
      const data = await sendAdvertToBaxter(vacancy);
      window.dispatchEvent(new CustomEvent('jeeves:baxter-advert-sent', {
        detail: {
          vacancy,
          message: formatBaxterAdvertResult(data, vacancy),
        },
      }));
      setState('sent');
      window.setTimeout(() => setState('idle'), 3500);
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent('jeeves:baxter-advert-error', {
        detail: {
          vacancy,
          message: `Baxter inzerát nepřijal: ${error.message || error}`,
        },
      }));
      setState('error');
      window.setTimeout(() => setState('idle'), 4500);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'sending'}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border transition-colors ${
        compact ? 'h-6 w-6' : 'h-7 w-7'
      } ${
        state === 'sent'
          ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300'
          : state === 'error'
            ? 'border-red-400/50 bg-red-500/15 text-red-300'
            : 'border-stone-500/40 bg-slate-950 text-stone-300 hover:border-stone-300/60 hover:bg-slate-900'
      } disabled:cursor-wait disabled:opacity-70`}
      title="Poslat inzerát Baxterovi"
      aria-label="Poslat inzerát Baxterovi"
    >
      {state === 'sending' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {state === 'sent' && <Check className="h-3.5 w-3.5" />}
      {state === 'error' && <AlertCircle className="h-3.5 w-3.5" />}
      {state === 'idle' && <Send className="h-3.5 w-3.5" />}
    </button>
  );
}
