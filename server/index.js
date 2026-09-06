import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import rateLimit from 'express-rate-limit';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    'WARNUNG: ANTHROPIC_API_KEY ist nicht gesetzt. Kopiere .env.example zu .env und trage deinen Key ein.'
  );
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Antwortet dem Nutzer bei einem fehlgeschlagenen Claude-Aufruf mit einer freundlichen,
// nichttechnischen Meldung (z. B. bei aufgebrauchtem API-Guthaben, Rate-Limit oder
// Netzwerkproblemen) statt eines rohen Fehlers. Die technischen Details landen nur im
// Server-Log, nie in der Nutzeroberfläche.
function sendeApiFehler(res, err, kontext) {
  console.error(`Fehler bei ${kontext}:`, err);
  res.status(503).json({
    error: 'Der Dienst ist gerade nicht verfügbar. Bitte versuche es in ein paar Minuten erneut.'
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Schützt die (kostenpflichtige) Claude-API vor Missbrauch durch Bots/Skripte im öffentlichen Betrieb.
const kiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen von dieser IP-Adresse. Bitte versuche es in einigen Minuten erneut.' }
});

const gozDaten = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'goz.json'), 'utf-8'));
const bemaDaten = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'bema.json'), 'utf-8'));
const goaeDaten = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'goae.json'), 'utf-8'));
const festzuschussDaten = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'festzuschuss.json'), 'utf-8'));
const bel2Daten = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'bel2.json'), 'utf-8'));
const wegegeldDaten = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'wegegeld.json'), 'utf-8'));

const GOZ_PUNKTWERT_EURO = gozDaten.punktwert_cent / 100;
const GOAE_PUNKTWERT_EURO = goaeDaten.punktwert_cent / 100;

// Ziffern-Typen, für die ein GOZ-typischer Steigerungsfaktor (1,0-3,5, Regelfaktor 2,3) gilt
// und die dementsprechend eine Euro-Berechnung bekommen. BEMA hat keinen bundeseinheitlichen
// Punktwert und daher weder Steigerungsfaktor noch Euro-Betrag.
const FAKTORFAEHIGE_TYPEN = new Set(['GOZ', 'GOÄ']);

function punktwertFuerTyp(typ) {
  if (typ === 'GOZ') return GOZ_PUNKTWERT_EURO;
  if (typ === 'GOÄ') return GOAE_PUNKTWERT_EURO;
  return null;
}

function baueReferenzliste(typ, ziffern, textFeld) {
  const zeilen = ziffern.map((z) => {
    const text = z[textFeld].length > 140 ? z[textFeld].slice(0, 140) + '…' : z[textFeld];
    const punktzahl = z.punktzahl ?? z.bewertungszahl;
    return `${z.ziffer} | ${text} | ${punktzahl} Punkte`;
  });
  return `--- ${typ}-Referenzliste (Ziffer | Leistungstext | Punktzahl) ---\n${zeilen.join('\n')}`;
}

const GOZ_REFERENZ = baueReferenzliste('GOZ', gozDaten.ziffern, 'leistungstext');
const BEMA_REFERENZ = baueReferenzliste('BEMA', bemaDaten.ziffern, 'leistungstext');
const GOAE_REFERENZ = baueReferenzliste('GOÄ', goaeDaten.ziffern, 'leistungstext');

function formatEuroDE(betrag) {
  return betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function baueFestzuschussReferenz(daten) {
  const zeilen = daten.befundklassen.map((b) => {
    const text = b.bezeichnung.length > 150 ? b.bezeichnung.slice(0, 150) + '…' : b.bezeichnung;
    const betraege = b.betraege
      ? `${formatEuroDE(b.betraege['60'])}€ / ${formatEuroDE(b.betraege['70'])}€ / ${formatEuroDE(b.betraege['75'])}€ / ${formatEuroDE(b.betraege['100'])}€ (60/70/75/100%)`
      : b.hinweis;
    return `${b.befund} | ${text} | ${betraege}`;
  });
  return `--- Festzuschuss-Befundklassen (Zahnersatz, GKV) – Befund | Bezeichnung | Festzuschuss bei 60%/70%/75%/100% ---
Mechanismus: ${daten.mechanismus.zusammenfassung}
Regelversorgung: ${daten.mechanismus.versorgungsarten.regelversorgung}
Gleichartiger Zahnersatz: ${daten.mechanismus.versorgungsarten.gleichartiger_zahnersatz}
Andersartiger Zahnersatz: ${daten.mechanismus.versorgungsarten.andersartiger_zahnersatz}
Wichtig: ${daten.mechanismus.wichtiger_hinweis}
Bonusstufen: 60% = ohne Bonusheft-Nachweis, 70% = Bonusheft 5 Jahre lückenlos, 75% = Bonusheft 10 Jahre lückenlos, 100% = Härtefall.

${zeilen.join('\n')}`;
}

const FESTZUSCHUSS_REFERENZ = baueFestzuschussReferenz(festzuschussDaten);
const FESTZUSCHUSS_NACH_BEFUND = new Map(festzuschussDaten.befundklassen.map((b) => [b.befund, b]));

function korrigiereFestzuschuss(festzuschuss) {
  if (!festzuschuss || !festzuschuss.befund) return null;
  const eintrag = FESTZUSCHUSS_NACH_BEFUND.get(String(festzuschuss.befund).trim());
  if (!eintrag || !eintrag.betraege) {
    // Kein eindeutig auflösbarer Befund-Schlüssel (z. B. "1.1 oder 1.2" statt eines einzelnen
    // Schlüssels) -> Beträge könnten unverifiziert/halluziniert sein, daher lieber ganz weglassen
    // statt ungeprüfte Zahlen anzuzeigen.
    console.warn(`Festzuschuss-Befund "${festzuschuss.befund}" nicht in der Datenbank gefunden, Feld wird verworfen.`);
    return null;
  }
  // Beträge/Bezeichnung immer aus der verifizierten Datenbank übernehmen, nie die von der KI
  // kopierten Werte vertrauen (Schutz vor Zahlendrehern/Halluzination bei den Euro-Beträgen).
  return {
    ...festzuschuss,
    befund: eintrag.befund,
    bezeichnung: eintrag.bezeichnung,
    betraege: { ...eintrag.betraege }
  };
}

function baueBel2Referenz(daten) {
  const zeilen = daten.leistungen.map((l) => {
    const gewerbe = l.hoechstpreis_gewerbelabor != null ? `${formatEuroDE(l.hoechstpreis_gewerbelabor)}€` : '–';
    const praxis = l.hoechstpreis_praxislabor != null ? `${formatEuroDE(l.hoechstpreis_praxislabor)}€` : '–';
    return `${l.nr} | ${l.bezeichnung} | Höchstpreis Gewerbelabor ${gewerbe} / Praxislabor ${praxis}`;
  });
  return `--- BEL-II-Referenzliste (zahntechnische Laborleistungen, NUR für GKV-Regelversorgung; Preise Bayern, andere KZV-Bezirke können geringfügig abweichen) ---
${daten.wichtiger_hinweis}

Regeln für GOZ-Laborkosten (freie Preisvereinbarung, gilt bei GOZ/Privatpatient sowie bei gleichartigem/andersartigem Zahnersatz):
${daten.goz_freie_laborkosten.kernregeln.map((r) => `- ${r}`).join('\n')}

${zeilen.join('\n')}`;
}

const BEL2_REFERENZ = baueBel2Referenz(bel2Daten);

function baueWegegeldReferenz(daten) {
  const zeilen = daten.wegegeld_tabelle.map(
    (w) => `${w.entfernung}: ${formatEuroDE(w.tag_euro)}€ (tags), ${formatEuroDE(w.nacht_euro)}€ (nachts, 20-8 Uhr)`
  );
  const re = daten.reiseentschaedigung_ab_25km;
  return `--- Wegegeld / Reiseentschädigung (§ 8 GOZ, gilt laut Abrechnungsbestimmung identisch für BEMA- und GOZ-Hausbesuche) ---
${daten.hinweis}
${daten.wegegeld_erlaeuterung}
${zeilen.join('\n')}
Reiseentschädigung ab mehr als 25 km statt Wegegeld: ${formatEuroDE(re.km_pauschale_euro)}€ je km (${re.km_pauschale_hinweis}), Tagegeld ${formatEuroDE(re.tagegeld_bis_8h_euro)}€ (bis 8h Abwesenheit) bzw. ${formatEuroDE(re.tagegeld_ueber_8h_euro)}€ (über 8h), zzgl. ${re.uebernachtung}.`;
}

const WEGEGELD_REFERENZ = baueWegegeldReferenz(wegegeldDaten);
const BEL2_NACH_NR = new Map(bel2Daten.leistungen.map((l) => [l.nr, l]));

// Gemeinsamer Referenzblock für GOZ/BEMA/GOÄ, byte-identisch in allen drei KI-Aufrufen
// (Vorschläge, Regelprüfung, Chat) verwendet, damit sie sich einen einzigen Prompt-Cache-Eintrag
// teilen können, statt ihn jeweils separat (und damit mehrfach kostenpflichtig) neu zu schreiben.
const KERN_REFERENZ = `${GOZ_REFERENZ}\n\n${BEMA_REFERENZ}\n\n${GOAE_REFERENZ}`;
const ERWEITERTE_REFERENZ = `${FESTZUSCHUSS_REFERENZ}\n\n${BEL2_REFERENZ}\n\n${WEGEGELD_REFERENZ}`;

function korrigiereHinweise(hinweise) {
  if (!Array.isArray(hinweise)) return [];
  return hinweise
    .map((h) => {
      // Abwärtskompatibel, falls die KI entgegen der Anweisung einen reinen String liefert.
      if (typeof h === 'string') return { text: h, ziffer: null, typ: null, punktzahl: null, anzahl: null };
      if (!h || typeof h.text !== 'string' || !h.text.trim()) return null;

      const typ = ['GOZ', 'BEMA', 'GOÄ'].includes(h.typ) ? h.typ : null;
      const ziffer = h.ziffer != null ? String(h.ziffer).trim() : null;
      if (!typ || !ziffer) {
        return { text: h.text, ziffer: null, typ: null, punktzahl: null, anzahl: null };
      }

      const eintrag = mapFuerTyp(typ).get(ziffer);
      if (!eintrag) {
        // Nicht auflösbar (z. B. halluzinierte Ziffer) -> Verknüpfung entfernen, Hinweistext bleibt.
        console.warn(`Hinweis-Ziffer "${typ} ${ziffer}" nicht in der Datenbank gefunden, Verknüpfung wird entfernt.`);
        return { text: h.text, ziffer: null, typ: null, punktzahl: null, anzahl: null };
      }

      return {
        text: h.text,
        ziffer,
        typ,
        punktzahl: eintrag.punktzahl ?? eintrag.bewertungszahl,
        anzahl: Number.isFinite(h.anzahl) && h.anzahl > 0 ? h.anzahl : 1
      };
    })
    .filter(Boolean);
}

function korrigiereLaborkosten(laborkosten) {
  if (!laborkosten) return null;
  if (!Array.isArray(laborkosten.beispielpositionen) || laborkosten.beispielpositionen.length === 0) {
    return { ...laborkosten, beispielpositionen: [] };
  }
  const korrigiert = [];
  for (const pos of laborkosten.beispielpositionen) {
    const eintrag = BEL2_NACH_NR.get(String(pos?.nr ?? '').trim());
    if (!eintrag) {
      console.warn(`BEL-II-Position "${pos?.nr}" nicht in der Datenbank gefunden, wird übersprungen.`);
      continue;
    }
    korrigiert.push({
      nr: eintrag.nr,
      bezeichnung: eintrag.bezeichnung,
      hoechstpreis_gewerbelabor: eintrag.hoechstpreis_gewerbelabor,
      hoechstpreis_praxislabor: eintrag.hoechstpreis_praxislabor
    });
  }
  return { ...laborkosten, beispielpositionen: korrigiert };
}

const GOZ_NACH_ZIFFER = new Map(gozDaten.ziffern.map((z) => [z.ziffer, z]));
const BEMA_NACH_ZIFFER = new Map(bemaDaten.ziffern.map((z) => [z.ziffer, z]));
const GOAE_NACH_ZIFFER = new Map(goaeDaten.ziffern.map((z) => [z.ziffer, z]));

function mapFuerTyp(typ) {
  if (typ === 'GOZ') return GOZ_NACH_ZIFFER;
  if (typ === 'GOÄ') return GOAE_NACH_ZIFFER;
  return BEMA_NACH_ZIFFER;
}

function findeAnmerkungen(ziffer, typ) {
  const eintrag = mapFuerTyp(typ).get(ziffer);
  if (!eintrag || !eintrag.anmerkungen || eintrag.anmerkungen.length === 0) {
    return null;
  }
  return eintrag.anmerkungen.join(' ');
}

console.log(
  `Datenbank geladen: ${gozDaten.ziffern.length} GOZ-Ziffern, ${bemaDaten.ziffern.length} BEMA-Ziffern, ${goaeDaten.ziffern.length} GOÄ-Ziffern (Beratung, Besuch, MKG-Chirurgie, Röntgen)`
);

const FLAECHEN_REIHENFOLGE = ['mehr als dreiflächig', 'dreiflächig', 'zweiflächig', 'einflächig'];

const FLAECHEN_FAMILIEN = [
  { typ: 'GOZ', varianten: { einflächig: '2050', zweiflächig: '2070', dreiflächig: '2090', 'mehr als dreiflächig': '2110' } },
  { typ: 'GOZ', varianten: { einflächig: '2060', zweiflächig: '2080', dreiflächig: '2100', 'mehr als dreiflächig': '2120' } },
  { typ: 'BEMA', varianten: { einflächig: '13a', zweiflächig: '13b', dreiflächig: '13c', 'mehr als dreiflächig': '13d' } }
];

const FLAECHEN_ZIFFER_ZU_FAMILIE = new Map();
for (const familie of FLAECHEN_FAMILIEN) {
  for (const [variante, ziffer] of Object.entries(familie.varianten)) {
    FLAECHEN_ZIFFER_ZU_FAMILIE.set(`${familie.typ}:${ziffer}`, { familie, variante });
  }
}

function erkenneFlaechenKeyword(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const kw of FLAECHEN_REIHENFOLGE) {
    if (t.includes(kw)) return kw;
  }
  return null;
}

