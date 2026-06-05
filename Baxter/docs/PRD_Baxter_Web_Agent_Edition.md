# PRD: Baxter Web / Agent Edition

## 1. Shrnutí

Baxter je lokálně hostovaná webová aplikace pro Windows, která funguje jako specializovaný agent pro kancelářskou rutinu. Baxter neřeší primární hlasové ovládání sám. Hlas, dialog a předání povelu obstarává Jeeves 3. Baxter přijímá konkrétní úkol přes lokální rozhraní, provede jej nad soubory v pracovní složce a vrátí Jeevesovi výsledek.

Zpracovávaná data neopouštějí uživatelův počítač.

## 2. Role Jeeves 3 a Baxter

### Jeeves 3

- Přijímá hlasový povel od uživatele.
- Rozpozná záměr, například převod obrázků, extrakci audia nebo podpis PDF.
- Zavolá Baxtera přes lokální rozhraní.
- Předá uživateli hlasovou odpověď podle výsledku od Baxtera.

### Baxter

- Běží lokálně jako webová aplikace / lokální agentní služba.
- Neřeší vlastní poslech mikrofonu.
- Zpracovává soubory v dedikované pracovní složce.
- V případě potřeby otevře webové UI pro ruční zásah, zejména při ručním umístění podpisu.

## 3. Pracovní složky

Na ploše bude hlavní složka:

```text
Baxter
├── Hotovo
├── Chyba
└── Config
```

Uživatel tyto složky nechá vytvořit Baxtera nebo je vytvoří ručně podle finální implementace. Baxter nemá spoléhat na jednorázové "první spuštění"; pokud potřebná složka chybí, úkol neprovede a vrátí Jeevesovi jasnou hlášku.

### Pravidla složek

- hlavní složka `Baxter`: uživatel sem přímo vkládá soubory k aktuálnímu zpracování.
- `Hotovo`: Baxter sem přesune původní vstupní soubory i vytvořené výsledky.
- `Chyba`: prostor pro soubory nebo reporty, které se nepodařilo zpracovat.
- `Config`: konfigurační soubory, zejména podpisový obrázek `signature.png`.

Po úspěšném zpracování má Baxter přesunout do `Hotovo` jak původní vstup, tak výstup.

## 4. Obecná pravidla zpracování

- Soubory ke zpracování budou přímo ve složce `Baxter`.
- Servisní podsložky `Hotovo`, `Chyba` a `Config` se při hledání vstupů ignorují.
- Ve složce `Baxter` nebudou smíchané různé typy úloh.
- Baxter tedy nemusí řešit kombinaci PDF, obrázků a videí v jednom běhu.
- Pokud je ve složce `Baxter` více relevantních souborů, Baxter je zpracuje dávkově podle typu úlohy.
- Pokud chybí požadovaná konfigurace, například `signature.png`, Baxter vrátí Jeevesovi hlášku a úkol neprovede.

## 5. Modul: JPG/PNG do PDF

### Vstup

- Soubory JPG/PNG ve složce `Baxter`.
- Povel od Jeeves 3 pro převod obrázků do PDF.

### Akce

- Baxter převede všechny obrázky ve `Vstup` do jednoho vícestránkového PDF.
- Řazení obrázků bude přirozené podle názvu souboru, například `strana1`, `strana2`, `strana10`.

### Výstup

- Pokud je vstup jeden obrázek, výstup ponese původní název s příponou `.pdf`.
- Pokud je vstup více obrázků, výstup ponese název prvního obrázku podle přirozeného řazení s příponou `.pdf`.
- Původní obrázky i výsledné PDF se přesunou do `Hotovo`.

Příklad:

```text
strana1.jpg
strana2.jpg
strana10.jpg
```

Výstup:

```text
strana1.pdf
```

## 6. Modul: Video to Audio Extractor

### Vstup

- Video soubory ve složce `Baxter`, například MP4 nebo MKV.
- Povel od Jeeves 3 pro extrakci audia.

### Akce

