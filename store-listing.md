# Play Store listing — iDisagree

Draft for the closed-testing submission. Paste the two descriptions straight in;
everything else in here is a checklist of what Play still wants and who can make it.

Written to match what the app actually does, and deliberately not more. A listing
that promises adjudication or "who won" would be a bigger problem than a dull
one: the app suggests, and a person decides. That distinction is the product.

**Nothing here mentions buying credits.** New accounts get starter credits, and
the purchase path is hidden on Android by design (Play's Payments policy).
Pointing at an external purchase in the listing is the part of that policy with
teeth, so this stays quiet about it.

---

## Short description — 74 / 80 characters

```
Map an argument as you have it. See the claims, the tactics, the concessions.
```

## Full description — 2,180 / 4,000 characters

```
Most arguments go badly for the same reason: nobody can see the shape of them.
Points get repeated, answered points get re-answered, and the thing actually in
dispute drifts out of view. iDisagree draws the argument while you have it.

Two people take turns. You type what you'd say anyway, and an AI reads each
statement and places it on a live map — what it claims, what it supports, what
it objects to, and how it connects to everything said so far.

WHAT IT SHOWS YOU

• The structure. Claims, premises, evidence, objections and rebuttals, arranged
  so you can see which point rests on which.

• Rhetorical tactics, named as they happen. Straw men, ad hominems, false
  dilemmas, slippery slopes, moving goalposts, circular reasoning — and the good
  ones too: steel-manning, citing sources, addressing the counterargument
  properly. Every tag quotes the words it was read from, so you can judge the
  call rather than take it on trust.

• Contradictions, when someone argues against something they said earlier.

• Possible concessions. When a statement reads like accepting the other side's
  point, the app says so — and stops there. It never decides for you. You confirm
  it, or you don't, and either way the map records what happened.

• A moderator's read on how each person is arguing, if you want a second opinion
  on the exchange itself.

TWO WAYS TO USE IT

Take turns live, one statement at a time — or paste in a conversation that
already happened, from anywhere, and watch the whole thing get mapped at once.

WHAT IT WON'T DO

It won't tell you who won. There's no verdict, no score for being right. Game
Mode adds points if you want the nudge, but the app's job is to show you the
argument clearly enough that you can both see what's actually being disagreed
about — which is usually smaller and more specific than it felt.

PRIVACY

Your arguments are yours. Crash reports carry stack traces only: the app
deliberately drops the diagnostic breadcrumbs that would capture what you typed,
because people paste real disagreements into this. Delete your data from inside
the app whenever you like.

Built for people who'd rather disagree well than loudly.
```

---

## Still needed, and who can make it

| asset | spec | status |
|---|---|---|
| App icon | 512×512 PNG | **done** — `store-screenshots/icon-512-{square,disc}.png`, pick one |
| Feature graphic | 1024×500 | **Alex** — needs designing |
| Phone screenshots | 2–8, ≥320px | **done** — 5 at 1080×2400 in `store-screenshots/` |
| Category | Education, or Tools | Alex's call — Education fits the framing above |
| Contact email | shown publicly | `support@trolleysolution.com` already forwards |
| Privacy policy URL | | `https://idisagree.trolleysolution.com/privacy` (no `.html`) |

### The screenshots

Captured 2026-08-09 from the emulator at 1080×2400, on a debug build of
`992f65d` — the same bundle as the release APK, so what they show is what
ships. All five are one real argument (the hot-dog-is-a-sandwich exchange),
replayed from History, so nothing in them is mocked up.

1. `01-the-map` — the finished map, Classic theme
2. `02-node-detail` — a node opened: tactic named, quote it was read from, tags
3. `03-moderator` — the moderator's read on both speakers
4. `04-midnight-theme` — the same map in Midnight, showing the dark themes
5. `05-paste-a-conversation` — Combined mode with a pasted exchange ready to run

**One edit was made for the capture:** `.cost-estimate` — the "~9.4¢" under the
Submit button — is hidden via injected CSS. It is real UI and a signed-in user
does see it, but on a store page it reads as "this app bills you per message",
which on Android it does not: the purchase path is hidden there by Play's
Payments policy, so a reviewer would be looking at a price with no way to pay
it. Say the word and it goes back in; it's one line in the capture script.

### The icon

Both files are the existing launcher art (`mipmap-xxxhdpi/ic_launcher_foreground.png`,
432×432) resampled to 512. `-square` fills the corners with the art's own navy
`#1a2233` so it fills Play's rounded-square mask; `-disc` leaves them
transparent, so the circle floats. **`-square` is the safer pick.**

## Content rating questionnaire

Answer honestly and it should come back low. The one that needs care: the app
lets two people exchange free text, so **user-generated content** is a yes. It is
not shared publicly and there is no social feed — arguments are private to the
account that made them — but the question is about the capability, not the reach.
