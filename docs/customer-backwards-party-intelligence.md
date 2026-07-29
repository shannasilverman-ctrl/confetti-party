# Confetti customer-backwards product doctrine

Status: active product standard, July 2026

## Product truth

Anyone can ask a general AI to plan a party. Confetti wins only when it already
understands the event well enough to:

1. ask fewer questions;
2. make a defensible recommendation instead of returning option soup;
3. turn that recommendation into executable work;
4. coordinate the host, cohosts, guests, vendors, quantities, money, and day-of
   timing in one source of truth; and
5. notice the easy-to-miss constraints before they become host stress.

Confetti is not an invitation app with an AI tab. It is a party operating system
with a conversational front door.

## Evidence from the market

Existing products solve valuable but narrower coordination jobs:

- Partiful emphasizes fast invitations, RSVP, guest questions, date polls,
  payments, text blasts, and social participation.
- Punchbowl and Evite support potluck or signup lists, guest limits, polls, and
  cohosts.
- Apple Invites connects invitations with shared photos and playlists.
- Newer planning products connect budgets, vendors, timelines, documents, and
  bookings, but largely resemble event-management workspaces.

The recurring user complaint is not “I cannot generate a checklist.” It is that
the plan fragments across group chats, notes, spreadsheets, shopping lists,
calendar reminders, maps, payment apps, photo albums, and the host's memory.
Communication and follow-through are frequently harder than the initial plan.

Confetti's whitespace is **decision compression plus execution continuity**:
understand the party, recommend the right path, and keep every downstream action
attached to that decision.

## The six customer jobs

### 1. Shape the right party

The host needs help matching ambition to age, guests, budget, space, season,
energy, and the feeling they want—not a theme generator.

Definition of good:

- begin with one sentence;
- ask only questions that would change the plan;
- offer a recommended format with two credible alternatives;
- state the tradeoff behind the recommendation;
- allow unknowns without inventing facts.

### 2. Make the party feasible

The host needs a real count, quantities, timing, constraints, backup plans, and
budget allocation.

Definition of good:

- distinguish children, adults, households, siblings, and plus-ones;
- translate attendance into food, seating, activity, supervision, and supply
  quantities;
- identify allergy, accessibility, observance, weather, venue, waiver, parking,
  bathroom, and equipment constraints;
- warn without pretending to provide medical, legal, or safety certification.

### 3. Get the work out of the host's head

The host needs an ordered plan, not a long undifferentiated checklist.

Definition of good:

- every task has timing, an owner, a reason, and a useful next action;
- dependencies are visible;
- skipped setup fields become open decisions;
- cohosts can own work without gaining access to private or financial data;
- Confetti identifies what can be removed when the plan is too ambitious.

### 4. Coordinate people without social awkwardness

The host needs RSVPs, answers, contributions, reminders, and updates while
remaining a gracious host.

Definition of good:

- questions adapt to the event;
- contribution requests are opt-in and clearly framed, not surprise labor;
- the bring board prevents duplicates and tracks quantities;
- reminders target only the people who need them;
- a guest can act from a link without creating an account.

### 5. Source and buy the right things

The host needs a decision-ready local shortlist and a consolidated list, not
affiliate spam or a directory.

Definition of good:

- compare at-home, grocery-prepared, restaurant/drop-off, venue, rental, and
  staffed-vendor paths;
- recommendations explain fit for headcount, budget, age, effort, and location;
- distinguish verified availability/pricing from estimates;
- carry decisions into budget, checklist, quantities, and timeline;
- never imply booking or availability that Confetti has not verified.

### 6. Run and remember the event

The host needs a calm day-of view, assignments, guest communications, photos,
cleanup, returns, payments, and reusable learning.

Definition of good:

- a role-based day-of run sheet;
- offline-friendly access to critical details;
- one-tap host update;
- photo collection without forcing Confetti to host originals;
- post-event closeout and a reusable retrospective.

