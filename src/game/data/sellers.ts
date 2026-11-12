// Verkäufertypen für den Gebrauchtwagenmarkt.
export interface SellerProfile {
  id: string;
  label: string;
  /** Erster Eindruck, den der Spieler zu sehen bekommt. */
  vibe: string;
  /** Maximaler Nachlass ohne jedes Argument (Anteil vom Angebotspreis). */
  flex: [number, number];
  /** Verhandlungsrunden, bevor er dichtmacht. */
  patience: [number, number];
  /** 0 = ahnungslos, 1 = kennt jede Macke und hat sie schon eingepreist. */
  knowledge: number;
  /** Wie viel eines berechtigten Arguments er als Nachlass anerkennt. */
  concede: number;
  /** Angebote unter diesem Anteil seiner Schmerzgrenze empfindet er als Frechheit. */
  insultAt: number;
  /** Wie weit er pro Runde entgegenkommt (Anteil des Abstands zur Schmerzgrenze). */
  step: number;
  opening: (price: string) => string;
}

export const SELLERS: Record<string, SellerProfile> = {
  private: {
    id: 'private', label: 'Privatverkäufer', vibe: 'freundlich, kennt sich mit Technik kaum aus',
    flex: [0.1, 0.16], patience: [3, 4], knowledge: 0.15, concede: 0.75, insultAt: 0.78, step: 0.5,
    opening: (p) => `„${p} – der lief immer zuverlässig, ich fahre nur zum Einkaufen.“`,
  },
  tinkerer: {
    id: 'tinkerer', label: 'Schrauber', vibe: 'kennt jede Macke des Wagens – und hat sie eingepreist',
    flex: [0.05, 0.09], patience: [3, 5], knowledge: 0.9, concede: 0.25, insultAt: 0.85, step: 0.35,
    opening: (p) => `„${p}. Was der hat, weiß ich selbst – steht alles im Preis.“`,
  },
  dealer: {
    id: 'dealer', label: 'Händler', vibe: 'routiniert, redet jeden Mangel klein',
    flex: [0.06, 0.11], patience: [2, 3], knowledge: 0.6, concede: 0.45, insultAt: 0.88, step: 0.3,
    opening: (p) => `„${p} – top gepflegt, technisch einwandfrei, da gibt's nichts.“`,
  },
  hurry: {
    id: 'hurry', label: 'Eiliger Verkäufer', vibe: 'zieht um und will den Wagen schnell loswerden',
    flex: [0.14, 0.22], patience: [2, 2], knowledge: 0.3, concede: 0.6, insultAt: 0.72, step: 0.65,
    opening: (p) => `„${p}. Ich brauche den Platz, am liebsten heute noch.“`,
  },
  stubborn: {
    id: 'stubborn', label: 'Rentner', vibe: 'geduldig, hängt am Auto, gibt ungern nach',
    flex: [0.04, 0.08], patience: [4, 6], knowledge: 0.4, concede: 0.5, insultAt: 0.9, step: 0.25,
    opening: (p) => `„${p}. Scheckheftgepflegt, das ist er wert.“`,
  },
};

/** Erbe eines Scheunenfunds – kein normaler Marktverkäufer. */
SELLERS.heir = {
  id: 'heir', label: 'Erbe', vibe: 'hat keine Ahnung von Autos und will die Scheune leer haben',
  flex: [0.15, 0.22], patience: [2, 3], knowledge: 0.05, concede: 0.3, insultAt: 0.7, step: 0.6,
  opening: (p) => `„${p} – Hauptsache, er kommt weg.“`,
};

export const SELLER_LIST = Object.values(SELLERS).filter((s) => s.id !== 'heir');
export const SELLER_NAMES = ['Herr Brandl', 'Frau Yildiz', 'Herr Kowalski', 'Frau Sommer', 'Herr Aigner', 'Herr Petrovic', 'Frau Lindner', 'Herr Okafor'];
