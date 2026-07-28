/**
 * Modules du noyau.
 *
 * Chaque module se declare ici une fois. L'ecran du jour, l'onboarding, le
 * tableau de bord, l'export selectif et le partage se derivent tous de ces
 * declarations -- il n'y a nulle part ailleurs de `if (module actif)`.
 *
 * `summarize` renvoie les quelques nombres qui iront dans le resume quotidien.
 * Il doit rester bon marche : il tourne a chaque sauvegarde. Et il ne doit
 * JAMAIS inventer de valeur : un champ non renseigne remonte `null` et sera
 * exclu des moyennes.
 */

import { registerModule } from '../core/modules.js';
import { mean, round } from '../core/summary.js';

export const CHECKIN_SLOTS = [
  { id: 'morning', label: 'Matin' },
  { id: 'afternoon', label: 'Après-midi' },
  { id: 'evening', label: 'Soir' },
];

/** Moyenne des check-ins effectivement enregistres, sur une echelle donnee. */
function checkinMean(data, key) {
  const values = CHECKIN_SLOTS.map((slot) => data?.checkins?.[slot.id])
    .filter((c) => c && c.loggedAt)
    .map((c) => c[key])
    .filter((v) => typeof v === 'number');
  return values.length ? round(mean(values), 1) : null;
}