## Party intelligence, not prompt engineering

The recommendation engine must use structured, versioned inputs:

- occasion and subtype;
- honoree age or audience life stage when relevant;
- children, adults, households, siblings, and attendance certainty;
- date/time and season;
- location and party format;
- effort target;
- budget and budget strictness;
- food approach;
- dietary, allergy, accessibility, and observance constraints;
- host goal and memorable moment;
- available helpers;
- weather, equipment, and venue constraints.

Outputs should be structured too:

- recommended format and rationale;
- duration and run-of-show;
- RSVP questions;
- tasks and dependencies;
- quantities and shopping;
- budget allocation;
- contribution plan;
- local sourcing queries or verified options;
- guardrails;
- assumptions, confidence, and unresolved decisions.

The language model can interpret conversation and personalize explanations. It
must not be the sole source of quantities, safety rules, policy, vendor facts, or
workflow state.

## Four-year-old birthday: reference implementation

This is the first golden path because a generic birthday plan is visibly
insufficient.

Minimum facts that change the plan:

- age turning;
- expected children and adults;
- at home, venue, or help choosing;
- easy, balanced, or all-out effort;
- date/time certainty;
- budget comfort;
- the child's current interests;
- allergies, accessibility, siblings, and adult-stay expectations.

Confetti should recommend:

- a compact schedule with short activity transitions;
- an easy arrival activity and one main activity;
- parent-ready RSVP questions;
- a child/adult count;
- a specific venue or at-home path;
- a practical food path and quantities;
- a supervision and handoff plan;
- a host kit;
- age-aware balloon, small-part, allergy, and food-handling guardrails;
- a weather or venue contingency;
- a calm pickup and cleanup ending.

The American Academy of Pediatrics' HealthyChildren guidance suggests an
age-plus-one guest-count rule of thumb for young children, about 10–15 minutes per
activity, and keeping toddler parties under roughly 90 minutes. CDC developmental
guidance for four-year-olds supports pretend play, active play, music, drawing,
matching, and simple social games. CPSC warns that uninflated or broken balloons
are a choking risk for children under eight. FoodSafety.gov notes that children
under five are at elevated risk of foodborne illness and that perishable food
should not remain at room temperature beyond two hours.

These are recommendations and safety prompts, not guarantees. The host remains
responsible for supervision, medical plans, venue compliance, and professional
advice.

## UX rules for every screen

1. Show the next best action, not every possible action.
2. Keep secondary setup behind progressive disclosure.
3. Explain why Confetti is asking whenever the reason is not obvious.
4. Let the host skip; convert the gap into an explicit open decision.
5. Preserve entered data when moving between Talk, wizard, party workspace, and
   guest-facing pages.
6. Never show a generated value as a fact when it is an assumption.
7. Use human labels (“Adults staying”) rather than database labels (“adult
   count”).
8. Make mobile touch targets at least 44px and keep primary actions reachable
   without precision scrolling.
9. Celebrate meaningful completion; do not animate routine navigation.
10. Every empty state must explain what happens next and why it helps.

## Recommendation confidence

Every recommendation belongs to one of four evidence levels:

- **Known:** host-provided or verified product data.
- **Rule:** a curated, versioned party playbook.
- **Estimate:** a calculation with inputs and an editable assumption.
- **Idea:** creative or generative inspiration.

The interface should expose this distinction in plain language when the
recommendation affects money, safety, availability, or guest communication.

## RSVP answers must change the plan

Current invitation products are good at collecting and displaying answers:
Partiful offers host-only questionnaires and exports, Zola groups households and
tracks meal choices, Evite can total poll selections, and Paperless Post supports
status-based follow-up. The remaining consumer burden is interpretation: the host
still has to translate each reply into quantities, food, timing, seating,
accessibility, supervision, and pickup work.

Confetti's adaptation rules:

- confirmed plus maybe replies form the current planning floor;
- if that floor exceeds the working child/adult estimate, Confetti offers an
  explicit quantity update;