- Baxter zpracuje všechna videa ve složce `Baxter`.
- Audio se nebude pouze kopírovat; bude převedeno do standardního MP3.
- Doporučený výchozí profil: MP3, například 192 kbps, kompatibilní nastavení.

### Výstup

- Výstupní soubor ponese původní název videa s příponou `.mp3`.
- Původní video i výsledné MP3 se přesunou do `Hotovo`.

Příklad:

```text
porada.mp4 -> porada.mp3
```

## 7. Modul: Inteligentní podepisovač PDF

### Vstup

- PDF soubory ve složce `Baxter`.
- Transparentní PNG podpisu uložené jako:

```text
Baxter\Config\signature.png
```

### Akce

- Baxter podepíše PDF ze složky `Baxter`.
- Podepisuje se jeden nejlepší nalezený bod v každém PDF, ne všechna nalezená místa.
- Podpis se vloží jako transparentní obrázek.

### Výstup

- Podepsaný soubor ponese původní název + `_signed.pdf`.
- Původní PDF i podepsané PDF se přesunou do `Hotovo`.

Příklad:

```text
smlouva.pdf -> smlouva_signed.pdf
```

## 8. Umístění podpisu

Aktuální preferovaný režim je ruční umístění podpisu. Po povelu k podpisu Baxter otevře PDF ve webovém UI, zobrazí stránky ve scrollovatelném náhledu a podpis drží u kurzoru myši. Kliknutí do stránky vloží podpis na dané místo.

Automatické hledání podle klíčových slov zůstává jako možný budoucí nebo doplňkový režim, ale není primární cesta pro MVP.

## 9. Automatické hledání místa pro podpis

Baxter prohledá textovou vrstvu PDF podle klíčových slov.

### Klíčová slova

Priorita hledání:

1. `Podpis klienta`
2. `Datum a podpis`
3. `Za klienta`
4. `Podpis`
5. `Unterschrift`
6. `Signature`
7. `Signatur`

### Pravidla výběru místa

- Baxter nejdřív hledá na poslední stránce.
- Pokud najde více kandidátů, použije nejlepší podle priority klíčových slov.
- Pokud na poslední stránce nenajde nic, hledá od konce dokumentu směrem dopředu.
- Podpis se umístí vzhledem k nalezenému bounding boxu s vertikálním posunem nahoru tak, aby vizuálně seděl nad linkou nebo tečkami.

## 10. Ruční umístění podpisu jako razítko

Primární ruční režim:

- otevře webové UI s náhledem PDF,
- zobrazí všechny stránky ve scrollovatelném náhledu,
- podpis se drží u kurzoru myši,
- uživatel klikne na místo, kam se má podpis vložit,
- klik označuje střed podpisu,
- velikost podpisu půjde upravit posuvníkem,
- kliknutí rovnou vytvoří podepsané PDF.

Tento režim je spolehlivý pro naskenované dokumenty bez OCR i pro dokumenty bez rozpoznatelných klíčových slov.

## 11. Chybové a stavové odpovědi pro Jeeves 3

Baxter má vracet Jeevesovi jednoduché stavy:

- `done`: úkol dokončen.
- `failed`: úkol se nepodařil.
- `needs_input`: je potřeba ruční zásah uživatele.
- `missing_config`: chybí požadovaná konfigurace, například `signature.png`.
- `missing_folder`: chybí některá pracovní složka.

Příklad hlášky:

```text
Chybí podpisový obrázek signature.png ve složce Config.
```

## 12. Otevřené otázky

- Přesný formát lokálního API mezi Jeeves 3 a Baxterem.
- Přesná cesta k ploše a pracovní složce na konkrétním Windows profilu.
- Zda má Baxter složky vytvořit sám, nebo jen validovat jejich existenci.
- Výchozí velikost podpisu v milimetrech.
- Výchozí vertikální posun podpisu při automatickém umístění.
- Přesný MP3 profil, například bitrate a mono/stereo.
- Jestli má webové UI zobrazovat historii hotových úloh.
