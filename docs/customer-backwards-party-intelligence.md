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

## Current-state audit

Already valuable:

- fast optional-field party creation;
- transparent, overridable home-versus-venue recommendations for the preschool
  birthday golden path;
- life-stage-aware preschool, school-age, and adult birthday playbooks;
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

- generic occasion defaults do not yet cover enough subtypes or life stages;
- the few durable facts captured in direct creation are not yet used by every
  occasion and workflow;
- local search is query generation, not a ranked/verified marketplace;
- quantities are not consistently tied to adult/kid counts and serving format;
- tasks have coordination owners, rationale, and linked actions, but not yet
  dependencies, notifications, or collaborator permissions;
- birthday RSVP defaults now adapt to preschool, school-age, and adult
  planning context, and optional host-only arrival/access answers feed the
  guest list; other occasion-specific questions and downstream automation
  are still incomplete;
- cohost permissions and targeted communications are incomplete;
- recommendations do not yet show confidence or verified-vs-estimated status;
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
- [Punchbowl potluck workflow](https://www.punchbowl.com/potluck)
- [Evite signup sheets](https://www.evite.com/pages/signup-sheets/potluck/)
- [HealthyChildren: playful birthday party guidance](https://www.healthychildren.org/English/family-life/power-of-play/Pages/playful-birthday-party-ideas-and-tips-for-young-children.aspx)
- [USDA FSIS: keeping buffet food safe](https://ask.fsis.usda.gov/article/How-do-I-keep-foods-safe-at-a-buffet)
- [CDC: milestones and activities by four years](https://www.cdc.gov/act-early/milestones/4-years.html)
- [CPSC: balloon suffocation hazard](https://www.cpsc.gov/safety-education/safety-guides/toys/balloons-can-be-suffocation-danger-kids)
- [FoodSafety.gov: people at risk of food poisoning](https://www.foodsafety.gov/people-at-risk)
- [FARE: parties and allergy communication](https://www.foodallergy.org/resources/parties)
