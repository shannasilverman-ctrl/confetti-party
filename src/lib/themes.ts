import type { OccasionType, Bucket } from "./party-context";

export type DecorIdea = { title: string; kind: "DIY" | "Buy"; bucket: Bucket; estPrice: number };

export type SetupZone = {
  key: "entry" | "food" | "activity" | "photo";
  label: string;
  instruction: string;
  minutesBefore: number;
};

export type Theme = {
  id: string;
  occasion: OccasionType;
  name: string;
  vibe: string;
  palette: [string, string, string, string]; // 4 HSL swatches
  heroImage: string;
  visionBoard: { table: string; decor: string; dessert: string };
  inspiration?: { entry: string; activity: string; photoSpot: string };
  decorIdeas: DecorIdea[];
  stylingTips: [string, string, string];
  setup: [SetupZone, SetupZone, SetupZone, SetupZone];
};

// --- image imports (all pre-generated into src/assets/themes) ---
import unicornHero from "@/assets/themes/unicorn-rainbow.jpg";
import unicornTable from "@/assets/themes/unicorn-rainbow-table.jpg";
import unicornDecor from "@/assets/themes/unicorn-rainbow-decor.jpg";
import unicornDessert from "@/assets/themes/unicorn-rainbow-dessert.jpg";
import unicornEntry from "@/assets/themes/unicorn-rainbow-entry.jpg";
import unicornActivity from "@/assets/themes/unicorn-rainbow-activity.jpg";
import unicornPhoto from "@/assets/themes/unicorn-rainbow-photo.jpg";

import dinoHero from "@/assets/themes/dinosaur-dig.jpg";
import dinoTable from "@/assets/themes/dinosaur-dig-table.jpg";
import dinoDecor from "@/assets/themes/dinosaur-dig-decor.jpg";
import dinoDessert from "@/assets/themes/dinosaur-dig-dessert.jpg";

import superHero from "@/assets/themes/superhero-city.jpg";
import superTable from "@/assets/themes/superhero-city-table.jpg";
import superDecor from "@/assets/themes/superhero-city-decor.jpg";
import superDessert from "@/assets/themes/superhero-city-dessert.jpg";

import seaHero from "@/assets/themes/under-the-sea.jpg";
import seaTable from "@/assets/themes/under-the-sea-table.jpg";
import seaDecor from "@/assets/themes/under-the-sea-decor.jpg";
import seaDessert from "@/assets/themes/under-the-sea-dessert.jpg";

import teaHero from "@/assets/themes/garden-tea-party.jpg";
import teaTable from "@/assets/themes/garden-tea-party-table.jpg";
import teaDecor from "@/assets/themes/garden-tea-party-decor.jpg";
import teaDessert from "@/assets/themes/garden-tea-party-dessert.jpg";

import neonHero from "@/assets/themes/neon-glow.jpg";
import neonTable from "@/assets/themes/neon-glow-table.jpg";
import neonDecor from "@/assets/themes/neon-glow-decor.jpg";
import neonDessert from "@/assets/themes/neon-glow-dessert.jpg";

import bohoHero from "@/assets/themes/boho-neutrals.jpg";
import bohoTable from "@/assets/themes/boho-neutrals-table.jpg";
import bohoDecor from "@/assets/themes/boho-neutrals-decor.jpg";
import bohoDessert from "@/assets/themes/boho-neutrals-dessert.jpg";

import twinkleHero from "@/assets/themes/twinkle-twinkle.jpg";
import twinkleTable from "@/assets/themes/twinkle-twinkle-table.jpg";
import twinkleDecor from "@/assets/themes/twinkle-twinkle-decor.jpg";
import twinkleDessert from "@/assets/themes/twinkle-twinkle-dessert.jpg";

import safariHero from "@/assets/themes/wild-one-safari.jpg";
import safariTable from "@/assets/themes/wild-one-safari-table.jpg";
import safariDecor from "@/assets/themes/wild-one-safari-decor.jpg";
import safariDessert from "@/assets/themes/wild-one-safari-dessert.jpg";

import petalsHero from "@/assets/themes/petals-and-pastels.jpg";
import petalsTable from "@/assets/themes/petals-and-pastels-table.jpg";
import petalsDecor from "@/assets/themes/petals-and-pastels-decor.jpg";
import petalsDessert from "@/assets/themes/petals-and-pastels-dessert.jpg";

import gloryHero from "@/assets/themes/gold-and-glory.jpg";
import gloryTable from "@/assets/themes/gold-and-glory-table.jpg";
import gloryDecor from "@/assets/themes/gold-and-glory-decor.jpg";
import gloryDessert from "@/assets/themes/gold-and-glory-dessert.jpg";

import fiestaHero from "@/assets/themes/backyard-fiesta.jpg";
import fiestaTable from "@/assets/themes/backyard-fiesta-table.jpg";
import fiestaDecor from "@/assets/themes/backyard-fiesta-decor.jpg";
import fiestaDessert from "@/assets/themes/backyard-fiesta-dessert.jpg";
import fiestaEntry from "@/assets/themes/backyard-fiesta-entry.jpg";
import fiestaActivity from "@/assets/themes/backyard-fiesta-activity.jpg";
import fiestaPhoto from "@/assets/themes/backyard-fiesta-photo.jpg";

import retroHero from "@/assets/themes/retro-yearbook.jpg";
import retroTable from "@/assets/themes/retro-yearbook-table.jpg";
import retroDecor from "@/assets/themes/retro-yearbook-decor.jpg";
import retroDessert from "@/assets/themes/retro-yearbook-dessert.jpg";

import winterHero from "@/assets/themes/winter-wonderland.jpg";
import winterTable from "@/assets/themes/winter-wonderland-table.jpg";
import winterDecor from "@/assets/themes/winter-wonderland-decor.jpg";
import winterDessert from "@/assets/themes/winter-wonderland-dessert.jpg";

