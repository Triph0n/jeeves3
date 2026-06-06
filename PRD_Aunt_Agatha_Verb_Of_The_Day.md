# PRD: Aunt Agatha - Sloveso dne

## Cil

Aunt Agatha ma mit vlastni kompaktni okno podobne jako panel `Obraz dne`. Pri otevreni Jeevese se v nem hned zobrazi jedno nemecke nepravidelne/silne sloveso dne. Sloveso se ulozi do lokalni databaze a pozdeji se z uz ukazanych sloves pouzije pro zkouseni.

## Problem

Soucasne Agathino okno pusobi jako samostatny chat/tutor panel. Ucici moment ma byt jednodussi a viditelny hned: jedna karta, jedno sloveso, jasne tvary, zadne rozptylovani.

## Inspirace

Panel `Obraz dne`:

- mala hlava karty s ikonou a nazvem,
- zdroj vpravo,
- vizualni/hlavni objekt vlevo,
- detaily a kratka zajimavost vpravo,
- kompaktni rozmer vhodny do prehledu.

Agathina verze ma byt stejne klidna a skenovatelna, ale misto obrazu ukazuje sloveso.

## Uzivatelsky scenar

1. Uzivatel otevre Jeevese.
2. V prehledu je hned videt karta `Aunt Agatha`.
3. Karta ukaze presne jedno sloveso dne.
4. Uzivatel vidi infinitiv, Prateritum a Partizip II.
5. Sloveso je zaznamenane jako dnes ukazane.
6. Tlacitko nebo mala akce spusti zkouseni z uz ukazanych sloves.

## Funkcni pozadavky

- Agatha karta je otevrena/zobrazena hned pri startu Jeevese.
- Denne se ukaze nejvyse jedno nove sloveso podle lokalniho denniho klice.
- Pokud uz dnes bylo sloveso vybrane, ukazuje se znovu stejne sloveso.
- Ukazana slovesa se ukladaji do lokalni SQLite databaze.
- Zkouseni pouziva jen slovesa, ktera uz byla nekdy ukazana.
- Zdrojovy katalog sloves zustava ulozeny lokalne v databazi.
- Pri nedostupnosti weboveho zdroje se pouzije posledni ulozeny katalog; az jako posledni zachrana vestavena zaloha.
- Karta nesmi otevirat Gemini, prohlizec ani externi aplikaci.

## Obsah karty

Hlavicka:

- ikona nebo portret Aunt Agatha,
- titulek `Aunt Agatha`,
- popisek `Sloveso dne`,
- zdroj/katalog vpravo, napriklad `167 sloves`.

Hlavni cast:

- dominantni infinitiv, napr. `gehen`,
- dva az tri kompaktni radky:
  - `Prateritum: ging`,
  - `Partizip II: gegangen`,
  - volitelne `Dnes ulozeno`.
- kratka veta nebo stroha poznamka, pokud je dostupna.

Akce:

- `Zkouset` otevira nebo zobrazi malou flashcard cast.
- `Nova karticka` meni jen zkousenou karticku, ne sloveso dne.
- Odpovedi se musi psat do inputu.

## Navrh rozlozeni

Karta ma byt soucasti prehledu podobne jako `MetArtworkDashboard`, ne velky plovouci chat pres obrazovku.

Doporucene umisteni:

- v prave ledgeri mezi mensimi panely, nebo
- jako samostatna karta vedle/okolo `Obraz dne`, pokud se layout vejde.

Nedoporucene:

- velky modal pres kalendar,
- plovouci okno prekryvajici hlavni UI,
- landing/uvodni text misto skutecneho slovesa.

## Datovy model

Pouzit existujici lokalni SQLite databazi `.auth/jeeves-usage.sqlite`.

Tabulky:

- `agatha_verb_catalog`: lokalni katalog sloves ze zdroje.
- `agatha_daily_verbs`: denni vybrane a ukazane sloveso.
- `agatha_known_verbs`: slovesa dostupna pro opakovani.
- `agatha_review_attempts`: napsane odpovedi a vysledek.

## API

- `GET /api/aunt-agatha/state`
  - vraci dnesni sloveso, statistiku, katalog a zpravy/zkouseni podle potreby.
- `POST /api/aunt-agatha/review`
  - ulozi psanou odpoved na karticku.
- `POST /api/aunt-agatha/import-verbs`
  - rucne obnovi katalog ze zdroje.

## Akceptacni kriteria

- Po otevreni Jeevese je videt karta Aunt Agatha bez klikani.
- Karta vizualne odpovida stylu `Obraz dne`.
- Dnesni sloveso se nezmeni pri refreshi v temze dni.
- Dalsi den se vybere dalsi jeste neukazane sloveso, pokud existuje.
- Databaze obsahuje zaznam o ukazanem slovese.
- Flashcard zkousi pouze slovesa z `agatha_known_verbs`.
- Build a typova kontrola projdou.

## Mimo rozsah

- Plnohodnotny AI chat s Agathou.
- Preklady vsech sloves do cestiny.
- Hlasove zkouseni.
- Synchronizace mezi zarizenimi.