function extrahiereZahnSegmente(beschreibung) {
  if (!beschreibung) return {};
  const teile = beschreibung.split(/(?=Zahn \d{2}:)/g);
  const segmente = {};
  for (const teil of teile) {
    const treffer = teil.match(/^Zahn (\d{2}):/);
    if (treffer) segmente[treffer[1]] = teil;
  }
  return segmente;
}

function findeZahnInText(text) {
  if (!text) return null;
  const treffer = text.match(/\b([1-4][1-8])\b/);
  return treffer ? treffer[1] : null;
}

function korrigiereFlaechenZiffern(vorschlaege, beschreibung) {
  if (!Array.isArray(vorschlaege)) return vorschlaege;

  const zahnSegmente = extrahiereZahnSegmente(beschreibung);
  const mehrzahnModus = Object.keys(zahnSegmente).length > 1;
  const globalErwartet = erkenneFlaechenKeyword(beschreibung);

  return vorschlaege.map((v) => {
    const eintrag = FLAECHEN_ZIFFER_ZU_FAMILIE.get(`${v.typ}:${v.ziffer}`);
    if (!eintrag) return v;

    let erwartet = globalErwartet;
    if (mehrzahnModus) {
      const zahn = findeZahnInText(`${v.kurzbezeichnung || ''} ${v.begruendung || ''}`);
      erwartet = zahn && zahnSegmente[zahn] ? erkenneFlaechenKeyword(zahnSegmente[zahn]) : null;
      if (!erwartet) return v; // Zahn nicht eindeutig zuordenbar -> lieber nichts anfassen
    }
    if (!erwartet || eintrag.variante === erwartet) return v;

    const korrekteZiffer = eintrag.familie.varianten[erwartet];
    const quelle = v.typ === 'GOZ' ? GOZ_NACH_ZIFFER : BEMA_NACH_ZIFFER;
    const korrekterEintrag = quelle.get(korrekteZiffer);
    if (!korrekterEintrag) return v;

    console.warn(
      `Flächen-Korrektur: ${v.typ} ${v.ziffer} (${eintrag.variante}) -> ${korrekteZiffer} (${erwartet}), da Beschreibung "${erwartet}" nennt.`
    );

    return {
      ...v,
      ziffer: korrekteZiffer,
      kurzbezeichnung: korrekterEintrag.leistungstext.length > 90
        ? korrekterEintrag.leistungstext.slice(0, 90) + '…'
        : korrekterEintrag.leistungstext,
      punktzahl: korrekterEintrag.punktzahl ?? korrekterEintrag.bewertungszahl
    };
  });
}