- Confetti never lowers quantities while invited guests can still reply;
- once every guest has replied, the host can explicitly align quantities to the
  current yes/maybe mix;
- dietary and allergen tags are summarized but never medically interpreted;
- comfort/access notes stay in the private host guest list and generate a review
  action, not an automated diagnosis;
- late-arrival answers create a timeline check;
- child-party replies without guest adults staying create a supervision/pickup
  check without assuming the host has no helpers; and
- no RSVP answer silently rewrites the host's plan.

### From insight to durable work

The useful destination is not another alert. It is connected, editable party
state:

- accepting a guest-count change re-sizes only untouched Confetti-generated
  shopping quantities with a stored per-unit serving ratio;
- custom quantities, in-cart items, and purchases remain host-authoritative;
- changing a generated quantity by hand opts that item out of future automatic
  sizing;
- allergen and dietary answers create review tasks rather than guessed menu
  substitutions;
- private comfort/access text never gets copied into a general task;
- later arrivals can create one editable arrival-window timeline item;
- child supervision signals can create one assignable responsibility; and
- every guest-impact action is idempotent, so returning to the card never creates
  duplicate work.

This is the consumer version of a connected event operations record: one change
propagates to the places it actually matters, within explicit safety and ownership
boundaries.

### From guest data to the right follow-up

Traditional invitation tools let hosts choose a template and filter recipients by
RSVP status. Confetti can remove more mental load because it already knows the
planning consequence behind the follow-up.

The host message helper therefore:

- recommends the highest-value available intent: unanswered RSVP, food
  confirmation, uncertain arrival, claimed contribution, or final details;
- shows the exact suggested audience and the reason before revealing the draft;
- creates deterministic, editable copy from known party facts instead of
  inventing details;
- omits unresolved date, time, and location facts and names them before sending;
- never copies allergen tags, dietary tags, or private access-note wording into a
  group-ready message;
- marks food and arrival follow-ups as one-to-one conversations;
- includes a real guest link only when the party has one; and
- copies only—the product never claims a message was sent, delivered, or read.

This is deliberately provider-neutral until Confetti has real contact consent,
deliverability, opt-out, message-history, and support infrastructure. It solves
the reasoning and drafting job now without introducing fake communications.

### From a headcount to a quantity plan a host can trust

Most quantity calculators hide their assumptions and return a precise-looking
number. That shifts the risk back to the host: they still have to decide whether
the tool imagined appetizers, a meal, a two-hour birthday, or an all-afternoon
gathering.

Confetti keeps direct creation fast, then asks only three high-leverage questions
when the host wants a sharper estimate:

- is the food light bites, a full meal, or available throughout;
- how long guests will be eating and drinking; and
- whether food is self-serve, family-style, or portioned per guest.

The estimate then separates known facts from working assumptions and labels
itself as a starting or tuned plan. The same serving guide appears beside the
real shopping list so the host does not have to remember or recalculate it.
Confetti does not invent package sizes, prices, or vendor yields: the recipe,
package label, or caterer's stated servings remains the final conversion before
buying. Explicit food decisions captured in Talk carry into the same planning
profile rather than being asked twice.

### From “near me” to a decision that stays in the plan

Local discovery is not useful if the host still has to reconstruct the decision
from browser tabs, screenshots, email, and memory. Confetti therefore treats
Maps as a current discovery source—not as inventory Confetti can verify—and
provides the continuity layer around it:

- occasion, age, headcount, effort, format, budget, and locality shape the
  starting searches;
- the host brings only plausible finalists back into a small party shortlist;
- every candidate records whether its cost is the host's estimate or a
  host-recorded vendor quote;
- status distinguishes considering, contacted, quoted, and booked-by-the-host;
- the interface shows the cost against the current party budget without
  recording an estimate as money spent;
