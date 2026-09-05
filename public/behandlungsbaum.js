const BEHANDLUNGS_BAUM = {
  kons: {
    label: 'Konservierend (Füllungen)',
    icon: '🦷',
    kinder: {
      fuellung: {
        label: 'Füllungstherapie',
        felder: [
          { id: 'material', label: 'Füllungsmaterial', typ: 'auswahl', optionen: ['Konventionell (z. B. Glasionomerzement, Kompomer, Amalgam)', 'Komposit in Adhäsivtechnik'] },
          { id: 'flaechen', label: 'Anzahl Flächen', typ: 'auswahl', optionen: ['1 (einflächig)', '2 (zweiflächig)', '3 (dreiflächig)', '4 oder mehr (mehr als dreiflächig)'] },
          { id: 'anaesthesie', label: 'Anästhesie', typ: 'auswahl', optionen: ['keine', 'Infiltrationsanästhesie', 'Leitungsanästhesie'] },
          { id: 'ueberkappung', label: 'Überkappung', typ: 'auswahl', optionen: ['keine', 'Indirekte Überkappung (Caries profunda, Pulpa nicht eröffnet)', 'Direkte Überkappung (Pulpa eröffnet)'] },
          { id: 'bmf', label: 'Besondere Maßnahmen beim Präparieren/Füllen (BMF, z. B. Kofferdam/Spanngummi, Zahnfleisch zurückhalten)', typ: 'checkbox' }
        ],
        zahnschema: true
      },
      exkavation: {
        label: 'Kariesexkavation (ohne definitive Füllung)',
        felder: [
          { id: 'anaesthesie', label: 'Anästhesie', typ: 'auswahl', optionen: ['keine', 'Infiltrationsanästhesie', 'Leitungsanästhesie'] }
        ],
        zahnschema: true
      },
      versiegelung: {
        label: 'Fissurenversiegelung',
        felder: [],
        zahnschema: true
      }
    }
  },
  endo: {
    label: 'Endodontie (Wurzelkanal)',
    icon: '🪡',
    kinder: {
      wkb_sitzung1: {
        label: 'Wurzelkanalbehandlung – 1. Sitzung (Eröffnung/Aufbereitung)',
        felder: [
          { id: 'kanaele', label: 'Anzahl Wurzelkanäle', typ: 'auswahl', optionen: ['1', '2', '3', '4 oder mehr'] },
          { id: 'pulpazustand', label: 'Zustand der Pulpa', typ: 'auswahl', optionen: ['Vital (Exstirpation der Pulpa)', 'Avital/pulpatot (Trepanation)'] },
          { id: 'maschinelle_aufbereitung', label: 'Maschinelle Aufbereitung (z. B. rotierendes NiTi-System)', typ: 'checkbox' },
          { id: 'laengenbestimmung', label: 'Elektrometrische Längenbestimmung durchgeführt', typ: 'checkbox' },
          { id: 'elektrophysikalisch', label: 'Zusätzliche elektrophysikalisch-chemische Methode angewendet (z. B. Ultraschall-/Laseraktivierung)', typ: 'checkbox' },
          { id: 'medikamentoese_einlage', label: 'Medikamentöse Einlage eingebracht', typ: 'checkbox' },
          { id: 'bmf', label: 'Besondere Maßnahmen beim Präparieren (BMF, z. B. Kofferdam/Spanngummi, Zahnfleisch zurückhalten)', typ: 'checkbox' },
          { id: 'anaesthesie', label: 'Anästhesie', typ: 'auswahl', optionen: ['keine', 'Infiltrationsanästhesie', 'Leitungsanästhesie'] },
          { id: 'roentgen', label: 'Röntgenologische Ausgangs-/Messaufnahme angefertigt', typ: 'checkbox' }
        ],
        zahnschema: true
      },
      wkb_sitzung2: {
        label: 'Wurzelkanalbehandlung – 2. Sitzung (Medikamentenwechsel)',
        felder: [
          { id: 'medikamentoese_einlage', label: 'Erneute medikamentöse Einlage eingebracht', typ: 'checkbox' },
          { id: 'erneute_aufbereitung', label: 'Erneute Aufbereitung eines Kanals nötig (anatomische Besonderheiten – in der Rechnung zu begründen)', typ: 'checkbox' },
          { id: 'laengenbestimmung', label: 'Erneute elektrometrische Längenbestimmung durchgeführt', typ: 'checkbox' },
          { id: 'bmf', label: 'Besondere Maßnahmen beim Präparieren (BMF, z. B. Kofferdam/Spanngummi)', typ: 'checkbox' },
          { id: 'anaesthesie', label: 'Anästhesie', typ: 'auswahl', optionen: ['keine', 'Infiltrationsanästhesie', 'Leitungsanästhesie'] },
          { id: 'roentgen', label: 'Röntgenkontrollaufnahme angefertigt', typ: 'checkbox' }
        ],
        zahnschema: true
      },
      wkb_sitzung3: {
        label: 'Wurzelkanalbehandlung – 3. Sitzung (Wurzelfüllung, Abschluss)',
        felder: [
          { id: 'kanaele', label: 'Anzahl Wurzelkanäle', typ: 'auswahl', optionen: ['1', '2', '3', '4 oder mehr'] },
          { id: 'medikamentoese_einlage', label: 'Vor der Füllung nochmals medikamentöse Einlage nötig gewesen', typ: 'checkbox' },
          { id: 'bmf', label: 'Besondere Maßnahmen beim Präparieren/Füllen (BMF, z. B. Kofferdam/Spanngummi)', typ: 'checkbox' },
          { id: 'anaesthesie', label: 'Anästhesie', typ: 'auswahl', optionen: ['keine', 'Infiltrationsanästhesie', 'Leitungsanästhesie'] },
          { id: 'roentgen', label: 'Röntgenologische Kontrollaufnahme nach Wurzelfüllung angefertigt', typ: 'checkbox' }
        ],
        zahnschema: true
      },
      revision: {
        label: 'Revision einer Wurzelfüllung',
        felder: [
          { id: 'kanaele', label: 'Anzahl Wurzelkanäle', typ: 'auswahl', optionen: ['1', '2', '3', '4 oder mehr'] }
        ],
        zahnschema: true
      },
      trepanation: {
        label: 'Trepanation (Erstversorgung/Notfall)',
        felder: [],
        zahnschema: true
      }
    }
  },
  chirurgie: {
    label: 'Chirurgie',
    icon: '🔪',
    kinder: {
      extraktion: {
        label: 'Extraktion (einfach)',
        felder: [
          { id: 'anaesthesie', label: 'Anästhesie', typ: 'auswahl', optionen: ['Infiltrationsanästhesie', 'Leitungsanästhesie'] },
          { id: 'naht', label: 'Naht erforderlich', typ: 'auswahl', optionen: ['keine', '1 Naht', '2 Nähte', '3 oder mehr Nähte'] },
          { id: 'roentgen', label: 'Röntgenkontrolle durchgeführt', typ: 'checkbox' }
        ],
        zahnschema: true
      },
      osteotomie: {
        label: 'Osteotomie (chirurgische Entfernung, z. B. verlagerter Zahn)',
        felder: [
          { id: 'anaesthesie', label: 'Anästhesie', typ: 'auswahl', optionen: ['Infiltrationsanästhesie', 'Leitungsanästhesie'] },
          { id: 'naht', label: 'Naht erforderlich', typ: 'auswahl', optionen: ['keine', '1 Naht', '2 Nähte', '3 oder mehr Nähte'] },
          { id: 'roentgen', label: 'Röntgenkontrolle durchgeführt', typ: 'checkbox' }
        ],
        zahnschema: true
      },
      wsr: {
        label: 'Wurzelspitzenresektion',
        felder: [
          { id: 'anaesthesie', label: 'Anästhesie', typ: 'auswahl', optionen: ['Infiltrationsanästhesie', 'Leitungsanästhesie'] },
          { id: 'naht', label: 'Naht erforderlich', typ: 'auswahl', optionen: ['keine', '1 Naht', '2 Nähte', '3 oder mehr Nähte'] }
        ],
        zahnschema: true
      },
      zystektomie: {
        label: 'Zystektomie',
        felder: [
          { id: 'anaesthesie', label: 'Anästhesie', typ: 'auswahl', optionen: ['Infiltrationsanästhesie', 'Leitungsanästhesie'] },
          { id: 'naht', label: 'Naht erforderlich', typ: 'auswahl', optionen: ['keine', '1 Naht', '2 Nähte', '3 oder mehr Nähte'] }
        ],
        zahnschema: true
      }
    }
  },
  prothetik: {
    label: 'Prothetik (Zahnersatz)',
    icon: '👑',
    kinder: {
      krone: {
        label: 'Krone',
        felder: [
          { id: 'material', label: 'Material', typ: 'auswahl', optionen: ['Vollkeramik', 'Metallkeramik', 'Vollguss'] }
        ],
        zahnschema: true
      },
      bruecke: {
        label: 'Brücke',
        felder: [
          { id: 'glieder', label: 'Anzahl Brückenglieder', typ: 'auswahl', optionen: ['1', '2', '3 oder mehr'] },
          { id: 'material', label: 'Material', typ: 'auswahl', optionen: ['Vollkeramik', 'Metallkeramik', 'Vollguss'] }
        ],
        zahnschema: true
      },
      teilprothese: {
        label: 'Teilprothese (herausnehmbar)',
        felder: [
          { id: 'art', label: 'Art der Halteelemente', typ: 'auswahl', optionen: ['Einfache gebogene Halteelemente', 'Modellguss mit gegossenen Halte-/Stützelementen'] },
          {
            id: 'abformung',
            label: 'Abformung',
            typ: 'auswahl',
            optionen: [
              'Standard (im Grundpreis der Prothese enthalten)',
              'Anatomische Abformung mit individuellem Löffel (ungünstige Kiefer-/Zahnbogenform)',
              'Funktionelle Abformung mit individuellem Löffel'
            ]
          }
        ],
        zahnRelevant: false
      },
      totalprothese: {
        label: 'Totalprothese',
        felder: [
          { id: 'kiefer', label: 'Kiefer', typ: 'auswahl', optionen: ['Oberkiefer', 'Unterkiefer', 'Beide Kiefer'] },
          {
            id: 'abformung',
            label: 'Abformung',
            typ: 'auswahl',
            optionen: ['Standard (im Grundpreis der Prothese enthalten)', 'Funktionelle Abformung mit individuellem Löffel']
          }
        ],
        zahnRelevant: false
      },
      reparatur: {
        label: 'Reparatur von Zahnersatz',
        felder: [],
        zahnschema: true
      }
    }
  },
  parodontologie: {
    label: 'Parodontologie',
    icon: '🩸',
    kinder: {
      pa_geschlossen: {
        label: 'PA-Behandlung (geschlossen, nicht-chirurgisch)',
        felder: [
          { id: 'anaesthesie', label: 'Anästhesie', typ: 'mehrfachauswahl', optionen: ['keine', 'Infiltrationsanästhesie', 'Leitungsanästhesie'] },
          { id: 'grad', label: 'Grad der Parodontitis (für UPT-Nachsorgeplan)', typ: 'auswahl', optionen: ['A', 'B', 'C'] }
        ],
        zahnRelevant: false,
        zahnschema: true,
        zahnschemaModus: 'wurzelzahl'
      },
      pa_chirurgisch: {
        label: 'PA-Chirurgie',
        felder: [
          { id: 'anaesthesie', label: 'Anästhesie', typ: 'mehrfachauswahl', optionen: ['Infiltrationsanästhesie', 'Leitungsanästhesie'] },
          {
            id: 'eingriffsart',
            label: 'Art des chirurgischen Eingriffs',
            typ: 'mehrfachauswahl',
            optionen: [
              'Gingivektomie/Gingivoplastik',
              'Lappenoperation/offene Kürettage',
              'Auffüllen eines Knochendefekts (Knochenersatzmaterial)',
              'Verwendung einer Membran (GTR)',
              'Osteoplastik/Kronenverlängerung',
              'Gestielter Schleimhautlappen (z. B. Rezessionsdeckung)',
              'Freies Schleimhauttransplantat',
              'Bindegewebstransplantat'
            ]
          }
        ],
        zahnschema: true,
        zahnschemaModus: 'wurzelzahl'
      },
      upt: {
        label: 'Unterstützende Parodontitistherapie (Nachsorge)',
        felder: [],
        zahnRelevant: false
      }
    }
  },
  roentgen: {
    label: 'Röntgen / Diagnostik',
    icon: '🩻',
    kinder: {
      einzelzahn: { label: 'Einzelzahnaufnahme', felder: [], zahnschema: true },
      opg: { label: 'Panoramaschichtaufnahme (OPG)', felder: [], zahnRelevant: false },
      befundung: {
        label: 'Kontrolluntersuchung / Befundung (ohne Röntgen)',
        felder: [
          { id: 'psi', label: 'Parodontaler Screening-Index (PSI) erhoben', typ: 'checkbox' },
          { id: 'zahnstein', label: 'Entfernung harter Zahnbeläge (Zahnstein)', typ: 'checkbox' },
          { id: 'mundschleimhaut', label: 'Behandlung einer Mundschleimhauterkrankung', typ: 'checkbox' },
          { id: 'ueberempfindlich', label: 'Behandlung überempfindlicher Zähne', typ: 'checkbox' },
          { id: 'fluoridierung', label: 'Fluoridierung durchgeführt', typ: 'checkbox' }
        ],
        zahnRelevant: false
      }
    }
  },
  prophylaxe: {
    label: 'Prophylaxe',
    icon: '🪥',
    kinder: {
      pzr: { label: 'Professionelle Zahnreinigung (PZR)', felder: [], zahnRelevant: false },
      fluoridierung: { label: 'Fluoridierung', felder: [], zahnRelevant: false }
    }
  },
  implantologie: {
    label: 'Implantologie',
    icon: '🔩',
    kinder: {
      insertion: {
        label: 'Implantatinsertion',
        felder: [
          { id: 'anzahl', label: 'Anzahl Implantate (an ausgewähltem/en Zahn/Zähnen)', typ: 'auswahl', optionen: ['1', '2', '3 oder mehr'] },
          { id: 'anaesthesie', label: 'Anästhesie', typ: 'auswahl', optionen: ['keine', 'Infiltrationsanästhesie', 'Leitungsanästhesie'] },
          { id: 'schablone', label: 'Schablone', typ: 'auswahl', optionen: ['keine', 'Orientierungsschablone', 'Navigationsschablone (3D-gestützt)'] },
          { id: 'augmentation', label: 'Gleichzeitige Augmentation (Knochenaufbau) in derselben Sitzung', typ: 'checkbox' }
        ],
        zahnschema: true
      },
      freilegung: {
        label: 'Freilegung eines Implantats (Zweitoperation)',
        felder: [{ id: 'anaesthesie', label: 'Anästhesie', typ: 'auswahl', optionen: ['keine', 'Infiltrationsanästhesie', 'Leitungsanästhesie'] }],
        zahnschema: true
      },
      aufbauelemente: {
        label: 'Entfernen/Wiedereinsetzen/Auswechseln von Aufbauelementen',
        felder: [{ id: 'grund', label: 'Anlass', typ: 'auswahl', optionen: ['Regulärer Wechsel (zweiphasiges Vorgehen)', 'Reparaturfall'] }],
        zahnschema: true
      },
      augmentation_isoliert: {
        label: 'Knochenaufbau ohne Implantation in derselben Sitzung',
        felder: [
          {
            id: 'art',
            label: 'Art der Augmentation',
            typ: 'auswahl',
            optionen: [
              'Alveolarfortsatz-Augmentation',
              'Sinusbodenelevation intern (interner Sinuslift)',
              'Sinusbodenelevation extern (externer Sinuslift)',
              'Spaltung und Spreizung von Knochensegmenten (Bone Splitting)'
            ]
          },
          { id: 'eigenknochen', label: 'Intraorale Eigenknochenentnahme', typ: 'checkbox' },
          { id: 'anaesthesie', label: 'Anästhesie', typ: 'auswahl', optionen: ['keine', 'Infiltrationsanästhesie', 'Leitungsanästhesie'] }
        ],
        zahnschema: true
      }
    }
  },
  schienen: {
    label: 'Aufbissbehelfe/Schienen',
    icon: '🛡️',
    kinder: {
      eingliederung: {
        label: 'Aufbissschiene eingliedern',
        felder: [
          {
            id: 'art',
            label: 'Art der Schiene',
            typ: 'auswahl',
            optionen: ['Ohne adjustierte Oberfläche (einfache Schiene)', 'Mit adjustierter Oberfläche (adjustierte Schiene)']
          }
        ],
        zahnRelevant: false
      },
      umarbeitung: {
        label: 'Umarbeitung einer vorhandenen Prothese zum Aufbissbehelf',
        felder: [],
        zahnRelevant: false
      },
      kontrolle: {
        label: 'Kontrolle/Nachbearbeitung einer Aufbissschiene',
        felder: [
          {
            id: 'art',
            label: 'Art der Kontrolle',
            typ: 'auswahl',
            optionen: ['Einfache Kontrolle', 'Nachbearbeitung, subtraktive Maßnahmen', 'Nachbearbeitung, additive Maßnahmen']
          }
        ],
        zahnRelevant: false
      }
    }
  },
  funktionsanalyse: {
    label: 'Funktionsdiagnostik (CMD)',
    icon: '🦴',
    kinder: {
      klinisch: {
        label: 'Klinische Funktionsanalyse',
        felder: [],
        zahnRelevant: false
      },
      instrumentell: {
        label: 'Instrumentelle Funktionsanalyse (Registrierung/Artikulator)',
        felder: [
          {
            id: 'art',
            label: 'Art der Registrierung',
            typ: 'auswahl',
            optionen: [
              'Zentrallage-Registrierung (Stützstiftregistrierung)',
              'Arbiträre Scharnierachsenbestimmung',
              'Kinematische Scharnierachsenbestimmung',
              'Kinematische Scharnierachsenbestimmung, elektronisch',
              'Unterkieferbewegungs-Registrierung für halbindividuellen Artikulator',
              'Unterkieferbewegungs-Registrierung für voll adjustierbaren Artikulator',
              'Unterkieferbewegungs-Registrierung elektronisch für voll adjustierbaren Artikulator'
            ]
          }
        ],
        zahnRelevant: false
      },
      einschleifen: {
        label: 'Einschleifen der Okklusion (Funktionstherapie)',
        felder: [],
        zahnRelevant: false
      }
    }
  }
};

