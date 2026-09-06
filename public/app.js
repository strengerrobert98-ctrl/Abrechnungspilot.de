const form = document.getElementById('eingabe-form');
const statusBox = document.getElementById('status');
const ergebnisSection = document.getElementById('ergebnis');
const vorschlaegeListe = document.getElementById('vorschlaege-liste');
const hinweiseBox = document.getElementById('hinweise-box');
const hinweiseListe = document.getElementById('hinweise-liste');
const komplementaerBox = document.getElementById('komplementaer-box');
const komplementaerListe = document.getElementById('komplementaer-liste');
const festzuschussBox = document.getElementById('festzuschuss-box');
const festzuschussInhalt = document.getElementById('festzuschuss-inhalt');
const laborkostenBox = document.getElementById('laborkosten-box');
const laborkostenInhalt = document.getElementById('laborkosten-inhalt');
const submitBtn = document.getElementById('submit-btn');

function getModus() {
  return document.querySelector('input[name="modus"]:checked').value;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const beschreibung = document.getElementById('beschreibung').value.trim();
  if (!beschreibung) return;
  submitBtn.disabled = true;
  await holeVorschlaege(beschreibung, getModus());
  submitBtn.disabled = false;
});

const LADE_STATUS_SCHRITTE = [
  { verzoegerung: 0, text: 'Passende Ziffern werden ermittelt …' },
  { verzoegerung: 14000, text: 'Vorschläge werden gegen offizielle Abrechnungsregeln geprüft …' },
  { verzoegerung: 30000, text: 'Fast fertig, letzte Prüfung läuft …' }
];

async function holeVorschlaege(beschreibung, modus) {
  ergebnisSection.hidden = true;
  const ladeTimeouts = LADE_STATUS_SCHRITTE.map((schritt) =>
    setTimeout(() => setStatus(schritt.text, false), schritt.verzoegerung)
  );

  try {
    const response = await fetch('/api/vorschlaege', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beschreibung, modus })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unbekannter Fehler.');
    }

    renderErgebnis(data, beschreibung, modus);
    statusBox.hidden = true;
  } catch (err) {
    setStatus(`Fehler: ${err.message}`, true);
  } finally {
    ladeTimeouts.forEach(clearTimeout);
  }
}

function setStatus(text, isError) {
  statusBox.hidden = false;
  statusBox.classList.toggle('error', isError);
  statusBox.classList.toggle('laden', !isError);
  if (isError) {
    statusBox.textContent = text;
  } else {
    statusBox.innerHTML = `
      <div class="lade-icon-wrap">
        <img class="lade-icon-base" src="logo-icon-base.png" alt="" />
        <img class="lade-icon-needle" src="logo-icon-needle.png" alt="" />
      </div>
      <p class="lade-text">${escapeHtml(text)}</p>
    `;
  }
}

function baueGruppenUeberschrift(text) {
  const h4 = document.createElement('h4');
  h4.className = 'vorschlaege-gruppe-titel';
  h4.textContent = text;
  return h4;
}

// Rendert eine Liste von typisierten Karten (Vorschläge oder Komplementärleistungen).
// Im Modus "beide" mit tatsächlich gemischten BEMA-/GOZ-Ergebnissen wird nach Kassen-
// (BEMA) und Privat-Abrechnung (GOZ/GOÄ) gruppiert, statt beides zu vermischen – erst
// alle BEMA-Karten, dann darunter alle GOZ-Karten. Allgemeine Punkte ohne eigene Ziffer
// (typ null, z. B. Trockenlegung) stehen voran, da sie keinem System zuzuordnen sind.
function renderNachModusGruppiert(container, liste, modus, renderFn) {
  const typenVorhanden = new Set(liste.map((item) => item.typ));
  const hatBema = typenVorhanden.has('BEMA');
  const hatPrivat = typenVorhanden.has('GOZ') || typenVorhanden.has('GOÄ');

  if (modus !== 'beide' || !hatBema || !hatPrivat) {
    for (const item of liste) container.appendChild(renderFn(item));
    return;
  }

  const allgemein = liste.filter((item) => item.typ == null);
  const bema = liste.filter((item) => item.typ === 'BEMA');
  const privat = liste.filter((item) => item.typ === 'GOZ' || item.typ === 'GOÄ');

  for (const item of allgemein) container.appendChild(renderFn(item));
  if (bema.length > 0) {
    container.appendChild(baueGruppenUeberschrift('BEMA (Kassenpatient)'));
    for (const item of bema) container.appendChild(renderFn(item));
  }
  if (privat.length > 0) {
    container.appendChild(baueGruppenUeberschrift('GOZ (Privatpatient)'));
    for (const item of privat) container.appendChild(renderFn(item));
  }
}

