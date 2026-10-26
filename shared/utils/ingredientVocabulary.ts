/**
 * Swiss ↔ German kitchen vocabulary, applied when an ingredient's search terms are built.
 *
 * The Swiss BLV catalog says Poulet, Rahm and Peperoni; the German BLS says Hähnchen, Sahne
 * and Paprika; a user in Hamburg types the second and expects the first to show up. Rather
 * than editing either dataset's names, every search term that contains one side of a pair
 * also gets a variant with the other side — in both directions, so a BLS row is just as
 * findable from Zürich. Words are in the normalised form of `normalizeSearchTerm()`
 * (lower-case, umlauts folded), matched as whole words.
 *
 * Deliberately small and deliberately only synonyms a cook treats as the same thing — a
 * pair here makes two rows interchangeable in the autocomplete, nothing more.
 */
export const INGREDIENT_VOCABULARY: ReadonlyArray<readonly [string, string]> = [
  // meat & poultry
  ['poulet', 'hahnchen'],
  ['hahnchen', 'huhn'],
  ['gehacktes', 'hackfleisch'],
  ['hackfleisch', 'hack'],
  ['voressen', 'gulasch'],
  ['gigot', 'keule'],
  ['plätzli', 'schnitzel'],
  ['platzli', 'schnitzel'],
  ['speck', 'bacon'],
  // eggs — "Ei" alone must find "Hühnerei roh"; two characters never reach the substring tiers
  ['huhnerei', 'ei'],
  ['eier', 'ei'],
  // dairy
  ['rahm', 'sahne'],
  ['vollrahm', 'schlagsahne'],
  ['halbrahm', 'sahne'],
  ['kaffeerahm', 'kaffeesahne'],
  ['sauerrahm', 'saure sahne'],
  ['nature', 'natur'],
  ['quark', 'topfen'],
  ['bratbutter', 'butterschmalz'],
  // vegetables & fruit
  ['peperoni', 'paprika'],
  ['paprika', 'gemusepaprika'],
  ['peperoncini', 'chili'],
  ['rubli', 'karotte'],
  ['karotte', 'mohre'],
  ['nusslisalat', 'feldsalat'],
  ['randen', 'rote bete'],
  ['kabis', 'weisskohl'],
  ['weisskabis', 'weisskohl'],
  ['rotkabis', 'rotkohl'],
  ['federkohl', 'grunkohl'],
  ['krautstiel', 'mangold'],
  ['zucchetti', 'zucchini'],
  ['kefen', 'zuckerschoten'],
  ['lauch', 'porree'],
  ['bohnli', 'bohnen'],
  ['zwetschge', 'pflaume'],
  ['baumnuss', 'walnuss'],
  ['baumnusse', 'walnusse'],
  ['mais', 'maiskolben'],
  // pantry
  ['bouillon', 'bruhe'],
  ['teigwaren', 'nudeln'],
  ['glace', 'speiseeis'],
  ['guetzli', 'kekse'],
  ['biscuits', 'kekse'],
  ['konfiture', 'marmelade'],
  ['griess', 'gries'],
  ['speisestarke', 'starke'],
  ['maisstarke', 'speisestarke'],
  ['puderzucker', 'staubzucker'],
]
