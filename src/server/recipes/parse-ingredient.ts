/**
 * Pull quantity, unit and item out of a free-text ingredient line.
 *
 * Ingredient lines are stored exactly as written ("2 cups all-purpose flour"),
 * so scaling a recipe means parsing the number back out at read time. Pure,
 * no I/O.
 */

/** Canonical singular unit names, with every spelling we recognise for each. */
export const UNITS = {
  teaspoon: ["teaspoons", "teaspoon", "tsps", "tsp"],
  tablespoon: ["tablespoons", "tablespoon", "tbsps", "tbsp", "tbls", "tblsp", "tbs"],
  cup: ["cups", "cup", "c"],
  "fluid ounce": ["fluid ounces", "fluid ounce", "fl. oz", "fl oz", "fl.oz"],
  ounce: ["ounces", "ounce", "oz"],
  pound: ["pounds", "pound", "lbs", "lb"],
  gram: ["grams", "gram", "gr", "g"],
  kilogram: ["kilograms", "kilogram", "kgs", "kg"],
  milligram: ["milligrams", "milligram", "mg"],
  milliliter: ["milliliters", "millilitres", "milliliter", "millilitre", "ml"],
  deciliter: ["deciliters", "decilitres", "deciliter", "decilitre", "dl"],
  liter: ["liters", "litres", "liter", "litre", "l"],
  pint: ["pints", "pint", "pt"],
  quart: ["quarts", "quart", "qt"],
  gallon: ["gallons", "gallon", "gal"],
  pinch: ["pinches", "pinch"],
  dash: ["dashes", "dash"],
  handful: ["handfuls", "handful"],
  clove: ["cloves", "clove"],
  slice: ["slices", "slice"],
  piece: ["pieces", "piece"],
  can: ["cans", "can"],
  package: ["packages", "package", "pkgs", "pkg"],
  stick: ["sticks", "stick"],
  bunch: ["bunches", "bunch"],
  head: ["heads", "head"],
  sprig: ["sprigs", "sprig"],
  stalk: ["stalks", "stalk"],
  jar: ["jars", "jar"],
  bottle: ["bottles", "bottle"],
} as const satisfies Record<string, readonly string[]>;

export type Unit = keyof typeof UNITS;

export type ParsedIngredient = {
  /** Lower (or only) quantity; null when the line doesn't start with one. */
  quantity: number | null;
  /** Upper bound of a range such as "2-3 cloves"; null unless the line has one. */
  quantityMax: number | null;
  /** Canonical singular unit ("cup" for "cups"); null when none is recognised. */
  unit: Unit | null;
  /** The rest of the line: what the quantity and unit apply to. */
  item: string;
};

const VULGAR: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅕": 1 / 5,
  "⅖": 2 / 5,
  "⅗": 3 / 5,
  "⅘": 4 / 5,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};
const VULGAR_CLASS = `[${Object.keys(VULGAR).join("")}]`;

// Web pages often use the fraction slash (U+2044) instead of "/".
const FRACTION = String.raw`\d+[/⁄]\d+`;
// "1 1/2", "1-1/2" and "1 - 1/2" (some sites hyphenate a mixed number), "1½", "1 ½".
// A whole number joined to a fraction is always a mixed number: read as a range it would run downwards.
const MIXED = String.raw`\d+(?:(?:\s+|\s*-\s*)${FRACTION}|(?:\s*-)?\s*${VULGAR_CLASS})`;
const NUMBER = String.raw`(?:${MIXED}|${FRACTION}|${VULGAR_CLASS}|\d*\.\d+|\d+)`;
const DASHES = "-\u2010\u2011\u2012\u2013\u2014";
// "2-3", "2 - 3", "2–3", "2 to 3", "1 or 2". The range is optional; the second group is then undefined.
const RANGE_SEP = String.raw`(?:\s*[${DASHES}]\s*|\s+(?:to|or)\s+)`;
const LEADING_QUANTITY = new RegExp(`^(${NUMBER})(?:${RANGE_SEP}(${NUMBER}))?`, "i");

