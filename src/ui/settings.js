/**
 * Reglages et donnees.
 *
 * L'ecran porte la promesse la plus concrete de l'application : tes donnees
 * t'appartiennent, tu peux les emporter, et rien n'est jamais retenu en otage.
 *
 * Deux principes appliques ici :
 *
 * - L'EXPORT EST GRATUIT, COMPLET ET SANS LIMITE. Definitivement. Faire payer
 *   l'acces a ses propres donnees, sur une application dont l'argument est
 *   qu'elles n'appartiennent qu'a vous, serait une contradiction que les gens
 *   sentent immediatement.
 *
 * - L'APPLICATION NE TOUCHE PAS AU RESEAU. Elle fabrique un fichier et le passe
 *   au systeme ; c'est le telephone qui l'envoie sur Drive, iCloud ou ailleurs,
 *   avec ses propres mecanismes. On obtient la sauvegarde dans le cloud sans
 *   serveur, sans frais et sans rien trahir.
 */

import { el, mount, announce } from './dom.js';
import { topbar } from './menu.js';
import * as db from '../core/db.js';
import {
  buildBackup, toJSON, gzip, parseBackupFile, restoreBackup, backupFilename,
  daysSinceBackup,
} from '../core/backup.js';
import { allModules, availableModules, enabledModules } from '../core/modules.js';

