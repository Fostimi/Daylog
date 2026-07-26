import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights, RAPPEL_CORRELATION } from '../src/core/insights.js';

/** Serie de jours avec un lien voulu entre sommeil et stress. */
function serie(n, { lien = true, trous = 0 } = {}) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const court = i % 3 === 0;
    rows.push({
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      sleepH: court ? 5.5 : 7.8,
      // `lien: false` doit decorreler TOUTES les series, sinon un lien
      // subsiste et le test verifierait le contraire de ce qu'il annonce.
      stress: lien ? (court ? 8 : 3) : 5 + (i % 2),
      mood: lien ? (court ? 4 : 8) : 6 - (i % 2),
    });
  }
  for (let i = 0; i < trous; i++) rows[i].stress = null;
  return rows;
}

test('aucune phrase sur un echantillon trop petit', () => {
  const out = buildInsights(serie(6));
  assert.equal(out.length, 1, 'seulement le message expliquant ce qui manque');
  assert.match(out[0], /deux semaines/);
});

test('aucune phrase du tout sans donnees', () => {
  assert.deepEqual(buildInsights([]), []);
});

test('un lien net est enonce, avec le nombre de jours', () => {
  const out = buildInsights(serie(24));
  const phrase = out.find((t) => t.includes('nuits les plus longues'));
  assert.ok(phrase, `aucune phrase sur le sommeil : ${out.join(' | ')}`);
  assert.match(phrase, /Sur \d+ jours/);
  assert.match(phrase, /stress plus bas/);
});

test('on ne garde que les rapprochements les plus nets', () => {
  // Empiler cinq observations dilue les deux qui comptent et fait horoscope.
  const out = buildInsights(serie(30));
  const rapprochements = out.filter((t) => t.includes('Sur '));
  assert.ok(rapprochements.length > 0);
  assert.ok(rapprochements.length <= 2, `${rapprochements.length} rapprochements`);
});

test('le rappel « ce n est pas une explication » existe, une seule fois', () => {
  // Il est fourni a part pour etre affiche sous l'ensemble : repete apres
  // chaque phrase, il doublait la longueur du bloc et cessait d'etre lu.
  assert.match(RAPPEL_CORRELATION, /pas des explications/);
  const out = buildInsights(serie(24));
  for (const t of out) {
    assert.doesNotMatch(t, /pas des explications/, 'le rappel ne doit pas etre colle aux phrases');
  }
});

test('les phrases restent descriptives, jamais prescriptives', () => {
  // Aucune formulation de conseil : Daylog n'est pas un dispositif medical.
  const out = buildInsights(serie(24));
  for (const t of out) {
    assert.doesNotMatch(t, /tu devrais|il faut que|essaie de|pense à dormir|conseil/i, t);
  }
});

test('les phrases sont du francais correct, pas des morceaux assembles', () => {
  // Le premier jet composait « ton nuits nettement va a l'inverse de ton
  // stress ». Ce test verrouille l'absence de ce genre d'accord fautif.
  const out = buildInsights(serie(24));
  for (const t of out) {
    assert.doesNotMatch(t, /\bton nuits\b/, t);
    assert.doesNotMatch(t, /\bton humeurs\b/, t);
    assert.doesNotMatch(t, /\bta stress\b/, t);
    assert.doesNotMatch(t, /\s{2,}/, `double espace : ${t}`);
    assert.match(t, /[.!?]$/, `phrase non terminee : ${t}`);
    assert.match(t, /^[A-ZÀ-Ý0-9]/, `phrase sans majuscule : ${t}`);
  }
});

test('un lien absent ne produit aucune affirmation', () => {
  const out = buildInsights(serie(24, { lien: false }));
  assert.ok(
    !out.some((t) => t.includes('nuits les plus longues')),
    'rien ne doit etre affirme quand les series ne se suivent pas'
  );
});

test('les journees a moitie renseignees ne comptent pas dans le total annonce', () => {
  const avec = buildInsights(serie(30));
  const avecTrous = buildInsights(serie(30, { trous: 10 }));

  const nDe = (list) => {
    const m = list.find((t) => t.includes('Sur '))?.match(/Sur (\d+) jours/);
    return m ? Number(m[1]) : null;
  };
  assert.equal(nDe(avec), 30);
  assert.equal(nDe(avecTrous), 20, 'seuls les jours ou les deux valeurs existent');
});

test('la comparaison nuits courtes / longues donne des chiffres parlants', () => {
  const out = buildInsights(serie(24));
  const phrase = out.find((t) => t.includes('6 h 30'));
  assert.ok(phrase, 'la comparaison directe doit apparaitre');
  assert.match(phrase, /stress moyen de [\d,.]+, contre [\d,.]+/);
});
