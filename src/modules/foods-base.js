/**
 * Base d'aliments livree avec l'application.
 *
 * POURQUOI ELLE EXISTE. Une bibliotheque vide au premier jour rend le module
 * inutilisable pendant la semaine ou l'on decide si l'on garde l'application --
 * et obliger a ouvrir une autre app pour chaque saisie le condamne avant meme
 * qu'il serve. Quatre-vingts aliments courants suffisent a franchir ce cap.
 *
 * POURQUOI ELLE EST SI PETITE. Une table de composition complete pese 5 a 30 Mo,
 * soit cent fois l'application entiere, et sans reseau elle ne peut pas etre
 * consultee a distance. Celle-ci pese quelques kilo-octets et n'est telechargee
 * qu'avec le module nutrition.
 *
 * CE QU'ELLE VAUT. Des valeurs INDICATIVES, pour 100 g d'aliment cru et non
 * prepare sauf mention contraire. Le riz d'une marque n'est pas celui d'une
 * table de composition : tout est modifiable, et une valeur corrigee devient un
 * aliment personnel qui prend la place de celui-ci dans les recherches.
 *
 * `unitGrams` donne le poids des unites qui ont un sens pour cet aliment. Un
 * oeuf se compte, l'huile se verse a la cuillere, les pates se pesent -- et on
 * ne propose jamais une unite qui obligerait a convertir de tete.
 */

/** Fabrique compacte : la table reste lisible et le fichier reste leger. */
function f(id, label, kcal, protein, carbs, fat, extra = {}) {
  return { id: `base:${id}`, base: true, label, kcal, protein, carbs, fat, ...extra };
}