const SYSTEM_ANWEISUNG = `Du bist ein spezialisiertes Assistenzsystem für die zahnärztliche Abrechnung in Deutschland (GOZ und BEMA).
Zielgruppe: Zahnärzte in der Weiterbildung und Abrechnungspersonal in der Einarbeitung.
Dein Ziel ist nicht nur die Nennung von Ziffern, sondern auch die kurze Erklärung, warum eine Ziffer passt, und der Hinweis auf häufig vergessene Zusatzpositionen (z. B. Anästhesie, Naht, Röntgen).

Unten findest du die offizielle GOZ-, BEMA- und GOÄ-Referenzliste (Ziffer, Leistungstext, Punktzahl) sowie die Festzuschuss- und BEL-II-Referenzlisten (für Zahnersatz-Kosten bei GKV-Patienten). Das ist deine EINZIGE erlaubte Quelle für Ziffern, Punktzahlen, Befunde und Laborpreise.

Hinweis zur GOÄ-Referenzliste: Die GOZ selbst deckt nicht jede zahnärztliche Leistung ab. Nach GOZ § 6 Abs. 2 darf der Zahnarzt für bestimmte, in der GOZ nicht enthaltene Leistungen auf näher bezeichnete Abschnitte des ärztlichen Gebührenverzeichnisses (GOÄ) zurückgreifen – das ist offiziell so vorgesehen, keine Ausnahme oder Behelfslösung. Die GOÄ-Referenzliste unten enthält genau diese offiziell zulässigen Fälle:
  - Nr. 1/Nr. 3 (Beratung, siehe Regel unten), Nr. 34 (Erörterung bei schwerwiegender/lebensverändernder Diagnose), Nr. 48/50/51 (Besuch/Hausbesuch bei immobilen bzw. Pflegeheim-Patienten), Nr. 70/75 (Bescheinigung, ausführlicher Arztbrief/Befundbericht) – frei verwendbar, wenn die Beschreibung das entsprechende Szenario schildert.
  - Nr. 2253, 2254, 2255, 2256, 2321, 2355, 2356 – WICHTIG: Diese sind laut GOZ § 6 Abs. 2 Nr. 5 NUR im Rahmen der Behandlung von Kieferbrüchen abrechnungsfähig. Schlage sie NIEMALS für sonstige Knochenchirurgie vor (z. B. normale Kieferaugmentation vor Implantaten) – nur wenn die Beschreibung erkennbar einen Kieferbruch/eine Fraktur betrifft.
  - Nr. 2620–2732 (Abschnitt "Mund-, Kiefer- und Gesichtschirurgie") – uneingeschränkt zulässig, deckt aber überwiegend GROSSE, spezialisierte Eingriffe ab (z. B. Lippen-Kiefer-Gaumenspalten, Dysgnathie-Operationen, ausgedehnte Kieferzysten, Kieferfrakturen, Kieferresektion bei Tumoren). Sei hier besonders zurückhaltend: Verwende diese Ziffern nur, wenn die Beschreibung eindeutig einen entsprechend großen chirurgischen Eingriff schildert – für normale Extraktionen, einfache Osteotomien oder Weisheitszahn-Entfernungen bleiben die regulären GOZ-Chirurgie-Ziffern (3000er-Serie) zuständig.
  - Nr. 5000, 5002, 5004 (Röntgendiagnostik, Abschnitt O.I) – WICHTIG und häufig gebraucht: Die GOZ hat KEINE eigene Röntgen-Ziffer. Bei einem Privatpatienten (Modus "goz" oder "beide") ist für Röntgenaufnahmen daher IMMER auf diese GOÄ-Ziffern zurückzugreifen, niemals eine BEMA-Röntgenziffer (Ä925 ff.) für den GOZ-Teil verwenden. Nr. 5000 = Einzelzahnaufnahme, je Projektion (bei mehreren auf einem Bild erfassten Zähnen trotzdem nur einmal); Nr. 5002 = Panoramaaufnahme eines Kiefers; Nr. 5004 = Panoramaschichtaufnahme beider Kiefer (OPG). Die reine Befundmitteilung/-beurteilung ist damit abgegolten, nicht gesondert berechenbar.
  Kennzeichne alle Vorschläge aus dieser Liste mit "typ": "GOÄ" (nicht "GOZ"). Bei BEMA-Patienten gibt es für die Beratung stattdessen die eigene BEMA-Ziffer Ä1; für die übrigen GOÄ-Fälle oben gibt es kein direktes BEMA-Äquivalent, da es sich um genuin privatzahnärztliche/GOÄ-basierte Abrechnungswege handelt.

WEGEGELD/REISEENTSCHÄDIGUNG bei Hausbesuchen (wichtig, oft vergessen): Wird ein Besuch/Hausbesuch abgerechnet (GOÄ 48/50/51 ODER BEMA 151-155), ist ZUSÄTZLICH zur Besuchsgebühr fast immer Wegegeld bzw. Reiseentschädigung berechenbar (siehe Wegegeld-Referenzliste unten – gilt laut Abrechnungsbestimmung identisch für BEMA und GOZ, § 8 GOZ). Nenne dies IMMER als Hinweis, sobald ein Besuch vorgeschlagen wird: "ziffer" und "typ" dabei auf null lassen (Wegegeld ist keine nummerierte Gebührenziffer, sondern eine Entschädigung mit von Entfernung/Tageszeit abhängigem Betrag), aber schreibe den konkret zutreffenden Betrag in den Hinweistext, wenn die Beschreibung eine Entfernung oder "nachts"/eine Uhrzeit nennt; ansonsten liste die Entfernungsstufen kurz auf und bitte um die fehlende Angabe.

WICHTIGSTE REGEL: Verwende ausschließlich Ziffern, die wörtlich in der Referenzliste unten stehen, mit der dort angegebenen Punktzahl. Erfinde niemals eine Ziffer oder Punktzahl. Wenn du für einen Teil der Beschreibung keine passende Ziffer in der Liste findest, lass sie weg und erwähne das stattdessen im Hinweisfeld ("keine passende Ziffer in der Referenzliste gefunden für ...").

VORSICHT bei ähnlichen Nachbar-Ziffern: Viele Ziffern-Serien unterscheiden sich nur durch ein einziges Wort am Ende des Leistungstextes (z. B. "einflächig" / "zweiflächig" / "dreiflächig" / "mehr als dreiflächig", oder "je Kanal"-Serien). Lies bei jeder gewählten Ziffer den KOMPLETTEN Leistungstext genau bis zum Ende und vergleiche ihn wörtlich mit der in der Beschreibung genannten Menge/Variante, bevor du sie einsetzt. Verwechsle niemals eine Ziffer mit ihrer direkten Nachbar-Ziffer in der Liste.

Antworte AUSSCHLIESSLICH mit validem JSON exakt in diesem Schema, ohne jeglichen Text davor oder danach und ohne Markdown-Codeblock:

{
  "vorschlaege": [
    {
      "ziffer": "string, exakt wie in der Referenzliste, z. B. '3000' oder '13a'",
      "typ": "GOZ", "BEMA" oder "GOÄ",
      "kurzbezeichnung": "string, kurz und präzise, abgeleitet aus dem Leistungstext der Referenzliste",
      "punktzahl": "Zahl, exakt aus der Referenzliste übernommen (Punktzahl EINER Einheit, nicht multipliziert)",
      "anzahl": "Zahl, wie oft diese Ziffer laut Beschreibung angesetzt wird (z. B. Anzahl Kanäle bei 'je Kanal', Anzahl Nähte bei 'je Naht'). Wenn die Leistung nur einmal vorkommt oder die Anzahl unklar ist, setze 1.",
      "pflicht": true oder false,
      "begruendung": "string, kurze Erklärung warum diese Ziffer zur Beschreibung passt",
      "steigerungsfaktor": "string oder null (null nur bei BEMA), z. B. '2,3 (Regelfaktor)' oder '2,3–3,5 bei erschwerter Behandlung'",
      "moeglicheBegruendungenErhoehung": "Array von 2-4 kurzen Strings, NUR bei GOZ und GOÄ (bei BEMA leeres Array []). Plausible, zur Beschreibung passende Begründungen, warum im Einzelfall ein höherer Steigerungsfaktor als der Regelfaktor 2,3 gerechtfertigt sein könnte, gestützt auf die drei zulässigen Kriterien nach § 5 Abs. 2 GOZ bzw. § 5 Abs. 2 GOÄ: (1) Schwierigkeit der Leistung, (2) Zeitaufwand, (3) Umstände bei der Ausführung. Beispiele: 'Ungewöhnlich schwierige anatomische Verhältnisse', 'Deutlich erhöhter Zeitaufwand durch ...', 'Erschwerte Bedingungen durch eingeschränkte Mundöffnung'. Erfinde nichts Unplausibles – wenn nichts Naheliegendes passt, gib trotzdem 2-3 allgemein gebräuchliche, seriöse Beispiele aus diesen drei Kategorien."
    }
  ],
  "komplementaerleistungen": [
    {
      "beschreibung": "string, kurz was zu tun/dokumentieren ist, z. B. 'Trockenlegung des Arbeitsfeldes'",
      "ziffer": "string oder null, falls es dafür keine eigene GOZ-/BEMA-Ziffer gibt",
      "typ": "GOZ" oder "BEMA" oder null,
      "punktzahl": "Zahl oder null, exakt aus der Referenzliste, falls eine Ziffer existiert",
      "anzahl": "Zahl, Standard 1",
      "steigerungsfaktor": "string oder null (null bei BEMA oder wenn keine Ziffer existiert), z. B. '2,3 (Regelfaktor)'",
      "moeglicheBegruendungenErhoehung": "Array von 2-4 kurzen Strings, NUR bei GOZ und GOÄ (bei BEMA oder ziffer=null leeres Array []) – GENAU DIESELBE Regel wie bei 'vorschlaege': plausible Begründungen für einen höheren Steigerungsfaktor gestützt auf Schwierigkeit/Zeitaufwand/Umstände nach § 5 Abs. 2 GOZ bzw. GOÄ. NIEMALS leer lassen, wenn typ GOZ/GOÄ ist – sonst fehlt dem Nutzer die Begründungshilfe im Steigerungsfaktor-Feld."
    }
  ],
  "hinweise": [
    {
      "text": "string, der vollständige Hinweistext wie bisher (Erklärung, warum/wann die Position ggf. zutrifft)",
      "ziffer": "string oder null – GENAU EINE Ziffer aus der Referenzliste, NUR wenn der Hinweis auf EINE konkrete, zusätzlich abrechenbare Einzelposition hinweist, die der Nutzer per Klick direkt übernehmen könnte (z. B. 'GOZ 2430'). null bei allgemeinen/mehrdeutigen Hinweisen, reinen Regel-/Kombinationshinweisen, oder wenn mehrere alternative Ziffern zur Wahl stehen.",
      "typ": "GOZ, BEMA oder GOÄ, oder null (wenn ziffer null ist)",
      "punktzahl": "Zahl oder null, exakt aus der Referenzliste, nur wenn ziffer gesetzt ist",
      "anzahl": "Zahl, Standard 1, nur relevant wenn ziffer gesetzt ist"
    }
  ],
  "festzuschuss": "null ODER Objekt {befund, bezeichnung, versorgungsart, betraege: {60,70,75,100}, erlaeuterung} – siehe Festzuschuss-Regel unten. NUR bei Zahnersatz (Krone, Brücke, Prothese, implantatgestützter Zahnersatz) UND wenn der Modus BEMA oder beide ist; sonst immer null. \"befund\" MUSS exakt EIN einzelner Schlüssel aus der Festzuschuss-Referenzliste sein (z. B. genau \"1.2\", niemals \"1.1 oder 1.2\" oder ein Bereich/mehrere Optionen) – bei Unsicherheit zwischen zwei Befunden entscheide dich für den wahrscheinlicheren und erwähne die Alternative NUR im Fließtext von \"erlaeuterung\", nicht im \"befund\"-Feld selbst. \"betraege\" sind Zahlen (ohne Euro-Zeichen/Anführungszeichen), exakt wie in der Referenzliste.",
  "laborkosten": "null ODER Objekt {einordnung, beispielpositionen: [{nr, bezeichnung, hoechstpreis_gewerbelabor, hoechstpreis_praxislabor}], erlaeuterung} – siehe Laborkosten-Regel unten. NUR wenn die Behandlung zahntechnische Laborarbeit erfordert (Krone, Brücke, Prothese, Verblendung, Stiftaufbau, laborgefertigte Schiene, implantatgetragene Suprakonstruktion); sonst immer null. \"nr\" MUSS exakt ein Schlüssel aus der BEL-II-Referenzliste sein (z. B. \"102 1\"), niemals erfunden."
}

Regeln:
- LABORKOSTEN (wichtig, eigenes Thema, hängt eng mit Festzuschuss zusammen): Bei jeder Behandlung mit zahntechnischer Laborarbeit fallen zusätzlich zur zahnärztlichen Gebühr (GOZ/BEMA) gesondert zu berechnende Material- und Laborkosten an.
  1. Liegt "festzuschuss.versorgungsart" (siehe oben) bei "Regelversorgung" UND Modus ist "bema" oder "beide": setze "einordnung" auf "BEL-II (gesetzliche Regelversorgung, Preise Bayern – andere KZV-Bezirke können geringfügig abweichen)" und wähle 2 bis 5 zur Versorgung passende Positionen aus der BEL-II-Referenzliste (z. B. bei einer Metallkrone: Modell, Vollkrone/Metall, Krone einarbeiten, Grundeinheit ZE). "erlaeuterung" kurz erklären, dass diese Kosten laut Berechnungsschema "Material-/Laborkosten minus Festzuschuss = Eigenanteil des Patienten" in die Rechnung einfließen.
  2. Liegt "gleichartiger" oder "andersartiger" Zahnersatz vor, ODER ist der Modus "goz" (reiner Privatpatient): setze "einordnung" auf "Freie Preisvereinbarung nach § 9 GOZ", "beispielpositionen": [] (leer, da es keine Preisbindung gibt – nenne hier NIEMALS erfundene Beträge), und fasse in "erlaeuterung" die wichtigsten Pflichten kurz zusammen: Kostenvoranschlags-Pflicht ab 1.000 Euro voraussichtlicher Kosten, Pflicht zur unverzüglichen Information bei absehbarer Überschreitung um mehr als 15%, und dass die Rechnung Art/Menge/Preis der Materialien (bei Legierungen: Bezeichnung, Gewicht, Tagespreis) sowie die Laborrechnung selbst enthalten muss.
  3. Ist unklar, ob überhaupt Laborarbeit anfällt (z. B. bei einer möglicherweise nur direkt am Zahn hergestellten Versorgung), setze "laborkosten": null.
  4. Erfinde NIEMALS konkrete Euro-Beträge für freie Preisvereinbarung (Regel 2) – dort gibt es bewusst keine Zahlen, nur die Verfahrensregeln.
- FESTZUSCHUSS (wichtig, eigenes Thema): Bei GKV-Patienten (Modus "bema" oder "beide") wird Zahnersatz (Krone, Brücke, Prothese, implantatgetragener Zahnersatz) NICHT über den BEMA-Punktwert bezuschusst, sondern über einen befundbezogenen FESTZUSCHUSS (siehe Festzuschuss-Referenzliste unten, komplett unabhängig von den GOZ-/BEMA-/GOÄ-Referenzlisten). Bei einer solchen Beschreibung:
  1. Bestimme aus der Beschreibung den passendsten Befund aus der Festzuschuss-Referenzliste (z. B. Einzelkrone auf einem stark zerstörten Zahn → Befund 1.1 oder 1.2, je nach Ausmaß; Brücke bei einer Zahnlücke → Befund 2.x je nach Lückengröße; Prothese bei Restzahnbestand/zahnlosem Kiefer → Befund 4.x; implantatgetragener Zahnersatz → siehe unten).
  2. Bestimme die Versorgungsart: "Regelversorgung" (dem Befund entsprechende Standardversorgung nach GOZ Regel-Auflistung, in aller Regel wenn Material/Ausführung nicht extra erwähnt wird oder ausdrücklich einfach gehalten ist), "gleichartig" (gleiche Zahnersatzart, aber höherwertiges Material/mehr Leistung, z. B. vollverblendete statt Metallkrone – das ist der HÄUFIGSTE Fall bei privat gewünschten ästhetischen Wünschen), oder "andersartig" (grundsätzlich andere Zahnersatzart als die Regelversorgung, z. B. Implantat statt Brücke/Prothese – das gilt so gut wie IMMER für implantatgetragenen Zahnersatz, außer bei den zwei engen Ausnahmen aus der Referenzliste).
  3. Ist der Befund aus der Beschreibung nicht eindeutig bestimmbar (z. B. weil unklar ist, wie viele Zähne fehlen oder ob Nachbarzähne intakt sind), setze "festzuschuss": null und erwähne stattdessen im Hinweisfeld, welche zusätzlichen Angaben für die genaue Befundklasse nötig wären.
  4. "betraege" IMMER exakt aus der Referenzliste übernehmen (alle vier Werte 60/70/75/100 angeben), niemals selbst berechnen oder schätzen.
  5. "erlaeuterung" kurz erklären: was der Befund bedeutet, welche Versorgungsart vorliegt und was das für die Abrechnung heißt (bei Regelversorgung: Festzuschuss deckt fast alles, Abrechnung über KZV; bei gleichartig/andersartig: Patient trägt Mehrkosten/Gesamtkosten privat nach GOZ, Festzuschuss wird verrechnet bzw. bei andersartig direkt von der Kasse an den Patienten gezahlt).
  6. Bei "goz"-Modus (reiner Privatpatient ohne GKV) immer "festzuschuss": null setzen – das Festzuschuss-System betrifft ausschließlich gesetzlich Versicherte.
- Wenn nur GOZ gewünscht ist, gib GOZ-Ziffern aus (und ggf. GOÄ-Ziffern, siehe Beratungs-Hinweis oben – diese gehören für Privatpatienten mit zum "GOZ"-Modus). Bei BEMA nur BEMA. Bei "beide" gib alle passenden Ziffern aus und kennzeichne den Typ pro Vorschlag.
- Beratung/Aufklärungsgespräch OHNE eigenständige Behandlung an diesem Termin (z. B. reines Beratungsgespräch, Zweitmeinung, ausführliche Erklärung eines Befundes): Bei GOZ/Privatpatient GOÄ Nr. 1 (einfache Beratung) oder Nr. 3 (eingehende Beratung, mind. 10 Minuten) verwenden, bei BEMA/Kassenpatient die Ziffer Ä1. Findet an demselben Termin bereits eine andere abrechenbare zahnärztliche Leistung statt, ist eine gesonderte Beratungsgebühr in aller Regel NICHT zusätzlich berechnungsfähig (die Beratung ist dann Teil der eigentlichen Leistung) – schlage Nr. 1/Nr. 3/Ä1 nur vor, wenn die Beschreibung erkennbar EINEN eigenständigen Beratungstermin ohne sonstige Behandlung schildert.
- Sei konservativ: Schlage keine Ziffer vor, die durch die Beschreibung nicht gedeckt ist. Fehlt eine Angabe (z. B. keine Aussage zur Anästhesie), erwähne das lieber als Hinweis.
- ALTERSGRENZEN bei BEMA beachten (wichtig, leicht zu übersehen): Die Individualprophylaxe-Ziffern IP1 bis IP5 sind laut Abrechnungsbestimmung NUR bei Versicherten abrechenbar, die das 6., aber noch nicht das 18. Lebensjahr vollendet haben; FLA (Fluoridlackanwendung) nur vom 6. bis zum vollendeten 72. Lebensmonat (Kleinkinder). Ist in der Beschreibung KEIN Alter genannt bzw. nichts, was auf ein Kind/Jugendlichen hindeutet, gehe von einem ERWACHSENEN Patienten aus und schlage IP1-IP5 oder FLA NIEMALS vor. Wird z. B. "Fluoridierung" bei einem Erwachsenen (BEMA-Modus) erwähnt, gibt es dafür KEINE separat abrechenbare BEMA-Ziffer – erwähne das ehrlich im Hinweisfeld (ggf. mit Verweis auf die private Analogie GOZ 1020, falls Modus "beide"). Nur bei explizit genanntem Kindes-/Jugendlichenalter oder Formulierungen wie "bei einem 10-jährigen Kind" IP1-IP5/FLA verwenden.
- Bei Füllungen mit plastischem Material gibt es in der Referenzliste sowohl eine günstigere Variante (konventionelles Material, z. B. GOZ 2050/2070/2090/2110) als auch eine teurere Variante in Adhäsivtechnik/Komposit (z. B. GOZ 2060/2080/2100/2120). Wähle die teurere Adhäsivtechnik-Ziffer NUR, wenn Komposit, Adhäsivtechnik oder ein vergleichbarer Begriff in der Beschreibung EXPLIZIT genannt wird. Ist das Material nicht genannt, wähle die günstigere konventionelle Variante und weise im Hinweisfeld darauf hin, dass bei Komposit-Füllung in Adhäsivtechnik eine andere (höherwertige) Ziffer gilt – wähle niemals unbegründet die teurere Variante.
- "anzahl" korrekt setzen: Enthält der Leistungstext "je Kanal", "je Fläche", "je Zahn", "je Naht", "je Implantat", "je Sitzung" o. Ä. und die Beschreibung nennt eine konkrete Menge (z. B. "3 Wurzelkanäle", "2 Nähte", "2 Implantate"), setze "anzahl" auf diese Menge. Berechne die Punktzahl NICHT selbst – gib nur die Punktzahl einer Einheit und die Anzahl an, die Multiplikation übernimmt das System.
- "komplementaerleistungen" (NEU, wichtig): Hier gehören Arbeitsschritte hinein, die in der Praxis bei dieser Art von Behandlung so gut wie IMMER dazugehören, auch wenn sie in der Beschreibung nicht erwähnt wurden – anders als "hinweise", wo es um Dinge geht, die NUR MANCHMAL zutreffen. Die meisten Praxen arbeiten heute bei Füllungen/Endo routinemäßig mit privat zu vereinbarenden Zuzahlungen für genau solche Zusatzleistungen – erwähne sie daher konsequent, auch im BEMA-Kontext. Typische Standardschritte:
  (a) Trockenlegung/Isolierung des Arbeitsfeldes (z. B. Watterollen oder Kofferdam) – NUR relevant bei Füllungstherapie und Wurzelkanalbehandlung (konservierende/endodontische Leistungen), NICHT bei chirurgischen Leistungen wie Extraktion, Osteotomie oder PA-Chirurgie (dort wird nicht auf diese Weise trockengelegt). Dafür gibt es KEINE eigene GOZ-/BEMA-Ziffer, trotzdem gehört sie in die Akte, also "ziffer": null setzen.
  (b) Lokalanästhesie (Infiltrations- oder Leitungsanästhesie, GOZ 0090/0100 bzw. BEMA 40/41a) – relevant bei praktisch allen invasiven Leistungen: Füllungstherapie, Endodontie, Chirurgie, PA-Chirurgie, Implantologie (Insertion, Freilegung, isolierte Augmentation).
  (c) Bei Füllungstherapie zusätzlich: Besondere Maßnahmen beim Präparieren/Füllen (GOZ 2030 bzw. BEMA 12, z. B. Kofferdam/Spanngummi, Zahnfleisch zurückhalten) – wird laut gängiger Praxis heute bei nahezu jeder Füllung mit abgerechnet.
  (d) Bei Wurzelkanalbehandlung (Endodontie) zusätzlich: Elektrometrische Längenbestimmung eines Wurzelkanals (GOZ 2400, 70 Punkte, je Kanal) und Zusätzliche Anwendung elektrophysikalisch-chemischer Methoden zur Wurzelkanalreinigung (GOZ 2420, 70 Punkte, je Kanal) – beides ist bei einer fachgerechten Wurzelkanalbehandlung heute praktisch Standard. WICHTIG: Dafür gibt es KEINE eigene BEMA-Ziffer (die GKV übernimmt das nicht). Bei "bema"-Modus daher NICHT als Komplementärleistung mit typ "BEMA" vorschlagen (es gäbe keine echte Ziffer dafür), sondern stattdessen im Hinweisfeld erwähnen, dass dies meist als privat zu vereinbarende Zusatzleistung (Mehrkostenvereinbarung, analog GOZ 2400/2420 abgerechnet) angeboten wird. Bei "goz" oder "beide" ganz normal mit "typ": "GOZ" als Komplementärleistung führen, "anzahl" = Anzahl der behandelten Kanäle.
  (e) Bei Krone oder Brücke (Prothetik) zusätzlich: eine provisorische Versorgung für die Zeit bis zur Eingliederung – im Regelfall GOZ 2260 (Provisorium im direkten Verfahren ohne Abformung, je Zahn, 100 Punkte) bei einer Einzelkrone bzw. GOZ 5120 (Provisorische Brücke im direkten Verfahren, je Zahn/Implantat, 240 Punkte) bei einer Brücke. Deutet die Beschreibung erkennbar auf ein anderes Verfahren hin (mit Abformung oder laborgefertigt), stattdessen die passendere Ziffer wählen (GOZ 2270, 5140, 7080 oder 7090) und das kurz in der Begründung erwähnen.
  Liste solche Standardschritte hier, SOFERN sie nicht schon explizit in der Beschreibung genannt und daher schon in "vorschlaege" enthalten sind (dann nicht doppelt aufführen). Ist ein Standardschritt für die konkrete Behandlungsart nicht einschlägig (z. B. Anästhesie bei reiner Prophylaxe/PZR, Trockenlegung bei Chirurgie), lasse ihn weg bzw. "komplementaerleistungen" ggf. ganz leer.
- ABFORMUNG bei Krone/Brücke vs. Prothese (wichtig, leicht zu verwechseln): Bei einer normalen Krone (GOZ 2200/2210/2220) oder Brücke ist die Abformung laut Abrechnungsbestimmung bereits IN der Ziffer enthalten ("abgegolten") – erfinde dafür NIEMALS eine zusätzliche separate Abformungs-Ziffer. Eigenständig abrechenbar ist eine Abformung mit individuellem Löffel NUR im Zusammenhang mit Teil-/Totalprothesen: GOZ 5170 (anatomische Abformung mit individuellem Löffel bei ungünstigen Kiefer-/Zahnbogenformen), GOZ 5180 (funktionelle Abformung Oberkiefer mit individuellem Löffel) bzw. GOZ 5190 (funktionelle Abformung Unterkiefer mit individuellem Löffel) – nur vorschlagen, wenn die Beschreibung dies explizit nennt (z. B. "funktionelle Abformung", "individueller Löffel"). Bei Totalprothese die Kiefer-Angabe (Oberkiefer: GOZ 5220, Unterkiefer: GOZ 5230) beachten. Bei Teilprothese unterscheide "einfache gebogene Halteelemente" (GOZ 5200) von "Modellguss mit gegossenen Halte-/Stützelementen" (GOZ 5210).
- "hinweise" soll v. a. auf typischerweise vergessene, aber situationsabhängige Zusatzpositionen eingehen (Röntgen, Zuschläge, Nachbehandlung, medikamentöse Einlage etc.), sofern sie in der Referenzliste existieren und fachlich relevant sind. Dinge, die nach obiger Regel schon in "komplementaerleistungen" stehen, gehören NICHT zusätzlich in "hinweise".
- SEI HIER MAXIMAL GRÜNDLICH, nicht nur bei den offensichtlichsten 1-2 Zusatzpositionen: Denke bei JEDER Behandlung aktiv über die gesamte Bandbreite plausibel dazugehöriger, aber leicht vergessener Einzelleistungen aus der Referenzliste nach – nicht nur direkte Verfahrensschritte, sondern auch naheliegende Begleitbefunde/-behandlungen derselben Sitzung. Beispiel: Bei einer Kontrolluntersuchung/Vorsorgetermin gehören dazu typischerweise (sofern zutreffend und nicht bereits in "vorschlaege" enthalten): Parodontaler Screening-Index (GOZ 4005 bzw. BEMA 04, alle 2 Jahre), Entfernung harter Zahnbeläge/Zahnstein (GOZ 4050/4055 bzw. BEMA 107, max. 1×/Kalenderjahr), Behandlung einer Mundschleimhauterkrankung (GOZ 4020 bzw. BEMA 105), Behandlung überempfindlicher Zahnflächen (GOZ 2010 bzw. BEMA 10), Fluoridierung (GOZ 1020 bzw. BEMA IP-Leistungen bei Kindern/Jugendlichen). Übertrage dieses Prinzip sinngemäß auf jede andere Behandlungsart: Frage dich "was wird in der Praxis bei diesem Anlass sonst noch routinemäßig mitgemacht oder mitbefundet, das eine eigene Ziffer hat?" – lieber eine Zusatzposition zu viel nennen (klar als "je nach Befund/optional" gekennzeichnet) als eine relevante zu vergessen.
- WICHTIG für "hinweise": Erwähnst du im "text" eine Ziffer, die NICHT in "vorschlaege" steht (z. B. eine mögliche Zusatzposition), schreibe IMMER direkt dahinter in Klammern ihre Kurzbedeutung aus der Referenzliste – z. B. "GOZ 2430 (Medikamentöse Einlage in den Wurzelkanal)" statt nur "GOZ 2430". Das gilt auch bei mehreren Ziffern in einer Aufzählung (jede einzeln mit Bedeutung). Nenne keine Ziffernbereiche wie "925a-c" – schreibe stattdessen die konkret relevante(n) Einzelziffer(n) mit Bedeutung aus. Der Nutzer kann einen Hinweis mit gesetztem "ziffer"-Feld per Klick direkt in die Vorschlagsliste übernehmen – setze "ziffer"/"typ"/"punktzahl" deshalb IMMER, wenn der Hinweis auf genau EINE konkrete, zusätzlich abrechenbare Position hinweist (auch wenn diese nur "je nach Befund" zutrifft), und lasse sie NUR bei wirklich allgemeinen Regel-/Kombinationshinweisen oder bei mehreren gleichwertigen Alternativ-Ziffern leer.
- Gib niemals mehr als 8 Vorschläge, 6 Komplementärleistungen und 9 Hinweise aus.`;

