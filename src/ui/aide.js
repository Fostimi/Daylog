/**
 * Comment ça marche.
 *
 * Cet ecran nait d'un defaut de formulation constate a l'usage : chaque ecran
 * re-expliquait ce que la premiere ouverture avait deja dit, dans les memes
 * termes. Le resultat n'etait pas rassurant, il etait infantilisant -- une
 * application qui reprend tout depuis le debut a chaque page traite la personne
 * comme si elle n'avait pas compris la premiere fois. Et un texte repete cesse
 * d'etre lu, donc il ne protege plus personne.
 *
 * La regle appliquee depuis :
 *
 *   sur les ecrans   le fait, et rien de plus  (« Règles : 5 jours en moyenne »)
 *   derriere un « i » ce qui n'est pas evident   (sur quoi repose ce chiffre)
 *   ici               le fonctionnement general et les partis pris
 *
 * L'ecran n'est telecharge que si on l'ouvre. Personne ne paie le poids d'une
 * documentation qu'il ne lit pas.
 */

import { el, mount } from './dom.js';
import { topbar } from './menu.js';

/**
 * Une section repliee.
 *
 * Toutes fermees a l'ouverture : une page de documentation entierement depliee
 * se parcourt mal, et on cherche presque toujours une seule reponse.
 */
function section(title, blocks) {
  return el('details', { class: 'card doc' }, [
    el('summary', { class: 'doc-head' }, el('h2', { class: 'card-title' }, title)),
    el('div', { class: 'doc-body' }, blocks),
  ]);
}

function p(...children) {
  return el('p', {}, children);
}

export function createAideView({ store, root, go, alert = null }) {
  function draw() {
    const capabilities = store.getCapabilities() || {};

    mount(root, [
      el('a', { class: 'skip-link', href: '#main' }, 'Aller au contenu'),
      topbar({ title: 'Comment ça marche', current: 'help', go, alert }),

      el('main', { class: 'app', id: 'main' }, [
        el('p', { class: 'card-hint', style: { margin: '0.75rem 0 0' } },
          'Ce que fait Daylog, et sur quoi reposent les chiffres qu’il affiche. ' +
            'Rien ici n’est indispensable pour s’en servir.'
        ),

        section('Où sont mes données', [
          p(
            'Sur cet appareil, dans le stockage du navigateur, et nulle part ailleurs. ' +
              'Daylog n’a ni compte, ni serveur, ni publicité, ni traceur, et n’émet ' +
              'aucune requête réseau — une vérification automatique le contrôle à ' +
              'chaque modification du code.'
          ),
          p(
            'La contrepartie est réelle : ',
            el('strong', {}, 'perdre l’appareil, c’est perdre les données'),
            '. La sauvegarde est la seule protection. Elle fabrique un fichier que ' +
              'le téléphone envoie où tu veux — l’application, elle, n’envoie rien.'
          ),
          p(
            'L’export est gratuit, complet et sans limite de durée. Il le restera : ' +
              'faire payer l’accès à ses propres données contredirait tout le reste.'
          ),
        ]),

        section('Ce qui n’est jamais inventé', [
          p(
            'Un champ auquel tu n’as pas touché vaut « non renseigné », jamais une ' +
              'valeur moyenne. Il est exclu des calculs et s’affiche « — ».'
          ),
          p(
            'C’est une distinction qui compte : « zéro verre d’eau » et « je n’ai pas ' +
              'noté » ne décrivent pas la même journée. Une moyenne ne porte que sur ' +
              'les journées réellement renseignées ; les autres sont des trous, pas ' +
              'des zéros.'
          ),
        ]),

        section('Comment le bilan calcule', [
          p(
            'Les moyennes ignorent les journées non renseignées. Le suivi se compte ' +
              'en « jours suivis sur la période », et non en série de jours ' +
              'consécutifs : rater trois semaines n’abîme rien.'
          ),
          p(
            'Les rapprochements entre deux séries (sommeil et stress, par exemple) ' +
              'demandent au moins quatorze jours où ',
            el('strong', {}, 'les deux'),
            ' valeurs sont notées, et un lien trop faible n’est pas mentionné. Ce ' +
              'sont des rapprochements entre séries de chiffres, pas des explications.'
          ),
        ]),

        // La section n'apparait que pour qui suit un cycle : une documentation
        // qui parle de fonctions absentes de l'ecran est une documentation qu'on
        // cesse de croire.
        capabilities.cycle &&
          section('Le repère de cycle', [
            p(
              'Les débuts de règles sont ',
              el('strong', {}, 'déduits'),
              ' de ce que tu notes, et pas d’une case à cocher : une case oubliée une ' +
                'fois décalerait tous les repères suivants sans que rien ne le signale. ' +
                'La case « Premier jour » est pré-cochée d’après cette déduction et se ' +
                'corrige quand elle se trompe.'
            ),
            p(
              'Le repère est la moyenne de tes six derniers cycles, reportée depuis ton ' +
                'dernier début de règles. Il faut deux cycles complets pour qu’il ' +
                'existe — ou une durée habituelle indiquée dans ton profil, en ' +
                'attendant. Quand tes cycles varient, il affiche une fourchette plutôt ' +
                'qu’une date ; quand ils varient beaucoup, il ne dit rien.'
            ),
            p(
              el('strong', {}, 'Daylog n’estime aucune fertilité et aucune ovulation.'),
              ' Il ne connaît que des dates de saignement : en déduire une ovulation ' +
                'reviendrait à fabriquer une information médicale à partir de rien. Ce ' +
                'n’est ni un moyen de contraception, ni un outil de conception.'
            ),
            p(
              'Pour la même raison, les moments du cycle sont dits « avant » et ' +
                '« après les règles » et non par leur nom clinique : nommer une phase ' +
                'lutéale affirmerait une ovulation que rien ici ne mesure.'
            ),
          ]),

        section('Ce que Daylog n’est pas', [
          p(
            'Un outil de suivi, ',
            el('strong', {}, 'pas un dispositif médical'),
            '. Aucun diagnostic, aucun conseil thérapeutique, aucun remplacement d’un ' +
              'professionnel de santé.'
          ),
          p(
            'Aucune intelligence artificielle n’intervient. Tous les calculs sont des ' +
              'formules écrites dans la documentation du code et lisibles par ' +
              'n’importe qui : il n’y a pas de boîte noire.'
          ),
          p(
            'Et aucun jugement : pas de série qui se casse, pas d’objectif manqué en ' +
              'rouge, pas de relance. Ce que tu notes est un relevé, pas une note.'
          ),
        ]),

        el('p', { class: 'footer-note' },
          'Le code est ouvert. C’est le seul moyen de prouver qu’aucune donnée ne ' +
            'sort : n’importe qui peut le vérifier.'
        ),
      ]),
    ]);
  }

  return { render: draw };
}