/** Every alias in one alternation, longest first so "tablespoons" wins over "tbs". */
const UNIT_ALIASES = Object.entries(UNITS)
  .flatMap(([unit, aliases]) => aliases.map((alias) => ({ unit: unit as Unit, alias })))
  .sort((a, b) => b.alias.length - a.alias.length);
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A unit may carry an optional plural ("cup(s)") and a trailing period ("Tbsp."), and must end at a
// word boundary so "g" never matches the start of "garlic".
const UNIT = `(${UNIT_ALIASES.map(({ alias }) => escapeRegExp(alias).replace(/ /g, "\\s+")).join("|")})(?:\\(s\\))?\\.?(?=$|[\\s,;:()/])`;
const UNIT_PATTERN = new RegExp(`^${UNIT}`, "i");
const UNIT_BY_ALIAS = new Map(UNIT_ALIASES.map(({ unit, alias }) => [alias.toLowerCase(), unit]));
// "1 lb 4 oz", "2 cups + 2 tbsp", "1 cup plus 2 tbsp", "1 cup/250ml": a second amount we would
// otherwise drop on the floor, so the line comes back unparsed instead of half-scaled.
const COMPOUND_AMOUNT = new RegExp(`^(?:\\+|/|plus\\s|${NUMBER}\\s*${UNIT})`, "i");

/** Value of one NUMBER match. Its shapes mirror MIXED / FRACTION above; keep the two in step. */
function toNumber(text: string): number | null {
  const last = text[text.length - 1];
  if (Object.hasOwn(VULGAR, last)) {
    const whole = text.slice(0, -1).replace(/[\s-]+$/, "");
    return (whole ? Number(whole) : 0) + VULGAR[last];
  }
  const fraction = /^(?:(\d+)[\s-]+)?(\d+)[/⁄](\d+)$/.exec(text);
  if (fraction) {
    const [, whole, numerator, denominator] = fraction;
    if (Number(denominator) === 0) return null;
    return (whole ? Number(whole) : 0) + Number(numerator) / Number(denominator);
  }
  return Number(text);
}

function matchUnit(rest: string): { unit: Unit; rest: string } | null {
  const m = UNIT_PATTERN.exec(rest);
  if (!m) return null;
  const unit = UNIT_BY_ALIAS.get(m[1].toLowerCase().replace(/\s+/g, " "));
  if (!unit) return null;
  return { unit, rest: rest.slice(m[0].length) };
}

export function parseIngredient(line: string): ParsedIngredient {
  const text = line.trim();
  const unparsed: ParsedIngredient = { quantity: null, quantityMax: null, unit: null, item: text };

  const numberMatch = LEADING_QUANTITY.exec(text);
  if (!numberMatch) return unparsed;
  const quantity = toNumber(numberMatch[1]);
  if (quantity == null) return unparsed;
  const quantityMax = numberMatch[2] === undefined ? null : toNumber(numberMatch[2]);
  if (numberMatch[2] !== undefined && (quantityMax == null || quantityMax < quantity)) return unparsed;

  let rest = text.slice(numberMatch[0].length);
  // A number glued to a word ("2nd batch") isn't a quantity, unless the word is a unit ("100g").
  const spaced = /^\s/.test(rest) || rest === "";
  rest = rest.trimStart();
  const unitMatch = matchUnit(rest);
  if (!spaced && !unitMatch) return unparsed;

  let unit: Unit | null = null;
  if (unitMatch) {
    unit = unitMatch.unit;
    rest = unitMatch.rest.trimStart();
    if (COMPOUND_AMOUNT.test(rest)) return unparsed;
    rest = rest.replace(/^[,;:]\s*/, "").replace(/^of(?:\s+|$)/i, "");
  }
  return { quantity, quantityMax, unit, item: rest.trim() };
}