function buildUserPrompt(beschreibung, modus) {
  const modusText =
    modus === 'goz'
      ? 'Nur GOZ (Privatpatient)'
      : modus === 'bema'
        ? 'Nur BEMA (Kassenpatient)'
        : 'Sowohl GOZ als auch BEMA';

  return `Behandlungsbeschreibung: "${beschreibung}"\n\nGewünschter Abrechnungsmodus: ${modusText}\n\nGib die passenden Abrechnungsziffern gemäß dem vorgegebenen JSON-Schema aus. Nutze dafür ausschließlich die Referenzliste aus der System-Anweisung.`;
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('Keine gültige JSON-Antwort von Claude erhalten.');
  }
  return JSON.parse(match[0]);
}

function parseSteigerungsfaktoren(text) {
  if (!text) return [];
  const treffer = text.match(/\d+,\d+/g);
  if (!treffer) return [];
  return treffer.map((s) => parseFloat(s.replace(',', '.')));
}

function runde(zahl) {
  return Math.round(zahl * 100) / 100;
}

function ergaenzeGesamtpunktzahl(liste) {
  if (!Array.isArray(liste)) return [];
  return liste.map((v) => {
    const anzahl = Number.isFinite(v.anzahl) && v.anzahl > 0 ? v.anzahl : 1;
    const punktzahl = Number.isFinite(v.punktzahl) ? v.punktzahl : null;
    const gesamtpunktzahl = punktzahl != null ? punktzahl * anzahl : null;

    let betragEuroMin = null;
    let betragEuroMax = null;
    let steigerungsfaktorWert = null;
    const punktwert = punktwertFuerTyp(v.typ);
    if (punktwert != null && gesamtpunktzahl != null) {
      const faktoren = parseSteigerungsfaktoren(v.steigerungsfaktor);
      if (faktoren.length > 0) {
        betragEuroMin = runde(gesamtpunktzahl * punktwert * Math.min(...faktoren));
        betragEuroMax = runde(gesamtpunktzahl * punktwert * Math.max(...faktoren));
        steigerungsfaktorWert = Math.min(...faktoren);
      }
    }

    return {
      ...v,
      anzahl,
      gesamtpunktzahl,
      betragEuroMin,
      betragEuroMax,
      steigerungsfaktorWert,
      moeglicheBegruendungenErhoehung: Array.isArray(v.moeglicheBegruendungenErhoehung)
        ? v.moeglicheBegruendungenErhoehung
        : []
    };
  });
}

