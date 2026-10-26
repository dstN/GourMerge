# Plan: BLS 4.0 als zweite Lebensmittelquelle

Stand: 2026-10-26 · Status: **Entwurf, nichts umgesetzt**

Ziel: den Bundeslebensmittelschlüssel (BLS) 4.0 des Max Rubner-Instituts neben der
Schweizer BLV-Datenbank V7.0 in den Zutatenkatalog aufnehmen, **ohne doppelte
Zutaten zu erzeugen**. Alle Zahlen unten stammen aus einer Auswertung der
Original-Downloads (Daten, Komponentenliste, Dokumentation, Erratum Stand August 2026)
gegen `server/database/seeds/swiss-foods.jsonl`.

---

## 1. Einschätzung: Swiss ersetzen oder ergänzen?

**Empfehlung: ergänzen, nicht ersetzen.** Eine Zutat bleibt ein Begriff, mit dem
gekocht wird; Swiss und BLS werden zu Quellen dieser Zutat. Wo beide dasselbe
Lebensmittel beschreiben, entsteht **eine** Zeile.

| Kriterium                  | Swiss BLV V7.0                                    | BLS 4.0                                                                                  |
| -------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Lebensmittel               | 1.191                                             | 7.140 gesamt, davon **3.327** kaufbare Einzellebensmittel (siehe §3)                     |
| Sprachen der Namen         | **DE, EN, FR, IT** (offiziell)                    | **nur DE + EN**                                                                          |
| Synonyme                   | ja, je Sprache                                    | nein (nur Alternativen im Namen, z. B. „Karotte/Möhre")                                  |
| Wortschatz                 | Schweizerdeutsch (Rahm, Poulet, Peperoni)         | Deutsch (Sahne, Hähnchen, Gemüsepaprika)                                                 |
| Namensstil                 | natürlich („Weizenmehl, Typ 550")                 | datenbankartig („Weizen Mehl, Type 550", „Hafer Flocken", „Mais Stärke")                 |
| Nährstoffe gesamt          | ~44                                               | 138                                                                                      |
| Füllgrad unserer 35 Felder | 95,9 %                                            | 95,3 %                                                                                   |
| Selen                      | 55 % der Zeilen                                   | **fehlt komplett**                                                                       |
| Dichte (ml → g)            | 157 Zeilen                                        | **keine**                                                                                |
| Herkunft je Datenpunkt     | ja                                                | ja (13 Kategorien, Referenz je Wert)                                                     |
| Bekannte Fehler            | –                                                 | Erratum mit 6 Punkten, Korrektur erst in 4.1 (siehe §5)                                  |
| Lizenz                     | frei nutzbar (Bedingungen hier nicht neu geprüft) | „kostenfrei und ohne Lizenzbarrieren", ausdrücklich auch App-Entwicklung; Quelle angeben |

Warum Swiss nicht rausfliegen sollte:

1. **Mehrsprachigkeit.** Das Frontend hat vier Sprachen. BLS liefert für kein einziges
   Lebensmittel FR oder IT. Ohne Swiss fiele die FR/IT-Autovervollständigung für den
   ganzen Katalog auf EN/DE zurück. Das englische ZIP hilft dabei nicht: Namen und Werte
   sind identisch mit dem deutschen, nur Spaltenköpfe, Herkunftslabels und 4
   Hinweistexte sind übersetzt. Es reicht also eine der beiden Dateien.
2. **Bestehende Rezepte.** `recipe_commit_ingredients.ingredient_id` verweist ohne
   Cascade auf `ingredients.id`, und Commits sind unveränderliche Snapshots. Eine
   benutzte Swiss-Zeile lässt sich nicht löschen, ohne Rezept-Historie umzuschreiben.
   „Swiss rauswerfen" könnte also höchstens heißen, ihre Nährwerte zu ersetzen, und das
   erlaubt das Design unten ohnehin.
3. **Sie ergänzen sich.** BLS hat viel, was Swiss fehlt: Vanillezucker (heute von Hand
   kuratiert), Puderzucker, Backpulver, Gelatine, Limette, Gouda, Tahin, deutsche
   Mehltypen 405/550/1050. Swiss hat dafür Zutaten, die im BLS fehlen: Thymian,
   Rosmarin, Paprika (Gewürz), Zimt, Schweizer Käse und Fleischstücke. Gewürze sind in
   **beiden** dünn: Muskat, Kreuzkümmel, Koriander, Oregano und Kurkuma fehlen überall.
4. **Suche.** Die BLS-Namen allein würden die Autovervollständigung verschlechtern:
   Bei der Präfixsuche findet „Weizenmehl" kein „Weizen Mehl, Type 405". Wo beide
   Quellen dasselbe meinen, sind die Swiss-Namen die besseren Anzeigenamen. Der
   deutsche BLS-Name wird dann Synonym, sodass „Sahne" die Zeile „Vollrahm" findet.
   Für gourmerge.de mit Deutsch als Standardsprache ist gerade das ein großer Gewinn.

Wo BLS inhaltlich klar besser ist: deutsche Marktprodukte, neuere Analysen
(Dezember 2025), Ballaststoffe nach aktueller Codex-Definition, mehr Lebensmittel.
Deshalb ist es sinnvoll, für doppelt vorhandene Zutaten später die BLS-Werte zu
nehmen (siehe Entscheidung E1).

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
ändert sich an keinem Lesepfad etwas: `nutrition.ts`, die Such-API, NutritionFacts und
der Datenexport bleiben unberührt.

Migration: Tabelle anlegen und aus `ingredient_nutrition WHERE source = 'swiss-blv-v7'`
auffüllen.

**Nebenbefund (schon heute ein Bug):** `import-swiss-foods.mjs` sucht vorhandene Zeilen
über `source = 'swiss-blv-v7'`, Version eingeschlossen. Mit einer künftigen BLV V8 und
neuem Source-String würde der Importer **alle 1.191 Zutaten ein zweites Mal anlegen**.
Die Suche über `ingredient_sources (dataset, external_id)` behebt das gleich mit.

---

## 3. Umfang: welche BLS-Einträge überhaupt

Der BLS-Code ist siebenstellig: 1. Stelle Hauptgruppe, 6. Stelle Garverfahren
(0/1 = handelsüblich/roh, 2–9 = gegart, gekocht, gebraten …).

| Teilmenge                                 | Anzahl | Vorschlag                                                                     |
| ----------------------------------------- | -----: | ----------------------------------------------------------------------------- |
| X, Y: Menükomponenten / Gerichte          |  2.050 | **nicht** importieren: Gerichte entstehen bei uns als Rezept                  |
| B–W, 6. Stelle 2–9: gegarte Varianten     |  1.763 | **nicht** importieren: Zutaten werden roh erfasst, das Garen steht im Schritt |
| B–W, 6. Stelle 0/1: kaufbare Lebensmittel |  3.327 | importieren, jeder Eintrag mit Entscheidung (§4)                              |

Innerhalb des BLS gibt es keine doppelten Namen (geprüft). Die Duplikatfrage stellt
sich also nur zwischen BLS und Swiss, BLS und kuratierten Zutaten sowie BLS und von
Nutzern angelegten Zutaten.

Grenzfälle für das Review: Gruppe D (Kuchen, Torten, Gebäck, 459 Einträge) sowie
Fertigprodukte. Einiges davon sind echte Zutaten (Löffelbiskuit, Butterkekse), anderes
nicht (Orangencremetorte). Siehe Entscheidung E2.

---

## 4. Duplikatvermeidung: Abgleich mit Entscheidungsdatei

Es gibt **keinen** Querverweis zwischen BLS und BLV (kein FoodEx2, kein LanguaL).
Abgleichen lässt sich nur über Namen und Nährwerte. Ein Prototyp mit reiner
Namens- und Nährwertähnlichkeit ergab für die 1.191 Swiss-Lebensmittel:

- **131** eindeutige Treffer (Tomate roh ↔ Tomate roh, Milchschokolade ↔ Milchschokolade)
- **271** mehrdeutig (Kalb Kotelett ↔ Kalb Kotelett (Rücken), Vollmilch ↔ Vollmilch 3,5 %)
- **789** ohne Kandidat, **darunter echte Paare**: Bratbutter ↔ Butterschmalz,
  Teilentrahmte Milch ↔ Milch fettarm 1,5 %, Rind Gehacktes ↔ Rind Hackfleisch

Ein vollautomatischer Abgleich würde also sowohl Duplikate durchlassen als auch Falsches
zusammenlegen (Schweizer „Peperoni" sind deutsche Gemüsepaprika). Deshalb:

1. **Kandidaten per Skript** (offline, ohne DB):
   - normalisierte DE- und EN-Namen (ß→ss, Umlaute, Satzzeichen)
   - zusammengesetzte Wörter verbinden („Weizen Mehl" → „weizenmehl")
   - Schrägstrich-Alternativen trennen („Karotte/Möhre")
   - Swiss-Synonyme
   - eine kleine Vokabeltabelle CH ↔ DE (Poulet/Hähnchen, Rahm/Sahne, Rüebli/Möhre,
     Peperoni/Gemüsepaprika, Gehacktes/Hackfleisch, Voressen/Gulasch,
     Nüsslisalat/Feldsalat, Baumnuss/Walnuss, Randen/Rote Bete, Kabis/Weißkohl …)
   - Zubereitungszustand muss übereinstimmen (roh ≠ geräuchert ≠ Konserve)
   - Nährwert-Plausibilität (kcal, Protein, Fett, KH, Wasser innerhalb einer Toleranz)
   - verträgliche Kategorie
2. **Entscheidungen in einer committeten Datei**
   `server/database/seeds/bls-map.csv`: eine Zeile je BLS-Code im Umfang:
   - `same:<swiss-id>`: gleiche Zutat. Der BLS-Code wird an die bestehende Zeile
     gehängt, der deutsche BLS-Name wird DE-Synonym, die FR/IT-Namen bleiben.
   - `same:curated:<name>`: dasselbe für kuratierte Zeilen (Vanillezucker).
   - `new`: eigene, neue Zutat.
   - `skip`: nicht importieren.

   Das Skript füllt eindeutige Fälle vor, den Rest sichtet ein Mensch. Eine
   KI-Vorsortierung ist möglich und unbedenklich, weil es Referenzdaten sind und keine
   Nutzerdaten. Final entscheidet trotzdem ein Mensch.

3. **Harte Regeln beim Erzeugen des Seeds:** Das Skript bricht ab, wenn
   - ein BLS-Code im Umfang keine Entscheidung hat,
   - eine Swiss-ID mehr als einmal `same` bekommt (nur 1:1; weitere Varianten werden
     `new` oder `skip`),
   - eine Ziel-ID nicht existiert.

   So kann kein Duplikat still durchrutschen, und das Review ist im Diff sichtbar.

4. **Von Nutzern angelegte Zutaten** (`created_by IS NOT NULL`) werden **nicht**
   automatisch zusammengelegt. Referenzdaten müssen in jeder Umgebung identisch
   ankommen und dürfen nicht vom Inhalt der Produktionsdatenbank abhängen. Stattdessen
   listet ein Admin-Skript Nutzerzutaten auf, deren Name nach dem Import einer
   Referenzzutat (fast) gleicht. Was dann passiert, entscheidet E4.

Aufwand Review: grob 400 bis 1.200 Paare mit Kandidat zu sichten, die übrigen BLS-Codes
sind ohne Kandidat praktisch `new`. Realistisch ein bis zwei Tage.

---

## 5. Nährwerte: Abbildung und Erratum

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
- Dichte und Stückgewicht: keine im BLS. Bei `same` bleibt die Swiss-Dichte erhalten.
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
| Sardelle roh T104100: Fett zu hoch, kein Ersatzwert | ja                       | `skip` bis 4.1 (oder Swiss-Wert behalten)  |

Abgeleitete Rezepturen, die laut Erratum ebenfalls betroffen sind, korrigiert das MRI
erst mit 4.1. Bis dahin bleiben sie, wie sie sind. Der Importer muss 4.1 später
einfach einspielen können: Der Schlüssel ist (`bls`, BLS-Code), die Version ist reine
Information.

---

## 6. Mehrsprachigkeit

| Fall                       | DE                      | EN    | FR / IT                                 |
| -------------------------- | ----------------------- | ----- | --------------------------------------- |
| Swiss allein               | Swiss                   | Swiss | Swiss                                   |
| `same` (Swiss + BLS)       | Swiss + BLS als Synonym | Swiss | Swiss                                   |
| `new` (nur BLS, ca. 2.900) | BLS + erzeugte Synonyme | BLS   | **fehlt** → Anzeige fällt auf EN zurück |

Die Such-API liefert heute schon `translations[locale] ?? translations.en ?? name`.
Die Fallback-Stufe funktioniert also, ist für FR/IT-Nutzer aber nicht schön. Zwei
Wege, siehe E3:

- vorerst mit dem EN-Fallback leben,
- einmalige Offline-Übersetzung der BLS-Namen nach FR/IT, gespeichert in
  `name_translations`. Das ist genau der „cheap slice" aus ROADMAP Punkt 8: nur
  Zutatennamen, als Skript, ohne Laufzeitdienst, verletzt Locked Decision 6 nicht und
  schickt keine Nutzerdaten irgendwohin. Stichprobe vor dem Commit prüfen.

Zusätzlich für DE, unabhängig davon: Synonyme aus dem BLS-Namensstil erzeugen
(„Weizen Mehl" → „Weizenmehl", „Hafer Flocken" → „Haferflocken", „Karotte/Möhre" →
beide), sonst greift die Präfixsuche nicht.

---

## 7. Suche: muss mit ausgeliefert werden

`GET /api/ingredients` hat heute **kein `ORDER BY`** und `limit = 10`. Bei 1.191
Zeilen fällt das kaum auf, bei rund 4.300 schon: „Milch" trifft dann Dutzende Zeilen
in zufälliger Reihenfolge, und „Vollmilch" kann aus den ersten zehn fallen. Ohne
Ranking macht BLS die Autovervollständigung schlechter. Vorschlag:

1. exakter Treffer auf den Namen in der Nutzersprache
2. Präfix auf den Namen in der Nutzersprache
3. Präfix auf andere Sprachen oder Synonyme
4. innerhalb einer Stufe kürzere Namen zuerst

Bei dieser Größe genügt das ohne neuen Index. Bei Bedarf später generierte Spalten.

---

## 8. Import und Deploy

- Seed: `server/database/seeds/bls-foods.jsonl` (JSON Lines wie bei Swiss, ca.
  3.000 Zeilen, nur die gemappten Felder, geschätzt 2–3 MB) plus `bls-map.csv` und
  `bls-4.0-errata.json`, alles committet. Die Original-XLSX kommen nach
  `.claude/data/bls/` (gitignored). Das Regenerieren nutzt wie beim Swiss-Import ein
  lazy geladenes `xlsx`, der normale Seed-Pfad braucht es nicht.
- Die Download-Links enthalten ein Token, das die Seite pro Aufruf neu erzeugt.
  Deshalb im README nur auf <https://blsdb.de/bls> verlinken, nie einen Token-Link.
- **Geschwindigkeit:** Der Swiss-Importer braucht drei Roundtrips je Lebensmittel.
  1.191 Zeilen dauerten in Produktion etwa 15 Minuten. 3.000 weitere Zeilen auf diese
  Art wären beim ersten Deploy weit über eine halbe Stunde. Der BLS-Importer
  schreibt deshalb in Batches (mehrzeilige Upserts in einer Transaktion). Den
  Swiss-Importer gleich mit umstellen.
- Die „schon importiert"-Prüfung zählt wie bisher, aber je `(dataset, dataset_version)`.
- `deploy.yml`: `npm run seed:bls` **nach** `seed:swiss`, weil `same` auf
  Swiss-Zeilen zeigt. `db:setup` bekommt denselben Schritt.

---

## 9. Quellenangabe

Heute nennt die Oberfläche **keine** Datenquelle, auch nicht die Schweizer
Datenbank. Mit BLS sollte ein kurzer Abschnitt „Datenquellen" dazukommen (Hilfe-
oder Rechtsseite, optional als Fußzeile unter den Nährwerten), in allen 4 Sprachen:

> Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0.
> Karlsruhe. DOI: 10.25826/Data20251217-134202-0
> Bundesamt für Lebensmittelsicherheit und Veterinärwesen BLV: Schweizer
> Nährwertdatenbank V7.0, naehrwertdaten.ch

---

## 10. Phasen

| #   | Inhalt                                                                                           | Ergebnis                                     |
| --- | ------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| 1   | `ingredient_sources` + Migration + Backfill; Swiss-Importer auf Datensatz-ohne-Version + Batches | keine Verhaltensänderung, Bug aus §2 behoben |
| 2   | BLS-Parser, Umfangsfilter, Feldabbildung, Erratum, Kandidaten-Generator                          | `bls-map.csv` mit Vorschlägen                |
| 3   | Review der Entscheidungsdatei                                                                    | jede der 3.327 Zeilen entschieden            |
| 4   | Seed erzeugen + Importer (merge/insert, Synonyme, Kategorien) + `seed:bls` in setup/deploy       | Katalog ca. 4.300 Zutaten, keine Duplikate   |
| 5   | Such-Ranking, Quellenangabe, Doku (README, ARCHITECTURE §10, current_state)                      | auslieferbar                                 |
| 6   | optional: FR/IT-Übersetzung, Umschalten auf BLS-Werte, Nutzerzutaten-Bericht, BLS 4.1            | je nach E1–E4                                |

Tests:

- Parser: Kennzeichen, µg→mg bei VITB6, Erratum-Korrektur an einem OLSAC-Beispiel
- Validierung der Entscheidungsdatei (vollständig, 1:1, Ziele existieren)
- Importer idempotent: zweimal laufen lassen ergibt null neue Zeilen
- E2E: „Sahne" liefert die Rahm-Zeile genau einmal

---

## 11. Offene Entscheidungen

- **E1, Werte bei Überschneidung:** Für die `same`-Paare zunächst die Swiss-Werte
  behalten (rein additiver Release, kein bestehendes Rezept ändert seine Nährwerte),
  oder sofort BLS nehmen (neuer, deutscher Markt)? _Empfehlung:_ zuerst Swiss behalten,
  mit dem 4.1-Import auf BLS umschalten, nachdem ein Diff-Bericht die Änderungen pro
  Rezept zeigt.
- **E2, Umfang Gruppe D / Fertigprodukte:** ganz raus, oder einzeln im Review
  entscheiden? _Empfehlung:_ einzeln, mit Vorschlag `skip`.
- **E3, FR/IT für BLS-only:** EN-Fallback beim Start, oder vor dem Launch übersetzen?
- **E4, Nutzerzutaten, die nach dem Import doppelt wirken:** nur berichten, oder ein
  `superseded_by`, das sie für neue Auswahl ausblendet, während alte Commits sie
  weiter referenzieren?
