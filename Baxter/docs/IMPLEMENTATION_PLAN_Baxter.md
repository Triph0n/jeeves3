# Implementation Plan: Baxter Web / Agent Edition

## 1. Cíl první implementace

První verze Baxtera má být lokální agentní služba pro Windows, kterou může Jeeves 3 zavolat přes jednoduché lokální API. Baxter nebude řešit vlastní rozpoznávání hlasu. Bude přijímat konkrétní úkol, pracovat se soubory přímo ve složce `C:\Users\Vladimir\Desktop\Baxter` a výsledky ukládat do `Hotovo`.

MVP musí pokrýt:

- převod JPG/PNG do jednoho PDF,
- extrakci MP3 z video souborů,
- automatický podpis PDF podle klíčových slov,
- ruční fallback pro podpis přes webové UI,
- jasné stavové odpovědi pro Jeeves 3.

## 2. Navržená technologie

### Backend

Doporučený backend: Python.

Důvody:

- dobrá práce s PDF a obrázky,
- jednoduchá integrace FFmpeg,
- snadné lokální API,
- rychlé vytvoření Windows-friendly lokální služby.

Doporučený stack:

- FastAPI pro lokální HTTP API,
- Uvicorn jako lokální server,
- Pillow pro obrázky,
- PyMuPDF / fitz pro čtení PDF, hledání textu a vkládání podpisu,
- FFmpeg pro převod videa do MP3,
- jednoduchý JSON konfigurační soubor.

### Frontend

Doporučený frontend pro MVP:

- jednoduché webové UI obsluhované backendem,
- dashboard se stavem složek a posledních úloh,
- stránka pro ruční umístění podpisu,
- PDF náhled přes render stránky z PyMuPDF do obrázku,
- overlay podpisu s posuvníkem velikosti.

Pro první verzi není nutný těžký frontend framework. Pokud se později UI rozroste, může se přidat React/Vite.

## 3. Složková struktura aplikace

Navržená struktura projektu:

```text
Baxter
├── app.py
├── baxter
│   ├── __init__.py
│   ├── api.py
│   ├── config.py
│   ├── folders.py
│   ├── jobs.py
│   ├── image_to_pdf.py
│   ├── video_to_audio.py
│   ├── pdf_signer.py
│   └── manual_signing.py
├── static
│   ├── app.css
│   └── app.js
├── templates
│   ├── dashboard.html
│   └── manual_sign.html
├── docs
│   ├── PRD_Baxter_Web_Agent_Edition.md
│   └── IMPLEMENTATION_PLAN_Baxter.md
└── scripts
    └── create_desktop_folders.ps1
```

## 4. Pracovní složky

Pevná výchozí cesta:

```text
C:\Users\Vladimir\Desktop\Baxter
```

Podsložky:

```text
Hotovo
Chyba
Config
```

Soubory ke zpracování se dávají přímo do hlavní složky `Baxter`. Složka `Vstup` se nepoužívá.

Konfigurační podpis:

```text
C:\Users\Vladimir\Desktop\Baxter\Config\signature.png
```

Baxter má při spuštění a před každou úlohou validovat, zda složky existují. Pokud něco chybí, vrátí stav `missing_folder`.

## 5. API kontrakt pro Jeeves 3

Lokální server:

```text
http://127.0.0.1:8765
```

### Health check

```text
GET /api/health
```

Odpověď:

```json
{
  "status": "ok",
  "app": "baxter"
}
```

### Stav Baxtera

```text
GET /api/status
```

Odpověď:

```json
{
  "status": "ready",
  "folders": {
    "base": true,
    "input": true,
    "done": true,
    "error": true,
    "config": true
  },
  "signature": true
}
```

### Převod obrázků do PDF

```text
POST /api/jobs/image-to-pdf
```

Odpovědi:

```json
{
  "status": "done",
  "message": "Obrázky byly převedeny do PDF.",
  "outputs": ["C:\\Users\\Vladimir\\Desktop\\Baxter\\Hotovo\\strana1.pdf"]
}
```

### Extrakce audia

```text
POST /api/jobs/video-to-audio
```

Odpovědi:

```json
{
  "status": "done",
  "message": "Audio bylo převedeno do MP3.",
  "outputs": ["C:\\Users\\Vladimir\\Desktop\\Baxter\\Hotovo\\porada.mp3"]
}
```

### Podpis PDF

```text
POST /api/jobs/sign-pdf
```

Možné odpovědi:

```json
{
  "status": "done",
  "message": "PDF bylo podepsáno.",
  "outputs": ["C:\\Users\\Vladimir\\Desktop\\Baxter\\Hotovo\\smlouva_signed.pdf"]
}
```

```json
{
  "status": "needs_input",
  "message": "Nenašel jsem místo pro podpis. Je potřeba ruční umístění.",
  "manual_url": "http://127.0.0.1:8765/manual-sign/job-id"
}
```

```json
{
  "status": "missing_config",
  "message": "Chybí podpisový obrázek signature.png ve složce Config."
}
```

## 6. Stavový model úloh

Interní stavy:

- `queued`: úloha vytvořena,
- `running`: úloha běží,
- `done`: hotovo,
- `failed`: chyba,
- `needs_input`: čeká na ruční zásah,
- `missing_config`: chybí konfigurace,
- `missing_folder`: chybí pracovní složka.

Pro MVP stačí držet stav v paměti procesu. Později lze přidat SQLite historii.

## 7. Modul 1: JPG/PNG do PDF

Implementační kroky:

1. Najít ve složce `Baxter` soubory s příponami `.jpg`, `.jpeg`, `.png`.
2. Seřadit je přirozeně podle názvu.
3. Otevřít přes Pillow.
4. Převést na RGB, zachovat rozumnou kvalitu.
5. Uložit jako jeden vícestránkový PDF.
6. Název výstupu odvodit z prvního obrázku.
7. Přesunout původní obrázky a výsledné PDF do `Hotovo`.

Hraniční stavy:

- žádné obrázky ve `Vstup`,
- nepodporovaný nebo poškozený soubor,
- konflikt názvu v `Hotovo`.

Pravidlo konfliktu:

- pokud výstup existuje, přidat číslovaný suffix, například `_2`.

## 8. Modul 2: Video do MP3

Implementační kroky:

1. Najít ve složce `Baxter` video soubory, například `.mp4`, `.mkv`, `.mov`, `.avi`, `.webm`.
2. Pro každý soubor zavolat FFmpeg.
3. Výstup uložit jako `.mp3` se stejným základním názvem.
4. Doporučené nastavení: MP3, 192 kbps.
5. Přesunout původní video i MP3 do `Hotovo`.

Hraniční stavy:

- FFmpeg není dostupný,
- video nemá audio stopu,
- konverze selže.

## 9. Modul 3: Automatický podpis PDF

Implementační kroky:

1. Zkontrolovat existenci `Config\signature.png`.
2. Najít PDF ve složce `Baxter`.
3. Pro každé PDF otevřít textovou vrstvu přes PyMuPDF.
4. Hledat klíčová slova podle priority:
   - `Podpis klienta`
   - `Datum a podpis`
   - `Za klienta`
   - `Podpis`
   - `Unterschrift`
   - `Signature`
   - `Signatur`
5. Nejprve hledat na poslední stránce.
6. Pokud se nic nenajde, hledat od konce dokumentu.
7. Podle bounding boxu vypočítat cílovou pozici podpisu.
8. Vložit transparentní PNG.
9. Uložit jako `_signed.pdf`.
10. Přesunout původní PDF i podepsané PDF do `Hotovo`.

Konfigurovatelné hodnoty:

- výchozí šířka podpisu v mm,
- vertikální posun od nalezeného textu,
- případný horizontální posun.

Výchozí návrh:

- šířka podpisu: 45 mm,
- posun nahoru: 12 mm,
- klik/fallback používá střed podpisu.

## 10. Fallback: ruční podpis

Když automatické hledání selže:

1. Backend vytvoří úlohu ve stavu `needs_input`.
2. Jeeves dostane `manual_url`.
3. Baxter otevře nebo nabídne webovou stránku pro ruční podpis.
4. UI zobrazí poslední stránku PDF jako obrázek.
5. Uživatel může přepínat stránky.
6. Uživatel klikne na cílovou pozici.
7. Klik znamená střed podpisu.
8. Uživatel nastaví velikost podpisu sliderem.
9. Po potvrzení backend vloží podpis a dokončí úlohu.