function berechneGesamtpunktzahl(ergebnis) {
  return {
    ...ergebnis,
    vorschlaege: ergaenzeGesamtpunktzahl(ergebnis.vorschlaege),
    komplementaerleistungen: ergaenzeGesamtpunktzahl(ergebnis.komplementaerleistungen)
  };
}

const PRUEF_SYSTEM_ANWEISUNG = `Du prüfst eine bereits erstellte Liste von GOZ-/BEMA-Abrechnungsziffern-Vorschlägen gegen die offiziellen Abrechnungsbestimmungen (Anmerkungen) der jeweiligen Ziffern und gegen die unten angehängte vollständige Referenzliste.

Deine Aufgabe:
- SCHRITT 0 (Verwechslungs-Check, sehr wichtig): Prüfe für JEDE Ziffer in "vorschlaege", ob ihr Leistungstext in der Referenzliste wirklich zur ursprünglichen Behandlungsbeschreibung passt – insbesondere bei Ziffern-Serien, die sich nur in einem Wort unterscheiden (z. B. "dreiflächig" vs. "mehr als dreiflächig", "je Kanal"-Serien, "einwurzelig" vs. "mehrwurzelig"). Wurde eine falsche Nachbar-Ziffer gewählt (Menge/Variante stimmt nicht mit der Beschreibung überein), ersetze sie durch die in der Referenzliste tatsächlich passende Ziffer und korrigiere Kurzbezeichnung sowie Punktzahl entsprechend.
- Prüfe, ob eine der Anmerkungen eine Ausschluss-, Kombinations- oder Häufigkeitsregel enthält, die einen der vorgeschlagenen Positionen betrifft (z. B. "nicht neben Nr. X abrechenbar", "nur einmal je Sitzung/Tag/Kalenderhalbjahr", "ist Bestandteil von Y und nicht gesondert berechnungsfähig").
- Falls ja: passe die Vorschlagsliste entsprechend an. Entferne eine Ziffer NUR, wenn die Regel eindeutig einen Konflikt mit einer ANDEREN vorgeschlagenen Ziffer in DERSELBEN Liste beschreibt. Bist du unsicher, entferne nichts, sondern ergänze stattdessen einen Hinweis.
- Ergänze für jede erkannte relevante Regel einen kurzen, konkreten Hinweis im "hinweise"-Feld (z. B. "GOZ 3010 und GOZ 3020 sind laut Abrechnungsbestimmung nicht nebeneinander abrechenbar – nur die höherwertige Leistung ansetzen.").
- WICHTIG: Falls ein bereits vorhandener Hinweis oder eine "begruendung" der gefundenen Regel widerspricht (z. B. behauptet, zwei Ziffern seien nebeneinander abrechenbar, obwohl die Anmerkung das ausschließt), entferne oder korrigiere diesen widersprüchlichen Text. Es dürfen niemals zwei sich widersprechende Aussagen gleichzeitig in der Antwort stehen.
- Ändere an unveränderten Vorschlägen sonst nichts (Ziffer, Punktzahl, Anzahl, Kurzbezeichnung, Steigerungsfaktor, moeglicheBegruendungenErhoehung bleiben wie vorgegeben, außer sie widersprechen einer gefundenen Regel).
- Wenn keine der Anmerkungen einen Konflikt beschreibt, gib die Vorschlagsliste unverändert zurück und ergänze keine neuen Hinweise.
- WICHTIG für "hinweise": Jeder Hinweis ist ein Objekt {text, ziffer, typ, punktzahl, anzahl} (kein reiner String) – erhalte dieses Format bei unveränderten Hinweisen exakt so. Erwähnst du im "text" eines neuen oder korrigierten Hinweises eine Ziffer, die NICHT in "vorschlaege" steht, schreibe IMMER direkt dahinter in Klammern ihre Kurzbedeutung aus der unten angehängten Referenzliste – z. B. "GOZ 2430 (Medikamentöse Einlage in den Wurzelkanal)" statt nur "GOZ 2430". Nenne keine Ziffernbereiche wie "925a-c" – schreibe stattdessen die konkret relevante(n) Einzelziffer(n) mit Bedeutung aus. Setze bei einem neuen Hinweis "ziffer"/"typ"/"punktzahl", wenn er auf genau EINE konkrete, zusätzlich abrechenbare Position hinweist (damit der Nutzer sie per Klick übernehmen kann), sonst null.
- Antworte AUSSCHLIESSLICH mit validem JSON exakt im selben Schema wie die Eingabe (Felder "vorschlaege" und "hinweise"), ohne jeglichen Text davor oder danach.`;

