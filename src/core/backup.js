/**
 * Sauvegarde, restauration et partage selectif.
 *
 * Trois principes :
 *
 * 1. L'export est GRATUIT et COMPLET, definitivement. Faire payer l'acces a ses
 *    propres donnees, sur une app dont l'argument est "tes donnees
 *    t'appartiennent", serait une contradiction que les gens sentent.
 *
 * 2. L'app ne touche jamais au reseau. Elle produit un fichier et le passe au
 *    systeme ; c'est le telephone qui l'envoie sur Drive, iCloud ou ailleurs,
 *    avec ses propres mecanismes. Sauvegarde dans le cloud, sans serveur, sans
 *    frais, sans compromis.
 *
 * 3. On peut n'exporter qu'une partie : montrer trois mois de suivi de
 *    traitement a son medecin, ou sa nutrition a une dieteticienne, sans jamais
 *    montrer son journal intime.
 *
 * La compression utilise CompressionStream, integre aux navigateurs. Zero
 * dependance, et un facteur ~10 sur du JSON.
 */

import * as db from './db.js';
import { SCHEMA_VERSION, migrate } from './schema.js';
import { isValidKey } from './date.js';

export const FORMAT = 'daylog-backup';
const GZIP_MAGIC = [0x1f, 0x8b];

/**
 * Construit l'objet de sauvegarde.
 *
 * `modules` limite l'export a certaines sections, `from`/`to` a une periode.
 * Un export partiel est marque comme tel pour qu'on ne le prenne pas pour une
 * sauvegarde complete au moment de le restaurer.
 */
export async function buildBackup({ modules = null, from = null, to = null } = {}) {
  const all = await db.dumpAll();

  let days = all.days;
  if (from) days = days.filter((d) => d.date >= from);
  if (to) days = days.filter((d) => d.date <= to);

  const partial = Boolean(modules) || Boolean(from) || Boolean(to);

  if (modules) {
    const keep = new Set(modules);
    days = days.map((d) => ({
      ...d,
      modules: Object.fromEntries(
        Object.entries(d.modules || {}).filter(([id]) => keep.has(id))
      ),
    }));
    // Une journee dont il ne reste rien apres filtrage ne part pas.
    days = days.filter((d) => Object.keys(d.modules).length > 0);
  }

  const dates = new Set(days.map((d) => d.date));
  const summaries = all.summaries.filter((s) => dates.has(s.date));

  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    partial,
    // Un export partiel n'emporte ni profil ni reglages : on partage des
    // donnees de suivi, pas son identite.
    meta: partial ? {} : all.meta,
    lists: partial ? [] : all.lists,
    days,
    summaries,
    counts: { days: days.length },
  };
}

export function toJSON(backup, pretty = false) {
  return JSON.stringify(backup, null, pretty ? 2 : 0);
}

/** Compresse une chaine en gzip. Renvoie null si le navigateur ne sait pas faire. */
export async function gzip(text) {
  if (typeof globalThis.CompressionStream !== 'function') return null;
  const stream = new Blob([text]).stream().pipeThrough(new globalThis.CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function gunzip(buffer) {
  if (typeof globalThis.DecompressionStream !== 'function') {
    throw new Error("Ce navigateur ne sait pas decompresser. Utilise l'export JSON lisible.");
  }
  const stream = new Blob([buffer])
    .stream()
    .pipeThrough(new globalThis.DecompressionStream('gzip'));
  return new Response(stream).text();
}

function looksGzipped(bytes) {
  return bytes.length > 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
}

/**
 * Lit un fichier de sauvegarde, compresse ou non.
 * Le format est detecte a partir du contenu, pas de l'extension : renommer un
 * fichier ne doit pas casser la restauration.
 */
export async function parseBackupFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const text = looksGzipped(bytes) ? await gunzip(arrayBuffer) : new TextDecoder().decode(bytes);
  return parseBackup(text);
}

export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde Daylog lisible.");
  }
  return validateBackup(data);
}

/**
 * Verifie et migre une sauvegarde.
 *
 * On accepte aussi les exports du prototype v5 (`{ entries, habits, profile }`),
 * pour ne perdre les donnees de personne au passage.
 */
