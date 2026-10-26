# Plan: BLS 4.0 als zweite Lebensmittelquelle

Stand: 2026-10-26 · Status: **Entwurf, nichts umgesetzt** · Entscheidungen E1–E4 getroffen (§11)

Ziel: den Bundeslebensmittelschlüssel (BLS) 4.0 des Max Rubner-Instituts neben der
Schweizer BLV-Datenbank V7.0 in den Zutatenkatalog aufnehmen, **ohne doppelte
Zutaten zu erzeugen**, und beide Quellen in allen vier Sprachen gleich gut auffindbar
machen. Alle Zahlen unten stammen aus einer Auswertung der Original-Downloads (Daten,
Komponentenliste, Dokumentation, Erratum Stand August 2026) gegen
`server/database/seeds/swiss-foods.jsonl`.

---

## 1. Einschätzung: Swiss ersetzen oder ergänzen?

**Ergänzen, nicht ersetzen.** Eine Zutat bleibt ein Begriff, mit dem gekocht wird;
Swiss und BLS werden zu Quellen dieser Zutat. Wo beide dasselbe Lebensmittel
beschreiben, entsteht **eine** Zeile.

| Kriterium                  | Swiss BLV V7.0                                    | BLS 4.0                                                                                  |
| -------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Lebensmittel               | 1.191                                             | 7.140 gesamt, davon ca. **5.325** im Umfang (siehe §3)                                   |
| Sprachen der Namen         | **DE, EN, FR, IT** (offiziell)                    | **nur DE + EN**                                                                          |
| Synonyme                   | ja, je Sprache                                    | nein (nur Alternativen im Namen, z. B. „Karotte/Möhre")                                  |
| Wortschatz                 | Schweizerdeutsch (Rahm, Poulet, Peperoni)         | Deutsch (Sahne, Hähnchen, Gemüsepaprika)                                                 |
| Namensstil                 | natürlich („Weizenmehl, Typ 550")                 | datenbankartig („Weizen Mehl, Type 550", „Hafer Flocken", „Mais Stärke")                 |
| Nährstoffe gesamt          | ~44                                               | 138                                                                                      |
| Füllgrad unserer 35 Felder | 95,9 %                                            | 95,3 %                                                                                   |
| Selen                      | 55 % der Zeilen                                   | **fehlt komplett**                                                                       |
| Dichte (ml → g)            | 157 Zeilen                                        | **keine**                                                                                |
| Herkunft je Datenpunkt     | ja                                                | ja (13 Kategorien, Referenz je Wert)                                                     |
| Bekannte Fehler            | –                                                 | Erratum mit 6 Punkten, Korrektur erst in 4.1 (siehe §6)                                  |
| Lizenz                     | frei nutzbar (Bedingungen hier nicht neu geprüft) | „kostenfrei und ohne Lizenzbarrieren", ausdrücklich auch App-Entwicklung; Quelle angeben |

Warum Swiss bleibt:

1. **Mehrsprachigkeit.** BLS liefert für kein einziges Lebensmittel FR oder IT. Das
   englische ZIP hilft dabei nicht: Namen und Werte sind identisch mit dem deutschen,
   nur Spaltenköpfe, Herkunftslabels und 4 Hinweistexte sind übersetzt. Es reicht also
   eine der beiden Dateien. Die offiziellen FR/IT-Namen von Swiss sind außerdem das
   Glossar für die Übersetzung der BLS-Namen (§7).
2. **Bestehende Rezepte.** `recipe_commit_ingredients.ingredient_id` verweist ohne
   Cascade auf `ingredients.id`. Eine benutzte Swiss-Zeile lässt sich nicht löschen,
   ohne Commits umzuschreiben.
3. **Sie ergänzen sich.** BLS hat viel, was Swiss fehlt: Vanillezucker (heute von Hand
   kuratiert), Puderzucker, Backpulver, Gelatine, Limette, Gouda, Tahin, deutsche
   Mehltypen 405/550/1050. Swiss hat dafür Zutaten, die im BLS fehlen: Thymian,
   Rosmarin, Paprika (Gewürz), Zimt, Schweizer Käse und Fleischstücke. Gewürze sind in
   **beiden** dünn: Muskat, Kreuzkümmel, Koriander, Oregano und Kurkuma fehlen überall.

Wo BLS inhaltlich klar besser ist: deutsche Marktprodukte, neuere Analysen
(Dezember 2025), Ballaststoffe nach aktueller Codex-Definition, deutlich mehr
Lebensmittel. Für Paare gelten trotzdem die Swiss-Werte (E1).

---

## 2. Datenmodell

Heute ist `ingredient_nutrition` 1:1 an die Zutat gebunden und trägt mit `source` /
`external_id` genau **eine** Herkunft. Das reicht nicht, wenn eine Zutat in zwei
Datensätzen vorkommt.

**Neu: `ingredient_sources`**, n:1 zu `ingredients`:

| Spalte            | Typ         | Zweck                                      |
| ----------------- | ----------- | ------------------------------------------ |
| `id`              | int PK      |                                            |
| `ingredient_id`   | int FK      | `ON DELETE CASCADE`, indexiert             |
| `dataset`         | varchar(20) | `swiss-blv`, `bls` (**ohne** Version)      |
| `external_id`     | varchar(50) | BLV-ID bzw. BLS-Code, z. B. `C214100`      |
| `dataset_version` | varchar(20) | `7.0`, `4.0` (Information, kein Schlüssel) |
| `created_at`      | datetime    |                                            |

`UNIQUE (dataset, external_id)`: Damit verhindert die Datenbank selbst, dass ein
Quell-Datensatz zweimal als Zutat landet. Das ist die harte Duplikatsperre für jeden
erneuten Import.

`ingredient_nutrition` bleibt, wie es ist, und hält die **wirksamen** Werte. `source`
sagt, aus welchem Datensatz sie stammen (`swiss-blv-v7`, `bls-4.0`, `curated`). Damit
ändert sich an `nutrition.ts`, NutritionFacts und dem Datenexport nichts.

Migration: Tabelle anlegen und aus `ingredient_nutrition WHERE source = 'swiss-blv-v7'`
auffüllen.

**Nebenbefund (schon heute ein Bug):** `import-swiss-foods.mjs` sucht vorhandene Zeilen
über `source = 'swiss-blv-v7'`, Version eingeschlossen. Mit einer künftigen BLV V8 und
neuem Source-String würde der Importer **alle 1.191 Zutaten ein zweites Mal anlegen**.
Die Suche über `ingredient_sources (dataset, external_id)` behebt das gleich mit.

---

## 3. Umfang

Der BLS-Code ist siebenstellig: 1. Stelle Hauptgruppe, 6. Stelle Garverfahren
(0/1 = handelsüblich/roh, 2–9 = gegart, gekocht, gebraten …).

| Teilmenge                                        | Anzahl | Umgang                                                            |
| ------------------------------------------------ | -----: | ----------------------------------------------------------------- |
| B–W, 6. Stelle 0/1: kaufbare Lebensmittel        |  3.327 | importieren                                                       |
| B–W, 6. Stelle 2–9: gekochte/gebratene Varianten |  1.763 | importieren; in der Suche hinter der rohen Variante (§5)          |
| X/Y: Komponenten, die als Zutat vorkommen        |   ~235 | importieren: 37 Brühen/Fonds, 159 Saucen/Dressings/Dips, 39 Teige |
| X/Y: fertige Gerichte                            | ~1.815 | **nicht** importieren (Kalbsfrikassee, Gulaschsuppe, Eintöpfe …)  |

In den ersten beiden Zeilen stecken auch die 466 Einträge der Gruppe D (Kuchen,
Torten, Gebäck); die kommen nach E2 komplett mit.

X und Y sind keine Fertigprodukte, sondern im Haushalt gekochte Gerichte, deren Werte
das MRI per Rezeptberechnung ermittelt hat. Fertig- und Instantprodukte
(Brühwürfel/-pulver, Instant-Kartoffelpüree, Ei- und Milchpulver, Kakaopulver) stehen
in den normalen Gruppen R, K, E, M, S und sind damit ohnehin dabei. Markenprodukte wie
„Fix für …" gibt es im BLS nicht.

Innerhalb des BLS gibt es keine doppelten Namen (geprüft). Die Duplikatfrage stellt
sich also nur zwischen BLS und Swiss, BLS und kuratierten Zutaten sowie BLS und von
Nutzern angelegten Zutaten.

---

## 4. Abgleich durch die KI: Paare und Suchbegriffe

Es gibt **keinen** Querverweis zwischen BLS und BLV (kein FoodEx2, kein LanguaL).
Ein reiner Algorithmus reicht nicht: Ein Prototyp mit Namens- und
Nährwertähnlichkeit fand für die 1.191 Swiss-Lebensmittel 131 eindeutige Treffer,
271 unklare Fälle und 789 ohne Kandidat, darunter echte Paare wie Bratbutter ↔
Butterschmalz. Er würde zudem Falsches zusammenlegen: Schweizer „Cervelat" ist
nicht die deutsche Zervelatwurst.

Deshalb macht den Abgleich die KI (Claude), gestützt auf Skripte, die Kandidaten
liefern und das Ergebnis prüfen. Dabei entstehen **zwei getrennte Ergebnisse**, weil
Zusammenlegen und Auffindbarkeit verschiedene Fragen sind:

### 4.1 Paare (streng)

Zusammengelegt wird nur, was ein Koch austauschbar verwenden würde **und** was
nährwertseitig zusammenpasst. Beispiele aus dem Probelauf:

| Swiss                              | BLS                            | Entscheidung | Grund                                           |
| ---------------------------------- | ------------------------------ | ------------ | ----------------------------------------------- |
| Bratbutter                         | Butterschmalz                  | `same`       | gleiches Produkt, Fett 98,3 / 99,5 g            |
| Peperoni, rot, roh                 | Gemüsepaprika rot, roh         | `same`       | Helvetismus, Werte passen                       |
| Nüsslisalat, roh                   | Feldsalat/Rapunzel, roh        | `same`       | Helvetismus, Werte passen                       |
| Baumnuss                           | Walnuss                        | `same`       | Helvetismus, Werte passen                       |
| Rande, roh                         | Rote Rübe/Rote Bete, roh       | `same`       | Helvetismus, Werte passen                       |
| Joghurt, nature                    | Joghurt mild, mind. 3,5 % Fett | `same`       | Werte passen                                    |
| Teilentrahmte Milch, pasteurisiert | Milch fettarm 1,5 %            | getrennt     | 2,8 g gegen 1,5 g Fett: in DE gibt es das nicht |
| Rind, Gehacktes, mager, roh        | Rind Hackfleisch, roh          | getrennt     | 7,5 g gegen 16,4 g Fett                         |
| Poulet, Schenkel, mit Haut, roh    | Hähnchen Ober-/Unterschenkel   | getrennt     | ganzer Schenkel ≠ Teilstück                     |
| Cervelat                           | Zervelatwurst                  | getrennt     | Brühwurst gegen Rohwurst                        |

Ablauf:

1. Ein Skript erzeugt je Swiss-Lebensmittel die besten BLS-Kandidaten mit Namen und
   den Kernwerten (kcal, Protein, Fett, KH, Wasser). Grundlage sind normalisierte DE-
   und EN-Namen, Swiss-Synonyme, eine CH ↔ DE-Vokabeltabelle und der
   Zubereitungszustand.
2. Claude entscheidet je Swiss-Lebensmittel: `same:<BLS-Code>` oder kein Paar, mit
   einem kurzen Grund. Unsichere Fälle bekommen das Flag `unsicher` und werden dir
   gezeigt. Erwartet: wenige Dutzend.
3. Alles landet in der committeten Datei `server/database/seeds/bls-map.csv`. Jeder
   BLS-Code im Umfang, der dort nicht als `same` steht, wird `new`.
4. Ein Prüfskript bricht ab, wenn
   - eine Swiss-ID mehr als ein `same` hat (nur 1:1),
   - ein Ziel nicht existiert,
   - die Nährwerte eines `same`-Paares stark abweichen (etwa > 20 % kcal oder > 5 g
     Fett), sofern das Paar nicht ausdrücklich begründet ist.

Kuratierte Zeilen laufen genauso mit (`same:curated:Vanillezucker`).

### 4.2 Suchbegriffe (großzügig)

Unabhängig davon, ob ein Paar entsteht, bekommt jede Zeile die Begriffe, unter denen
man sie in Deutschland, der Schweiz, Frankreich und Italien sucht. Beispiele:

- „Poulet, Schenkel, mit Haut, roh" (Swiss, ohne Paar): zusätzlich „Hähnchenschenkel",
  „Hühnerschenkel".
- „Rind, Gehacktes, mager": zusätzlich „Rinderhackfleisch mager", „Tatar".
- „Gemüsepaprika rot, roh" (BLS): zusätzlich „Paprika", „Peperoni".
- „Vollrahm": zusätzlich „Sahne", „Schlagsahne".

Diese Begriffe schreibt Claude im selben Durchgang wie die Paare und die
Übersetzungen (§7). Sie liegen als committete Datei je Quelle vor (Schlüssel:
Swiss-ID bzw. BLS-Code), sodass ein neues Datenbank-Release nur für neue oder
geänderte Codes neue Arbeit erzeugt. So ist „Poulet" für deutsche Nutzer auffindbar,
ohne den Swiss-Namen umzuschreiben.

---

## 5. Suche statt Umschreiben

Formatprobleme löst die Suche, nicht die Daten. „Weizenmehl" muss „Weizen Mehl,
Type 405" finden, „mehl weizen" ebenfalls, „hahnchen" ohne Umlaut auch.

- **Normalisierte Suchbegriffe** in einer eigenen Tabelle
  `ingredient_search_terms (ingredient_id, locale, term, compact, kind)`, befüllt
  beim Import aus Namen aller Sprachen und Synonymen:
  - `term`: kleingeschrieben, ß → ss, Umlaute zusätzlich gefaltet (ä → a und ae),
    Satzzeichen weg
  - `compact`: dasselbe ohne Leerzeichen, sodass aus „weizen mehl type 405" der Wert
    „weizenmehltype405" wird
- **Treffer**, wenn jedes Wort der Eingabe ein Wort-Präfix trifft, oder wenn die
  kompakte Eingabe ein Präfix bzw. Teilstring des kompakten Begriffs ist.
- **Ranking** (heute fehlt jedes `ORDER BY`, `limit = 10`):
  1. exakter Treffer in der Nutzersprache
  2. Präfix auf den Anzeigenamen
  3. Wort-Präfix
  4. Teilstring/kompakt
  5. Synonym

  Innerhalb einer Stufe zuerst roh/handelsüblich, dann gegarte Varianten, dann
  kürzere Namen. Wer „Karotte" tippt, sieht zuerst „Karotte, roh", nicht
  „Karotte/Möhre, gebraten".

- **Last:** rund 6.000 Zutaten × ~6 Begriffe = ~36.000 kurze Zeilen. Ein Scan
  dauert dafür Millisekunden. Für reine Präfixe gibt es zusätzlich einen Index auf
  `term`.
- E2E-Tests: „Poulet" und „Hähnchen" finden dieselbe Zeile; „Weizenmehl" findet die
  Typen 405/550; „Sahne" findet „Vollrahm" genau einmal.

---

## 6. Nährwerte: Abbildung und Erratum

Abbildung auf die heutigen Spalten:

| Feld                 | BLS-Code       | Feld                     | BLS-Code                          |
| -------------------- | -------------- | ------------------------ | --------------------------------- |
| `energy_kcal_100g`   | ENERCC (korr.) | `vit_b6_mg`              | VITB6 **µg → mg (÷ 1000)**        |
| `energy_kj_100g`     | ENERCJ (korr.) | `vit_b12_mcg`            | VITB12                            |
| `fat_100g`           | FAT            | `niacin_mg`              | NIA                               |
| `saturated_fat_100g` | FASAT          | `folate_mcg`             | FOL (Folat-Äquivalent)            |
| `carbs_100g`         | CHO            | `pantothenic_mg`         | PANTAC                            |
| `sugars_100g`        | SUGAR          | `vit_c_mg` / `vit_d_mcg` | VITC / VITD                       |
| `starch_100g`        | STARCH         | `vit_e_mg`               | VITE                              |
| `fiber_100g`         | FIBT           | `vit_a_re_mcg`           | VITA (RE)                         |
| `protein_100g`       | PROT625        | `retinol_mcg`            | RETOL                             |
| `salt_100g`          | NACL           | `beta_carotene_mcg`      | CARTB                             |
| `alcohol_100g`       | ALC            | Mineralstoffe            | K, NA, CLD, CA, MG, P, FE, ID, ZN |
| `water_100g`         | WATER          | `selenium_mcg`           | – (gibt es im BLS nicht)          |

- Kennzeichen: `-` (fehlend) → `NULL`; `TR`, `<LOQ`, `<LOD` → `0`. Die Doku erlaubt das
  als Schätzung, und für Rezeptsummen ist es vernachlässigbar. 59 leere Zink-Zellen
  werden wie im Erratum zu `NULL`.
- Bei `same`-Paaren gelten die Swiss-Werte (E1). Die Swiss-Dichte bleibt damit ebenfalls
  erhalten. BLS-only-Zeilen haben keine Dichte und kein Stückgewicht.
- Kategorie: Abbildung über den Anfangsbuchstaben auf unsere Schlüssel (G vegetable,
  F fruit, M dairy, T fish, U/V/W meat, Q oil, S sweet, N beverage, P alcohol, H nut/legume
  nach 2. Stelle …).

**Erratum (Stand August 2026), Umgang beim Erzeugen des Seeds**, als kleine committete
Datei `bls-4.0-errata.json`:

| Punkt                                               | Betrifft uns?            | Umgang                                     |
| --------------------------------------------------- | ------------------------ | ------------------------------------------ |
| Energie: OLSAC doppelt gezählt (411 LM, bis +23 %)  | **ja**, kcal/kJ          | korrigieren: −2 kcal bzw. −8 kJ je g OLSAC |
| Vitamin A/Retinol Magermilch M111100                | ja (micros)              | Werte aus Tabelle 1 übernehmen             |
| Iodid fettarme Milch 1,5 %                          | ja (micros)              | Werte aus Tabelle 2 übernehmen             |
| Calcium Mandel süß / blanchiert                     | ja (micros)              | Werte aus Tabelle 3 übernehmen             |
| Zink: 59 leere Zellen                               | ja                       | ergibt ohnehin `NULL` bzw. 0 bei < LOQ/LOD |
| Phenylalanin-Nullwerte                              | nein (nicht gespeichert) | –                                          |
| Sardelle roh T104100: Fett zu hoch, kein Ersatzwert | ja                       | ohne Nährwerte importieren bis 4.1         |

Abgeleitete Rezepturen, die laut Erratum ebenfalls betroffen sind, korrigiert das MRI
erst mit 4.1. Der Importer muss 4.1 später einfach einspielen können: Der Schlüssel ist
(`bls`, BLS-Code), die Version ist reine Information.

---

## 7. Mehrsprachigkeit

| Fall                       | DE                              | EN    | FR / IT                  |
| -------------------------- | ------------------------------- | ----- | ------------------------ |
| Swiss allein               | Swiss + Suchbegriffe            | Swiss | Swiss                    |
| `same` (Swiss + BLS)       | Swiss + BLS-Name + Suchbegriffe | Swiss | Swiss                    |
| `new` (nur BLS, ca. 4.900) | BLS + Suchbegriffe              | BLS   | **von Claude übersetzt** |

Die Übersetzung passiert im selben Durchgang wie der Abgleich (E3):

- Rund 4.900 Namen × 2 Sprachen, in Stapeln je BLS-Gruppe.
- Ein Glossar aus den offiziellen Swiss-Übersetzungen sorgt für einheitliche Begriffe:
  „roh" → cru/crudo, „gekocht" → cuit/cotto, Fleischstücke, „mind. 45 % Fett i. Tr." →
  „min. 45 % MG/ES" bzw. „min. 45 % grasso s.s.".
- Ergebnis als committete Datei `server/database/seeds/bls-i18n.jsonl` (BLS-Code →
  fr, it, Suchbegriffe je Sprache). Ein späteres 4.1 braucht nur die neuen Codes.
- Prüfskript: jede Zeile hat fr und it, keine leeren Werte, Glossarbegriffe
  eingehalten, keine verbliebenen deutschen Wörter. Dazu eine Stichprobe für dich.

Das entspricht dem „cheap slice" aus ROADMAP Punkt 8: nur Zutatennamen, kein
Laufzeitdienst, keine Nutzerdaten. Locked Decision 6 bleibt unberührt.

---

## 8. Von Nutzern angelegte Zutaten (E4)

Wo eine Nutzerzutat nach dem Import einer Referenzzutat entspricht, wird sie ersetzt
und gelöscht:

1. `scripts/merge-user-ingredients.mjs --report` listet alle Zutaten mit
   `created_by IS NOT NULL`, mit Namen, Nährwerten und Zahl der Commits, die sie
   verwenden. Es läuft gegen Produktion, weil nur dort die Daten liegen.
2. Claude ordnet jede Zeile einer Referenzzutat zu oder lässt sie stehen. Zutaten mit
   `manufacturer` (Markenprodukte) werden nicht auf generische Zeilen gelegt.
3. `--apply <datei> --dry-run`, danach `--apply <datei>`. Ablauf in einer
   Transaktion, nach einem Backup (`scripts/backup-db.mjs`):
   - `recipe_commit_ingredients.ingredient_id` umhängen (alle Commits inklusive
     Forks, damit Diffs konsistent bleiben)
   - die Nutzerzutat löschen
4. Den Namen, unter dem der Nutzer gesucht hat, als Suchbegriff in die committete
   Datei übernehmen. Direkt in Produktion würde ihn der nächste Deploy überschreiben,
   weil die Seeds die Referenzdaten bei jedem Lauf neu schreiben.

Das ist eine bewusste Ausnahme von „Commits sind unveränderliche Snapshots":
Menge, Einheit und Reihenfolge bleiben gleich, nur der Verweis zeigt auf dieselbe
Zutat in der Referenzfassung. Die Nährwerte dieser Rezepte ändern sich dabei auf die
Referenzwerte. Die Mappingdatei enthält Produktions-IDs und kommt nicht ins Repo.
Läuft erst, wenn der BLS-Import deployt ist.

---

## 9. Import und Deploy

- Seed: `server/database/seeds/bls-foods.jsonl` (JSON Lines wie bei Swiss, ca. 5.300
  Zeilen, nur die gemappten Felder, geschätzt 4–5 MB) plus `bls-map.csv`,
  `bls-i18n.jsonl`, die Suchbegriff-Dateien und `bls-4.0-errata.json`, alles
  committet. Die Original-XLSX kommen nach `.claude/data/bls/` (gitignored). Das
  Regenerieren nutzt wie beim Swiss-Import ein lazy geladenes `xlsx`, der normale
  Seed-Pfad braucht es nicht.
- Die Download-Links enthalten ein Token, das die Seite pro Aufruf neu erzeugt.
  Deshalb im README nur auf <https://blsdb.de/bls> verlinken, nie einen Token-Link.
- **Geschwindigkeit:** Der Swiss-Importer braucht drei Roundtrips je Lebensmittel.
  1.191 Zeilen dauerten in Produktion etwa 15 Minuten. 5.300 weitere Zeilen auf diese
  Art wären über eine Stunde. Der BLS-Importer schreibt deshalb in Batches
  (mehrzeilige Upserts in einer Transaktion). Den Swiss-Importer gleich mit umstellen.
- Die „schon importiert"-Prüfung zählt wie bisher, aber je `(dataset, dataset_version)`.
- `deploy.yml`: `npm run seed:bls` **nach** `seed:swiss`, weil `same` auf
  Swiss-Zeilen zeigt. `db:setup` bekommt denselben Schritt.

---

## 10. Quellenangabe

Heute nennt die Oberfläche **keine** Datenquelle, auch nicht die Schweizer Datenbank.
Neu ist ein Abschnitt „Datenquellen" im Impressum (`app/pages/legal/impressum.vue`,
4 Sprachen), mit Links:

> Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0.
> Karlsruhe. DOI: 10.25826/Data20251217-134202-0 – https://blsdb.de
> Bundesamt für Lebensmittelsicherheit und Veterinärwesen BLV: Schweizer
> Nährwertdatenbank V7.0 – https://naehrwertdaten.ch

---

## 11. Phasen

| #   | Inhalt                                                                                           | Ergebnis                                     |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| 1   | `ingredient_sources` + Migration + Backfill; Swiss-Importer auf Datensatz-ohne-Version + Batches | keine Verhaltensänderung, Bug aus §2 behoben |
| 2   | Suchbegriff-Tabelle, Normalisierung, Ranking; Quellenangabe im Impressum                         | bessere Suche schon mit Swiss allein         |
| 3   | BLS-Parser, Umfangsfilter, Feldabbildung, Erratum, Kandidaten-Generator                          | Eingaben für den Abgleich                    |
| 4   | Abgleich, Suchbegriffe, Übersetzung durch Claude + Prüfskripte                                   | `bls-map.csv`, `bls-i18n.jsonl`, Synonyme    |
| 5   | Seed erzeugen + Importer + `seed:bls` in setup/deploy; Doku (README, ARCHITECTURE §10)           | Katalog ca. 6.000 Zutaten, keine Duplikate   |
| 6   | Nutzerzutaten zusammenführen (§8)                                                                | keine doppelten Nutzerzutaten                |

Tests:

- Parser: Kennzeichen, µg→mg bei VITB6, Erratum-Korrektur an einem OLSAC-Beispiel
- Prüfskripte für `bls-map.csv` und `bls-i18n.jsonl`
- Importer idempotent: zweimal laufen lassen ergibt null neue Zeilen
- Suche: die E2E-Fälle aus §5

---

## 12. Entscheidungen

- **E1, Werte bei Paaren:** Swiss. Wichtig ist, dass beide Benennungen gleich gut
  gefunden werden (§4.2, §5).
- **E2, Gruppe D / Fertigprodukte:** alles mitnehmen.
- **E2b, gegarte Varianten:** mitnehmen. Gerichte aus X/Y: nur die ~235 Komponenten
  (Brühen, Saucen, Teige), die fertigen Gerichte nicht.
- **E3, FR/IT:** im selben Durchgang wie der Abgleich übersetzen.
- **E4, doppelte Nutzerzutaten:** ersetzen und löschen (§8).
- **Offen, E5, Anzeigename bei Paaren:** Schweizer Name („Poulet, Brust …") oder
  deutscher BLS-Name („Hähnchen Brust …") als DE-Anzeige? Der jeweils andere bleibt
  Suchbegriff.