export const BASE_FOODS = [
  // ------------------------------------------------------------ feculents
  f('pates', 'Pâtes (crues)', 350, 12, 71, 1.5, { unitGrams: { bowl: 80 } }),
  f('pates-cuites', 'Pâtes (cuites)', 130, 4.5, 26, 0.6, { unitGrams: { bowl: 200 } }),
  f('riz', 'Riz (cru)', 350, 7, 78, 0.9, { unitGrams: { bowl: 75 } }),
  f('riz-cuit', 'Riz (cuit)', 125, 2.5, 28, 0.3, { unitGrams: { bowl: 180 } }),
  f('semoule', 'Semoule (crue)', 355, 12, 73, 1.5),
  f('quinoa', 'Quinoa (cru)', 370, 14, 59, 6),
  f('boulgour', 'Boulgour (cru)', 345, 12, 69, 1.5),
  f('lentilles', 'Lentilles (crues)', 340, 25, 50, 1.5),
  f('pois-chiches', 'Pois chiches (cuits)', 145, 8.5, 20, 2.5),
  f('haricots-rouges', 'Haricots rouges (cuits)', 125, 8, 18, 0.5),
  f('pomme-de-terre', 'Pomme de terre', 80, 2, 17, 0.2, { unitGrams: { unit: 150 } }),
  f('patate-douce', 'Patate douce', 90, 1.6, 20, 0.1, { unitGrams: { unit: 180 } }),
  f('farine', 'Farine de blé', 350, 10, 72, 1.2, { unitGrams: { tbsp: 10 } }),
  f('avoine', 'Flocons d’avoine', 375, 13, 60, 7, { unitGrams: { tbsp: 8, bowl: 50 } }),
  f('pain', 'Pain', 260, 8.5, 50, 1.5, { unitGrams: { slice: 30 } }),
  f('pain-complet', 'Pain complet', 245, 9, 43, 2, { unitGrams: { slice: 35 } }),
  f('biscotte', 'Biscotte', 400, 12, 74, 5, { unitGrams: { unit: 10 } }),
  f('tortilla', 'Galette de blé', 300, 8, 50, 7, { unitGrams: { unit: 45 } }),

  // ---------------------------------------------------------------- viandes
  f('poulet', 'Blanc de poulet', 110, 23, 0, 1.8, { unitGrams: { unit: 130 } }),
  f('poulet-cuisse', 'Cuisse de poulet', 175, 19, 0, 11, { unitGrams: { unit: 150 } }),
  f('dinde', 'Escalope de dinde', 105, 23, 0, 1.2, { unitGrams: { unit: 120 } }),
  f('boeuf-hache-5', 'Bœuf haché 5 %', 130, 21, 0, 5, { unitGrams: { unit: 125 } }),
  f('boeuf-hache-15', 'Bœuf haché 15 %', 215, 19, 0, 15, { unitGrams: { unit: 125 } }),
  f('steak', 'Steak de bœuf', 160, 26, 0, 6, { unitGrams: { unit: 150 } }),
  f('porc', 'Filet de porc', 145, 22, 0, 6),
  f('jambon', 'Jambon blanc', 110, 20, 1, 3, { unitGrams: { slice: 40 } }),
  f('lardons', 'Lardons', 280, 15, 0.5, 24),
  f('saucisse', 'Saucisse', 300, 14, 1.5, 27, { unitGrams: { unit: 70 } }),

  // --------------------------------------------------------------- poissons
  f('saumon', 'Saumon', 200, 20, 0, 13, { unitGrams: { unit: 130 } }),
  f('cabillaud', 'Cabillaud', 80, 18, 0, 0.7, { unitGrams: { unit: 130 } }),
  f('thon-nature', 'Thon au naturel', 105, 25, 0, 0.8, { unitGrams: { unit: 110 } }),
  f('sardine', 'Sardines à l’huile', 220, 24, 0, 14, { unitGrams: { unit: 90 } }),
  f('crevette', 'Crevettes', 95, 20, 0.5, 1),

  // ------------------------------------------------------------ oeufs, lait
  f('oeuf', 'Œuf', 145, 12.5, 0.7, 10, { unitGrams: { unit: 55 } }),
  f('blanc-oeuf', 'Blanc d’œuf', 48, 11, 0.7, 0.2, { unitGrams: { unit: 33 } }),
  f('lait-demi', 'Lait demi-écrémé', 46, 3.3, 4.8, 1.6, {
    liquid: true,
    unitGrams: { glass: 200, bowl: 250 },
  }),
  f('lait-entier', 'Lait entier', 64, 3.2, 4.7, 3.6, {
    liquid: true,
    unitGrams: { glass: 200, bowl: 250 },
  }),
  f('yaourt', 'Yaourt nature', 60, 4, 5, 3, { unitGrams: { unit: 125 } }),
  f('skyr', 'Skyr / fromage blanc 0 %', 55, 10, 4, 0.2, { unitGrams: { unit: 150 } }),
  f('fromage-blanc', 'Fromage blanc 3 %', 75, 7.5, 4.5, 3, { unitGrams: { unit: 100 } }),
  f('gruyere', 'Emmental râpé', 380, 28, 1, 30, { unitGrams: { tbsp: 8 } }),
  f('camembert', 'Camembert', 300, 20, 0.5, 24),
  f('mozzarella', 'Mozzarella', 250, 18, 1, 19, { unitGrams: { unit: 125 } }),

  // --------------------------------------------------------------- legumes
  f('tomate', 'Tomate', 18, 0.8, 3, 0.2, { unitGrams: { unit: 120 } }),
  f('carotte', 'Carotte', 36, 0.8, 7, 0.2, { unitGrams: { unit: 90 } }),
  f('courgette', 'Courgette', 17, 1.3, 2, 0.3, { unitGrams: { unit: 200 } }),
  f('brocoli', 'Brocoli', 34, 3, 4, 0.4),
  f('haricots-verts', 'Haricots verts', 31, 1.8, 4, 0.2),
  f('epinards', 'Épinards', 23, 2.9, 1.5, 0.4),
  f('salade', 'Salade verte', 15, 1.3, 1.5, 0.2),
  f('poivron', 'Poivron', 26, 1, 5, 0.3, { unitGrams: { unit: 150 } }),
  f('oignon', 'Oignon', 40, 1.1, 8, 0.1, { unitGrams: { unit: 110 } }),
  f('champignon', 'Champignons de Paris', 22, 3, 1, 0.3),
  f('petits-pois', 'Petits pois', 80, 5.4, 11, 0.4),
  f('mais', 'Maïs', 95, 3, 19, 1.2),

  // ---------------------------------------------------------------- fruits
  f('pomme', 'Pomme', 52, 0.3, 12, 0.2, { unitGrams: { unit: 180 } }),
  f('banane', 'Banane', 90, 1.1, 20, 0.3, { unitGrams: { unit: 120 } }),
  f('orange', 'Orange', 47, 0.9, 9, 0.1, { unitGrams: { unit: 180 } }),
  f('clementine', 'Clémentine', 46, 0.8, 9, 0.2, { unitGrams: { unit: 70 } }),
  f('fraise', 'Fraises', 32, 0.7, 6, 0.3),
  f('raisin', 'Raisin', 69, 0.7, 16, 0.2),
  f('kiwi', 'Kiwi', 61, 1.1, 12, 0.5, { unitGrams: { unit: 75 } }),
  f('avocat', 'Avocat', 160, 2, 2, 15, { unitGrams: { unit: 150 } }),
  f('datte', 'Dattes', 280, 2, 65, 0.4, { unitGrams: { unit: 8 } }),

  // ----------------------------------------------------- matieres grasses
  f('huile-olive', 'Huile d’olive', 900, 0, 0, 100, {
    liquid: true,
    unitGrams: { tbsp: 10, tsp: 4 },
  }),
  f('huile-colza', 'Huile de colza', 900, 0, 0, 100, {
    liquid: true,
    unitGrams: { tbsp: 10, tsp: 4 },
  }),
  f('beurre', 'Beurre', 750, 0.7, 0.6, 82, { unitGrams: { tsp: 5, tbsp: 12 } }),
  f('creme', 'Crème fraîche 30 %', 300, 2.5, 3, 30, { liquid: true, unitGrams: { tbsp: 15 } }),
  f('amande', 'Amandes', 620, 21, 6, 53, { unitGrams: { unit: 1.2 } }),
  f('noix', 'Noix', 690, 15, 6, 65),
  f('cacahuete', 'Cacahuètes', 590, 26, 10, 49),
  f('beurre-cacahuete', 'Beurre de cacahuète', 600, 25, 12, 50, { unitGrams: { tbsp: 16 } }),

  // ------------------------------------------------------------- boissons
  f('cafe', 'Café noir', 2, 0.2, 0, 0, { liquid: true, unitGrams: { unit: 100 } }),
  f('the', 'Thé', 1, 0, 0.2, 0, { liquid: true, unitGrams: { unit: 200 } }),
  f('jus-orange', 'Jus d’orange', 45, 0.7, 10, 0.1, { liquid: true, unitGrams: { glass: 200 } }),
  f('soda', 'Soda', 40, 0, 10, 0, { liquid: true, unitGrams: { glass: 250 } }),
  // `alcohol` signale que l'energie ne s'explique pas par les macronutriments :
  // l'ethanol apporte 7 kcal/g et n'est ni proteine, ni glucide, ni lipide. Le
  // controle de coherence de la table le sait et ne s'en alarme pas.
  f('biere', 'Bière', 43, 0.5, 3.5, 0, { liquid: true, alcohol: true, unitGrams: { glass: 250 } }),
  f('vin', 'Vin', 80, 0.1, 2.5, 0, { liquid: true, alcohol: true, unitGrams: { glass: 125 } }),

  // --------------------------------------------------------------- divers
  f('chocolat-noir', 'Chocolat noir', 550, 7, 35, 40, { unitGrams: { unit: 5 } }),
  f('biscuit', 'Biscuit sec', 450, 6, 70, 16, { unitGrams: { unit: 10 } }),
  f('miel', 'Miel', 320, 0.4, 80, 0, { unitGrams: { tsp: 7, tbsp: 21 } }),
  f('sucre', 'Sucre', 400, 0, 100, 0, { unitGrams: { tsp: 5, unit: 5 } }),
  f('ketchup', 'Ketchup', 110, 1.2, 24, 0.2, { unitGrams: { tbsp: 15 } }),
  f('mayonnaise', 'Mayonnaise', 700, 1, 1.5, 75, { unitGrams: { tbsp: 13 } }),
  f('sauce-tomate', 'Sauce tomate', 60, 1.5, 8, 2),
  f('houmous', 'Houmous', 230, 7, 12, 17, { unitGrams: { tbsp: 25 } }),
  f('tofu', 'Tofu nature', 120, 12, 2, 7),
  f('proteine-poudre', 'Protéine en poudre (whey)', 380, 78, 6, 4, { unitGrams: { unit: 30 } }),

  // -------------------------------------------------- proteines vegetales
  //
  // Cette section n'est pas un supplement : une application de suivi
  // alimentaire qui ne connait que le poulet et le fromage est inutilisable
  // pour qui mange vegetarien ou vegan, et l'inutilisabilite se decouvre au
  // premier repas -- soit exactement au moment ou l'on decide de rester ou non.
  f('tofu-ferme', 'Tofu ferme', 145, 15, 2, 8),
  f('tofu-soyeux', 'Tofu soyeux', 60, 6, 2, 3),
  f('tofu-fume', 'Tofu fumé', 175, 18, 2, 11),
  f('tempeh', 'Tempeh', 190, 19, 8, 11),
  f('seitan', 'Seitan', 145, 25, 6, 2),
  f('proteine-soja', 'Protéine de soja texturée', 335, 50, 30, 1),
  f('proteine-pois', 'Protéine de pois en poudre', 375, 80, 4, 5, { unitGrams: { unit: 30 } }),
  f('steak-vegetal', 'Steak végétal', 200, 17, 8, 11, { unitGrams: { unit: 100 } }),
  f('falafel', 'Falafels', 330, 13, 32, 17, { unitGrams: { unit: 20 } }),
  f('edamame', 'Édamame', 125, 11, 9, 5),
  f('haricots-blancs', 'Haricots blancs (cuits)', 130, 9, 19, 0.6),
  f('pois-casses', 'Pois cassés (crus)', 340, 24, 52, 1.2),
  f('lentilles-corail', 'Lentilles corail (crues)', 350, 25, 55, 1.5),
  f('soja-jaune', 'Graines de soja (crues)', 420, 36, 23, 20),

  // ------------------------------------------------ boissons vegetales
  f('lait-avoine', 'Boisson à l’avoine', 45, 0.8, 7, 1.5, {
    liquid: true,
    unitGrams: { glass: 200, bowl: 250 },
  }),
  f('lait-soja', 'Boisson au soja', 40, 3.3, 1.5, 1.9, {
    liquid: true,
    unitGrams: { glass: 200, bowl: 250 },
  }),
  f('lait-amande', 'Boisson à l’amande', 24, 0.5, 2.5, 1.2, {
    liquid: true,
    unitGrams: { glass: 200, bowl: 250 },
  }),
  f('lait-riz', 'Boisson au riz', 50, 0.3, 10, 1, {
    liquid: true,
    unitGrams: { glass: 200, bowl: 250 },
  }),
  f('lait-coco', 'Lait de coco', 190, 2, 3, 19, { liquid: true, unitGrams: { tbsp: 15 } }),
  f('creme-soja', 'Crème de soja', 175, 3, 3, 17, { liquid: true, unitGrams: { tbsp: 15 } }),
  f('yaourt-soja', 'Yaourt au soja', 70, 4.5, 4, 3.5, { unitGrams: { unit: 125 } }),
  f('yaourt-coco', 'Yaourt à la coco', 130, 1, 6, 11, { unitGrams: { unit: 125 } }),
  f('fromage-vegetal', 'Fromage végétal', 280, 1, 22, 21),

  // ------------------------------------------- cereales et sans gluten
  f('sarrasin', 'Sarrasin (cru)', 345, 13, 62, 3.4),
  f('pates-sarrasin', 'Pâtes de sarrasin (crues)', 340, 13, 66, 2.5, { unitGrams: { bowl: 80 } }),
  f('pates-completes', 'Pâtes complètes (crues)', 340, 14, 62, 2.5, { unitGrams: { bowl: 80 } }),
  f('pates-lentilles', 'Pâtes de lentilles (crues)', 340, 25, 48, 2, { unitGrams: { bowl: 80 } }),
  f('riz-complet', 'Riz complet (cru)', 350, 8, 74, 2.8, { unitGrams: { bowl: 75 } }),
  f('millet', 'Millet (cru)', 375, 11, 68, 4),
  f('epeautre', 'Épeautre (cru)', 340, 15, 62, 2.5),
  f('polenta', 'Polenta (crue)', 360, 8, 78, 1.5),
  f('pain-sans-gluten', 'Pain sans gluten', 250, 4, 47, 4, { unitGrams: { slice: 30 } }),
  f('farine-riz', 'Farine de riz', 360, 6, 80, 1.4, { unitGrams: { tbsp: 10 } }),
  f('farine-pois-chiche', 'Farine de pois chiche', 385, 22, 50, 7, { unitGrams: { tbsp: 10 } }),

  // ------------------------------------------------- graines et oleagineux
  f('chia', 'Graines de chia', 490, 17, 8, 31, { unitGrams: { tbsp: 12 } }),
  f('lin', 'Graines de lin', 530, 18, 3, 42, { unitGrams: { tbsp: 10 } }),
  f('courge', 'Graines de courge', 560, 30, 11, 45, { unitGrams: { tbsp: 10 } }),
  f('tournesol', 'Graines de tournesol', 585, 21, 11, 51, { unitGrams: { tbsp: 9 } }),
  f('sesame', 'Graines de sésame', 570, 18, 12, 50, { unitGrams: { tbsp: 9 } }),
  f('tahini', 'Purée de sésame (tahini)', 600, 17, 10, 54, { unitGrams: { tbsp: 15 } }),
  f('beurre-amande', 'Purée d’amande', 630, 21, 7, 56, { unitGrams: { tbsp: 16 } }),
  f('noisette', 'Noisettes', 630, 15, 7, 61),
  f('cajou', 'Noix de cajou', 555, 18, 27, 44),
  f('pistache', 'Pistaches', 560, 20, 16, 45),

  // ------------------------------------------------------------ appoints
  f('levure-maltee', 'Levure maltée', 355, 45, 20, 5, { unitGrams: { tbsp: 5 } }),
  f('sirop-erable', 'Sirop d’érable', 260, 0, 67, 0, { unitGrams: { tbsp: 20, tsp: 7 } }),
  f('sirop-agave', 'Sirop d’agave', 310, 0, 76, 0, { unitGrams: { tbsp: 21, tsp: 7 } }),
  f('compote', 'Compote sans sucres ajoutés', 50, 0.3, 11, 0.2, { unitGrams: { unit: 100 } }),
  f('olives', 'Olives', 145, 1, 1, 15),
  f('cornichon', 'Cornichons', 15, 0.7, 1.5, 0.2, { unitGrams: { unit: 10 } }),
  f('sauce-soja', 'Sauce soja', 60, 6, 6, 0.1, { liquid: true, unitGrams: { tbsp: 15 } }),
  f('curry-pate', 'Pâte de curry', 130, 3, 12, 7, { unitGrams: { tbsp: 15 } }),
];

/** Nombre d'aliments livres. Sert au test qui surveille le poids de la base. */
export const BASE_COUNT = BASE_FOODS.length;