export function validateBackup(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Sauvegarde illisible.');
  }
  if (data.format !== FORMAT) {
    if (data.entries && typeof data.entries === 'object') {
      throw Object.assign(new Error('LEGACY_V5'), { legacy: true, data });
    }
    throw new Error("Ce fichier ne ressemble pas a une sauvegarde Daylog.");
  }
  if (!Array.isArray(data.days)) {
    throw new Error('Sauvegarde incomplete : aucune journee.');
  }
  for (const d of data.days) {
    if (!isValidKey(d?.date)) {
      throw new Error(`Sauvegarde corrompue : date invalide (${d?.date}).`);
    }
  }
  const { data: migrated, migrated: didMigrate, from } = migrate(data);
  return { backup: migrated, migrated: didMigrate, fromVersion: from };
}

/**
 * Restaure une sauvegarde.
 *
 * `merge` (defaut) : on garde, pour chaque journee, la version la plus recente
 * entre celle du fichier et celle deja presente. C'est le comportement sur
 * lequel on ne peut pas se tromper -- changer de telephone puis reimporter ne
 * doit jamais effacer ce qu'on a saisi entre-temps.
 *
 * `replace` : on vide tout d'abord. Reserve a une restauration explicite.
 */
export async function restoreBackup(backup, { strategy = 'merge' } = {}) {
  if (strategy === 'replace') {
    await db.restoreAll(backup, { replace: true });
    return { days: backup.days.length, strategy };
  }

  const existing = await db.dumpAll();
  const byDate = new Map(existing.days.map((d) => [d.date, d]));
  const summariesByDate = new Map(existing.summaries.map((s) => [s.date, s]));

  const days = [];
  const summaries = [];
  let kept = 0;

  for (const incoming of backup.days) {
    const current = byDate.get(incoming.date);
    // Comparaison STRICTE : a horodatage egal, c'est la version locale qui
    // gagne. Deux ecritures dans la meme milliseconde sont indiscernables, et
    // dans le doute il vaut mieux conserver ce qui est deja sur l'appareil --
    // une fusion ne doit jamais faire disparaitre une saisie recente.
    if (!current || (incoming.updatedAt || '') > (current.updatedAt || '')) {
      days.push(incoming);
      const s = backup.summaries?.find((x) => x.date === incoming.date);
      if (s) summaries.push(s);
    } else {
      kept++;
      const s = summariesByDate.get(incoming.date);
      if (s) summaries.push(s);
    }
  }

  await db.restoreAll(
    {
      days,
      summaries,
      lists: backup.lists || [],
      // Le profil et les reglages locaux ne sont pas ecrases par une fusion.
      meta: backup.partial ? {} : { ...backup.meta },
    },
    { replace: false }
  );

  return { days: days.length, keptLocal: kept, strategy };
}

/** Nom de fichier lisible et triable. */
export function backupFilename({ compressed = true, partial = false, date = new Date() } = {}) {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
  const kind = partial ? 'extrait' : 'sauvegarde';
  return `daylog-${kind}-${d}.json${compressed ? '.gz' : ''}`;
}

/** Jours ecoules depuis la derniere sauvegarde, ou null si jamais faite. */
export function daysSinceBackup(lastBackupAt, now = new Date()) {
  if (!lastBackupAt) return null;
  const then = new Date(lastBackupAt);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((now - then) / 86400000);
}

/**
 * Faut-il afficher le bandeau de rappel ?
 *
 * Un bandeau discret, jamais une fenetre modale. Local-first veut dire qu'il n'y
 * a aucun filet automatique : perdre son telephone, c'est tout perdre. Le rappel
 * est donc une vraie fonctionnalite de securite, pas une relance commerciale.
 */
export function shouldRemindBackup(settings, { totalDays = 0, now = new Date() } = {}) {
  if (totalDays < 7) return false; // on ne harcele pas quelqu'un qui vient d'arriver
  const threshold = settings?.backupReminderDays ?? 21;
  const since = daysSinceBackup(settings?.lastBackupAt, now);
  if (since === null) return totalDays >= 14;
  return since >= threshold;
}