export function createSettingsView({ store, root, go, alert = null }) {
  let status = null;
  let busy = false;

  function setStatus(message, kind = 'info') {
    status = message ? { message, kind } : null;
    draw();
    if (message) announce(message, kind === 'error');
  }

  // ------------------------------------------------------------------ export

  /**
   * Fabrique le fichier et le confie au systeme.
   *
   * `URL.createObjectURL` cree une adresse locale a l'onglet : rien ne part sur
   * le reseau, le fichier ne quitte l'appareil que si la personne choisit de
   * l'envoyer quelque part.
   */
  async function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Liberation differee : Safari a besoin que l'adresse survive au clic.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function exportAll({ compressed }) {
    if (busy) return;
    busy = true;
    try {
      const backup = await buildBackup();
      const json = toJSON(backup, !compressed);
      const packed = compressed ? await gzip(json) : null;

      // Si le navigateur ne sait pas compresser, on livre le JSON lisible
      // plutot que d'echouer : mieux vaut un fichier plus gros que pas de
      // sauvegarde du tout.
      const blob = packed
        ? new Blob([packed], { type: 'application/gzip' })
        : new Blob([json], { type: 'application/json' });

      await download(blob, backupFilename({ compressed: Boolean(packed) }));
      await store.setSettings({ lastBackupAt: new Date().toISOString() });

      const size = (blob.size / 1024).toFixed(0);
      setStatus(
        `Sauvegarde créée : ${backup.days.length} journées, ${size} Ko. ` +
          'Range-la où tu veux — Drive, iCloud, une clé USB.'
      );
    } catch (error) {
      setStatus(`La sauvegarde a échoué : ${error.message}`, 'error');
    } finally {
      busy = false;
    }
  }

  /** Export d'un seul module : montrer sa nutrition sans montrer son journal. */
  async function exportModule(moduleId, label) {
    if (busy) return;
    busy = true;
    try {
      const backup = await buildBackup({ modules: [moduleId] });
      if (!backup.days.length) {
        setStatus(`Rien à exporter pour « ${label} » : aucune donnée enregistrée.`, 'error');
        return;
      }
      const json = toJSON(backup, true);
      await download(
        new Blob([json], { type: 'application/json' }),
        backupFilename({ compressed: false, partial: true })
      );
      setStatus(
        `Extrait « ${label} » créé : ${backup.days.length} journées. ` +
          "Il ne contient que cette section, ni ton profil ni ton journal."
      );
    } catch (error) {
      setStatus(`L'extrait a échoué : ${error.message}`, 'error');
    } finally {
      busy = false;
    }
  }

  // ------------------------------------------------------------------ import

  async function importFile(file, strategy) {
    if (!file || busy) return;
    busy = true;
    try {
      const buffer = await file.arrayBuffer();
      const { backup, migrated, fromVersion } = await parseBackupFile(buffer);
      const result = await restoreBackup(backup, { strategy });

      const parts = [`${result.days} journées restaurées`];
      if (result.keptLocal) {
        parts.push(`${result.keptLocal} conservées telles quelles sur cet appareil`);
      }
      if (migrated) parts.push(`converties depuis un format plus ancien (v${fromVersion})`);
      setStatus(`${parts.join(', ')}.`);

      await store.loadDay(store.getDate());
    } catch (error) {
      if (error.legacy) {
        setStatus(
          "Ce fichier vient du prototype Daylog v5. Sa conversion n'est pas encore " +
            'disponible — garde-le précieusement, elle arrivera.',
          'error'
        );
      } else {
        setStatus(`La restauration a échoué : ${error.message}`, 'error');
      }
    } finally {
      busy = false;
    }
  }

  // ------------------------------------------------------------------- rendu

  async function draw() {
    const settings = store.getSettings();
    const moduleState = store.getModuleState();
    const capabilities = store.getCapabilities();
    const active = new Set(enabledModules(moduleState, capabilities).map((m) => m.id));
    const totalDays = await db.countDays();
    const since = daysSinceBackup(settings.lastBackupAt);
    const storage = await db.estimateStorage();

    const fileInput = el('input', {
      type: 'file',
      id: 'restore-file',
      accept: '.json,.gz,application/json,application/gzip',
      class: 'sr-only',
      onChange: (e) => {
        const [file] = e.target.files;
        const replace = root.querySelector('#restore-replace')?.checked;
        importFile(file, replace ? 'replace' : 'merge');
        e.target.value = '';
      },
    });

    mount(root, [
      el('a', { class: 'skip-link', href: '#main' }, 'Aller au contenu'),
      topbar({ title: 'Mes données', current: 'data', go, alert }),

      el('main', { class: 'app', id: 'main' }, [
        status &&
          el('div', {
            class: `banner${status.kind === 'error' ? ' is-error' : ''}`,
            role: 'status',
          }, el('p', {}, status.message)),

        // ------------------------------------------------------ sauvegarde
        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Sauvegarder'),
          el('p', { class: 'card-hint' },
            'Tes notes ne sont que sur cet appareil.'
          ),

          el('dl', { class: 'facts' }, [
            el('div', { class: 'fact' }, [
              el('dt', {}, 'Journées enregistrées'),
              el('dd', {}, String(totalDays)),
            ]),
            el('div', { class: 'fact' }, [
              el('dt', {}, 'Dernière sauvegarde'),
              el('dd', {}, since === null ? 'jamais' : since === 0 ? "aujourd'hui" : `il y a ${since} j`),
            ]),
            storage?.usage != null &&
              el('div', { class: 'fact' }, [
                el('dt', {}, 'Place occupée'),
                el('dd', {}, `${(storage.usage / 1024).toFixed(0)} Ko`),
              ]),
          ]),

          el('div', { class: 'card-actions' }, [
            el('button', {
              class: 'btn btn-primary',
              type: 'button',
              onClick: () => exportAll({ compressed: true }),
            }, 'Sauvegarder maintenant'),
            el('button', {
              class: 'btn',
              type: 'button',
              onClick: () => exportAll({ compressed: false }),
            }, 'Version lisible (JSON)'),
          ]),

          el('p', { class: 'card-hint', style: { marginTop: '0.75rem', marginBottom: '0' } },
            "Le fichier est remis au système : c'est toi qui choisis où il va."
          ),
        ]),

        // -------------------------------------------------------- restaurer
        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Restaurer'),
          el('p', { class: 'card-hint' },
            'Par défaut, une journée déjà présente est conservée si elle est plus récente.'
          ),
          el('label', { class: 'onb-option', for: 'restore-replace' }, [
            el('input', { type: 'checkbox', id: 'restore-replace', class: 'onb-input' }),
            el('span', { class: 'onb-option-text' }, [
              el('span', { class: 'onb-option-label' }, 'Tout remplacer'),
              el('span', { class: 'onb-option-hint' },
                'Efface ce qui est sur cet appareil avant de restaurer. À réserver ' +
                  'à une vraie remise à zéro.'
              ),
            ]),
          ]),
          fileInput,
          el('div', { class: 'card-actions' }, [
            el('button', {
              class: 'btn',
              type: 'button',
              onClick: () => fileInput.click(),
            }, 'Choisir un fichier de sauvegarde'),
          ]),
        ]),

        // ------------------------------------------------------- partage
        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Partager une partie seulement'),
          el('p', { class: 'card-hint' },
            'Un extrait ne contient que la section choisie, ni ton profil ni le ' +
              'reste. Rien n’est verrouillé : c’est toi qui décides de ce que tu ' +
              'montres, et de à qui.'
          ),
          // Un module decoupe en parts propose ses parts ET son ensemble : on
          // ne force personne a partager trois fois pour tout donner, ni a tout
          // donner pour partager une chose.
          el('div', { class: 'card-actions' },
            allModules()
              .filter((m) => m.shareable && active.has(m.id))
              .flatMap((m) => [
                el('button', {
                  class: 'btn btn-sm',
                  type: 'button',
                  onClick: () => exportModule(m.id, m.label),
                }, m.label),
                ...(m.shareParts || []).map((part) =>
                  el('button', {
                    class: 'btn btn-sm',
                    type: 'button',
                    onClick: () => exportModule(`${m.id}:${part.id}`, `${m.label} — ${part.label}`),
                  }, `${m.label} : ${part.label.toLowerCase()}`)
                ),
              ])
          ),
        ]),

        // -------------------------------------------------------- modules
        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Ce que je suis'),
          el('p', { class: 'card-hint' },
            'Désactiver ne supprime rien : les données restent, elles sont masquées.'
          ),
          // Seuls les modules dont les conditions sont reunies : proposer
          // « Cycle menstruel » a quelqu'un qui a repondu ne pas en avoir
          // afficherait une case qui se redecocherait toute seule.
          ...availableModules(capabilities).map((mod) => {
            const on = active.has(mod.id);
            const id = `mod-${mod.id}`;
            return el('label', { class: 'onb-option', for: id }, [
              el('input', {
                type: 'checkbox',
                id,
                class: 'onb-input',
                checked: on,
                disabled: mod.essential,
                onChange: async (e) => {
                  await store.setModuleState({ [mod.id]: e.target.checked });
                  draw();
                },
              }),
              el('span', { class: 'onb-option-text' }, [
                el('span', { class: 'onb-option-label' }, mod.label),
                mod.essential &&
                  el('span', { class: 'onb-option-hint' },
                    "Toujours actif : c'est le cœur du journal."
                  ),
              ]),
            ]);
          }),
        ]),

        // ------------------------------------------------------- confidentialite
        el('div', { class: 'card' }, [
          el('h2', { class: 'card-title' }, 'Confidentialité'),
          el('p', { class: 'card-hint', style: { marginBottom: '0' } },
            "Daylog n'a aucun compte, aucun serveur, aucune publicité et aucun " +
              "traceur. L'application ne fait aucune requête réseau : le code est " +
              'ouvert, et une vérification automatique le contrôle à chaque ' +
              'modification.'
          ),
        ]),
      ]),
    ]);
  }

  return { render: draw };
}