- one working choice per need can be selected without claiming a booking;
- selecting it creates one idempotent confirmation task covering availability,
  inclusions, fees, cancellation terms, access needs, and payment; and
- externally supplied URLs are HTTPS-validated before they become links.

This is the provider-neutral bridge before a real marketplace. Verified ratings,
availability, packages, contracts, payment, support, and booking status require
provider integrations and marketplace operations; UI copy must not imply those
capabilities early.

## Current-state audit

Already valuable:

- fast optional-field party creation;
- transparent, overridable home-versus-venue recommendations for the preschool
  birthday golden path;
- life-stage-aware preschool, school-age, and adult birthday playbooks;
- parent-boundary-aware baby-shower planning and ceremony-aware graduation
  planning, with inclusive language, practical handoffs, and tailored guest
  questions;
- Talk draft with assumptions and blocking unknowns;
- RSVP and guest counts;
- bring board;
- shopping and budget;
- tasks and timeline;
- local map searches;
- holiday starters;
- day-of view;
- photo drop and party booth;
- public guest actions without account creation.

Material gaps:

- birthday, baby-shower, graduation, holiday, dinner, game-day, and cookout
  planning now use curated playbooks; `other` and still-unmodeled subtypes
  continue to use the general planning fallback;
- the few durable facts captured in direct creation are not yet used by every
  occasion and workflow;
- local search now carries host-entered finalists, quote provenance, status,
  budget context, a working choice, and confirmation work back into the party;
  it is still not ranked or verified marketplace inventory;
- birthday, holiday, game-day, and cookout quantities now use known child/adult
  counts, expose assumptions and confidence, and can be tuned by food role,
  duration, and service style; broader menu-, recipe-, package-, and
  vendor-specific conversion remains incomplete;
- tasks have coordination owners, rationale, and linked actions, but not yet
  dependencies, notifications, or collaborator permissions; task owners can
  now receive a host-controlled brief with timing, rationale, and a clear
  finish line through the host's existing share flow; copied, waiting,
  confirmed, and blocked states are host-recorded and unresolved handoffs stay
  visible without claiming Confetti can read external conversations;
- birthday RSVP defaults now adapt to preschool, school-age, and adult
  planning context; optional host-only answers now feed an explainable impact
  layer for headcount, food, access, arrival, and supervision; accepted count
  changes safely resize untouched generated shopping quantities, while other
  impacts become deduplicated, editable tasks or timeline work; other
  occasion-specific questions are still incomplete;
- cohost permissions and actual message delivery remain incomplete; targeted
  host follow-ups now have intent-aware audiences and privacy-safe editable copy;
- quantity recommendations now distinguish starting assumptions from confirmed
  facts; local and vendor recommendations do not yet consistently show
  confidence or verified-vs-estimated status;
- retrospectives do not yet improve future playbooks.

## Delivery sequence

1. Finish and QA the four-year-old birthday golden path.
2. Add adult birthday and school-age birthday playbooks to prove reuse.
3. Add holiday dinner/Shabbat as the contribution-and-food golden path.
4. Add game day/BBQ as the time-anchor and quantity golden path.
5. Add cohost ownership and linked actions.
6. Add a provider-neutral local sourcing layer, then verified vendor inventory
   only when contracts, availability, pricing, reviews, and support are real.
7. Instrument time-to-first-plan, decisions avoided, open-decision completion,
   plan edits, guest completion, host task completion, and post-event host
   confidence.

## Research sources

