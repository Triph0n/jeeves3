# Baxter

Baxter je lokální webová aplikace / agent pro kancelářské souborové úlohy. Běží na Windows lokálně a je připravený na volání z Jeeves 3 přes HTTP API.

## Pracovní složka

Baxter očekává tuto strukturu na ploše:

```text
C:\Users\Vladimir\Desktop\Baxter
├── Hotovo
├── Chyba
└── Config
```

Soubory k práci dávej přímo do složky `Baxter`. Složka `Vstup` se nepoužívá.

Podpisový obrázek pro PDF podpis ulož jako:

```text
C:\Users\Vladimir\Desktop\Baxter\Config\signature.png
```

Pokud se soubor jmenuje jinak, Baxter použije první PNG soubor ve složce `Config`.

## Instalace

```powershell
pip install -r requirements.txt
```

Pro převod videa do MP3 musí být dostupný FFmpeg v PATH.

## Spuštění

```powershell
python -m uvicorn app:app --host 127.0.0.1 --port 8765
```

Nebo:

```powershell
.\scripts\run_baxter.ps1
```

Dashboard:

```text
http://127.0.0.1:8765
```

## API

Dokumentace pro Jeeves 3 je v:

```text
docs\API_FOR_JEEVES.md
```

## Rychlá kontrola

```powershell
python -m py_compile app.py baxter\api.py baxter\config.py baxter\folders.py baxter\image_to_pdf.py baxter\video_to_audio.py baxter\pdf_signer.py baxter\jobs.py baxter\models.py
```

Pokud máš nainstalovaný pytest:

```powershell
python -m pytest
```