import cabinHero from "@/assets/themes/cozy-cabin.jpg";
import cabinTable from "@/assets/themes/cozy-cabin-table.jpg";
import cabinDecor from "@/assets/themes/cozy-cabin-decor.jpg";
import cabinDessert from "@/assets/themes/cozy-cabin-dessert.jpg";

import sparkleHero from "@/assets/themes/sparkle-and-shine.jpg";
import sparkleTable from "@/assets/themes/sparkle-and-shine-table.jpg";
import sparkleDecor from "@/assets/themes/sparkle-and-shine-decor.jpg";
import sparkleDessert from "@/assets/themes/sparkle-and-shine-dessert.jpg";

import tuscanHero from "@/assets/themes/tuscan-table.jpg";
import tuscanTable from "@/assets/themes/tuscan-table-table.jpg";
import tuscanDecor from "@/assets/themes/tuscan-table-decor.jpg";
import tuscanDessert from "@/assets/themes/tuscan-table-dessert.jpg";

import candleHero from "@/assets/themes/modern-candlelight.jpg";
import candleTable from "@/assets/themes/modern-candlelight-table.jpg";
import candleDecor from "@/assets/themes/modern-candlelight-decor.jpg";
import candleDessert from "@/assets/themes/modern-candlelight-dessert.jpg";

import bistroHero from "@/assets/themes/garden-bistro.jpg";
import bistroTable from "@/assets/themes/garden-bistro-table.jpg";
import bistroDecor from "@/assets/themes/garden-bistro-decor.jpg";
import bistroDessert from "@/assets/themes/garden-bistro-dessert.jpg";

const zones = (
  entry: string,
  food: string,
  activity: string,
  photo: string,
): [SetupZone, SetupZone, SetupZone, SetupZone] => [
  { key: "entry", label: "Entry moment", instruction: entry, minutesBefore: 45 },
  { key: "food", label: "Food & drink table", instruction: food, minutesBefore: 60 },
  { key: "activity", label: "Activity area", instruction: activity, minutesBefore: 30 },
  { key: "photo", label: "Photo spot", instruction: photo, minutesBefore: 90 },
];