MVP UI prvky:

- náhled stránky,
- předchozí/další stránka,
- slider velikosti,
- tlačítko potvrdit,
- tlačítko zrušit.

## 11. Dashboard

Dashboard pro MVP:

- ukáže stav pracovních složek,
- ukáže, zda existuje `signature.png`,
- ukáže počty souborů ve `Vstup`,
- nabídne ruční spuštění tří akcí:
  - obrázky do PDF,
  - video do MP3,
  - podepsat PDF,
- ukáže poslední výsledek nebo chybu.

Dashboard není primární ovládání. Primární volání jde přes Jeeves 3.

## 12. Testovací plán

### Ruční smoke testy

1. Vložit jeden JPG do `Vstup`, spustit převod, ověřit PDF v `Hotovo`.
2. Vložit více JPG/PNG, ověřit přirozené pořadí a jeden PDF výstup.
3. Vložit MP4, spustit převod, ověřit MP3.
4. Vložit PDF s textem `Podpis`, ověřit automatické vložení podpisu.
5. Vložit PDF bez textové vrstvy, ověřit ruční fallback.
6. Odstranit `signature.png`, ověřit `missing_config`.
7. Dočasně přejmenovat složku `Vstup`, ověřit `missing_folder`.

### Automatizované testy

Pro MVP stačí menší sada:

- test přirozeného řazení souborů,
- test generování výstupních názvů,
- test validace složek,
- test výběru nejlepšího klíčového slova,
- test odpovědí API pro chybějící konfiguraci.

## 13. Milníky implementace

### Milník 1: Kostra aplikace

- založit Python aplikaci,
- přidat FastAPI server,
- přidat konfiguraci cest,
- přidat `/api/health` a `/api/status`,
- přidat jednoduchý dashboard.

Stav: implementováno.

### Milník 2: Práce se složkami a názvy

- validace `Baxter` složek,
- helper pro bezpečný přesun do `Hotovo`,
- helper pro řešení konfliktů názvů,
- helper pro přirozené řazení.

Stav: implementováno.

### Milník 3: Obrázky do PDF

- implementace modulu,
- API endpoint,
- dashboard tlačítko,
- smoke test.

Stav: implementováno, smoke test zatím ruční.

### Milník 4: Video do MP3

- detekce FFmpeg,
- implementace konverze,
- API endpoint,
- dashboard tlačítko,
- smoke test.

Stav: implementováno, smoke test zatím ruční.

### Milník 5: Automatický podpis

- načtení `signature.png`,
- hledání klíčových slov v PDF,
- výpočet pozice,
- vložení podpisu,
- API endpoint,
- smoke test.

Stav: implementováno, smoke test zatím ruční.

### Milník 6: Ruční fallback

- stav `needs_input`,
- render stránky PDF do obrázku,
- UI pro kliknutí a velikost,
- potvrzení podpisu,
- dokončení úlohy.

Stav: implementováno.

### Milník 7: Stabilizace pro Jeeves 3

- sjednocení JSON odpovědí,
- čisté chybové hlášky v češtině,
- dokumentace API pro Jeeves,
- lokální spuštění na fixním portu.

Stav: implementováno v základní verzi.

## 14. Doporučené pořadí práce

Nejlepší další krok je začít Milníkem 1 a 2. Tím vznikne lokální služba, dashboard a pevná infrastruktura pro složky. Potom lze přidávat jednotlivé moduly bez přepisování základů.

Po Milníku 2 bude možné ověřit, že Jeeves 3 dokáže Baxtera zavolat alespoň přes `health`, `status` a prázdnou testovací úlohu.

## 15. Otevřená rozhodnutí před implementací

Tato rozhodnutí neblokují start MVP, ale bude dobré je doladit během práce:

- přesný port lokální služby, navrženo `8765`,
- zda dashboard automaticky otevřít po startu,
- zda výsledky v `Hotovo` členit do podsložek podle data,
- přesná výchozí velikost podpisu,
- přesný vizuální offset podpisu vůči nalezenému slovu,
- jak bude Jeeves 3 otevírat `manual_url` při ručním fallbacku.
