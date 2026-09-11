import { describe, expect, it } from "vitest";
import { parseIngredient } from "./parse-ingredient";

const parsed = (quantity: number | null, unit: string | null, item: string, quantityMax: number | null = null) => ({
  quantity,
  quantityMax,
  unit,
  item,
});

describe("parseIngredient", () => {
  it("splits a plain line into quantity, unit and item", () => {
    expect(parseIngredient("2 cups all-purpose flour")).toEqual(parsed(2, "cup", "all-purpose flour"));
  });

  describe("quantities", () => {
    it("reads simple fractions", () => {
      expect(parseIngredient("1/2 cup sugar")).toEqual(parsed(0.5, "cup", "sugar"));
      expect(parseIngredient("3/4 tsp salt")).toEqual(parsed(0.75, "teaspoon", "salt"));
    });

    it("reads mixed numbers", () => {
      expect(parseIngredient("1 1/2 teaspoons vanilla extract")).toEqual(parsed(1.5, "teaspoon", "vanilla extract"));
      // Some sites hyphenate the whole and the fraction: "1-1/2" is one and a half, not a range.
      expect(parseIngredient("1-1/2 cups milk")).toEqual(parsed(1.5, "cup", "milk"));
    });

    it("reads unicode fractions, alone and in mixed numbers", () => {
      expect(parseIngredient("½ cup butter")).toEqual(parsed(0.5, "cup", "butter"));
      expect(parseIngredient("1½ cups rolled oats")).toEqual(parsed(1.5, "cup", "rolled oats"));
      expect(parseIngredient("2 ⅓ cups water")).toEqual(parsed(2 + 1 / 3, "cup", "water"));
    });

    it("reads the unicode fraction slash that web pages often use", () => {
      expect(parseIngredient("1⁄2 cup sugar")).toEqual(parsed(0.5, "cup", "sugar"));
      expect(parseIngredient("1 1⁄2 cups flour")).toEqual(parsed(1.5, "cup", "flour"));
    });

    it("reads decimals", () => {
      expect(parseIngredient("1.5 kg potatoes")).toEqual(parsed(1.5, "kilogram", "potatoes"));
      expect(parseIngredient(".5 cup cream")).toEqual(parsed(0.5, "cup", "cream"));
    });

    it("keeps the item when there is a quantity but no unit", () => {
      expect(parseIngredient("3 eggs")).toEqual(parsed(3, null, "eggs"));
      expect(parseIngredient("1 large onion, diced")).toEqual(parsed(1, null, "large onion, diced"));
    });

    it("leaves the whole line as the item when it does not start with a number", () => {
      expect(parseIngredient("salt to taste")).toEqual(parsed(null, null, "salt to taste"));
      expect(parseIngredient("Juice of 1 lemon")).toEqual(parsed(null, null, "Juice of 1 lemon"));
      expect(parseIngredient("Pinch of salt")).toEqual(parsed(null, null, "Pinch of salt"));
    });
  });

  describe("ranges", () => {
    it("reads hyphen and dash ranges", () => {
      expect(parseIngredient("2-3 cloves garlic")).toEqual(parsed(2, "clove", "garlic", 3));
      expect(parseIngredient("1 - 2 tbsp olive oil")).toEqual(parsed(1, "tablespoon", "olive oil", 2));
      expect(parseIngredient("1–2 tbsp olive oil")).toEqual(parsed(1, "tablespoon", "olive oil", 2));
    });

    it("reads 'to' ranges", () => {
      expect(parseIngredient("2 to 3 cloves garlic, minced")).toEqual(parsed(2, "clove", "garlic, minced", 3));
    });

    it("allows fractions and mixed numbers on either side", () => {
      expect(parseIngredient("1/2-3/4 cup sugar")).toEqual(parsed(0.5, "cup", "sugar", 0.75));
      expect(parseIngredient("1 1/2 - 2 cups flour")).toEqual(parsed(1.5, "cup", "flour", 2));
      expect(parseIngredient("3½-4 cups stock")).toEqual(parsed(3.5, "cup", "stock", 4));
    });

    it("does not mistake a hyphenated word for a range", () => {
      expect(parseIngredient("2-inch piece ginger")).toEqual(parsed(null, null, "2-inch piece ginger"));
    });

    it("reads 'or' ranges and any capitalisation of 'to'", () => {
      expect(parseIngredient("1 or 2 eggs")).toEqual(parsed(1, null, "eggs", 2));
      expect(parseIngredient("1 To 2 Tbsp Olive Oil")).toEqual(parsed(1, "tablespoon", "Olive Oil", 2));
    });

    it("accepts the unicode hyphen", () => {
      expect(parseIngredient("1\u20102 cups flour")).toEqual(parsed(1, "cup", "flour", 2));
    });

    it("treats a whole number joined to a fraction by a hyphen as a mixed number, never a descending range", () => {
      expect(parseIngredient("1-½ cups milk")).toEqual(parsed(1.5, "cup", "milk"));
      expect(parseIngredient("1 - 1/2 cups milk")).toEqual(parsed(1.5, "cup", "milk"));
    });

    it("gives up on a range that runs downwards", () => {
      expect(parseIngredient("3-2 cups flour")).toEqual(parsed(null, null, "3-2 cups flour"));
    });
  });

  describe("units", () => {
    it("normalises spellings to a canonical singular unit", () => {
      expect(parseIngredient("2 Tbsp. olive oil").unit).toBe("tablespoon");
      expect(parseIngredient("1 tablespoon honey").unit).toBe("tablespoon");
      expect(parseIngredient("2 lbs ground beef").unit).toBe("pound");
      expect(parseIngredient("4 ounces cream cheese").unit).toBe("ounce");
      expect(parseIngredient("4 fl. oz. milk").unit).toBe("fluid ounce");
      expect(parseIngredient("250 mL water").unit).toBe("milliliter");
      expect(parseIngredient("2 litres stock").unit).toBe("liter");
      expect(parseIngredient("1 pkg yeast").unit).toBe("package");
      expect(parseIngredient("1 c. flour").unit).toBe("cup");
      expect(parseIngredient("2 dl cream").unit).toBe("deciliter");
    });

    it("reads a unit written with an optional plural", () => {
      expect(parseIngredient("1 cup(s) flour")).toEqual(parsed(1, "cup", "flour"));
    });

    it("drops punctuation that only separates the unit from the item", () => {
      expect(parseIngredient("2 cups, divided")).toEqual(parsed(2, "cup", "divided"));
      expect(parseIngredient("1 cup of")).toEqual(parsed(1, "cup", ""));
    });

    it("gives up on compound amounts rather than scaling half of them", () => {
      expect(parseIngredient("1 lb 4 oz beef")).toEqual(parsed(null, null, "1 lb 4 oz beef"));
      expect(parseIngredient("2 cups + 2 tbsp flour")).toEqual(parsed(null, null, "2 cups + 2 tbsp flour"));
      expect(parseIngredient("1 cup plus 2 tbsp sugar")).toEqual(parsed(null, null, "1 cup plus 2 tbsp sugar"));
      expect(parseIngredient("1 cup/250ml flour")).toEqual(parsed(null, null, "1 cup/250ml flour"));
    });

    it("still parses an item that merely starts with a number", () => {
      expect(parseIngredient("1 cup 2% milk")).toEqual(parsed(1, "cup", "2% milk"));
      expect(parseIngredient("2 cups 00 flour")).toEqual(parsed(2, "cup", "00 flour"));
    });

    it("reads a unit glued to the number", () => {
      expect(parseIngredient("100g flour")).toEqual(parsed(100, "gram", "flour"));
      expect(parseIngredient("500ml milk")).toEqual(parsed(500, "milliliter", "milk"));
    });

    it("drops a leading 'of' after the unit", () => {
      expect(parseIngredient("2 cups of milk")).toEqual(parsed(2, "cup", "milk"));
      expect(parseIngredient("3 cloves of garlic")).toEqual(parsed(3, "clove", "garlic"));
      expect(parseIngredient("1 head of lettuce")).toEqual(parsed(1, "head", "lettuce"));
    });

    it("does not read the start of an ordinary word as a unit", () => {
      expect(parseIngredient("2 garlic cloves")).toEqual(parsed(2, null, "garlic cloves"));
      expect(parseIngredient("2 large onions")).toEqual(parsed(2, null, "large onions"));
      expect(parseIngredient("1 can't-miss trick")).toEqual(parsed(1, null, "can't-miss trick"));
    });

    it("keeps a parenthetical size with the item rather than guessing a unit", () => {
      expect(parseIngredient("1 (14 oz) can crushed tomatoes")).toEqual(parsed(1, null, "(14 oz) can crushed tomatoes"));
    });
  });

  describe("edge cases", () => {
    it("trims surrounding whitespace", () => {
      expect(parseIngredient("  2 cups flour  ")).toEqual(parsed(2, "cup", "flour"));
    });

    it("returns an empty item for an empty line", () => {
      expect(parseIngredient("")).toEqual(parsed(null, null, ""));
    });

    it("does not treat a number glued to a non-unit word as a quantity", () => {
      expect(parseIngredient("2nd batch of dough")).toEqual(parsed(null, null, "2nd batch of dough"));
    });

    it("gives up on a zero denominator", () => {
      expect(parseIngredient("1/0 cup nonsense")).toEqual(parsed(null, null, "1/0 cup nonsense"));
    });

    it("returns an empty item when the line is only a quantity and unit", () => {
      expect(parseIngredient("2 cups")).toEqual(parsed(2, "cup", ""));
    });
  });
});