export const THEMES: Theme[] = [
  // ---------- BIRTHDAY ----------
  {
    id: "unicorn-rainbow",
    occasion: "birthday",
    name: "Unicorn Rainbow",
    vibe: "Pastel magic with rainbow arches and iridescent sparkle.",
    palette: ["hsl(340 85% 75%)", "hsl(200 80% 72%)", "hsl(50 95% 70%)", "hsl(280 60% 78%)"],
    heroImage: unicornHero,
    visionBoard: { table: unicornTable, decor: unicornDecor, dessert: unicornDessert },
    inspiration: { entry: unicornEntry, activity: unicornActivity, photoSpot: unicornPhoto },
    decorIdeas: [
      { title: "Rainbow balloon arch over the entry", kind: "Buy", bucket: "1-2 weeks", estPrice: 28 },
      { title: "Iridescent tablecloth on the main table", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "DIY unicorn horn headbands for guests", kind: "DIY", bucket: "1-2 weeks", estPrice: 15 },
      { title: "Cloud-shaped paper napkin rings", kind: "DIY", bucket: "Party week", estPrice: 10 },
      { title: "Hang pastel streamers as a rainbow backdrop", kind: "DIY", bucket: "Day of", estPrice: 20 },
      { title: "Star-shaped fairy lights around the dessert table", kind: "Buy", bucket: "1-2 weeks", estPrice: 22 },
      { title: "Sprinkle rainbow confetti down the table runner", kind: "Buy", bucket: "Day of", estPrice: 18 },
      { title: "Cotton candy in mini clouds for favors", kind: "Buy", bucket: "Party week", estPrice: 15 },
      { title: "Unicorn-themed tableware set", kind: "Buy", bucket: "1-2 weeks", estPrice: 15 },
    ],
    stylingTips: [
      "Layer three shades of pink on the table for depth.",
      "Keep balloons in odd-numbered clusters, 3, 5, 7.",
      "Hide the boring stuff (drinks cooler, trash) behind a streamer curtain.",
    ],
    setup: zones(
      "Anchor the balloon arch to two chairs framing the front door; tuck a welcome sign at kid-eye level.",
      "Layer the iridescent cloth, then a white runner, then rainbow confetti; cluster desserts on tiered stands at the center.",
      "Set up the face-painting station on a small side table with a mirror and a labeled color chart.",
      "Hang the pastel streamer backdrop against a blank wall in bright, indirect light, take a test photo before guests arrive.",
    ),

  },
  {
    id: "dinosaur-dig",
    occasion: "birthday",
    name: "Dinosaur Dig",
    vibe: "Earthy jungle greens and rust with prehistoric adventure.",
    palette: ["hsl(90 30% 40%)", "hsl(25 55% 45%)", "hsl(45 65% 70%)", "hsl(15 25% 25%)"],
    heroImage: dinoHero,
    visionBoard: { table: dinoTable, decor: dinoDecor, dessert: dinoDessert },
    decorIdeas: [
      { title: "Kraft paper table runner with dino footprints", kind: "DIY", bucket: "Party week", estPrice: 18 },
      { title: "Potted ferns and moss down the center", kind: "Buy", bucket: "1-2 weeks", estPrice: 16 },
      { title: "Dino excavation dig kits as favors", kind: "Buy", bucket: "3-5 weeks", estPrice: 22 },
      { title: "Cave entrance made from a brown sheet at the door", kind: "DIY", bucket: "Party week", estPrice: 15 },
      { title: "Toy dinosaurs scattered across the table", kind: "Buy", bucket: "1-2 weeks", estPrice: 22 },
      { title: "Volcano cupcake tower with red-orange frosting", kind: "DIY", bucket: "Day of", estPrice: 18 },
      { title: "Green and brown balloon garland", kind: "Buy", bucket: "1-2 weeks", estPrice: 28 },
      { title: "Chalkboard 'Danger: Dino Zone' entry sign", kind: "DIY", bucket: "1-2 weeks", estPrice: 22 },
    ],
    stylingTips: [
      "Mix textures, burlap, moss, kraft paper, for a natural feel.",
      "Skip bright primary greens; stick to sage and olive.",
      "A single big prop (T-rex balloon) beats twenty small ones.",
    ],
    setup: zones(
      "Drape a brown sheet as a cave entrance and post the 'Danger: Dino Zone' sign at kid height.",
      "Layer kraft paper, then ferns and moss down the center, and tuck toy dinos between platters.",
      "Set up the dig kit table with plastic bins of sand and small brushes at each seat.",
      "Stage the T-rex balloon against a leafy corner with soft daylight for the best photos.",
    ),
  },
  {
    id: "superhero-city",
    occasion: "birthday",
    name: "Superhero City",
    vibe: "Comic-book pops of primary color with skyline silhouettes.",
    palette: ["hsl(0 82% 55%)", "hsl(220 85% 50%)", "hsl(50 95% 55%)", "hsl(0 0% 15%)"],
    heroImage: superHero,
    visionBoard: { table: superTable, decor: superDecor, dessert: superDessert },
    decorIdeas: [
      { title: "Comic-book POW / ZAP paper cutouts on the walls", kind: "DIY", bucket: "1-2 weeks", estPrice: 10 },
      { title: "Red, blue, and yellow balloon column at the door", kind: "Buy", bucket: "1-2 weeks", estPrice: 28 },
      { title: "Cape and mask kit for each guest", kind: "Buy", bucket: "3-5 weeks", estPrice: 15 },
      { title: "City skyline silhouette on kraft paper backdrop", kind: "DIY", bucket: "1-2 weeks", estPrice: 20 },
      { title: "Superhero-logo cookies on the dessert table", kind: "Buy", bucket: "Party week", estPrice: 18 },
      { title: "'Training academy' obstacle course in the yard", kind: "DIY", bucket: "Day of", estPrice: 15 },
      { title: "Comic-strip printed table runner", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Phone-booth photo prop by the entry", kind: "DIY", bucket: "1-2 weeks", estPrice: 22 },
    ],
    stylingTips: [
      "Use bold black outlines on every printable to feel like a comic panel.",
      "Balance red and blue evenly so neither dominates.",
      "Halftone dot patterns as accents feel more comic-book than logos.",
    ],
    setup: zones(
      "Stack the balloon column beside the door and hand out capes as guests arrive.",
      "Roll out the comic-strip runner, then arrange logo cookies and drinks in labeled 'city zones'.",
      "Chalk the obstacle course in the yard and stage props at each station.",
      "Set the phone-booth prop in front of the skyline backdrop with a chair for group shots.",
    ),
  },
  {
    id: "under-the-sea",
    occasion: "birthday",
    name: "Under the Sea",
    vibe: "Ocean blues, coral pinks, and shimmering scale patterns.",
    palette: ["hsl(200 75% 55%)", "hsl(180 55% 65%)", "hsl(340 70% 72%)", "hsl(50 80% 68%)"],
    heroImage: seaHero,
    visionBoard: { table: seaTable, decor: seaDecor, dessert: seaDessert },
    decorIdeas: [
      { title: "Blue crepe paper 'waves' along the table edge", kind: "DIY", bucket: "Party week", estPrice: 10 },
      { title: "Mermaid-tail balloon garland", kind: "Buy", bucket: "1-2 weeks", estPrice: 28 },
      { title: "Shells and starfish scattered as table confetti", kind: "Buy", bucket: "1-2 weeks", estPrice: 12 },
      { title: "Hanging paper jellyfish above the food table", kind: "DIY", bucket: "1-2 weeks", estPrice: 10 },
      { title: "Bubble machine near the entry", kind: "Buy", bucket: "3-5 weeks", estPrice: 32 },
      { title: "Ombre blue drinks with pineapple 'seaweed' garnish", kind: "DIY", bucket: "Day of", estPrice: 18 },
      { title: "Fishnet draped as a backdrop with paper fish", kind: "DIY", bucket: "1-2 weeks", estPrice: 20 },
      { title: "Sand-bucket favor holders", kind: "Buy", bucket: "Party week", estPrice: 15 },
    ],
    stylingTips: [
      "Combine three blues, pale, teal, deep, for real ocean depth.",
      "Iridescent film catches light exactly like water.",
      "A bubble machine does the work of ten decorations.",
    ],
    setup: zones(
      "Position the bubble machine at the door on low so kids walk through a soft haze.",
      "Lay the wave runner, place shells and starfish along the center, and set drinks in an ice-filled sand bucket.",
      "Roll out a blue rug for the 'sea floor' activity zone and stack sand pails with tools.",
      "Hang the fishnet backdrop and jellyfish in a corner with fairy lights for shimmer.",
    ),
  },
  {
    id: "garden-tea-party",
    occasion: "birthday",
    name: "Garden Tea Party",
    vibe: "Soft florals, vintage china, and afternoon-light pastels.",
    palette: ["hsl(340 55% 82%)", "hsl(90 35% 72%)", "hsl(45 70% 82%)", "hsl(20 40% 70%)"],
    heroImage: teaHero,
    visionBoard: { table: teaTable, decor: teaDecor, dessert: teaDessert },
    decorIdeas: [
      { title: "Mismatched vintage teacups from the thrift store", kind: "Buy", bucket: "3-5 weeks", estPrice: 14 },
      { title: "Fresh cut flowers in mason jars", kind: "Buy", bucket: "Party week", estPrice: 16 },
      { title: "Tiered dessert stands with mini scones", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Lace tablecloth layered over linen", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Handwritten place cards on kraft tags", kind: "DIY", bucket: "Party week", estPrice: 10 },
      { title: "Floral crown-making station for guests", kind: "DIY", bucket: "1-2 weeks", estPrice: 15 },
      { title: "String lights woven through nearby branches", kind: "Buy", bucket: "1-2 weeks", estPrice: 22 },
      { title: "Cucumber and berry infused water in glass pitchers", kind: "DIY", bucket: "Day of", estPrice: 18 },
    ],
    stylingTips: [
      "Odd numbers of flowers per jar feel less staged.",
      "Mix warm and cool pastels, pure pink alone looks flat.",
      "Skip plastic, even paper straws break the vintage feel.",
    ],
    setup: zones(
      "Line the walkway with mason jar flowers and hang a small welcome wreath on the door.",
      "Iron the linen, layer the lace, then stage the tiered stands loaded with scones and finger sandwiches.",
      "Set up the flower crown table with wire, ribbon, and pre-cut blooms in shallow trays.",
      "Angle a bench beneath the string lights for group photos in warm afternoon light.",
    ),
  },
  {
    id: "neon-glow",
    occasion: "birthday",
    name: "Neon Glow",
    vibe: "Blacklight-reactive pinks, greens, and cyan for after-dark energy.",
    palette: ["hsl(320 100% 60%)", "hsl(140 90% 55%)", "hsl(180 100% 55%)", "hsl(280 90% 60%)"],
    heroImage: neonHero,
    visionBoard: { table: neonTable, decor: neonDecor, dessert: neonDessert },
    decorIdeas: [
      { title: "Blacklight bulbs in every lamp", kind: "Buy", bucket: "3-5 weeks", estPrice: 22 },
      { title: "Glow-stick bracelets in a bowl at the door", kind: "Buy", bucket: "1-2 weeks", estPrice: 15 },
      { title: "White table linens (they glow under UV)", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Neon paint splatter poster backdrop", kind: "DIY", bucket: "1-2 weeks", estPrice: 20 },
      { title: "Tonic-water drinks (they fluoresce)", kind: "Buy", bucket: "Party week", estPrice: 18 },
      { title: "Neon duct tape geometric shapes on the walls", kind: "DIY", bucket: "Party week", estPrice: 8 },
      { title: "White balloons with neon painted stripes", kind: "DIY", bucket: "Day of", estPrice: 12 },
      { title: "Highlighter pens for glow-in-the-dark signatures", kind: "Buy", bucket: "1-2 weeks", estPrice: 15 },
    ],
    stylingTips: [
      "Test the blacklights in daylight first, position matters more than count.",
      "White surfaces glow brighter than any colored one.",
      "Turn off overhead lights entirely; keep only the UV.",
    ],
    setup: zones(
      "Fill the door bowl with glow sticks and swap the entry lamp for a blacklight bulb.",
      "Dress the table in white, sprinkle glow confetti, and pour tonic drinks into clear glasses ready to serve.",
      "Tape neon shapes on one wall as a glow dance floor with a portable speaker nearby.",
      "Hang the splatter backdrop opposite a blacklight and prop up highlighter pens on a small stool.",
    ),
  },

  // ---------- BABY SHOWER ----------
  {
    id: "boho-neutrals",
    occasion: "baby-shower",
    name: "Boho Neutrals",
    vibe: "Warm sand tones, pampas grass, and macramé softness.",
    palette: ["hsl(30 30% 82%)", "hsl(25 25% 65%)", "hsl(20 20% 40%)", "hsl(45 40% 88%)"],
    heroImage: bohoHero,
    visionBoard: { table: bohoTable, decor: bohoDecor, dessert: bohoDessert },
    decorIdeas: [
      { title: "Pampas grass in tall glass vases", kind: "Buy", bucket: "3-5 weeks", estPrice: 16 },
      { title: "Macramé wall hanging as backdrop", kind: "Buy", bucket: "3-5 weeks", estPrice: 20 },
      { title: "Linen napkins tied with jute twine", kind: "DIY", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Terracotta mini pots as favors", kind: "Buy", bucket: "3-5 weeks", estPrice: 16 },
      { title: "Wooden slice charger plates", kind: "Buy", bucket: "1-2 weeks", estPrice: 14 },
      { title: "Nude and cream balloon garland", kind: "Buy", bucket: "1-2 weeks", estPrice: 28 },
      { title: "Rattan pendant lights above the table", kind: "Buy", bucket: "1-2 weeks", estPrice: 15 },
      { title: "Handwritten kraft-paper name cards", kind: "DIY", bucket: "Party week", estPrice: 10 },
    ],
    stylingTips: [
      "Stay within one warm undertone, no cool greys.",
      "Natural materials only: wood, rattan, linen, dried florals.",
      "Vary heights of vases dramatically for real drama.",
    ],
    setup: zones(
      "Prop the macramé hanging by the door with a small dried flower bundle at its base.",
      "Layer linen, arrange wooden slices, then place pampas vases at three staggered heights.",
      "Set the terracotta pot painting station with acrylics, brushes, and drop cloths.",
      "Hang the rattan pendant over a wide bench and drape a linen throw for warmth in photos.",
    ),
  },
  {
    id: "twinkle-twinkle",
    occasion: "baby-shower",
    name: "Twinkle Twinkle",
    vibe: "Dreamy night sky in navy, cream, and starry gold.",
    palette: ["hsl(230 55% 22%)", "hsl(45 75% 65%)", "hsl(40 40% 92%)", "hsl(220 30% 55%)"],
    heroImage: twinkleHero,
    visionBoard: { table: twinkleTable, decor: twinkleDecor, dessert: twinkleDessert },
    decorIdeas: [
      { title: "Navy tablecloth with gold star confetti", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Star-shaped fairy lights strung overhead", kind: "Buy", bucket: "1-2 weeks", estPrice: 22 },
      { title: "Moon-and-stars balloon cluster", kind: "Buy", bucket: "1-2 weeks", estPrice: 28 },
      { title: "'Twinkle twinkle little star' banner", kind: "Buy", bucket: "3-5 weeks", estPrice: 20 },
      { title: "Star-cutout sugar cookies as favors", kind: "Buy", bucket: "Party week", estPrice: 18 },
      { title: "Cloud-shaped cake with gold star topper", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Gold-dipped taper candles", kind: "Buy", bucket: "1-2 weeks", estPrice: 14 },
      { title: "Constellation printable place cards", kind: "DIY", bucket: "Party week", estPrice: 10 },
    ],
    stylingTips: [
      "Use warm gold, never yellow-gold, against the navy.",
      "Group candles in threes for a soft glow instead of overhead lighting.",
      "Metallic accents work best in small doses, a rim, a rope, a topper.",
    ],
    setup: zones(
      "Hang the banner across the door and cluster the moon-and-stars balloons on one side.",
      "Lay the navy cloth, scatter gold stars, and light the taper candles just before guests arrive.",
      "Stage a wish-card station where guests write hopes for the baby on star-shaped cards.",
      "Drape star lights behind a soft chair for a warm nighttime portrait spot.",
    ),
  },
  {
    id: "wild-one-safari",
    occasion: "baby-shower",
    name: "Wild One Safari",
    vibe: "Sunset savanna oranges with playful animal prints.",
    palette: ["hsl(30 75% 60%)", "hsl(15 60% 45%)", "hsl(45 55% 78%)", "hsl(20 30% 30%)"],
    heroImage: safariHero,
    visionBoard: { table: safariTable, decor: safariDecor, dessert: safariDessert },
    decorIdeas: [
      { title: "Animal-print paper napkins", kind: "Buy", bucket: "1-2 weeks", estPrice: 14 },
      { title: "Plush safari animals as centerpieces", kind: "Buy", bucket: "3-5 weeks", estPrice: 16 },
      { title: "Fringe tablecloth in golden tan", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Palm leaves down the table runner", kind: "Buy", bucket: "Party week", estPrice: 18 },
      { title: "'Wild One' banner over the cake", kind: "Buy", bucket: "1-2 weeks", estPrice: 20 },
      { title: "Zebra-striped straws in drinks", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Terracotta and orange balloon arch", kind: "Buy", bucket: "1-2 weeks", estPrice: 28 },
      { title: "Safari cracker treat bags for favors", kind: "DIY", bucket: "Party week", estPrice: 18 },
    ],
    stylingTips: [
      "Warm oranges and tans should outweigh the animal prints.",
      "Real palm fronds beat plastic every time.",
      "Group plush animals in threes at different heights.",
    ],
    setup: zones(
      "Set the balloon arch by the door and prop a plush lion at the base as a greeter.",
      "Roll out palm leaves down the center and stack plush animals on wooden crates.",
      "Set up a onesie-decorating table with fabric markers and animal stencils.",
      "Frame the 'Wild One' banner behind a rattan chair for the guest of honor's portrait.",
    ),
  },
  {
    id: "petals-and-pastels",
    occasion: "baby-shower",
    name: "Petals and Pastels",
    vibe: "Soft blush, sage, and butter yellow with fresh florals.",
    palette: ["hsl(340 55% 85%)", "hsl(100 25% 72%)", "hsl(50 80% 82%)", "hsl(0 0% 100%)"],
    heroImage: petalsHero,
    visionBoard: { table: petalsTable, decor: petalsDecor, dessert: petalsDessert },
    decorIdeas: [
      { title: "Bud vases in a line down the table", kind: "Buy", bucket: "1-2 weeks", estPrice: 16 },
      { title: "Pastel balloon cloud in the corner", kind: "Buy", bucket: "1-2 weeks", estPrice: 28 },
      { title: "Petal-scattered white table runner", kind: "DIY", bucket: "Day of", estPrice: 18 },
      { title: "Watercolor-printed menu cards", kind: "DIY", bucket: "Party week", estPrice: 18 },
      { title: "Flower-shaped shortbread cookies", kind: "Buy", bucket: "Party week", estPrice: 18 },
      { title: "Blush ribbon backdrop", kind: "DIY", bucket: "1-2 weeks", estPrice: 20 },
      { title: "Small potted succulents as favors", kind: "Buy", bucket: "3-5 weeks", estPrice: 16 },
      { title: "White linen napkins with sprig of eucalyptus", kind: "DIY", bucket: "Day of", estPrice: 18 },
    ],
    stylingTips: [
      "Anchor with white, pastels alone feel washed out.",
      "One statement flower type reads more elegant than a mix.",
      "Fresh petals scattered late in setup won't wilt.",
    ],
    setup: zones(
      "Tie a ribbon bow on the door and set a bud vase on the entry table with a folded welcome card.",
      "Layer white linen, line up bud vases with three flower stems each, and fold napkins with eucalyptus sprigs.",
      "Set the succulent favor table near the exit with tags and small watering cans as decor.",
      "Hang the ribbon backdrop and stage a chair with a linen throw and a fresh flower bouquet nearby.",
    ),
  },

  // ---------- GRADUATION ----------
  {
    id: "gold-and-glory",
    occasion: "graduation",
    name: "Gold and Glory",
    vibe: "Black tie meets confetti in deep black, champagne, and metallic gold.",
    palette: ["hsl(0 0% 8%)", "hsl(45 75% 55%)", "hsl(40 40% 92%)", "hsl(0 0% 100%)"],
    heroImage: gloryHero,
    visionBoard: { table: gloryTable, decor: gloryDecor, dessert: gloryDessert },
    decorIdeas: [
      { title: "Black tablecloth with gold sequin runner", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Champagne flute display for a toast", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Gold graduation cap balloons", kind: "Buy", bucket: "1-2 weeks", estPrice: 12 },
      { title: "'Class of' foil banner over the mantel", kind: "Buy", bucket: "3-5 weeks", estPrice: 20 },
      { title: "Photo wall of grad from K through 12", kind: "DIY", bucket: "1-2 weeks", estPrice: 15 },
      { title: "Gold-foil edged plates", kind: "Buy", bucket: "1-2 weeks", estPrice: 14 },
      { title: "Diploma-shaped cookies as favors", kind: "Buy", bucket: "Party week", estPrice: 18 },
      { title: "LED marquee letters spelling grad's initials", kind: "Buy", bucket: "3-5 weeks", estPrice: 45 },
    ],
    stylingTips: [
      "Contrast is everything, pure black next to bright gold pops.",
      "Real metallic beats matte 'gold' paint every time.",
      "Cluster the flutes as a display, not scattered.",
    ],
    setup: zones(
      "Set the marquee initials by the door with a small greeting sign underneath.",
      "Iron the black cloth, roll out the sequin runner, and stage the flutes in three tight rows.",
      "Set up a signing board or memory jar near the photo wall with gold pens ready.",
      "Hang the 'Class of' banner behind an armchair with the LED letters glowing beside it.",
    ),
  },
  {
    id: "backyard-fiesta",
    occasion: "graduation",
    name: "Backyard Fiesta",
    vibe: "Sun-warmed terracotta, pink, and marigold. Casual and loud.",
    palette: ["hsl(15 75% 55%)", "hsl(340 70% 65%)", "hsl(45 85% 58%)", "hsl(200 55% 55%)"],
    heroImage: fiestaHero,
    visionBoard: { table: fiestaTable, decor: fiestaDecor, dessert: fiestaDessert },
    inspiration: { entry: fiestaEntry, activity: fiestaActivity, photoSpot: fiestaPhoto },
    decorIdeas: [
      { title: "Papel picado banners strung across the yard", kind: "Buy", bucket: "3-5 weeks", estPrice: 20 },
      { title: "Cactus centerpieces in terracotta pots", kind: "Buy", bucket: "1-2 weeks", estPrice: 16 },
      { title: "Colorful woven blanket as tablecloth", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Margarita bar with fresh limes on display", kind: "DIY", bucket: "Day of", estPrice: 18 },
      { title: "Marigold blooms scattered along the runner", kind: "Buy", bucket: "Party week", estPrice: 18 },
      { title: "String lights zig-zagged overhead", kind: "Buy", bucket: "3-5 weeks", estPrice: 22 },
      { title: "Serape-striped napkins", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Mini piñata favors at each place setting", kind: "Buy", bucket: "1-2 weeks", estPrice: 20 },
    ],
    stylingTips: [
      "More is more, layer four colors, not two.",
      "Real cactus and marigold beat any printed motif.",
      "Overhead string lights transform any yard after sunset.",
    ],
    setup: zones(
      "Hang papel picado from the fence to the house and post a chalkboard welcome sign at the gate.",
      "Throw the woven blanket over the table, line up cactus pots, and set up the margarita bar at one end.",
      "Set out lawn games (cornhole, giant Jenga) with a drinks cooler nearby.",
      "String lights zig-zagged over a taco station make the best evening backdrop.",
    ),
  },
  {
    id: "retro-yearbook",
    occasion: "graduation",
    name: "Retro Yearbook",
    vibe: "'90s yearbook nostalgia in cream, cherry red, and denim blue.",
    palette: ["hsl(0 65% 55%)", "hsl(220 45% 40%)", "hsl(40 50% 90%)", "hsl(30 25% 30%)"],
    heroImage: retroHero,
    visionBoard: { table: retroTable, decor: retroDecor, dessert: retroDessert },
    decorIdeas: [
      { title: "Blown-up yearbook photos on the wall", kind: "DIY", bucket: "1-2 weeks", estPrice: 15 },
      { title: "Vintage lockers or trophies as props", kind: "DIY", bucket: "3-5 weeks", estPrice: 22 },
      { title: "Cream and cherry-red balloon garland", kind: "Buy", bucket: "1-2 weeks", estPrice: 28 },
      { title: "Notebook-paper printed table runner", kind: "DIY", bucket: "1-2 weeks", estPrice: 18 },
      { title: "'Sign my yearbook' guest book on the entry table", kind: "DIY", bucket: "1-2 weeks", estPrice: 10 },
      { title: "'90s hits playlist on a boombox prop", kind: "Buy", bucket: "3-5 weeks", estPrice: 32 },
      { title: "Cassette-tape shaped cookies", kind: "Buy", bucket: "Party week", estPrice: 18 },
      { title: "Polaroid camera and film for guest snapshots", kind: "Buy", bucket: "3-5 weeks", estPrice: 40 },
    ],
    stylingTips: [
      "Keep the palette tight, three colors max or it looks like a garage sale.",
      "Real vintage props beat 'retro-styled' new ones.",
      "Hand-lettered signs feel more authentic than printed fonts.",
    ],
    setup: zones(
      "Set the yearbook and pens on the entry table with a stack of Polaroid photos of the grad.",
      "Lay the notebook-paper runner, stage cream and red desserts, and prop the boombox nearby.",
      "Set up a photo strip station with the Polaroid camera and a bin of goofy props.",
      "Blow up the yearbook photo grid on one wall as an instant portrait backdrop.",
    ),
  },

  // ---------- HOLIDAY ----------
  {
    id: "winter-wonderland",
    occasion: "holiday",
    name: "Winter Wonderland",
    vibe: "Silver, icy blue, and snow-white with crystal sparkle.",
    palette: ["hsl(210 60% 90%)", "hsl(200 40% 70%)", "hsl(220 20% 30%)", "hsl(0 0% 100%)"],
    heroImage: winterHero,
    visionBoard: { table: winterTable, decor: winterDecor, dessert: winterDessert },
    decorIdeas: [
      { title: "White faux fur table runner", kind: "Buy", bucket: "1-2 weeks", estPrice: 24 },
      { title: "Crystal ornaments as place-setting accents", kind: "Buy", bucket: "1-2 weeks", estPrice: 15 },
      { title: "White paper snowflakes hanging from the ceiling", kind: "DIY", bucket: "1-2 weeks", estPrice: 15 },
      { title: "Bare branches spray-painted white in tall vases", kind: "DIY", bucket: "3-5 weeks", estPrice: 16 },
      { title: "Silver taper candles down the center", kind: "Buy", bucket: "1-2 weeks", estPrice: 14 },
      { title: "Snowflake-etched drinking glasses", kind: "Buy", bucket: "3-5 weeks", estPrice: 14 },
      { title: "Icy blue string lights along the mantel", kind: "Buy", bucket: "1-2 weeks", estPrice: 22 },
      { title: "White chocolate 'snowball' truffles as favors", kind: "Buy", bucket: "Party week", estPrice: 18 },
    ],
    stylingTips: [
      "Stick to cool whites, warm ivories break the icy mood.",
      "Silver, not gold, is the only metallic here.",
      "Real branches with lights beat fake trees.",
    ],
    setup: zones(
      "Hang paper snowflakes at three heights over the door and tuck white branches into an entry vase.",
      "Layer the fur runner, cluster candles with ornaments, and pre-fill snowflake glasses with water.",
      "Set up an ornament-decorating table with plain glass balls, paint pens, and ribbon.",
      "Drape blue lights over the mantel and place a fur throw on a nearby chair for portraits.",
    ),
  },
  {
    id: "cozy-cabin",
    occasion: "holiday",
    name: "Cozy Cabin",
    vibe: "Plaid, pinecones, and firelight warmth in forest and cranberry.",
    palette: ["hsl(0 55% 35%)", "hsl(120 25% 30%)", "hsl(40 50% 88%)", "hsl(25 40% 25%)"],
    heroImage: cabinHero,
    visionBoard: { table: cabinTable, decor: cabinDecor, dessert: cabinDessert },
    decorIdeas: [
      { title: "Red-and-black buffalo plaid tablecloth", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Pinecones and evergreen sprigs along the runner", kind: "DIY", bucket: "Party week", estPrice: 18 },
      { title: "Fireplace with real crackling wood", kind: "DIY", bucket: "Day of", estPrice: 0 },
      { title: "Hot cocoa bar with marshmallows and syrups", kind: "DIY", bucket: "Day of", estPrice: 18 },
      { title: "Wool blankets draped over every chair", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Lanterns with pillar candles on the porch", kind: "Buy", bucket: "1-2 weeks", estPrice: 22 },
      { title: "Wood-slice charger plates", kind: "Buy", bucket: "1-2 weeks", estPrice: 14 },
      { title: "Cinnamon-stick bundle napkin ties", kind: "DIY", bucket: "Party week", estPrice: 15 },
    ],
    stylingTips: [
      "Real evergreen scent trumps any candle.",
      "Layer three textures per surface, wool, wood, ceramic.",
      "Warm dim light only; no overhead bulbs.",
    ],
    setup: zones(
      "Light the porch lanterns and hang a small evergreen wreath on the door.",
      "Spread the plaid cloth, run evergreens and pinecones down the center, and top with wood chargers.",
      "Set the cocoa bar with mugs, marshmallows, syrups, and cinnamon sticks in a wooden crate.",
      "Build the fire an hour ahead so it's glowing steadily for photos on the hearthside rug.",
    ),
  },
  {
    id: "sparkle-and-shine",
    occasion: "holiday",
    name: "Sparkle and Shine",
    vibe: "Gold, champagne, and blush with disco-ball glamour.",
    palette: ["hsl(45 75% 55%)", "hsl(340 45% 78%)", "hsl(40 40% 92%)", "hsl(0 0% 12%)"],
    heroImage: sparkleHero,
    visionBoard: { table: sparkleTable, decor: sparkleDecor, dessert: sparkleDessert },
    decorIdeas: [
      { title: "Gold sequin table runner", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Small disco balls as centerpieces", kind: "Buy", bucket: "3-5 weeks", estPrice: 45 },
      { title: "Champagne tower on the sideboard", kind: "DIY", bucket: "Day of", estPrice: 18 },
      { title: "Gold-tipped taper candles", kind: "Buy", bucket: "1-2 weeks", estPrice: 14 },
      { title: "Blush balloon and gold star garland", kind: "Buy", bucket: "1-2 weeks", estPrice: 12 },
      { title: "Metallic gold cocktail napkins", kind: "Buy", bucket: "1-2 weeks", estPrice: 14 },
      { title: "'Cheers' foil banner over the bar", kind: "Buy", bucket: "3-5 weeks", estPrice: 20 },
      { title: "Fringe curtain backdrop in gold Mylar", kind: "Buy", bucket: "3-5 weeks", estPrice: 20 },
    ],
    stylingTips: [
      "Disco balls need one direct light source to sparkle properly.",
      "Blush softens gold, without it the room reads brassy.",
      "Group candles in threes at varying heights.",
    ],
    setup: zones(
      "Hang the fringe backdrop by the door and prop a small disco ball on the entry table.",
      "Roll out the sequin runner, arrange disco balls with candles, and stage the champagne tower.",
      "Set up the bar with 'Cheers' banner overhead and metallic napkins fanned beside the ice.",
      "Aim a spotlight at the biggest disco ball above a bench for glittery group photos.",
    ),
  },

  // ---------- DINNER PARTY ----------
  {
    id: "tuscan-table",
    occasion: "dinner-party",
    name: "Tuscan Table",
    vibe: "Sun-baked terracotta, olive, and cream with rustic Italian warmth.",
    palette: ["hsl(15 55% 50%)", "hsl(80 30% 45%)", "hsl(40 50% 88%)", "hsl(20 40% 30%)"],
    heroImage: tuscanHero,
    visionBoard: { table: tuscanTable, decor: tuscanDecor, dessert: tuscanDessert },
    decorIdeas: [
      { title: "Terracotta serving platters family-style", kind: "Buy", bucket: "1-2 weeks", estPrice: 15 },
      { title: "Olive branches down the runner", kind: "Buy", bucket: "Party week", estPrice: 18 },
      { title: "Linen tablecloth in unbleached cream", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Chianti bottles as candlesticks", kind: "DIY", bucket: "3-5 weeks", estPrice: 14 },
      { title: "Rustic bread board with focaccia at the center", kind: "DIY", bucket: "Day of", estPrice: 18 },
      { title: "Handwritten menu cards on kraft paper", kind: "DIY", bucket: "Party week", estPrice: 10 },
      { title: "Fresh rosemary sprigs at each place setting", kind: "DIY", bucket: "Day of", estPrice: 16 },
      { title: "Beeswax taper candles", kind: "Buy", bucket: "1-2 weeks", estPrice: 14 },
    ],
    stylingTips: [
      "Serve family-style on the table, plated feels wrong for this vibe.",
      "Real olive branches beat every fake alternative.",
      "Warm dim light only; kill the overheads.",
    ],
    setup: zones(
      "Set a chalkboard menu by the door and lean an olive branch against a terracotta pot beside it.",
      "Iron the linen, drape olive branches down the center, place bread boards and light beeswax tapers.",
      "Pre-pour aperitivos on a side table so guests grab one on the way in.",
      "Light Chianti-bottle candles on a low sideboard for warm dinner-party photos.",
    ),
  },
  {
    id: "modern-candlelight",
    occasion: "dinner-party",
    name: "Modern Candlelight",
    vibe: "Moody minimal in black, brass, and deep burgundy in candlelight.",
    palette: ["hsl(0 0% 8%)", "hsl(40 65% 50%)", "hsl(0 55% 30%)", "hsl(30 20% 88%)"],
    heroImage: candleHero,
    visionBoard: { table: candleTable, decor: candleDecor, dessert: candleDessert },
    decorIdeas: [
      { title: "Black linen tablecloth", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Brass taper candlesticks at varied heights", kind: "Buy", bucket: "3-5 weeks", estPrice: 14 },
      { title: "Deep burgundy taper candles", kind: "Buy", bucket: "1-2 weeks", estPrice: 14 },
      { title: "Single-stem dark florals in small vessels", kind: "Buy", bucket: "Party week", estPrice: 16 },
      { title: "Matte black stoneware plates", kind: "Buy", bucket: "3-5 weeks", estPrice: 14 },
      { title: "Linen napkins tied with brass rings", kind: "DIY", bucket: "1-2 weeks", estPrice: 18 },
      { title: "Dim the overheads to 20%, candles do the work", kind: "DIY", bucket: "Day of", estPrice: 0 },
      { title: "Cocktail menu printed on black card stock", kind: "DIY", bucket: "Party week", estPrice: 15 },
    ],
    stylingTips: [
      "Fewer, better objects, restraint is the whole aesthetic.",
      "Uneven candle heights read intentional; matched ones look catered.",
      "No overhead light, dim it or turn it off entirely.",
    ],
    setup: zones(
      "Light one large brass candle on the entry console and dim the hallway light before guests arrive.",
      "Lay the black linen, place brass candlesticks at three heights, and set stoneware with brass-tied napkins.",
      "Stage the cocktail cart with the black-card menu and glassware polished ready.",
      "Cluster the brass candles low on a sideboard for warm portrait light behind seated guests.",
    ),
  },
  {
    id: "garden-bistro",
    occasion: "dinner-party",
    name: "Garden Bistro",
    vibe: "French bistro outdoors with white linen, green foliage, and warm string lights.",
    palette: ["hsl(0 0% 100%)", "hsl(120 30% 40%)", "hsl(40 40% 88%)", "hsl(15 55% 55%)"],
    heroImage: bistroHero,
    visionBoard: { table: bistroTable, decor: bistroDecor, dessert: bistroDessert },
    decorIdeas: [
      { title: "Crisp white tablecloth over the table", kind: "Buy", bucket: "1-2 weeks", estPrice: 18 },
      { title: "String lights zig-zagged overhead", kind: "Buy", bucket: "3-5 weeks", estPrice: 22 },
      { title: "Bistro-style café chairs", kind: "Buy", bucket: "3-5 weeks", estPrice: 15 },
      { title: "Small vases with garden roses and herbs", kind: "DIY", bucket: "Day of", estPrice: 16 },
      { title: "Baguettes in a linen-lined basket", kind: "DIY", bucket: "Day of", estPrice: 18 },
      { title: "Glass carafes of wine on the table", kind: "Buy", bucket: "Party week", estPrice: 18 },
      { title: "Chalkboard menu propped at one end", kind: "DIY", bucket: "1-2 weeks", estPrice: 22 },
      { title: "Fresh potted herbs as centerpieces", kind: "Buy", bucket: "1-2 weeks", estPrice: 16 },
    ],
    stylingTips: [
      "White plus green is the whole palette, resist adding a third.",
      "Real bread and wine on the table is decor.",
      "String lights hung 8 feet up feel intimate; higher feels like a wedding.",
    ],
    setup: zones(
      "Prop the chalkboard menu by the garden gate with a small vase of herbs beside it.",
      "Iron the white cloth, place potted herbs down the center, and set carafes ready to pour.",
      "Line up the café chairs around the table so guests find their spot easily.",
      "Turn on the string lights just before sunset, golden-hour dinner photos land perfectly.",
    ),
  },
];

export function themesForOccasion(o: OccasionType): Theme[] {
  return THEMES.filter((t) => t.occasion === o);
}

export function themeById(id: string | undefined | null): Theme | undefined {
  if (!id) return undefined;
  return THEMES.find((t) => t.id === id);
}

