# Baxter Implementation Summary

## Hotové části

- Lokální FastAPI aplikace na portu `8765`.
- Dashboard na `http://127.0.0.1:8765`.
- API pro Jeeves 3:
  - `GET /api/health`
  - `GET /api/status`
  - `POST /api/jobs/image-to-pdf`
  - `POST /api/jobs/video-to-audio`
  - `POST /api/jobs/sign-pdf`
- Převod JPG/PNG do jednoho vícestránkového PDF.
- Převod video souborů do MP3 přes FFmpeg.
- Ruční podepisování PDF přes scrollovatelný webový náhled.
- Podpis sleduje kurzor myši a kliknutí ho vloží.
- Automatické podepisování PDF podle klíčových slov zůstává v kódu jako doplňkový modul, ale API teď používá ruční režim.
- Slider velikosti podpisu.
- Kliknutí označuje střed podpisu.
- Přesun vstupů i výstupů do `Hotovo`.
- Validace pracovních složek a podpisového obrázku.

## Klíčové soubory

- `app.py`: vstupní bod aplikace.
- `baxter/api.py`: webové UI a HTTP API.
- `baxter/image_to_pdf.py`: převod obrázků do PDF.
- `baxter/video_to_audio.py`: převod videa do MP3.
- `baxter/pdf_signer.py`: automatický a ruční podpis PDF.
- `baxter/folders.py`: práce se složkami, názvy a přesuny.
- `templates/dashboard.html`: dashboard.
- `templates/manual_sign.html`: ruční podpis.
- `static/app.js`: interakce UI.
- `static/app.css`: vzhled UI.
- `docs/API_FOR_JEEVES.md`: kontrakt pro Jeeves 3.

## Lokální spuštění

```powershell
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8765
```

## První ruční ověření

1. Připrav složky:

```text
C:\Users\Vladimir\Desktop\Baxter\Hotovo
C:\Users\Vladimir\Desktop\Baxter\Chyba
C:\Users\Vladimir\Desktop\Baxter\Config
```

Soubory ke zpracování dávej přímo do `C:\Users\Vladimir\Desktop\Baxter`.

2. Pro podpis ulož:

```text
C:\Users\Vladimir\Desktop\Baxter\Config\signature.png
```

3. Spusť Baxtera.

4. Otevři:

```text
http://127.0.0.1:8765
```

5. Vlož testovací soubor do `Vstup` a spusť odpovídající akci.

## Poznámka k ověření v této session

V této Codex session nešlo spustit lokální procesy kvůli Windows sandbox chybě `CreateProcessAsUserW failed: 5`. Kód je připravený, ale syntax a smoke testy je potřeba spustit přímo lokálně ve Windows PowerShellu.