function buildPruefPrompt(beschreibung, ersteVorschlaege) {
  const anmerkungenBloecke = ersteVorschlaege.vorschlaege
    .map((v) => {
      const text = findeAnmerkungen(v.ziffer, v.typ);
      return `${v.ziffer} (${v.typ}): ${text || '(keine besonderen Abrechnungsbestimmungen hinterlegt)'}`;
    })
    .join('\n\n');

  return `Ursprüngliche Behandlungsbeschreibung: "${beschreibung}"

Bisherige Vorschläge (JSON):
${JSON.stringify(ersteVorschlaege)}

Offizielle Abrechnungsbestimmungen zu diesen Ziffern:
${anmerkungenBloecke}

Prüfe die Vorschläge gegen diese Bestimmungen und gib das ggf. angepasste JSON zurück.`;
}

async function pruefeGegenAbrechnungsbestimmungen(beschreibung, ersteVorschlaege) {
  if (!ersteVorschlaege.vorschlaege || ersteVorschlaege.vorschlaege.length === 0) {
    return ersteVorschlaege;
  }

  console.time('[timing] Pass 2 (Regelprüfung)');
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    output_config: { effort: 'low' },
    system: [
      { type: 'text', text: KERN_REFERENZ, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: PRUEF_SYSTEM_ANWEISUNG, cache_control: { type: 'ephemeral' } }
    ],
    messages: [{ role: 'user', content: buildPruefPrompt(beschreibung, ersteVorschlaege) }]
  });
  console.timeEnd('[timing] Pass 2 (Regelprüfung)');

  const textBlock = message.content.find((block) => block.type === 'text');
  return extractJson(textBlock?.text || '');
}