export function registerCoreModules() {
  // -------------------------------------------------------------- humeur
  registerModule({
    id: 'mood',
    label: 'Humeur',
    icon: 'mood',
    essential: true, // le journal ne peut pas exister sans lui
    express: true,
    order: 10,
    shareable: false, // le journal intime ne part jamais dans un export partiel
    summarize(data) {
      return {
        mood: checkinMean(data, 'mood'),
        energy: checkinMean(data, 'energy'),
        stress: checkinMean(data, 'stress'),
        checkins: CHECKIN_SLOTS.filter((s) => data?.checkins?.[s.id]?.loggedAt).length || null,
        // Score de recuperation d'un appareil connecte, saisi a la main ou lu
        // plus tard depuis le pont sante du telephone.
        recovery: typeof data?.recovery === 'number' ? data.recovery : null,
      };
    },
  });

  // -------------------------------------------------------------- sommeil
  registerModule({
    id: 'sleep',
    label: 'Sommeil',
    icon: 'sleep',
    defaultEnabled: true,
    order: 20,
    // Le sommeil etait cache derriere un bouton « Ajouter du detail ». Ce n'est
    // pas un detail de l'humeur : c'est un suivi a part entiere.
    view: () => import('./views/sleep.js'),
    summarize(data) {
      return {
        sleepH: typeof data?.hours === 'number' ? round(data.hours, 2) : null,
        sleepQ: typeof data?.quality === 'number' ? data.quality : null,
      };
    },
  });

  // ------------------------------------------------------------ habitudes
  registerModule({
    id: 'habits',
    label: 'Ce que tu as fait',
    icon: 'habits',
    defaultEnabled: true,
    order: 30,
    // L'ecran du module n'est telecharge que si le module est actif. Un module
    // desactive ne coute donc rien, ni en poids ni en temps de demarrage.
    view: () => import('./views/habits.js'),
    summarize(data) {
      const done = data?.done?.length || 0;
      // `active` est la photographie des habitudes existant CE JOUR-LA. Sans
      // elle, ajouter une habitude aujourd'hui ferait baisser retroactivement
      // tous les scores des mois passes -- le bug du v5.
      const total = data?.active?.length || 0;
      return {
        habitsDone: total ? done : null,
        habitsTotal: total || null,
        habitsPct: total ? Math.round((done / total) * 100) : null,
      };
    },
  });

  // ------------------------------------------------------ activite physique
  // Le resume ne publie QUE des faits mesures : duree, distance, nombre de
  // seances. Pas de calories actives -- elles se deduisent du poids, que le
  // module ne connait pas (il vit dans le profil, pas dans la journee), et un
  // module n'a pas a publier un chiffre qu'il ne peut pas calculer honnetement.
  // L'ecran, lui, a le profil sous la main et les affiche.
  registerModule({
    id: 'activity',
    label: 'Activité physique',
    icon: 'activity',
    defaultEnabled: false,
    order: 35,
    view: () => import('./views/activity.js'),
    summarize(data) {
      const sessions = data?.sessions || [];
      const minutes = sessions.map((s) => s?.minutes).filter((v) => typeof v === 'number');
      const legs = sessions.map((s) => s?.meters).filter((v) => typeof v === 'number');
      const own = typeof data?.meters === 'number' ? data.meters : null;
      const distance =
        own === null && !legs.length ? null : (own || 0) + legs.reduce((a, b) => a + b, 0);
      return {
        moveM: distance === null ? null : Math.round(distance),
        moveMin: minutes.length ? minutes.reduce((a, b) => a + b, 0) : null,
        workouts: sessions.length || null,
        // Un jour de repos est une reponse a part entiere, comme « zero verre
        // d'eau » : il se distingue d'une journee ou l'on n'a rien note.
        restDay: data?.restDay === true ? 1 : null,
      };
    },
  });

  // ----------------------------------------------------------- hydratation
  registerModule({
    id: 'hydration',
    label: 'Hydratation',
    icon: 'water',
    defaultEnabled: true,
    express: false,
    order: 40,
    view: () => import('./views/hydration.js'),
    summarize(data) {
      return { waterMl: typeof data?.ml === 'number' && data.ml > 0 ? data.ml : null };
    },
  });

  // ----------------------------------------------------------------- cycle
  // N'apparait que si la personne a declare suivre un cycle -- question posee a
  // tout le monde, jamais deduite d'une case « sexe » ni de l'identite. Une
  // fois visible, il se desactive comme n'importe quel autre module.
  registerModule({
    id: 'cycle',
    label: 'Cycle menstruel',
    icon: 'cycle',
    defaultEnabled: true,
    order: 45,
    requires: ['cycle'],
    view: () => import('./views/cycle.js'),
    summarize(data) {
      // `cycleStart` remonte aussi quand il vaut `false` : c'est une correction
      // explicite (« non, ce n'est pas un debut »), et la perdre laisserait la
      // deduction automatique reprendre le dessus au prochain calcul.
      const start = typeof data?.cycleStart === 'boolean' ? data.cycleStart : null;
      return {
        flow: typeof data?.flow === 'number' ? data.flow : null,
        cycleStart: start,
        symptoms: data?.symptoms?.length || null,
      };
    },
  });

  // ------------------------------------------------------------- nutrition
  // Mode macros pour commencer. Le mode detaille (micronutriments) viendra en
  // option : 13 champs par repas a la main, personne ne tient une semaine.
  registerModule({
    id: 'nutrition',
    label: 'Alimentation',
    icon: 'meal',
    defaultEnabled: true,
    order: 50,
    view: () => import('./views/nutrition.js'),
    summarize(data) {
      // Chaque entree porte deja ses valeurs, figees au moment de la saisie :
      // le resume n'a qu'a les additionner, et un champ non renseigne est
      // exclu du total plutot que compte pour zero.
      const items = data?.items || [];
      if (!items.length) return {};
      const total = (key) => {
        const vals = items.map((m) => m?.[key]).filter((v) => typeof v === 'number');
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0)) : null;
      };
      return {
        kcal: total('kcal'),
        protein: total('protein'),
        carbs: total('carbs'),
        fat: total('fat'),
        foods: items.length || null,
      };
    },
  });

  // ---------------------------------------------------------------- sante
  // Le seul module dont les cles de resume sont declarees a deux endroits :
  // ici, et dans `MEASURES` de core/health.js. C'est volontaire -- importer le
  // noyau de sante ferait payer son poids a tout le monde, y compris a qui n'a
  // jamais active le module -- et un test verifie que les deux listes ne
  // divergent pas.
  //
  // `defaultEnabled: false` : un module qui apparait tout seul dans la journee
  // de quelqu'un qui ne l'a pas demande est une intrusion, a plus forte raison
  // celui-ci. Il s'active a la premiere ouverture ou dans les reglages.
  registerModule({
    id: 'health',
    label: 'Santé',
    icon: 'health',
    defaultEnabled: false,
    order: 55,
    view: () => import('./views/health.js'),
    summarize(data) {
      const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
      return {
        weightKg: n(data?.weight),
        bodyFatPct: n(data?.bodyFat),
        tempC: n(data?.temp),
        bpSys: n(data?.bp?.systolic),
        bpDia: n(data?.bp?.diastolic),
        spo2: n(data?.spo2),
        bpmRest: n(data?.bpmRest),
        bpmMin: n(data?.bpmMin),
        bpmMax: n(data?.bpmMax),
        pain: n(data?.pain?.level),
        // `ailments` et non `symptoms` : le cycle publie deja cette cle, et
        // deux modules qui ecrivent la meme case du resume s'ecraseraient
        // silencieusement selon l'ordre d'enregistrement.
        ailments: data?.symptoms?.length || null,
        doses: data?.doses?.length || null,
      };
    },
  });

  // ---------------------------------------------------------------- argent
  // Les montants du resume sont EN CENTIMES, comme partout ailleurs dans le
  // module : additionner des flottants ferait afficher une balance a
  // -0,009999999999990905 € au bout de trente saisies, et aucun arrondi a
  // l'affichage ne repare ça.
  registerModule({
    id: 'money',
    label: 'Argent',
    icon: 'money',
    defaultEnabled: false,
    order: 70,
    view: () => import('./views/money.js'),
    summarize(data) {
      const entries = data?.entries || [];
      if (!entries.length) return { spent: null, earned: null, balance: null };

      let spent = 0;
      let earned = 0;
      let moved = 0;
      for (const entry of entries) {
        const amount = typeof entry?.amount === 'number' && Number.isFinite(entry.amount)
          ? Math.round(entry.amount)
          : 0;
        if (amount <= 0) continue;
        if (entry.kind === 'expense') spent += amount;
        else if (entry.kind === 'income') earned += amount;
        // Un virement bouge la balance sans entrer dans les deux totaux : se
        // faire rembourser n'est pas un revenu, et rembourser n'est pas une
        // depense de plus.
        else if (entry.kind === 'transfer') moved += entry.direction === 'out' ? -amount : amount;
      }
      return {
        spent: spent || null,
        earned: earned || null,
        balance: earned + moved - spent,
      };
    },
  });

  // ------------------------------------------------------------------ note
  registerModule({
    id: 'note',
    label: 'Journal',
    icon: 'note',
    essential: true,
    express: true,
    order: 60,
    shareable: false,
    summarize(data) {
      const text = data?.text;
      return { hasNote: text && text.trim() ? 1 : null };
    },
  });
}

/** Fabrique un check-in vide. Aucune valeur par defaut : tout est `null`. */
export function createCheckin() {
  return { mood: null, energy: null, stress: null, note: null, loggedAt: null };
}
