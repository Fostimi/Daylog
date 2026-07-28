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
    const modules = store.getModuleState() || {};

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
            // Ecrit ici, et nulle part ailleurs : une invitation a consulter
            // declenchee par un seuil serait un jugement medical deguise -- elle
            // dirait « ton cycle sort de la norme » a partir d'une moyenne
            // arithmetique, sans rien savoir d'une grossesse, d'un traitement,
            // d'une perimenopause ou d'un arret de contraception. A cet endroit,
            // elle est disponible pour qui la cherche et ne vise personne.
            p(
              'Daylog ne juge aucun cycle : ni trop long, ni trop court, ni ' +
                'irrégulier. Il ne sait pas ce qu’un retard signifie pour toi, et il ' +
                'ne le devinera pas. Si quelque chose t’inquiète, c’est à un ' +
                'professionnel de santé d’en parler — et tes saisies s’exportent en ' +
                'un fichier que tu peux lui montrer.'
            ),
          ]),

        section('Les calculs de nutrition', [
          p(
            'La dépense au repos vient d’une formule publiée, calibrée séparément ' +
              'sur des groupes de référence féminins et masculins. Daylog choisit ' +
              'la référence à partir de ta réponse sur le genre, ',
            el('strong', {}, 'et ne s’en sert nulle part ailleurs'),
            '. Si tu es non binaire, il prend le milieu des deux ; si tu es une ' +
              'personne trans, tu choisis toi-même et tu peux faire glisser la ' +
              'référence progressivement.'
          ),
          p(
            'Une masse grasse mesurée l’emporte sur tout : c’est une mesure, pas ' +
              'une catégorie, et elle ne pose aucune question.'
          ),
          p(
            'Trois chiffres, à ne pas confondre : ce que ton corps dépense au repos, ' +
              'ce qu’il dépense en tout, et ce que tu vises. Le dernier ne descend ' +
              'jamais sous le premier, quel que soit l’objectif choisi.'
          ),
          p(
            'Compte ± 10 % d’erreur au départ, pour tout le monde. Puis, au bout de ' +
              'six semaines de pesées et de repas notés, ',
            el('strong', {}, 'ce sont tes faits qui décident'),
            ' : la différence entre ce que tu as mangé et ce que ton poids a fait ' +
              'donne ta dépense réelle, et c’est elle qui remplace la formule. Le ' +
              'point de départ ne pèse alors presque plus.'
          ),
          p(
            'Le recalage a besoin des deux : sans tes repas notés, perdre du poids ' +
              'parce que tu l’as voulu serait pris pour une erreur de la formule, et ' +
              'ta cible baisserait à chaque fois un peu plus. Et si l’écart dépasse ' +
              '40 %, Daylog ne recale pas — à ce niveau-là ce n’est plus la formule ' +
              'qui se trompe, c’est qu’il manque des repas dans le journal.'
          ),
          p(
            'Les aliments livrés portent des valeurs ',
            el('strong', {}, 'indicatives'),
            ' : le riz d’une marque n’est pas celui d’une table de composition. ' +
              '« Ajuster ses valeurs » enregistre les tiennes, et elles passent ' +
              'devant dans les recherches. Une correction ne réécrit jamais les ' +
              'journées déjà notées.'
          ),
        ]),

        // Comme la section du cycle : elle n'apparait que pour qui suit sa
        // sante. Une documentation qui decrit des ecrans absents est une
        // documentation qu'on cesse de croire.
        modules.health &&
          section('Les chiffres de santé', [
            p(
              'Daylog ',
              el('strong', {}, 'ne qualifie aucune mesure'),
              '. Pas de « normal », pas d’« élevé », aucune couleur d’alerte sur ' +
                'une tension ou un pouls. Il ne connaît ni ton âge, ni tes ' +
                'antécédents, ni ce que ton médecin t’a dit : en tirer un jugement ' +
                'serait inventer un avis médical à partir de rien.'
            ),
            p(
              'Une saisie peut en revanche être ',
              el('strong', {}, 'refusée'),
              ' : 370 °C est une virgule oubliée, et l’enregistrer fausserait toutes ' +
                'tes moyennes. Le refus dit ce que Daylog sait noter, jamais ce qu’un ' +
                'corps a le droit d’afficher — et rien n’est corrigé à ta place, ' +
                'arrondir une mesure reviendrait à en inventer une.'
            ),
            p(
              'Tu ne vois que les mesures que tu as cochées dans « Ce que je note ». ' +
                'Les treize champs du départ tiendraient trois jours ; deux champs ' +
                'tiennent des années.'
            ),
            p(
              'Le poids est traité comme une ',
              el('strong', {}, 'série'),
              ', jamais comme une valeur : il varie de plus d’un kilo dans une même ' +
                'journée. La tendance compare la moyenne de tes premières pesées à ' +
                'celle des dernières, et ne s’affiche pas avant quatre pesées. Ta ' +
                'dernière pesée met à jour le poids de référence de ton profil — ' +
                'compléter une journée oubliée ne le fait jamais reculer.'
            ),
            p(
              'Une prise de traitement enregistre la ',
              el('strong', {}, 'dose du jour'),
              ', figée. Changer un dosage aujourd’hui ne réécrit pas les mois passés : ' +
                'c’est ce qui permet de relire un traitement qui évolue et de voir à ' +
                'quelle dose correspondait quel ressenti.'
            ),
            p(
              'Aucun oubli n’est signalé. Une prise notée est une information ; une ' +
                'case vide n’en est pas une, et Daylog ne la transformera pas en ' +
                'reproche.'
            ),
          ]),

        modules.activity &&
          section('Les calories d’une séance', [
            p(
              'Elles ',
              el('strong', {}, 'ne s’ajoutent à aucune cible'),
              ', et c’est voulu. Le niveau d’activité de ton profil contient déjà ' +
                'tes séances : les additionner reviendrait à compter la même dépense ' +
                'deux fois, et à te proposer de manger davantage pour une séance déjà ' +
                'prise en compte.'
            ),
            p(
              'Si tu veux que tes séances pèsent vraiment sur ton estimation, c’est ' +
                'déjà le cas : le recalage sur tes pesées les compte, puisqu’elles se ' +
                'voient dans ton poids et dans tes repas. Sans rien additionner à la main.'
            ),
            p(
              'Le chiffre affiché est un ordre de grandeur. La même séance vaut du ' +
                'simple au double selon l’intensité, et il est calculé à partir de ton ' +
                'poids et de la durée — sans poids connu, aucune calorie n’est estimée.'
            ),
            p(
              'Ta réponse sur la façon dont tu te déplaces change l’',
              el('strong', {}, 'ordre'),
              ' du catalogue et le mot employé, jamais ce à quoi tu as accès : tout ' +
                'reste ouvert à tout le monde. En fauteuil, la distance s’affiche sans ' +
                'équivalent en poussées — celui-ci dépend du réglage du fauteuil et du ' +
                'terrain, et le calculer avec la formule de la marche donnerait un ' +
                'nombre précis et faux.'
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

        el('p', { class: 'footer-note' }, [
          'Le code est ouvert. C’est le seul moyen de prouver qu’aucune donnée ne ' +
            'sort : n’importe qui peut le vérifier.',
          el('br'),
          // Utile le jour ou quelqu'un signale un comportement etrange : la
          // premiere question est toujours « quelle version ? ».
          `Version ${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '—'}`,
        ]),
      ]),
    ]);
  }

  return { render: draw };
}