- [Partiful product features](https://partiful.com/)
- [Partiful guest questionnaires](https://help.partiful.com/hc/en-us/articles/24495264104219-Collecting-guest-info-dietary-restrictions-names-of-1s-etc)
- [Zola guest RSVP experience](https://www.zola.com/faq/115002259432-how-can-my-guests-rsvp-online-what-does-that-experience-look-like-to-them-)
- [Evite poll and meal selections](https://support.evite.com/products/invitations/create-and-edit/poll-feature)
- [Paperless Post RSVP tracking](https://paperlesspost.zendesk.com/hc/en-us/articles/207620646-Tracking-Responses-Where-are-my-RSVPs)
- [Planning Pod guest and seating workflow](https://planningpod.com/event-floor-plan-software)
- [Listo per-guest quantity and task workflow](https://listorun.com/)
- [Havenue connected catering and dietary workflow](https://havenue.co/)
- [PlanIt party planning workflow](https://apps.apple.com/gb/app/planit-party-planner/id6654909940)
- [Paperless Post status- and tag-filtered follow-ups](https://paperlesspost.zendesk.com/hc/en-us/articles/4408189210779-Send-an-RSVP-reminder-or-follow-up-message-to-guests-or-recipients)
- [Evite group and individual guest messages](https://support.evite.com/products/invitations/manage-and-edit-guest-list/send-a-message-to-guests)
- [Punchbowl potluck workflow](https://www.punchbowl.com/potluck)
- [Evite signup sheets](https://www.evite.com/pages/signup-sheets/potluck/)
- [HealthyChildren: playful birthday party guidance](https://www.healthychildren.org/English/family-life/power-of-play/Pages/playful-birthday-party-ideas-and-tips-for-young-children.aspx)
- [USDA FSIS: keeping buffet food safe](https://ask.fsis.usda.gov/article/How-do-I-keep-foods-safe-at-a-buffet)
- [CDC: milestones and activities by four years](https://www.cdc.gov/act-early/milestones/4-years.html)
- [CPSC: balloon suffocation hazard](https://www.cpsc.gov/safety-education/safety-guides/toys/balloons-can-be-suffocation-danger-kids)
- [FoodSafety.gov: people at risk of food poisoning](https://www.foodsafety.gov/people-at-risk)
- [FARE: parties and allergy communication](https://www.foodallergy.org/resources/parties)
- [University of Minnesota Extension: planning food quantities for an occasion](https://extension.umn.edu/cooking-safely-crowd/planning-quantity-food-occasion)
- [Washington State University Catering: hors d'oeuvres serving guidance](https://catering.wsu.edu/menus/hors-doeuvres/)
- [University of Michigan Taubman College: catering and service-format guidance](https://intranet.tcaup.umich.edu/knowledge-base/catering/)
- [GoodEvent: one brief and side-by-side supplier quote workflow](https://www.goodevent.com/products/planner/how-it-works)
- [Festa: tailored vendor checklist and quote comparison](https://festapr.com/)
- [Planza: local vendor quotes and side-by-side comparison](https://www.planzaevents.com/)
- [PartyPlanning discussion: spreadsheets, chats, and forgotten ice](https://www.reddit.com/r/apps/comments/1sqjrra/me_and_my_friend_got_tired_of_party_planning/)
- [PartyPlanning discussion: milestone-party vendor coordination load](https://www.reddit.com/r/partyplanning/comments/1sqkrrg/overwhelmed_planning_my_daughters_sweet_16_too/)
- [Planning Pod: assignments, due dates, and reminders](https://planningpod.com/checklists-and-task-management)
- [AskWomenOver30 discussion: why party help is hard to delegate](https://www.reddit.com/r/AskWomenOver30/comments/13tikp6/what_do_you_do_if_you_are_hosting_a_party_and_are/)
- [WeddingPlanning discussion: unclear delegation and missed follow-through](https://www.reddit.com/r/weddingplanning/comments/111qn39/anyone_else_feel_like_if_you_delegate_tasks_they/)
- [Eventcombo event task ownership and status workflow](https://www.eventcombo.com/products/event-task-management)
- [Zoho Projects task ownership, dependencies, and status workflow](https://www.zoho.com/projects/task-management-software.html)
- [Parenting discussion: the invisible follow-through in household mental load](https://www.reddit.com/r/Parenting/comments/sgzvxe/how_would_you_describe_the_mental_load_of/)