function renderErgebnis(data, beschreibung, modus) {
  vorschlaegeListe.innerHTML = '';

  const regelHinweis = document.getElementById('regelpruef-hinweis');
  if (data._regelnGeprueft) {
    regelHinweis.hidden = false;
    regelHinweis.textContent = '✓ Gegen offizielle Abrechnungsbestimmungen (Ausschluss-/Kombinationsregeln) geprüft';
  } else {
    regelHinweis.hidden = true;
  }

  let aktuelleVorschlaege = Array.isArray(data.vorschlaege) ? data.vorschlaege.slice() : [];

  function renderVorschlaegeListe() {
    if (aktuelleVorschlaege.length === 0) {
      vorschlaegeListe.innerHTML = '<p>Keine passenden Ziffern gefunden.</p>';
    } else {
      vorschlaegeListe.innerHTML = '';
      renderNachModusGruppiert(vorschlaegeListe, aktuelleVorschlaege, modus, renderVorschlagCard);
    }
  }
  renderVorschlaegeListe();

  const komplementaer = Array.isArray(data.komplementaerleistungen) ? data.komplementaerleistungen : [];
  komplementaerListe.innerHTML = '';
  if (komplementaer.length > 0) {
    renderNachModusGruppiert(komplementaerListe, komplementaer, modus, renderKomplementaerKarte);
    komplementaerBox.hidden = false;
  } else {
    komplementaerBox.hidden = true;
  }

  // Übernimmt einen Hinweis mit konkreter Ziffer in die Vorschlagsliste (Nutzer bestätigt
  // damit, dass diese Zusatzleistung tatsächlich erbracht wurde) und entfernt ihn aus den
  // Hinweisen, damit die Liste der definitiv abzurechnenden Positionen vollständig bleibt.
  async function uebernehmeHinweis(hinweis) {
    const eintrag = await findeZifferEintrag(hinweis.ziffer, hinweis.typ);
    const kurzbezeichnung = eintrag
      ? eintrag.text.length > 90
        ? eintrag.text.slice(0, 90) + '…'
        : eintrag.text
      : `${hinweis.typ} ${hinweis.ziffer}`;
    const anzahl = hinweis.anzahl && hinweis.anzahl > 0 ? hinweis.anzahl : 1;
    const istFaktorfaehig = FAKTORFAEHIGE_TYPEN.has(hinweis.typ);

    aktuelleVorschlaege.push({
      ziffer: hinweis.ziffer,
      typ: hinweis.typ,
      kurzbezeichnung,
      punktzahl: hinweis.punktzahl,
      anzahl,
      gesamtpunktzahl: hinweis.punktzahl != null ? hinweis.punktzahl * anzahl : null,
      pflicht: true,
      begruendung: 'Manuell aus den Hinweisen übernommen.',
      steigerungsfaktor: istFaktorfaehig ? '2,3 (Regelfaktor)' : null,
      steigerungsfaktorWert: istFaktorfaehig ? 2.3 : null,
      moeglicheBegruendungenErhoehung: []
    });
    renderVorschlaegeListe();
  }

  let aktuelleHinweise = Array.isArray(data.hinweise) ? data.hinweise.slice() : [];

  function renderHinweiseListe() {
    hinweiseListe.innerHTML = '';
    if (aktuelleHinweise.length > 0) {
      for (const h of aktuelleHinweise) {
        hinweiseListe.appendChild(renderHinweisEintrag(h));
      }
      hinweiseBox.hidden = false;
    } else {
      hinweiseBox.hidden = true;
    }
  }

  function renderHinweisEintrag(h) {
    const li = document.createElement('li');
    const textSpan = document.createElement('span');
    textSpan.textContent = h.text ?? '';
    li.appendChild(textSpan);

    if (h.ziffer && h.typ) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hinweis-uebernehmen-btn';
      btn.textContent = `✓ ${h.typ} ${h.ziffer} übernehmen`;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Wird übernommen …';
        await uebernehmeHinweis(h);
        aktuelleHinweise = aktuelleHinweise.filter((x) => x !== h);
        renderHinweiseListe();
      });
      li.appendChild(btn);
    }

    return li;
  }

  renderHinweiseListe();

  renderFestzuschuss(data.festzuschuss);
  renderLaborkosten(data.laborkosten);
  ergebnisChat.setzeKontext(baueErgebnisKontext(beschreibung, modus, data));

  ergebnisSection.hidden = false;
  ergebnisSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderLaborkosten(lk) {
  if (!lk || !lk.einordnung) {
    laborkostenBox.hidden = true;
    laborkostenInhalt.innerHTML = '';
    return;
  }

  const positionen = Array.isArray(lk.beispielpositionen) ? lk.beispielpositionen : [];
  const tabelleHtml =
    positionen.length > 0
      ? `
    <table class="laborkosten-tabelle">
      <thead>
        <tr><th>BEL-Nr.</th><th>Bezeichnung</th><th>Höchstpreis Gewerbelabor</th><th>Höchstpreis Praxislabor</th></tr>
      </thead>
      <tbody>
        ${positionen
          .map(
            (p) => `
          <tr>
            <td>${escapeHtml(p.nr ?? '')}</td>
            <td>${escapeHtml(p.bezeichnung ?? '')}</td>
            <td>${p.hoechstpreis_gewerbelabor != null ? formatEuro(p.hoechstpreis_gewerbelabor) : '–'}</td>
            <td>${p.hoechstpreis_praxislabor != null ? formatEuro(p.hoechstpreis_praxislabor) : '–'}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`
      : '';

  laborkostenInhalt.innerHTML = `
    <p class="laborkosten-einordnung"><strong>${escapeHtml(lk.einordnung)}</strong></p>
    ${tabelleHtml}
    ${lk.erlaeuterung ? `<p class="laborkosten-erlaeuterung">${escapeHtml(lk.erlaeuterung)}</p>` : ''}
  `;
  laborkostenBox.hidden = false;
}

function renderFestzuschuss(fz) {
  if (!fz || !fz.betraege) {
    festzuschussBox.hidden = true;
    festzuschussInhalt.innerHTML = '';
    return;
  }

  const b = fz.betraege;
  festzuschussInhalt.innerHTML = `
    <p class="festzuschuss-befund">Befund <strong>${escapeHtml(fz.befund ?? '')}</strong> – ${escapeHtml(fz.bezeichnung ?? '')}</p>
    ${fz.versorgungsart ? `<p class="festzuschuss-versorgungsart">Versorgungsart: <strong>${escapeHtml(fz.versorgungsart)}</strong></p>` : ''}
    <table class="festzuschuss-tabelle">
      <thead>
        <tr><th>60 % (ohne Bonus)</th><th>70 % (Bonus 5 J.)</th><th>75 % (Bonus 10 J.)</th><th>100 % (Härtefall)</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>${formatEuro(b['60'])}</td>
          <td>${formatEuro(b['70'])}</td>
          <td>${formatEuro(b['75'])}</td>
          <td>${formatEuro(b['100'])}</td>
        </tr>
      </tbody>
    </table>
    ${fz.erlaeuterung ? `<p class="festzuschuss-erlaeuterung">${escapeHtml(fz.erlaeuterung)}</p>` : ''}
  `;
  festzuschussBox.hidden = false;
}

const GOZ_PUNKTWERT_EURO = 0.0562421;
const GOAE_PUNKTWERT_EURO = 0.0582873;
const GOZ_REGELFAKTOR = 2.3;
const FAKTORFAEHIGE_TYPEN = new Set(['GOZ', 'GOÄ']);

function punktwertFuerTyp(typ) {
  if (typ === 'GOZ') return GOZ_PUNKTWERT_EURO;
  if (typ === 'GOÄ') return GOAE_PUNKTWERT_EURO;
  return null;
}

function formatEuro(betrag) {
  return betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function renderPunktzahl(v) {
  if (v.punktzahl == null) return '';
  const anzahl = v.anzahl && v.anzahl > 1 ? v.anzahl : 1;
  if (anzahl > 1 && v.gesamtpunktzahl != null) {
    return `<p class="punktzahl">${escapeHtml(String(v.punktzahl))} Punkte × ${escapeHtml(String(anzahl))} = <strong>${escapeHtml(String(v.gesamtpunktzahl))} Punkte gesamt</strong></p>`;
  }
  return `<p class="punktzahl">${escapeHtml(String(v.punktzahl))} Punkte</p>`;
}

// Fällt zurück auf allgemein gebräuchliche, seriöse Begründungsbeispiele nach den drei nach
// § 5 Abs. 2 GOZ/GOÄ zulässigen Kriterien (Schwierigkeit, Zeitaufwand, Umstände), falls für eine
// Karte keine fallspezifischen Vorschläge vorliegen (z. B. bei manuell aus Hinweisen übernommenen
// Positionen, für die es naturgemäß keine KI-generierte Begründung gibt).
const STANDARD_BEGRUENDUNGEN_ERHOEHUNG = [
  'Ungewöhnlich schwierige anatomische Verhältnisse',
  'Deutlich erhöhter Zeitaufwand gegenüber dem Durchschnittsfall',
  'Erschwerte Umstände bei der Ausführung (z. B. eingeschränkte Mundöffnung oder Kooperation des Patienten)'
];

function baueFaktorBlockHtml(v) {
  if (!FAKTORFAEHIGE_TYPEN.has(v.typ) || v.steigerungsfaktorWert == null) {
    return v.steigerungsfaktor
      ? `<p class="steigerungsfaktor"><strong>Steigerungsfaktor-Empfehlung:</strong> ${escapeHtml(v.steigerungsfaktor)}</p>`
      : '';
  }

  const begruendungen =
    Array.isArray(v.moeglicheBegruendungenErhoehung) && v.moeglicheBegruendungenErhoehung.length > 0
      ? v.moeglicheBegruendungenErhoehung
      : STANDARD_BEGRUENDUNGEN_ERHOEHUNG;
  const begruendungenHtml = begruendungen.map((b) => `<li>${escapeHtml(b)}</li>`).join('');

  return `
    <div class="faktor-block">
      <label class="faktor-label">
        Steigerungsfaktor
        <input type="number" class="faktor-input" min="1.0" max="3.5" step="0.1" value="${v.steigerungsfaktorWert.toFixed(1)}" />
      </label>
      <span class="faktor-empfehlung">(Empfehlung: ${escapeHtml(v.steigerungsfaktor ?? '')})</span>
      <p class="faktor-betrag"></p>
      <div class="faktor-begruendung-box" hidden>
        <p class="faktor-begruendung-hinweis">Ab einem Faktor über 2,3 ist laut § 5 Abs. 2 ${v.typ === 'GOÄ' ? 'GOÄ' : 'GOZ'} eine schriftliche Begründung in der Rechnung nötig. Mögliche Begründungen:</p>
        <ul>${begruendungenHtml}</ul>
      </div>
    </div>
  `;
}

function aktiviereFaktorBlock(card, v) {
  const faktorInput = card.querySelector('.faktor-input');
  if (!faktorInput) return;

  const punktwert = punktwertFuerTyp(v.typ) ?? GOZ_PUNKTWERT_EURO;

  const aktualisiere = () => {
    let faktor = parseFloat(String(faktorInput.value).replace(',', '.'));
    if (!Number.isFinite(faktor)) faktor = v.steigerungsfaktorWert;
    faktor = Math.min(3.5, Math.max(1.0, faktor));

    const gesamtpunktzahl = (v.punktzahl ?? 0) * (v.anzahl || 1);
    const betrag = Math.round(gesamtpunktzahl * punktwert * faktor * 100) / 100;
    card.querySelector('.faktor-betrag').textContent = `≈ ${formatEuro(betrag)}`;

    const box = card.querySelector('.faktor-begruendung-box');
    if (box) box.hidden = faktor <= GOZ_REGELFAKTOR;
  };

  faktorInput.addEventListener('input', aktualisiere);
  aktualisiere();
}

// Hängt einen "Anmerkungen anzeigen"-Umschalter an eine Ergebnis-Karte an (Vorschlag oder
// Komplementärleistung), analog zum Nachschlagen-Tab. Lädt die Ziffern-Datenbank bei Bedarf
// nach (sie ist sonst nur beim Besuch des Nachschlagen-Tabs geladen) und cacht das Ergebnis
// pro Karte, damit ein erneutes Klappen keinen zweiten Request auslöst.
function haengeAnmerkungenAn(card, ziffer, typ) {
  if (!ziffer || !typ) return;

  const box = document.createElement('div');
  box.className = 'suche-anmerkungen';
  box.hidden = true;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'suche-details-btn';
  btn.textContent = 'Anmerkungen anzeigen';

  let geladen = false;
  btn.addEventListener('click', async () => {
    if (!geladen) {
      btn.disabled = true;
      btn.textContent = 'Lädt …';
      const eintrag = await findeZifferEintrag(ziffer, typ);
      geladen = true;
      btn.disabled = false;

      if (!eintrag || !eintrag.anmerkungen || eintrag.anmerkungen.length === 0) {
        box.innerHTML = '<p>Keine besonderen Abrechnungsbestimmungen zu dieser Ziffer hinterlegt.</p>';
      } else {
        const gruppen = gruppiereAnmerkungen(eintrag.anmerkungen);
        box.innerHTML =
          gruppen.length > 1
            ? `<ul>${gruppen.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`
            : gruppen.map((a) => `<p>${escapeHtml(a)}</p>`).join('');
      }
    }
    box.hidden = !box.hidden;
    btn.textContent = box.hidden ? 'Anmerkungen anzeigen' : 'Anmerkungen ausblenden';
  });

  card.appendChild(box);
  card.appendChild(btn);
}

function renderKomplementaerKarte(k) {
  const card = document.createElement('div');
  card.className = 'komplementaer-karte';

  if (k.ziffer) {
    card.innerHTML = `
      <div class="vorschlag-kopf">
        <span class="ziffer">${escapeHtml(k.ziffer)}${k.typ ? `<span class="typ-tag">${escapeHtml(k.typ)}</span>` : ''}</span>
        <span class="standard-tag">Standard</span>
      </div>
      <p class="kurzbezeichnung">${escapeHtml(k.beschreibung ?? '')}</p>
      ${renderPunktzahl(k)}
      ${baueFaktorBlockHtml(k)}
    `;
    aktiviereFaktorBlock(card, k);
    haengeAnmerkungenAn(card, k.ziffer, k.typ);
  } else {
    card.innerHTML = `
      <div class="vorschlag-kopf">
        <span class="kurzbezeichnung" style="font-weight:600;">${escapeHtml(k.beschreibung ?? '')}</span>
        <span class="standard-tag">Standard</span>
      </div>
      <p class="begruendung">Keine eigene GOZ-/BEMA-Ziffer – trotzdem in der Akte dokumentieren.</p>
    `;
  }

  return card;
}

function renderVorschlagCard(v) {
  const card = document.createElement('div');
  card.className = 'vorschlag-card';

  const pflichtLabel = v.pflicht ? 'Pflicht' : 'Optional';
  const pflichtClass = v.pflicht ? 'pflicht' : 'optional';

  card.innerHTML = `
    <div class="vorschlag-kopf">
      <span class="ziffer">${escapeHtml(v.ziffer ?? '?')}<span class="typ-tag">${escapeHtml(v.typ ?? '')}</span></span>
      <span class="pflicht-tag ${pflichtClass}">${pflichtLabel}</span>
    </div>
    <p class="kurzbezeichnung">${escapeHtml(v.kurzbezeichnung ?? '')}</p>
    ${renderPunktzahl(v)}
    ${v.begruendung ? `<p class="begruendung">${escapeHtml(v.begruendung)}</p>` : ''}
    ${baueFaktorBlockHtml(v)}
  `;

  aktiviereFaktorBlock(card, v);
  haengeAnmerkungenAn(card, v.ziffer, v.typ);

  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

const tabButtons = document.querySelectorAll('.eingabe-tab-btn');
const panelFreitext = document.getElementById('panel-freitext');
const panelGefuehrt = document.getElementById('panel-gefuehrt');
const panelSuche = document.getElementById('panel-suche');
const panelFragen = document.getElementById('panel-fragen');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode;
    panelFreitext.hidden = mode !== 'freitext';
    panelGefuehrt.hidden = mode !== 'gefuehrt';
    panelSuche.hidden = mode !== 'suche';
    panelFragen.hidden = mode !== 'fragen';
    statusBox.hidden = true;
    ergebnisSection.hidden = true;
    if (mode === 'gefuehrt') {
      wizardState = { schritt: 'block' };
      renderWizard();
    }
    if (mode === 'suche') {
      ladeDatenbankFallsNoetig();
    }
    if (mode === 'fragen') {
      document.getElementById('chat-eingabe').focus();
    }
  });
});

function formatiereChatText(text) {
  const zeilen = escapeHtml(text).split('\n');
  let html = '';
  let inListe = false;
  for (const zeile of zeilen) {
    const listenMatch = zeile.match(/^[-•]\s+(.*)$/);
    if (listenMatch) {
      if (!inListe) {
        html += '<ul class="chat-liste">';
        inListe = true;
      }
      html += `<li>${listenMatch[1]}</li>`;
    } else {
      if (inListe) {
        html += '</ul>';
        inListe = false;
      }
      html += zeile.trim() === '' ? '' : `<p>${zeile}</p>`;
    }
  }
  if (inListe) html += '</ul>';
  return html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// Erzeugt eine eigenständige Chat-Instanz (Verlauf + Bedienung), die an ein beliebiges
// Set von DOM-Elementen gebunden wird. So teilen sich der allgemeine Fragen-Tab und der
// ergebnisbezogene Chat im Freitext-Tab dieselbe Logik, ohne Code zu duplizieren.
function erzeugeChatInstanz({ verlaufEl, formEl, eingabeEl, sendenBtn, neuBtn, leerHinweisHtml }) {
  const instanz = { verlauf: [], kontext: null };

  function render() {
    if (instanz.verlauf.length === 0) {
      verlaufEl.innerHTML = leerHinweisHtml;
      return;
    }
    verlaufEl.innerHTML = instanz.verlauf
      .map((n) => `<div class="chat-nachricht ${n.rolle}"><div class="chat-blase">${formatiereChatText(n.text)}</div></div>`)
      .join('');
    verlaufEl.scrollTop = verlaufEl.scrollHeight;
  }
  instanz.render = render;

  instanz.setzeKontext = (kontext) => {
    instanz.verlauf = [];
    instanz.kontext = kontext;
    render();
  };

  eingabeEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      formEl.requestSubmit();
    }
  });

  formEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    const frage = eingabeEl.value.trim();
    if (!frage) return;

    instanz.verlauf.push({ rolle: 'user', text: frage });
    eingabeEl.value = '';
    render();

    sendenBtn.disabled = true;
    const denkBlase = document.createElement('div');
    denkBlase.className = 'chat-nachricht assistant';
    denkBlase.innerHTML = '<div class="chat-blase chat-denkt">Claude denkt nach …</div>';
    verlaufEl.appendChild(denkBlase);
    verlaufEl.scrollTop = verlaufEl.scrollHeight;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nachrichten: instanz.verlauf, kontext: instanz.kontext })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unbekannter Fehler.');
      }
      instanz.verlauf.push({ rolle: 'assistant', text: data.antwort });
    } catch (err) {
      instanz.verlauf.push({ rolle: 'assistant', text: `Fehler: ${err.message}` });
    }

    render();
    sendenBtn.disabled = false;
    eingabeEl.focus();
  });

  if (neuBtn) {
    neuBtn.addEventListener('click', () => instanz.setzeKontext(null));
  }

  return instanz;
}

const fragenChat = erzeugeChatInstanz({
  verlaufEl: document.getElementById('chat-verlauf'),
  formEl: document.getElementById('chat-form'),
  eingabeEl: document.getElementById('chat-eingabe'),
  sendenBtn: document.getElementById('chat-senden-btn'),
  neuBtn: document.getElementById('chat-neu-btn'),
  leerHinweisHtml:
    '<p class="chat-leer-hinweis">Stelle eine Frage zur GOZ-/BEMA-Abrechnung, z.&nbsp;B. „Wie oft kann ich UPT bei Grad B abrechnen?“ oder „Ist GOZ 2030 neben 2040 abrechenbar?“. Die Antworten basieren ausschließlich auf den offiziellen Ziffernkatalogen dieser App.</p>'
});

const ergebnisChat = erzeugeChatInstanz({
  verlaufEl: document.getElementById('ergebnis-chat-verlauf'),
  formEl: document.getElementById('ergebnis-chat-form'),
  eingabeEl: document.getElementById('ergebnis-chat-eingabe'),
  sendenBtn: document.getElementById('ergebnis-chat-senden-btn'),
  neuBtn: null,
  leerHinweisHtml:
    '<p class="chat-leer-hinweis">Stelle eine gezielte Frage zu diesem Ergebnis, z.&nbsp;B. „Warum diese Ziffer und nicht die Nachbarziffer?“</p>'
});

function baueErgebnisKontext(beschreibung, modus, data) {
  const teile = [`Behandlungsbeschreibung des Nutzers: "${beschreibung}"`, `Abrechnungsmodus: ${modus}`];

  const vorschlaege = Array.isArray(data.vorschlaege) ? data.vorschlaege : [];
  if (vorschlaege.length > 0) {
    teile.push('Vorgeschlagene Ziffern:');
    for (const v of vorschlaege) {
      teile.push(`- ${v.typ} ${v.ziffer} (${v.kurzbezeichnung}), ${v.punktzahl} Punkte × ${v.anzahl}. Begründung: ${v.begruendung}`);
    }
  }

  const komplementaer = Array.isArray(data.komplementaerleistungen) ? data.komplementaerleistungen : [];
  if (komplementaer.length > 0) {
    teile.push('Komplementärleistungen (Standardschritte):');
    for (const k of komplementaer) {
      teile.push(`- ${k.beschreibung}${k.ziffer ? ` (${k.typ} ${k.ziffer})` : ''}`);
    }
  }

  const hinweise = Array.isArray(data.hinweise) ? data.hinweise : [];
  if (hinweise.length > 0) {
    teile.push('Hinweise:');
    for (const h of hinweise) teile.push(`- ${h}`);
  }

  if (data.festzuschuss) {
    teile.push(
      `Festzuschuss: Befund ${data.festzuschuss.befund} (${data.festzuschuss.bezeichnung}), Versorgungsart: ${data.festzuschuss.versorgungsart}.`
    );
  }

  if (data.laborkosten) {
    teile.push(`Laborkosten-Einordnung: ${data.laborkosten.einordnung}`);
  }

  return teile.join('\n');
}

let datenbank = null;
let datenbankLadeVersuch = null;

// Lädt die vollständige Ziffern-Datenbank (einmalig, mit Cache) – wird sowohl vom
// Nachschlagen-Tab als auch von den "Anmerkungen anzeigen"-Buttons bei Freitext-/
// Wizard-Ergebnissen genutzt, damit die Ziffer-Details überall verfügbar sind.
async function ladeDatenbank() {
  if (datenbank) return datenbank;

  if (!datenbankLadeVersuch) {
    datenbankLadeVersuch = fetch('/api/datenbank').then((r) => r.json());
  }

  const data = await datenbankLadeVersuch;
  datenbank = [
    ...data.goz.map((z) => ({
      ziffer: z.ziffer,
      typ: 'GOZ',
      text: z.leistungstext,
      punkte: z.punktzahl,
      anmerkungen: z.anmerkungen || []
    })),
    ...data.bema.map((z) => ({
      ziffer: z.ziffer,
      typ: 'BEMA',
      text: z.leistungstext,
      punkte: z.bewertungszahl,
      anmerkungen: z.anmerkungen || []
    })),
    ...(data.goae || []).map((z) => ({
      ziffer: z.ziffer,
      typ: 'GOÄ',
      text: z.leistungstext,
      punkte: z.punktzahl,
      anmerkungen: z.anmerkungen || []
    }))
  ];
  return datenbank;
}

async function ladeDatenbankFallsNoetig() {
  if (datenbank) {
    fuehreSucheAus();
    return;
  }
  const sucheStatus = document.getElementById('suche-status');
  sucheStatus.textContent = 'Datenbank wird geladen …';

  try {
    const geladen = await ladeDatenbank();
    sucheStatus.textContent = `${geladen.length} Ziffern geladen. Tippe, um zu suchen.`;
    fuehreSucheAus();
  } catch (err) {
    sucheStatus.textContent = 'Fehler beim Laden der Datenbank.';
    datenbankLadeVersuch = null;
  }
}

// Ziffer+Typ eindeutig identifizieren (z. B. GOZ 2070 vs. BEMA 13b) und die vollständigen
// Anmerkungen dafür aus der Datenbank holen.
async function findeZifferEintrag(ziffer, typ) {
  try {
    const daten = await ladeDatenbank();
    return daten.find((e) => e.ziffer === ziffer && e.typ === typ) || null;
  } catch (err) {
    return null;
  }
}

const sucheEingabe = document.getElementById('suche-eingabe');
const sucheErgebnisse = document.getElementById('suche-ergebnisse');

sucheEingabe.addEventListener('input', fuehreSucheAus);

function levenshteinDistanz(a, b) {
  const dp = [];
  for (let i = 0; i <= a.length; i++) dp.push([i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function textPasstUngefaehr(begriff, text) {
  if (text.includes(begriff)) return true;
  if (begriff.length < 5) return false;
  const erlaubteAbweichung = begriff.length >= 8 ? 2 : 1;
  const worte = text.split(/[^a-zäöüßA-ZÄÖÜ]+/);
  return worte.some((wortRoh) => {
    const wort = wortRoh.toLowerCase();
    if (wort.length < begriff.length - erlaubteAbweichung) return false;
    // Nur den Wortanfang vergleichen, damit gebeugte Formen (z. B. "Abszesses" statt "Abszess") erkannt werden
    const vergleichslaenge = Math.min(wort.length, begriff.length + erlaubteAbweichung);
    return levenshteinDistanz(begriff, wort.slice(0, vergleichslaenge)) <= erlaubteAbweichung;
  });
}

function fuehreSucheAus() {
  if (!datenbank) return;

  const begriff = sucheEingabe.value.trim().toLowerCase();
  const modus = getModus();
  const sucheStatus = document.getElementById('suche-status');

  let treffer = datenbank.filter((e) => {
    if (modus === 'goz' && e.typ === 'BEMA') return false;
    if (modus === 'bema' && (e.typ === 'GOZ' || e.typ === 'GOÄ')) return false;
    if (!begriff) return true;
    return e.ziffer.toLowerCase().includes(begriff) || textPasstUngefaehr(begriff, e.text.toLowerCase());
  });

  const gesamtTreffer = treffer.length;
  treffer = treffer.slice(0, 50);

  sucheErgebnisse.innerHTML = '';
  if (begriff && gesamtTreffer === 0) {
    sucheStatus.textContent = 'Keine Treffer.';
  } else if (begriff) {
    sucheStatus.textContent =
      gesamtTreffer > 50
        ? `${gesamtTreffer} Treffer, zeige die ersten 50. Bitte genauer eingrenzen.`
        : `${gesamtTreffer} Treffer.`;
  } else {
    sucheStatus.textContent = `${datenbank.length} Ziffern verfügbar (gefiltert nach Abrechnungsmodus oben). Tippe, um zu suchen.`;
  }

  for (const e of treffer) {
    sucheErgebnisse.appendChild(renderSucheKarte(e));
  }
}

function gruppiereAnmerkungen(zeilen) {
  const gruppen = [];
  let aktuelle = [];

  for (const zeile of zeilen) {
    const istNeuerPunkt = /^\d{1,2}\.\s/.test(zeile);
    if (istNeuerPunkt && aktuelle.length > 0) {
      gruppen.push(aktuelle.join(' '));
      aktuelle = [zeile];
    } else {
      aktuelle.push(zeile);
    }
  }
  if (aktuelle.length > 0) gruppen.push(aktuelle.join(' '));

  return gruppen;
}

function renderSucheKarte(e) {
  const card = document.createElement('div');
  card.className = 'suche-karte';

  const anmerkungenGruppen = gruppiereAnmerkungen(e.anmerkungen);
  const anmerkungenInhalt =
    anmerkungenGruppen.length > 1
      ? `<ul>${anmerkungenGruppen.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`
      : anmerkungenGruppen.map((a) => `<p>${escapeHtml(a)}</p>`).join('');

  const anmerkungenHtml =
    e.anmerkungen.length > 0
      ? `<div class="suche-anmerkungen" hidden>${anmerkungenInhalt}</div>
         <button type="button" class="suche-details-btn">Anmerkungen anzeigen</button>`
      : '';

  card.innerHTML = `
    <div class="vorschlag-kopf">
      <span class="ziffer">${escapeHtml(e.ziffer)}<span class="typ-tag">${escapeHtml(e.typ)}</span></span>
      ${e.punkte != null ? `<span class="punktzahl">${escapeHtml(String(e.punkte))} Punkte</span>` : ''}
    </div>
    <p class="kurzbezeichnung">${escapeHtml(e.text)}</p>
    ${anmerkungenHtml}
  `;

  const detailsBtn = card.querySelector('.suche-details-btn');
  if (detailsBtn) {
    detailsBtn.addEventListener('click', () => {
      const box = card.querySelector('.suche-anmerkungen');
      box.hidden = !box.hidden;
      detailsBtn.textContent = box.hidden ? 'Anmerkungen anzeigen' : 'Anmerkungen ausblenden';
    });
  }

  return card;
}

document.querySelectorAll('input[name="modus"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    if (!panelSuche.hidden && datenbank) {
      fuehreSucheAus();
    }
  });
});

const wizardEl = document.getElementById('wizard');
let wizardState = { schritt: 'block' };

function getLeaf(state) {
  if (!state.blockKey || !state.artKey) return null;
  return BEHANDLUNGS_BAUM[state.blockKey].kinder[state.artKey];
}

function computeSteps(state) {
  const steps = ['block', 'art'];
  const leaf = getLeaf(state);
  if (leaf) {
    if (leaf.zahnschema) {
      steps.push('zahnschema');
    } else if (leaf.zahnRelevant !== false) {
      steps.push('zahn');
    }
    if (leaf.felder && leaf.felder.length > 0) steps.push('felder');
  }
  steps.push('zusammenfassung');
  return steps;
}

function gehtZuSchritt(schritt) {
  wizardState.schritt = schritt;
  renderWizard();
}

function renderWizard() {
  const steps = computeSteps(wizardState);
  const breadcrumbTeile = [];
  if (wizardState.blockKey) breadcrumbTeile.push(BEHANDLUNGS_BAUM[wizardState.blockKey].label);
  if (wizardState.artKey) breadcrumbTeile.push(BEHANDLUNGS_BAUM[wizardState.blockKey].kinder[wizardState.artKey].label);

  let inhalt = '';
  if (breadcrumbTeile.length > 0) {
    inhalt += `<p class="wizard-breadcrumb">${breadcrumbTeile.map(escapeHtml).join(' &rsaquo; ')}</p>`;
  }

  if (wizardState.schritt === 'block') {
    inhalt += renderAuswahlKarten(
      'Fachgebiet wählen',
      Object.entries(BEHANDLUNGS_BAUM).map(([key, val]) => ({ key, label: val.label, icon: val.icon })),
      'block'
    );
  } else if (wizardState.schritt === 'art') {
    const block = BEHANDLUNGS_BAUM[wizardState.blockKey];
    inhalt += renderAuswahlKarten(
      'Behandlungsart wählen',
      Object.entries(block.kinder).map(([key, val]) => ({ key, label: val.label })),
      'art'
    );
    inhalt += renderZurueckButton('block');
  } else if (wizardState.schritt === 'zahn') {
    inhalt += `
      <h3>Zahn / Regio</h3>
      <label for="wizard-zahn">Zahn (FDI-Schema, z. B. 36) oder Regio</label>
      <input type="text" id="wizard-zahn" placeholder="z. B. 36 oder 14-16" value="${escapeHtml(wizardState.zahn || '')}" />
      <div class="wizard-nav">
        ${renderZurueckButton('art')}
        <button type="button" class="wizard-weiter-btn" id="wizard-zahn-weiter">Weiter</button>
      </div>
    `;
  } else if (wizardState.schritt === 'zahnschema') {
    const leaf = getLeaf(wizardState);
    inhalt += renderZahnschema(wizardState.ausgewaehlteZaehne || [], leaf.zahnschemaModus);
    inhalt += `
      <div class="wizard-nav">
        ${renderZurueckButton('art')}
        <button type="button" class="wizard-weiter-btn" id="wizard-zahnschema-weiter">Weiter</button>
      </div>
    `;
  } else if (wizardState.schritt === 'felder') {
    const leaf = getLeaf(wizardState);
    const mehrzahn = istMehrzahnModus(leaf, wizardState);
    const zaehne = wizardState.ausgewaehlteZaehne || [];
    const zahnIndex = wizardState.aktuellerZahnIndex || 0;
    const aktuellerZahn = mehrzahn ? zaehne[zahnIndex] : null;
    const antwortenQuelle = mehrzahn
      ? (wizardState.zahnAntworten && wizardState.zahnAntworten[aktuellerZahn]) || {}
      : wizardState.antworten;

    inhalt += `<h3>Besonderheiten${aktuellerZahn ? ` – Zahn ${aktuellerZahn}` : ''}</h3>`;
    if (mehrzahn) {
      inhalt += `<p class="wizard-mehrzahn-fortschritt">Zahn ${zahnIndex + 1} von ${zaehne.length}</p>`;
    }
    inhalt += leaf.felder.map((feld) => renderFeld(feld, antwortenQuelle)).join('');

    const zurueckHtml =
      mehrzahn && zahnIndex > 0
        ? `<button type="button" class="wizard-zurueck-btn" id="wizard-felder-zurueck-zahn">&larr; Zurück</button>`
        : renderZurueckButton(leaf.zahnschema ? 'zahnschema' : leaf.zahnRelevant !== false ? 'zahn' : 'art');
    const weiterLabel = mehrzahn && zahnIndex < zaehne.length - 1 ? 'Weiter zum nächsten Zahn' : 'Weiter';

    inhalt += `
      <div class="wizard-nav">
        ${zurueckHtml}
        <button type="button" class="wizard-weiter-btn" id="wizard-felder-weiter">${weiterLabel}</button>
      </div>
    `;
  } else if (wizardState.schritt === 'zusammenfassung') {
    const beschreibung = baueBeschreibung(wizardState);
    const steps2 = computeSteps(wizardState);
    const vorherigerSchritt = steps2[steps2.length - 2];
    const grad = wizardState.antworten && wizardState.antworten.grad;
    inhalt += `
      <h3>Zusammenfassung</h3>
      <div class="wizard-zusammenfassung-box">${escapeHtml(beschreibung)}</div>
      ${grad ? renderUptPlan(grad) : ''}
      <div class="wizard-nav">
        ${renderZurueckButton(vorherigerSchritt)}
        <button type="button" class="wizard-weiter-btn" id="wizard-absenden">Ziffern vorschlagen</button>
      </div>
    `;
  }

  wizardEl.innerHTML = inhalt;
  bindeWizardEvents();
}

function renderAuswahlKarten(titel, eintraege, schrittTyp) {
  const karten = eintraege
    .map((e) => {
      const icon = e.icon ? `<span class="wizard-karte-icon">${e.icon}</span>` : '';
      return `<button type="button" class="wizard-karte" data-key="${escapeHtml(e.key)}" data-schritt="${schrittTyp}">${icon}${escapeHtml(e.label)}</button>`;
    })
    .join('');
  return `<h3>${escapeHtml(titel)}</h3><div class="wizard-karten-grid">${karten}</div>`;
}

function renderZurueckButton(zielSchritt) {
  return `<button type="button" class="wizard-zurueck-btn" data-ziel="${zielSchritt}">&larr; Zurück</button>`;
}

function renderUptPlan(grad) {
  const schema = UPT_SCHEMA[grad];
  if (!schema) return '';

  const zeilen = [];
  zeilen.push(
    `<li><strong>UPT a, b, c, e, f</strong> (Mundhygienekontrolle, -unterweisung, Zahnreinigung, subgingivale Instrumentierung): je bis zu <strong>${schema.standard.anzahl}×</strong>, Mindestabstand ${schema.standard.mindestabstand} Monate zur jeweils letzten gleichen Leistung</li>`
  );
  if (schema.upt_d) {
    zeilen.push(
      `<li><strong>UPT d</strong> (Sondierungstiefen-Messung, Zwischenbefund): bis zu <strong>${schema.upt_d.anzahl}×</strong>, Mindestabstand ${schema.upt_d.mindestabstand} Monate</li>`
    );
  } else {
    zeilen.push(`<li><strong>UPT d</strong>: bei Grad A nicht vorgesehen</li>`);
  }
  zeilen.push(
    `<li><strong>UPT g</strong> (Abschlussuntersuchung/Reevaluation): <strong>${schema.upt_g.anzahl}×</strong>, Mindestabstand ${schema.upt_g.mindestabstand} Monate ${escapeHtml(schema.upt_g.bezug)}</li>`
  );

  return `
    <div class="upt-plan-box">
      <h4>UPT-Nachsorgeplan bei Grad ${escapeHtml(grad)}</h4>
      <p class="upt-plan-hinweis">UPT-Zeitraum: 2 Jahre ab der ersten UPT-Leistung, bei zahnmedizinischer Indikation um bis zu 6 Monate verlängerbar.</p>
      <ul>${zeilen.join('')}</ul>
      <p class="upt-plan-quelle">Quelle: offizielle BEMA-Abrechnungsbestimmungen zu Nr. UPT a – automatisch berechnet, keine KI-Schätzung.</p>
    </div>
  `;
}

function aktualisiereZahnschemaZusammenfassung() {
  const ausgewaehlt = wizardState.ausgewaehlteZaehne || [];
  const leaf = getLeaf(wizardState);
  const el = wizardEl.querySelector('.zahnschema-zusammenfassung');
  if (el) {
    el.textContent = zahnschemaZusammenfassungText(ausgewaehlt, leaf && leaf.zahnschemaModus);
  }
}

function zahnschemaZusammenfassungText(ausgewaehlt, modus) {
  if (modus === 'wurzelzahl') {
    const einwurzelig = ausgewaehlt.filter((z) => ZAHN_WURZELTYP[z] === 'einwurzelig');
    const mehrwurzelig = ausgewaehlt.filter((z) => ZAHN_WURZELTYP[z] === 'mehrwurzelig');
    return `${ausgewaehlt.length} Zahn/Zähne ausgewählt – ${einwurzelig.length} einwurzelig (AITa), ${mehrwurzelig.length} mehrwurzelig (AITb)`;
  }
  return ausgewaehlt.length > 0
    ? `${ausgewaehlt.length} Zahn/Zähne ausgewählt: ${ausgewaehlt.slice().sort().join(', ')}`
    : '0 Zähne ausgewählt';
}

function renderZahnschema(ausgewaehlt, modus) {
  const zeileHtml = (zaehne) =>
    `<div class="zahnschema-zeile">${zaehne
      .map((z) => {
        const aktiv = ausgewaehlt.includes(z) ? 'aktiv' : '';
        return `<button type="button" class="zahn-btn ${aktiv}" data-zahn="${z}">${z}</button>`;
      })
      .join('')}</div>`;

  const hinweisText =
    modus === 'wurzelzahl'
      ? 'Klicke alle Zähne an, die parodontal behandelt wurden.'
      : 'Klicke den/die betroffenen Zahn/Zähne an.';

  return `
    <h3>Betroffene Zähne auswählen</h3>
    <p class="zahnschema-hinweis">${hinweisText}</p>
    <div class="zahnschema">
      <div class="zahnschema-quadrant-paar">${zeileHtml(ZAHNSCHEMA_QUADRANTEN[0])}${zeileHtml(ZAHNSCHEMA_QUADRANTEN[1])}</div>
      <div class="zahnschema-mitte-linie"></div>
      <div class="zahnschema-quadrant-paar">${zeileHtml(ZAHNSCHEMA_QUADRANTEN[2])}${zeileHtml(ZAHNSCHEMA_QUADRANTEN[3])}</div>
    </div>
    <p class="zahnschema-zusammenfassung">${zahnschemaZusammenfassungText(ausgewaehlt, modus)}</p>
  `;
}

function renderFeld(feld, quelle) {
  const antwortenQuelle = quelle || wizardState.antworten;
  if (feld.typ === 'mehrfachauswahl') {
    const gespeichert = (antwortenQuelle && antwortenQuelle[feld.id]) || [];
    return `
      <label>${escapeHtml(feld.label)}</label>
      <div class="wizard-mehrfachauswahl">
        ${feld.optionen
          .map(
            (opt) => `
              <label class="wizard-checkbox-label">
                <input type="checkbox" data-feld-id="${feld.id}" data-feld-typ="mehrfachauswahl" value="${escapeHtml(opt)}" class="wizard-feld-mehrfach" ${gespeichert.includes(opt) ? 'checked' : ''} />
                ${escapeHtml(opt)}
              </label>
            `
          )
          .join('')}
      </div>
    `;
  }
  if (feld.typ === 'auswahl') {
    const gespeichert = (antwortenQuelle && antwortenQuelle[feld.id]) || '';
    const optionen = feld.optionen
      .map((opt) => `<option value="${escapeHtml(opt)}" ${opt === gespeichert ? 'selected' : ''}>${escapeHtml(opt)}</option>`)
      .join('');
    return `
      <label for="feld-${feld.id}">${escapeHtml(feld.label)}</label>
      <select id="feld-${feld.id}" data-feld-id="${feld.id}" class="wizard-feld">
        <option value="">– bitte wählen –</option>
        ${optionen}
      </select>
    `;
  }
  if (feld.typ === 'checkbox') {
    const gespeichert = antwortenQuelle && antwortenQuelle[feld.id];
    return `
      <label class="wizard-checkbox-label">
        <input type="checkbox" id="feld-${feld.id}" data-feld-id="${feld.id}" class="wizard-feld" ${gespeichert ? 'checked' : ''} />
        ${escapeHtml(feld.label)}
      </label>
    `;
  }
  return '';
}

function bindeWizardEvents() {
  wizardEl.querySelectorAll('.wizard-karte').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const schrittTyp = btn.dataset.schritt;
      if (schrittTyp === 'block') {
        wizardState = { schritt: 'art', blockKey: key };
      } else if (schrittTyp === 'art') {
        wizardState.artKey = key;
        wizardState.antworten = {};
        wizardState.ausgewaehlteZaehne = [];
        const naechsteSteps = computeSteps(wizardState);
        wizardState.schritt = naechsteSteps[2];
      }
      renderWizard();
    });
  });

  wizardEl.querySelectorAll('.wizard-zurueck-btn').forEach((btn) => {
    btn.addEventListener('click', () => gehtZuSchritt(btn.dataset.ziel));
  });

  wizardEl.querySelectorAll('.zahn-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const zahn = btn.dataset.zahn;
      wizardState.ausgewaehlteZaehne = wizardState.ausgewaehlteZaehne || [];
      const idx = wizardState.ausgewaehlteZaehne.indexOf(zahn);
      if (idx === -1) {
        wizardState.ausgewaehlteZaehne.push(zahn);
        btn.classList.add('aktiv');
      } else {
        wizardState.ausgewaehlteZaehne.splice(idx, 1);
        btn.classList.remove('aktiv');
      }
      aktualisiereZahnschemaZusammenfassung();
    });
  });

  const zahnschemaWeiterBtn = document.getElementById('wizard-zahnschema-weiter');
  if (zahnschemaWeiterBtn) {
    zahnschemaWeiterBtn.addEventListener('click', () => {
      wizardState.aktuellerZahnIndex = 0;
      wizardState.zahnAntworten = {};
      const steps = computeSteps(wizardState);
      const idx = steps.indexOf('zahnschema');
      wizardState.schritt = steps[idx + 1];
      renderWizard();
    });
  }

  const zahnWeiterBtn = document.getElementById('wizard-zahn-weiter');
  if (zahnWeiterBtn) {
    zahnWeiterBtn.addEventListener('click', () => {
      wizardState.zahn = document.getElementById('wizard-zahn').value.trim();
      const steps = computeSteps(wizardState);
      const idx = steps.indexOf('zahn');
      wizardState.schritt = steps[idx + 1];
      renderWizard();
    });
  }

  const felderZurueckZahnBtn = document.getElementById('wizard-felder-zurueck-zahn');
  if (felderZurueckZahnBtn) {
    felderZurueckZahnBtn.addEventListener('click', () => {
      wizardState.aktuellerZahnIndex = (wizardState.aktuellerZahnIndex || 0) - 1;
      renderWizard();
    });
  }

  const felderWeiterBtn = document.getElementById('wizard-felder-weiter');
  if (felderWeiterBtn) {
    felderWeiterBtn.addEventListener('click', () => {
      const antworten = {};
      wizardEl.querySelectorAll('.wizard-feld').forEach((el) => {
        const id = el.dataset.feldId;
        antworten[id] = el.type === 'checkbox' ? el.checked : el.value;
      });

      const mehrfachGruppen = {};
      wizardEl.querySelectorAll('.wizard-feld-mehrfach').forEach((el) => {
        const id = el.dataset.feldId;
        mehrfachGruppen[id] = mehrfachGruppen[id] || [];
        if (el.checked) mehrfachGruppen[id].push(el.value);
      });
      Object.assign(antworten, mehrfachGruppen);

      const leaf = getLeaf(wizardState);
      const mehrzahn = istMehrzahnModus(leaf, wizardState);

      if (mehrzahn) {
        const zaehne = wizardState.ausgewaehlteZaehne || [];
        const zahnIndex = wizardState.aktuellerZahnIndex || 0;
        wizardState.zahnAntworten = wizardState.zahnAntworten || {};
        wizardState.zahnAntworten[zaehne[zahnIndex]] = antworten;

        if (zahnIndex < zaehne.length - 1) {
          wizardState.aktuellerZahnIndex = zahnIndex + 1;
          renderWizard();
          return;
        }
      } else {
        wizardState.antworten = antworten;
      }

      wizardState.schritt = 'zusammenfassung';
      renderWizard();
    });
  }

  const absendenBtn = document.getElementById('wizard-absenden');
  if (absendenBtn) {
    absendenBtn.addEventListener('click', async () => {
      absendenBtn.disabled = true;
      const beschreibung = baueBeschreibung(wizardState);
      await holeVorschlaege(beschreibung, getModus());
      absendenBtn.disabled = false;
    });
  }
}

function istMehrzahnModus(leaf, state) {
  return !!(
    leaf.zahnschema &&
    leaf.zahnschemaModus !== 'wurzelzahl' &&
    state.ausgewaehlteZaehne &&
    state.ausgewaehlteZaehne.length > 1
  );
}

function formatiereFelderAntworten(felder, antworten) {
  const teile = [];
  for (const feld of felder || []) {
    const wert = antworten ? antworten[feld.id] : undefined;
    if (feld.typ === 'checkbox') {
      if (wert) teile.push(`${feld.label}: ja`);
    } else if (feld.typ === 'mehrfachauswahl') {
      if (Array.isArray(wert) && wert.length > 0) teile.push(`${feld.label}: ${wert.join(' und ')}`);
    } else if (wert) {
      teile.push(`${feld.label}: ${wert}`);
    }
  }
  return teile;
}

function baueBeschreibung(state) {
  const block = BEHANDLUNGS_BAUM[state.blockKey];
  const leaf = block.kinder[state.artKey];
  const teile = [`${block.label}: ${leaf.label}`];

  if (state.zahn) {
    teile.push(`an Zahn/Regio ${state.zahn}`);
  }

  const mehrzahn = istMehrzahnModus(leaf, state);

  if (leaf.zahnschema && state.ausgewaehlteZaehne && state.ausgewaehlteZaehne.length > 0) {
    if (leaf.zahnschemaModus === 'wurzelzahl') {
      const einwurzelig = state.ausgewaehlteZaehne.filter((z) => ZAHN_WURZELTYP[z] === 'einwurzelig');
      const mehrwurzelig = state.ausgewaehlteZaehne.filter((z) => ZAHN_WURZELTYP[z] === 'mehrwurzelig');
      if (einwurzelig.length > 0) {
        teile.push(`Behandelte einwurzelige Zähne (AITa, je Zahn abzurechnen): ${einwurzelig.join(', ')} (${einwurzelig.length} Zahn/Zähne)`);
      }
      if (mehrwurzelig.length > 0) {
        teile.push(`Behandelte mehrwurzelige Zähne (AITb, je Zahn abzurechnen): ${mehrwurzelig.join(', ')} (${mehrwurzelig.length} Zahn/Zähne)`);
      }
    } else if (!mehrzahn) {
      teile.push(`an Zahn/Regio ${state.ausgewaehlteZaehne.join(', ')}`);
    }
    // im Mehrzahn-Modus wird der Zahn direkt in der jeweiligen Zahn-Klausel unten genannt
  }

  if (mehrzahn) {
    for (const zahn of state.ausgewaehlteZaehne) {
      const antworten = (state.zahnAntworten && state.zahnAntworten[zahn]) || {};
      const zahnTeile = formatiereFelderAntworten(leaf.felder, antworten);
      teile.push(`Zahn ${zahn}${zahnTeile.length > 0 ? ': ' + zahnTeile.join(', ') : ''}`);
    }
  } else if (state.antworten) {
    teile.push(...formatiereFelderAntworten(leaf.felder, state.antworten));
  }

  return teile.join('. ') + '.';
}