const FRAGE_SYSTEM_ANWEISUNG = `Du bist ein Frage-Antwort-Assistent für zahnärztliche Abrechnungsfragen (GOZ und BEMA) in Deutschland, eingebettet in eine App für Zahnärzte in der Weiterbildung und Abrechnungspersonal in der Einarbeitung.

Unten findest du die offizielle GOZ-, BEMA- und GOÄ-Referenzliste (Ziffer, Leistungstext, Punktzahl), sowie die Festzuschuss-Befundklassen (GKV-Zahnersatz) und die BEL-II-Referenzliste (zahntechnische Laborkosten bei GKV-Regelversorgung). Zusätzlich bekommst du, sofern in der bisherigen Unterhaltung konkrete Ziffern erwähnt wurden, die vollständigen offiziellen Abrechnungsbestimmungen (Anmerkungen) zu genau diesen Ziffern angehängt.

Manchmal bekommst du zusätzlich einen "Kontext"-Block mit einem bereits von der App erstellten Abrechnungsvorschlag (Behandlungsbeschreibung, vorgeschlagene Ziffern, Festzuschuss, Laborkosten). Der Nutzer stellt dann gezielte Rückfragen zu genau diesem Ergebnis (z. B. "warum diese Ziffer und nicht die Nachbarziffer?", "was bedeutet der Festzuschuss hier konkret?"). Beziehe deine Antwort in diesem Fall auf den mitgegebenen Kontext, statt allgemein zu antworten.

Hinweis: Die GOZ hat keine eigene Ziffer für eine reine Beratung. Für GOZ-Patienten wird dafür GOÄ Nr. 1 oder Nr. 3 (Gebührenverzeichnis für ärztliche Leistungen) herangezogen – das ist offiziell so vorgesehen (GOZ Anlage 1, Allgemeine Bestimmung Nr. 1), keine Behelfslösung. Die GOÄ hat einen eigenen Punktwert (5,82873 Cent), der vom GOZ-Punktwert (5,62421 Cent) abweicht. Bei BEMA-Patienten gibt es dafür die eigene Ziffer Ä1.

Hinweis zu Zahnersatz-Kosten: Bei GKV-Patienten richtet sich die Kassenbezuschussung von Zahnersatz nach dem Festzuschuss-System (befundbezogen, unabhängig von der gewählten Versorgung, siehe Festzuschuss-Referenzliste). Zahntechnische Laborkosten sind bei GKV-Regelversorgung über BEL-II-Höchstpreise gedeckelt (siehe BEL-II-Referenzliste, Preise Bayern, andere KZV-Bezirke ggf. leicht abweichend); bei gleichartigem/andersartigem Zahnersatz oder reinen Privatpatienten gilt freie Preisvereinbarung nach § 9 GOZ (keine Preisliste, aber feste Offenlegungspflichten wie Kostenvoranschlag ab 1.000 Euro).

WICHTIGSTE REGEL: Antworte ausschließlich auf Basis dieser bereitgestellten offiziellen Daten. Erfinde niemals eine Ziffer, Punktzahl oder Abrechnungsregel. Wenn eine Frage Details betrifft, die aus den bereitgestellten Daten nicht eindeutig hervorgehen (z. B. weil zu einer nicht erwähnten Ziffer keine vollständigen Abrechnungsbestimmungen angehängt sind, oder eine Frage über die Daten hinausgeht, z. B. regionale KZV-Sonderregelungen oder der BEMA-Punktwert, der nicht bundeseinheitlich ist), sage das ehrlich und klar, statt zu raten oder zu spekulieren. Verweise in solchen Fällen darauf, die zuständige KZV/Zahnärztekammer oder die vollständige Abrechnungsbestimmung zu konsultieren.

Unterscheide klar zwischen GOZ (privatzahnärztliche Abrechnung) und BEMA (vertragszahnärztliche/gesetzliche Abrechnung) – die Regeln unterscheiden sich oft erheblich. Ist aus der Frage nicht klar, welches System gemeint ist, gehe kurz auf beide ein oder frage kurz nach.

Nennst du eine Ziffer, schreibe ihre Kurzbedeutung aus dem Leistungstext dazu (z. B. "GOZ 2030 (Besondere Maßnahmen beim Präparieren oder Füllen)").

Ethischer Rahmen (gilt immer): Deine Antworten dienen der korrekten und rechtssicheren Abrechnung, nicht der Maximierung des Honorars. Schlage niemals Wege vor, Leistungen ohne fachliche/tatsächliche Rechtfertigung höher oder zusätzlich abzurechnen (das wäre Abrechnungsbetrug, § 263 StGB, bzw. bei GOZ ein Verstoß gegen § 5 Abs. 2 GOZ). Wenn danach gefragt wird, weise freundlich, aber klar darauf hin.

Antworte in klarem, gut lesbarem Deutsch in Fließtext (kein JSON, keine Code-Blöcke). Halte Antworten so kurz wie möglich, aber so ausführlich wie nötig – bei einfachen Fragen reichen 2-4 Sätze, bei komplexeren Regelketten (z. B. Abrechnungsfrequenzen) auch eine kurze strukturierte Aufzählung mit Zeilenumbrüchen.

Dies ist eine Lern- und Nachschlagehilfe und ersetzt keine verbindliche Abrechnungsprüfung durch die KZV, Zahnärztekammer oder einen Steuerberater.`;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function erkenneErwaehnteZiffern(text) {
  if (!text) return [];
  const treffer = [];
  const pruefeMap = (map, typ) => {
    for (const ziffer of map.keys()) {
      // Sehr kurze Ziffern-Schlüssel (z. B. GOÄ "1"/"3") würden bei jeder beliebigen Zahl im
      // Fließtext anschlagen (Datumsangaben, Anzahl Kanäle usw.) - dafür gibt es die gezieltere
      // Präfix-/Konzept-Suche weiter unten.
      if (ziffer.length < 2) continue;
      const regex = new RegExp(`(?<![0-9A-Za-zÄÖÜäöüß])${escapeRegExp(ziffer)}(?![0-9A-Za-zÄÖÜäöüß])`);
      if (regex.test(text)) {
        treffer.push({ ziffer, typ });
      }
    }
  };
  pruefeMap(GOZ_NACH_ZIFFER, 'GOZ');
  pruefeMap(BEMA_NACH_ZIFFER, 'BEMA');
  pruefeMap(GOAE_NACH_ZIFFER, 'GOÄ');
  return treffer;
}

function extrahiereSuchworte(text) {
  const woerter = text.match(/[A-Za-zÄÖÜäöüß0-9]+/g) || [];
  const ergebnis = new Set();
  for (const w of woerter) {
    if (w.length >= 12 && /[A-Za-zÄÖÜäöüß]/.test(w)) {
      // Lange, fachspezifische Komposita (z. B. "Mindestabstand", "Sondierungstiefen") sind
      // präzise genug für eine Volltextsuche in Leistungstext/Anmerkungen.
      ergebnis.add(w.toLowerCase());
    } else if (w.length >= 2 && w.length <= 5 && w === w.toUpperCase() && /[A-ZÄÖÜ]/.test(w)) {
      // Kurze durchgängig großgeschriebene Tokens sind meist Abkürzungen wie UPT, BMF, PZR.
      ergebnis.add(w.toLowerCase());
    }
  }
  return Array.from(ergebnis);
}

function erkenneRelevanteZiffern(nachrichten) {
  const text = nachrichten.map((n) => n.text).join('\n');
  const gefunden = new Map();

  // 1. Exakte Ziffer-Erwähnungen (z. B. "2030", "13a") – höchste Präzision, kein Limit.
  for (const { ziffer, typ } of erkenneErwaehnteZiffern(text)) {
    gefunden.set(`${typ}:${ziffer}`, { ziffer, typ });
  }

  const suchworte = extrahiereSuchworte(text);
  const praefixWorte = suchworte.filter((w) => w.length <= 5 && /[a-zäöüß]/.test(w));
  const konzeptWorte = suchworte.filter((w) => w.length >= 12);

  // 1b. "GOÄ" wird explizit erwähnt: Die beiden Beratungsziffern (Nr. 1/Nr. 3) sind zu kurz
  //     für eine Präfix- oder Volltextsuche, daher hier als Spezialfall behandelt.
  if (praefixWorte.includes('goä') || praefixWorte.includes('goae')) {
    for (const ziffer of GOAE_NACH_ZIFFER.keys()) {
      gefunden.set(`GOÄ:${ziffer}`, { ziffer, typ: 'GOÄ' });
    }
  }

  // 2. Abkürzungs-Präfixe (z. B. "upt" -> UPTa-g) – ebenfalls hohe Präzision, kein eigenes Limit,
  //    laufen aber VOR den unscharfen Konzept-Treffern, damit sie nicht vom Gesamt-Limit verdrängt werden.
  if (praefixWorte.length > 0) {
    const pruefePraefix = (map, typ) => {
      for (const [ziffer] of map) {
        const key = `${typ}:${ziffer}`;
        if (gefunden.has(key)) continue;
        const zifferLower = ziffer.toLowerCase();
        if (praefixWorte.some((w) => zifferLower.startsWith(w))) {
          gefunden.set(key, { ziffer, typ });
        }
      }
    };
    pruefePraefix(GOZ_NACH_ZIFFER, 'GOZ');
    pruefePraefix(BEMA_NACH_ZIFFER, 'BEMA');
  }

  // 3. Fachbegriffe in Leistungstext ODER Anmerkungen – niedrigere Präzision, daher mit
  //    eigenem, begrenztem Kontingent, das die präziseren Treffer oben nicht verdrängen kann.
  if (konzeptWorte.length > 0 && gefunden.size < 25) {
    const pruefeKonzept = (map, typ) => {
      for (const [ziffer, eintrag] of map) {
        const key = `${typ}:${ziffer}`;
        if (gefunden.has(key)) continue;
        const textLower = `${eintrag.leistungstext} ${(eintrag.anmerkungen || []).join(' ')}`.toLowerCase();
        if (konzeptWorte.some((w) => textLower.includes(w))) {
          gefunden.set(key, { ziffer, typ });
          if (gefunden.size >= 25) return;
        }
      }
    };
    pruefeKonzept(GOZ_NACH_ZIFFER, 'GOZ');
    if (gefunden.size < 25) pruefeKonzept(BEMA_NACH_ZIFFER, 'BEMA');
    if (gefunden.size < 25) pruefeKonzept(GOAE_NACH_ZIFFER, 'GOÄ');
  }

  return Array.from(gefunden.values());
}

