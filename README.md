# Cursor Duck 🦆

A browser extension for Chrome, Firefox and Edge: a cute duck swims after your mouse
pointer on every website, pecks at it now and then, lets you pet and feed it, hunts fish
shadows — and in between does what ducks do: dabble, dive, preen, bathe, quack, nap.

Everything is drawn procedurally onto a canvas — **not a single image asset**. That's why
every duck stays crisp at any size, and a new model is just a few lines of color values.

## Install

- **Chrome:** [Chrome Web Store](https://chromewebstore.google.com/detail/hohfcnokdpmjggmicebcjalgjcfpfblg)
- **Firefox:** [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/cursor-duck/)
- **Edge:** Microsoft Edge Add-ons (in review)

After installing, the duck starts swimming right away and a welcome page briefly explains
her tricks.

## What she can do

| | |
|---|---|
| **Following you** | Follows the cursor with inertia, weaves while paddling, leaves a wake and a bow wave. Far behind? Then she sprints. She tilts into her swimming direction and visibly turns when changing course — on a steep course her body foreshortens slightly, as if seen head-on. |
| **Staying attentive** | When the cursor moves away she abandons whatever she was doing and swims after it. If the cursor jumps suddenly (window switch, iframe), she perks up with a “!” and catches up extra fast. |
| **Petting** | Wiggle the cursor over her → she squints happily ^^, blushes, wobbles, hearts float up. A full bar means a happy quack. |
| **Pecking the cursor** | Hold the mouse still: she catches up and pecks at the pointer — with sparks, a ripple and a “nom”. |
| **Feeding** | Double-click anywhere on the page to toss bread crumbs into the water — she swims over and picks them up one by one, with nibble ripples and contented quacking. The ducklings join in! |
| **Don't overfeed her** | Too many crumbs in a row make her visibly plump, then she hiccups — and eventually it goes POP: a cloud of feathers, gone for a moment, and she plops back out of the water looking sheepish. |
| **Visitors** | Every few minutes a wild duck swims by: a quack duet to say hello, then the two perform a synchronized little dance with a pirouette — hearts on parting, and off she goes. |
| **Shore leave** | Every now and then she climbs out of the water, proudly waddles a circle across the page on her little legs, and jumps back in exactly where she got out. |
| **Scroll current** | Scrolling briefly sweeps the duck family along with the current — vigorous scrolling even wakes a sleeping duck. |
| **Night mode** | Between 10 pm and 6 am she gets sleepy sooner and dreams in little stars. |
| **Fish hunt** | Every now and then a fish shadow passes below the surface. She spots it (“!”), chases it, snaps — and doesn't always get it. The popup counts her catches. |
| **Dizziness** | Circle the cursor around her a few times → she gets woozy: she staggers, stars orbit, then she shakes it off. |
| **Dancing** | Wiggle the cursor quickly next to her → she dances: bobbing, wing swings, little music notes, turning to the beat. |
| **Peekaboo** | Rest the cursor calmly on her → she dives cheekily and pops up right next to it. |
| **Watching you** | Her head visibly tracks the cursor — while swimming and at rest, on both sides. |
| **Startling** | Swipe through her really fast → she jumps, feathers fly, indignant quacking. |
| **Napping** | 15 seconds of quiet → head into the feathers, Zzz. Wakes up again with a “!”. |
| **Idle animations** | Dabbling (tail up, head underwater), diving with bubbles and a surfacing splash, preening, wing flapping, shaking, bathing, pirouettes, looking around, bobbing, quacking with music notes. |
| **Ducklings** | Up to 6 ducklings swim in a row along mama's trail — with their own little animations (including dozing off) and a fluffy yellow color scheme. The family gently keeps its distance, so no duckling disappears behind mama. |
| **Duckling nest** | When mama gets sleepy she first puts the ducklings to bed: a nest appears (it grows with the number of ducklings and the duck size), she waits at the rim, gives the little ones a good-night nudge — then falls asleep beside them, occasionally dreaming little hearts. When she wakes up, the nest sinks away with a bubble. |
| **Clicking** | Click the duck → she quacks back. Double-click the duck → wing flapping. |

## The duck models

**Real ducks:** mallard (drake & hen), rubber duck, pekin duck, mandarin duck, wood duck,
tufted duck, teal, runner duck, chonk duck, duckling, swan, goose.

**Fantasy:** debug duck (with glasses), cyber duck (neon visor), ghost duck, pirate duck,
royal duck, ninja duck, goth duck, party duck (with confetti), chef duck, wizard duck,
astro duck (helmet), zombie duck, angel duck (halo), devil duck, cowboy duck,
rainbow duck, galaxy duck (starry body), golden duck.

**Seasonal:** pumpkin duck (October), Christmas duck (December) and Easter duck
(from three weeks before until one week after Easter Sunday, computed with Gauss's
Easter algorithm) appear in the popup automatically during their time window.

**With opinions:** the visionary duck (black turtleneck, round glasses) doesn't just
quack — every now and then she says things like “One more thing …”,
“You're holding it wrong.” or “Quack different.” (twelve lines in total).

Rare models are marked in the popup (blue = rare, purple = epic, gold = legendary).
The 🎲 button picks at random — legendaries are rare. The popup also holds
**35 achievements** — from petting fan through “Identity crisis” to “Keynote fan”;
clicking an achievement reveals how to earn it.

## Settings (popup)

Size, speed, number of ducklings, playfulness, opacity, sound on/off, water effects,
reflection, cursor pecking, crumb feeding, “new random model on every browser start”,
“pause on this site” — everything applies instantly, without reloading. Plus 16 buttons
to trigger tricks directly (including feeding, fish hunt, shore leave and visitors).

Keyboard shortcuts: `Alt+Shift+D` (on/off), `Alt+Shift+N` (next model).

Sound is **off** by default. Switched on, she quacks synthetically (Web Audio, no sound
files) in cartoon style: a sawtooth carrier with a downward sweep, ~105 Hz rasp
(amplitude modulation), two formants and a noise onset; joy quacks in two syllables.
Every model has its own pitch, ducklings peep high.

## Technical details

- **Manifest V3** (Firefox ships as MV2, since Firefox treats MV3 host permissions as
  opt-in, which would leave the duck invisible). Permissions: only `storage` and
  `activeTab`. No network access, no data collection, no external dependencies.
- The duck lives in a **canvas inside a Shadow DOM** with `pointer-events: none` at the
  very top of the stack — clicks, text selection and page CSS remain untouched.
- Inside `<iframe>`s only a tiny listener runs that reports the cursor position to the top
  window; drawing happens exclusively in the top window (one duck per tab, not one per frame).
- The animation pauses automatically when the tab goes into the background.
- All motion is time-interpolated and therefore independent of the frame rate.
- The interface (popup, welcome page, model names) is bilingual via `_locales/`: German and
  English. The browser picks automatically by its language; everything except German gets
  English (`default_locale: en`).

## Privacy

Cursor Duck collects **no data whatsoever**, has no network functionality and talks to no
server. Details: [PRIVACY.md](PRIVACY.md) (English and German).

## License

**© 2026 Lucas Reiser (forliHD) — all rights reserved.** The code is source-available for
viewing, but may not be copied, modified, redistributed or — for instance in extension
stores — republished or presented as your own work without written permission.
Details in [LICENSE](LICENSE).
