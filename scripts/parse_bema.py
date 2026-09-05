import pdfplumber
import re
import json

PDF_PFAD = 'data/quellen/bema.pdf'
AUSGABE_PFAD = 'data/bema.json'

NR_MAX_X = 100
WERT_MIN_X = 440

WERT_RE = re.compile(r'^\d+([.,]\d+)?$')
BROAD_ZIFFER_RE = re.compile(r'^(Ä\s?\d+[a-zA-Z]?|(K|UP|FU|IP|ePA)\s?\d+[a-zA-Z]?|gz|\d{1,3}[a-zA-Z]{0,2})$')
PURE_LETTER_RE = re.compile(r'^[A-Za-zÄäöüÖÜß]{1,8}$')
SUB_RE = re.compile(r'^([a-h])\)\s*(.*)$')
NOTE_RE = re.compile(r'^(\d{1,2})\.\s+(.*)$')


def classify_line(words):
    """Ordnet Wörter einer Zeile den Spalten Nr/Text/Punktzahl zu.

    Wichtig: Ein Wort in der Punktzahl-Spalten-Position wird nur dann als
    Punktzahl gewertet, wenn es auch wie eine Zahl aussieht. Sonst handelt
    es sich um eine zufällig weit rechts stehende Wortsilbe (z. B. bei
    Trennung am Zeilenende), die inhaltlich zum Fließtext gehört.
    """
    nr, body, wert = [], [], []
    for w in sorted(words, key=lambda w: w['x0']):
        text = w['text']
        if w['x0'] < NR_MAX_X:
            nr.append(text)
        elif w['x0'] >= WERT_MIN_X:
            if WERT_RE.match(text):
                wert.append(text)
            else:
                body.append(text)
        else:
            body.append(text)
    return ' '.join(nr), ' '.join(body), ' '.join(wert)


def rohe_eintraege_extrahieren():
    entries = []
    current = None
    lines_seen = 0

    with pdfplumber.open(PDF_PFAD) as pdf:
        for pnum, page in enumerate(pdf.pages):
            if pnum < 6:
                continue
            words = page.extract_words()
            words = [w for w in words if 40 < w['top'] < 800]
            lines = {}
            for w in words:
                key = round(w['top'])
                lines.setdefault(key, []).append(w)

            for top in sorted(lines.keys()):
                nr, body, wert = classify_line(lines[top])
                nr = nr.strip()

                if nr == 'Nr.':
                    continue

                is_new_entry = False
                if nr:
                    if BROAD_ZIFFER_RE.match(nr):
                        is_new_entry = True
                    elif PURE_LETTER_RE.match(nr):
                        if current is None or lines_seen != 1:
                            is_new_entry = True

                if is_new_entry:
                    if current:
                        entries.append(current)
                    current = {'ziffer': nr, 'body_lines': [], 'wert_kandidaten': [], 'seite': pnum + 1}
                    lines_seen = 1
                else:
                    lines_seen += 1

                if current is None:
                    continue
                if body:
                    current['body_lines'].append(body)
                if wert and WERT_RE.match(wert):
                    current['wert_kandidaten'].append(wert)

        if current:
            entries.append(current)

    return entries


def normalisiere_ziffer(z):
    return z.replace(' ', '')


def verbinde_zeilenumbrueche(zeilen):
    """Fügt Wörter zusammen, die am Zeilenende im Original-PDF getrennt wurden
    (z. B. 'ausreichen-' + 'den' -> 'ausreichenden'), statt sie als zwei
    Fragmente mit Bindestrich stehen zu lassen."""
    ergebnis = []
    i = 0
    while i < len(zeilen):
        zeile = zeilen[i]
        while zeile.endswith('-') and not zeile.endswith('--') and i + 1 < len(zeilen):
            i += 1
            zeile = zeile[:-1] + zeilen[i]
        ergebnis.append(zeile)
        i += 1
    return ergebnis


def finalisiere(rohe_eintraege):
    final = []

    for e in rohe_eintraege:
        ziffer = normalisiere_ziffer(e['ziffer'])
        lines = verbinde_zeilenumbrueche(e['body_lines'])
        werte = e['wert_kandidaten']

        sub_start_idx = None
        for idx, l in enumerate(lines):
            if SUB_RE.match(l):
                sub_start_idx = idx
                break

        if sub_start_idx is not None and len(werte) >= 2:
            intro = ' '.join(lines[:sub_start_idx]).strip()
            subs = []
            cur_letter = None
            cur_text = []
            rest_notes = []
            in_subs = True
            for l in lines[sub_start_idx:]:
                m = SUB_RE.match(l)
                nm = NOTE_RE.match(l)
                if m:
                    if cur_letter:
                        subs.append((cur_letter, ' '.join(cur_text).strip()))
                    cur_letter = m.group(1)
                    cur_text = [m.group(2)]
                elif nm and in_subs:
                    if cur_letter:
                        subs.append((cur_letter, ' '.join(cur_text).strip()))
                        cur_letter = None
                    in_subs = False
                    rest_notes.append(l)
                elif in_subs:
                    cur_text.append(l)
                else:
                    rest_notes.append(l)
            if cur_letter:
                subs.append((cur_letter, ' '.join(cur_text).strip()))

            for i, (letter, text) in enumerate(subs):
                final.append({
                    'ziffer': f'{ziffer}{letter}',
                    'leistungstext': f'{intro} – {text}'.strip(' –'),
                    'anmerkungen': rest_notes,
                    'bewertungszahl': int(werte[i]) if i < len(werte) and werte[i].isdigit() else None,
                    'seite': e['seite']
                })
        else:
            notes_start = None
            for idx, l in enumerate(lines):
                if NOTE_RE.match(l):
                    notes_start = idx
                    break
            if notes_start is None:
                leistungstext = ' '.join(lines).strip()
                anmerkungen = []
            else:
                leistungstext = ' '.join(lines[:notes_start]).strip()
                anmerkungen = lines[notes_start:]
            final.append({
                'ziffer': ziffer,
                'leistungstext': leistungstext,
                'anmerkungen': anmerkungen,
                'bewertungszahl': int(werte[0]) if werte and werte[0].isdigit() else None,
                'seite': e['seite']
            })

    final = [e for e in final if e['bewertungszahl'] is not None and e['leistungstext']]
    return final


def main():
    rohe = rohe_eintraege_extrahieren()
    final = finalisiere(rohe)

    from collections import Counter
    dupes = {z: c for z, c in Counter(e['ziffer'] for e in final).items() if c > 1}

    output = {
        'quelle': 'kzbv.de – BEMA, Anlage A zum BMV-Z, Stand 01.01.2026',
        'stand_abgerufen': '2026-09-04',
        'hinweis': 'Automatisiert aus PDF extrahiert (Tabellenlayout, Spaltenerkennung, inhaltsbasierte Punktzahl-Erkennung). Leistungstexte koennen an Zeilenumbruechen vereinzelt kleine Trennfehler enthalten. Ziffer/Punktzahl-Zuordnung wurde mehrfach stichprobenartig geprueft.',
        'ziffern': final
    }
    with open(AUSGABE_PFAD, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f'{len(rohe)} Rohpositionen -> {len(final)} finale Ziffern gespeichert in {AUSGABE_PFAD}')
    print('Duplikate:', dupes if dupes else 'keine')


if __name__ == '__main__':
    main()
