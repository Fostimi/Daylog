#!/usr/bin/env node
/**
 * Rejoue toute la suite de tests dans plusieurs fuseaux horaires.
 *
 * Le prototype v5 produisait ses cles de jour avec `toISOString()`, donc en UTC :
 * a Paris, tout ce qui etait saisi apres 22h atterrissait au lendemain. Le bug
 * etait invisible pour qui developpait en UTC, et permanent pour les autres.
 *
 * Les fuseaux ci-dessous sont choisis pour leur capacite a casser du code de
 * date naif : decalages extremes des deux cotes, decalage non entier, et
 * changement d'heure a minuit.
 */

import { execFileSync } from 'node:child_process';

const ZONES = [
  ['UTC', 'reference'],
  ['Europe/Paris', 'UTC+1/+2, le fuseau de reference du projet'],
  ['Pacific/Kiritimati', 'UTC+14, le plus en avance du monde'],
  ['Pacific/Auckland', 'UTC+12/+13, heure d ete inversee'],
  ['Pacific/Midway', 'UTC-11, le plus en retard'],
  ['America/Los_Angeles', 'UTC-8/-7'],
  ['Asia/Kathmandu', 'UTC+5:45, decalage non entier'],
  ['Australia/Eucla', 'UTC+8:45, decalage non entier'],
  ['America/Santiago', 'changement d heure a minuit'],
  ['Asia/Tehran', 'changement d heure a minuit'],
];

let failed = 0;

for (const [tz, why] of ZONES) {
  process.stdout.write(`${tz.padEnd(22)} ${why.padEnd(40)} `);
  try {
    execFileSync(process.execPath, ['--test', 'tests/*.test.js'], {
      env: { ...process.env, TZ: tz },
      stdio: 'pipe',
    });
    console.log('ok');
  } catch (err) {
    failed++;
    console.log('ECHEC');
    const out = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
    console.log(
      out
        .split('\n')
        .filter((l) => l.startsWith('not ok') || l.includes('AssertionError') || l.includes('expected'))
        .slice(0, 12)
        .map((l) => `    ${l}`)
        .join('\n')
    );
  }
}

if (failed) {
  console.error(`\n${failed} fuseau(x) en echec.`);
  process.exit(1);
}
console.log(`\n${ZONES.length} fuseaux horaires : tout passe.`);
