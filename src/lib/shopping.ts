import type { OccasionType } from "./party-context";

export type ShoppingStatus = "needed" | "in-cart" | "purchased";

export type ShoppingCategoryName =
  | "Venue"
  | "Food & Drink"
  | "Cake & Desserts"
  | "Decorations"
  | "Entertainment"
  | "Favors";

export type ShoppingItem = {
  id: string;
  name: string;
  category: ShoppingCategoryName;
  qty: number;
  estPrice: number; // per unit
  status: ShoppingStatus;
  linkedExpenseId?: string; // set when purchased
  actualPrice?: number; // total paid, set when purchased
};

type Seed = {
  name: string;
  category: ShoppingCategoryName;
  estPrice: number;
  serves?: number; // if omitted, qty = 1
};

// Occasion baselines
const OCCASION_SEEDS: Record<OccasionType, Seed[]> = {
  birthday: [
    { name: "Paper plates and cups", category: "Food & Drink", estPrice: 9, serves: 8 },
    { name: "Napkins and utensils", category: "Food & Drink", estPrice: 6, serves: 12 },
    { name: "Assorted drinks", category: "Food & Drink", estPrice: 15, serves: 6 },
    { name: "Birthday candles", category: "Cake & Desserts", estPrice: 4 },
    { name: "Party favor bags", category: "Favors", estPrice: 8, serves: 6 },
  ],
  "baby-shower": [
    { name: "Cocktail napkins", category: "Food & Drink", estPrice: 5, serves: 10 },
    { name: "Sparkling drinks (non-alc)", category: "Food & Drink", estPrice: 12, serves: 6 },
    { name: "Small dessert plates", category: "Food & Drink", estPrice: 8, serves: 10 },
    { name: "Guest thank-you favors", category: "Favors", estPrice: 6, serves: 4 },
  ],
  graduation: [
    { name: "Sturdy dinner plates", category: "Food & Drink", estPrice: 10, serves: 8 },
    { name: "Bulk drinks (cases)", category: "Food & Drink", estPrice: 18, serves: 12 },
    { name: "Serving trays", category: "Food & Drink", estPrice: 12, serves: 20 },
    { name: "Grad photo prop kit", category: "Entertainment", estPrice: 20 },
  ],
  holiday: [
    { name: "Holiday napkins", category: "Food & Drink", estPrice: 6, serves: 10 },
    { name: "Wine and mixers", category: "Food & Drink", estPrice: 25, serves: 6 },
    { name: "Dessert plates", category: "Food & Drink", estPrice: 8, serves: 10 },
  ],
  "dinner-party": [
    { name: "Fresh bread from the bakery", category: "Food & Drink", estPrice: 8 },
    { name: "Wine for the table", category: "Food & Drink", estPrice: 22, serves: 4 },
    { name: "Cheese board ingredients", category: "Food & Drink", estPrice: 30 },
  ],
  other: [
    { name: "Plates, cups, napkins", category: "Food & Drink", estPrice: 12, serves: 10 },
    { name: "Assorted drinks", category: "Food & Drink", estPrice: 15, serves: 8 },
  ],
};