const ZAHN_WURZELTYP = {};
['11', '12', '13', '15', '21', '22', '23', '25', '31', '32', '33', '34', '35', '41', '42', '43', '44', '45'].forEach(
  (z) => (ZAHN_WURZELTYP[z] = 'einwurzelig')
);
['14', '16', '17', '18', '24', '26', '27', '28', '36', '37', '38', '46', '47', '48'].forEach(
  (z) => (ZAHN_WURZELTYP[z] = 'mehrwurzelig')
);

const ZAHNSCHEMA_QUADRANTEN = [
  ['18', '17', '16', '15', '14', '13', '12', '11'],
  ['21', '22', '23', '24', '25', '26', '27', '28'],
  ['48', '47', '46', '45', '44', '43', '42', '41'],
  ['31', '32', '33', '34', '35', '36', '37', '38']
];

// Quelle: BEMA, Anmerkung 1+2 zu Nr. UPT a (Stand siehe data/bema.json).
// UPT-Zeitraum: 2 Jahre ab erster UPT-Leistung, verlängerbar um bis zu 6 Monate bei zahnmedizinischer Indikation.
const UPT_SCHEMA = {
  A: {
    standard: { anzahl: 2, mindestabstand: 10 },
    upt_d: null,
    upt_g: { anzahl: 1, mindestabstand: 10, bezug: 'zur ersten UPT-Leistung (kein UPT d bei Grad A)' }
  },
  B: {
    standard: { anzahl: 4, mindestabstand: 5 },
    upt_d: { anzahl: 2, mindestabstand: 5 },
    upt_g: { anzahl: 1, mindestabstand: 5, bezug: 'zur letzten UPT-d-Leistung' }
  },
  C: {
    standard: { anzahl: 6, mindestabstand: 3 },
    upt_d: { anzahl: 4, mindestabstand: 3 },
    upt_g: { anzahl: 1, mindestabstand: 3, bezug: 'zur letzten UPT-d-Leistung' }
  }
};