function buildErwaehnteZiffernBlock(nachrichten) {
  const treffer = erkenneRelevanteZiffern(nachrichten);

  if (treffer.length === 0) {
    return 'In der bisherigen Unterhaltung wurden keine konkreten Ziffern erkannt, zu denen zusätzliche vollständige Abrechnungsbestimmungen angehängt werden könnten. Nutze bei Bedarf die Kurzangaben aus der Referenzliste oben und weise ggf. darauf hin, wenn Details fehlen.';
  }

  const bloecke = treffer.map(({ ziffer, typ }) => {
    const eintrag = mapFuerTyp(typ).get(ziffer);
    const anmerkungen =
      eintrag.anmerkungen && eintrag.anmerkungen.length > 0
        ? eintrag.anmerkungen.join(' ')
        : '(keine besonderen Abrechnungsbestimmungen hinterlegt)';
    const punktzahl = eintrag.punktzahl ?? eintrag.bewertungszahl;
    return `${typ} ${ziffer}: ${eintrag.leistungstext}\nPunktzahl: ${punktzahl}\nAbrechnungsbestimmungen: ${anmerkungen}`;
  });

  return `--- Vollständige offizielle Abrechnungsbestimmungen zu in der Unterhaltung erwähnten Ziffern ---\n${bloecke.join('\n\n')}`;
}

app.post('/api/chat', kiRateLimiter, async (req, res) => {
  try {
    const { nachrichten, kontext } = req.body;

    if (!Array.isArray(nachrichten) || nachrichten.length === 0) {
      return res.status(400).json({ error: 'Keine Nachrichten übermittelt.' });
    }
    if (nachrichten.length > 30) {
      return res.status(400).json({ error: 'Diese Unterhaltung ist zu lang geworden. Bitte starte einen neuen Chat.' });
    }
    if (kontext != null && (typeof kontext !== 'string' || kontext.length > 4000)) {
      return res.status(400).json({ error: 'Ungültiger Kontext.' });
    }

    const bereinigt = [];
    for (const n of nachrichten) {
      if (!n || (n.rolle !== 'user' && n.rolle !== 'assistant') || typeof n.text !== 'string' || !n.text.trim()) {
        return res.status(400).json({ error: 'Ungültiges Nachrichtenformat.' });
      }
      bereinigt.push({ rolle: n.rolle, text: n.text.trim().slice(0, 2000) });
    }
    if (bereinigt[0].rolle !== 'user' || bereinigt[bereinigt.length - 1].rolle !== 'user') {
      return res.status(400).json({ error: 'Ungültiger Gesprächsverlauf.' });
    }

    const erwaehnteZiffernBlock = buildErwaehnteZiffernBlock(bereinigt);
    const systemBloecke = [
      { type: 'text', text: KERN_REFERENZ, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: ERWEITERTE_REFERENZ, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: FRAGE_SYSTEM_ANWEISUNG, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: erwaehnteZiffernBlock }
    ];
    if (kontext && kontext.trim()) {
      systemBloecke.push({
        type: 'text',
        text: `--- Kontext: Der Nutzer bezieht sich auf folgendes, bereits von dieser App erstelltes Abrechnungsergebnis. Beziehe deine Antwort darauf, wenn die Frage erkennbar dazu passt. ---\n${kontext.trim()}`
      });
    }

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      output_config: { effort: 'medium' },
      system: systemBloecke,
      messages: bereinigt.map((n) => ({ role: n.rolle, content: n.text }))
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    res.json({ antwort: textBlock?.text?.trim() || 'Keine Antwort erhalten.' });
  } catch (err) {
    sendeApiFehler(res, err, '/api/chat');
  }
});

app.get('/api/datenbank', (req, res) => {
  res.json({
    goz: gozDaten.ziffern,
    bema: bemaDaten.ziffern,
    goae: goaeDaten.ziffern
  });
});

// Merkt sich fertige, bereits KI-geprüfte Ergebnisse für exakt wiederkehrende Behandlungsbeschreibungen
// (z. B. "Kontrolluntersuchung" oder häufige Kombinationen aus dem geführten Wizard). Bei einem Treffer
// entfällt der komplette (teure) KI-Aufruf. Lebt nur, solange dieser Server-Prozess läuft (kein
// persistenter Speicher auf Render Free) – reduziert aber Kosten/Latenz für den laufenden Betrieb spürbar.
const vorschlaegeCache = new Map();
const MAX_CACHE_EINTRAEGE = 500;

function baueCacheSchluessel(beschreibung, modus) {
  return `${modus}::${beschreibung.trim().toLowerCase()}`;
}

app.post('/api/vorschlaege', kiRateLimiter, async (req, res) => {
  try {
    const { beschreibung, modus } = req.body;

    if (!beschreibung || typeof beschreibung !== 'string' || !beschreibung.trim()) {
      return res.status(400).json({ error: 'Bitte eine Behandlungsbeschreibung angeben.' });
    }
    if (beschreibung.length > 2000) {
      return res.status(400).json({ error: 'Die Behandlungsbeschreibung ist zu lang (max. 2000 Zeichen).' });
    }
    if (!['goz', 'bema', 'beide'].includes(modus)) {
      return res.status(400).json({ error: 'Ungültiger Modus.' });
    }

    const cacheSchluessel = baueCacheSchluessel(beschreibung, modus);
    const gecacht = vorschlaegeCache.get(cacheSchluessel);
    if (gecacht) {
      return res.json({ ...gecacht, _ausCache: true });
    }

    console.time('[timing] Pass 1 (Vorschläge)');
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      output_config: { effort: 'low' },
      system: [
        { type: 'text', text: KERN_REFERENZ, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: ERWEITERTE_REFERENZ, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: SYSTEM_ANWEISUNG, cache_control: { type: 'ephemeral' } }
      ],
      messages: [{ role: 'user', content: buildUserPrompt(beschreibung.trim(), modus) }]
    });
    console.timeEnd('[timing] Pass 1 (Vorschläge)');

    const textBlock = message.content.find((block) => block.type === 'text');
    const ersteVorschlaege = extractJson(textBlock?.text || '');
    const komplementaerleistungen = ersteVorschlaege.komplementaerleistungen || [];
    const festzuschuss = korrigiereFestzuschuss(ersteVorschlaege.festzuschuss);
    const laborkosten = korrigiereLaborkosten(ersteVorschlaege.laborkosten);

    ersteVorschlaege.vorschlaege = korrigiereFlaechenZiffern(ersteVorschlaege.vorschlaege, beschreibung.trim());

    let result = ersteVorschlaege;
    let regelnGeprueft = false;
    try {
      result = await pruefeGegenAbrechnungsbestimmungen(beschreibung.trim(), ersteVorschlaege);
      regelnGeprueft = true;
    } catch (pruefFehler) {
      console.error('Regelprüfung fehlgeschlagen, gebe ungeprüfte Vorschläge zurück:', pruefFehler);
    }

    result.vorschlaege = korrigiereFlaechenZiffern(result.vorschlaege, beschreibung.trim());
    result.komplementaerleistungen = komplementaerleistungen;
    result.festzuschuss = festzuschuss;
    result.laborkosten = laborkosten;
    result.hinweise = korrigiereHinweise(result.hinweise);
    result = berechneGesamtpunktzahl(result);

    const antwort = { ...result, _regelnGeprueft: regelnGeprueft };

    if (regelnGeprueft) {
      if (vorschlaegeCache.size >= MAX_CACHE_EINTRAEGE) {
        vorschlaegeCache.delete(vorschlaegeCache.keys().next().value);
      }
      vorschlaegeCache.set(cacheSchluessel, antwort);
    }

    res.json(antwort);
  } catch (err) {
    sendeApiFehler(res, err, '/api/vorschlaege');
  }
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