// Theme-specific add-ons, keyed by theme id
const THEME_SEEDS: Record<string, Seed[]> = {
  "unicorn-rainbow": [
    { name: "Rainbow balloon arch kit", category: "Decorations", estPrice: 35 },
    { name: "Iridescent tablecloth", category: "Decorations", estPrice: 15 },
    { name: "Unicorn tableware pack", category: "Decorations", estPrice: 7, serves: 8 },
    { name: "Star fairy lights", category: "Decorations", estPrice: 12 },
    { name: "Rainbow confetti", category: "Decorations", estPrice: 6 },
    { name: "Cotton candy cloud favors", category: "Favors", estPrice: 10, serves: 6 },
    { name: "Unicorn party favor kits", category: "Favors", estPrice: 8, serves: 6 },
  ],
  "dinosaur-dig": [
    { name: "Green and brown balloon garland", category: "Decorations", estPrice: 28 },
    { name: "Toy dinosaur set", category: "Decorations", estPrice: 15 },
    { name: "Potted ferns", category: "Decorations", estPrice: 12, serves: 6 },
    { name: "Dino dig kit favors", category: "Favors", estPrice: 6, serves: 1 },
  ],
  "superhero-city": [
    { name: "Primary color balloon column", category: "Decorations", estPrice: 30 },
    { name: "Cape and mask kits", category: "Favors", estPrice: 7, serves: 1 },
    { name: "Comic-strip table runner", category: "Decorations", estPrice: 10 },
  ],
  "under-the-sea": [
    { name: "Mermaid balloon garland", category: "Decorations", estPrice: 28 },
    { name: "Shells and starfish mix", category: "Decorations", estPrice: 10 },
    { name: "Bubble machine", category: "Entertainment", estPrice: 25 },
    { name: "Sand bucket favors", category: "Favors", estPrice: 5, serves: 1 },
  ],
  "garden-tea-party": [
    { name: "Mismatched teacups", category: "Decorations", estPrice: 4, serves: 1 },
    { name: "Fresh cut flowers", category: "Decorations", estPrice: 20 },
    { name: "Tiered dessert stand", category: "Cake & Desserts", estPrice: 22 },
    { name: "Lace tablecloth", category: "Decorations", estPrice: 18 },
  ],
  "neon-glow": [
    { name: "Blacklight bulbs", category: "Decorations", estPrice: 14, serves: 6 },
    { name: "Glow-stick bracelets", category: "Favors", estPrice: 6, serves: 8 },
    { name: "Neon paint splatter posters", category: "Decorations", estPrice: 12 },
  ],
  "boho-neutrals": [
    { name: "Pampas grass bundles", category: "Decorations", estPrice: 18 },
    { name: "Macramé wall hanging", category: "Decorations", estPrice: 35 },
    { name: "Terracotta pot favors", category: "Favors", estPrice: 4, serves: 1 },
  ],
  "twinkle-twinkle": [
    { name: "Star fairy lights", category: "Decorations", estPrice: 14 },
    { name: "Moon-and-stars balloon cluster", category: "Decorations", estPrice: 22 },
    { name: "Star sugar cookie favors", category: "Favors", estPrice: 3, serves: 1 },
  ],
  "wild-one-safari": [
    { name: "Animal print napkins", category: "Food & Drink", estPrice: 7, serves: 12 },
    { name: "Plush safari animals", category: "Decorations", estPrice: 15, serves: 6 },
    { name: "Terracotta balloon arch", category: "Decorations", estPrice: 32 },
  ],
  "petals-and-pastels": [
    { name: "Bud vases", category: "Decorations", estPrice: 3, serves: 2 },
    { name: "Pastel balloon cloud", category: "Decorations", estPrice: 26 },
    { name: "Succulent favors", category: "Favors", estPrice: 5, serves: 1 },
  ],
  "gold-and-glory": [
    { name: "Gold sequin table runner", category: "Decorations", estPrice: 16 },
    { name: "Champagne flutes", category: "Food & Drink", estPrice: 3, serves: 1 },
    { name: "Class-of foil banner", category: "Decorations", estPrice: 12 },
    { name: "Diploma cookie favors", category: "Favors", estPrice: 4, serves: 1 },
  ],
  "backyard-fiesta": [
    { name: "Papel picado banners", category: "Decorations", estPrice: 14, serves: 15 },
    { name: "Cactus centerpieces", category: "Decorations", estPrice: 12, serves: 8 },
    { name: "Woven table blanket", category: "Decorations", estPrice: 28 },
    { name: "Mini piñata favors", category: "Favors", estPrice: 6, serves: 1 },
    { name: "String lights (long)", category: "Decorations", estPrice: 22 },
  ],
  "retro-yearbook": [
    { name: "Cream and red balloon garland", category: "Decorations", estPrice: 26 },
    { name: "Polaroid film pack", category: "Entertainment", estPrice: 20 },
    { name: "Cassette tape cookies", category: "Favors", estPrice: 3, serves: 1 },
  ],
  "winter-wonderland": [
    { name: "White faux fur runner", category: "Decorations", estPrice: 22 },
    { name: "Silver taper candles", category: "Decorations", estPrice: 3, serves: 2 },
    { name: "Snowball truffle favors", category: "Favors", estPrice: 4, serves: 1 },
  ],
  "cozy-cabin": [
    { name: "Buffalo plaid tablecloth", category: "Decorations", estPrice: 18 },
    { name: "Pinecones and evergreen sprigs", category: "Decorations", estPrice: 10 },
    { name: "Hot cocoa bar supplies", category: "Food & Drink", estPrice: 24, serves: 8 },
  ],
  "sparkle-and-shine": [
    { name: "Mini disco balls", category: "Decorations", estPrice: 8, serves: 4 },
    { name: "Gold taper candles", category: "Decorations", estPrice: 3, serves: 2 },
    { name: "Fringe curtain backdrop", category: "Decorations", estPrice: 18 },
  ],
  "tuscan-table": [
    { name: "Terracotta serving platters", category: "Decorations", estPrice: 14, serves: 6 },
    { name: "Olive branches", category: "Decorations", estPrice: 12 },
    { name: "Beeswax taper candles", category: "Decorations", estPrice: 3, serves: 2 },
  ],
  "modern-candlelight": [
    { name: "Brass taper candlesticks", category: "Decorations", estPrice: 9, serves: 2 },
    { name: "Burgundy taper candles", category: "Decorations", estPrice: 3, serves: 2 },
    { name: "Black linen tablecloth", category: "Decorations", estPrice: 26 },
  ],
  "garden-bistro": [
    { name: "White tablecloth", category: "Decorations", estPrice: 18 },
    { name: "Potted herb centerpieces", category: "Decorations", estPrice: 8, serves: 4 },
    { name: "Warm string lights", category: "Decorations", estPrice: 22 },
  ],
};

const uid = () => Math.random().toString(36).slice(2, 10);

export function generateShoppingItems(
  occasion: OccasionType,
  themeId: string | undefined,
  guests: number,
): ShoppingItem[] {
  const seeds: Seed[] = [
    ...(OCCASION_SEEDS[occasion] ?? OCCASION_SEEDS.other),
    ...(themeId && THEME_SEEDS[themeId] ? THEME_SEEDS[themeId] : []),
  ];
  return seeds.map((s) => ({
    id: uid(),
    name: s.name,
    category: s.category,
    qty: s.serves ? Math.max(1, Math.ceil(guests / s.serves)) : 1,
    estPrice: s.estPrice,
    status: "needed" as const,
  }));
}

export const STATUS_LABEL: Record<ShoppingStatus, string> = {
  needed: "Needed",
  "in-cart": "In cart",
  purchased: "Purchased",
};
