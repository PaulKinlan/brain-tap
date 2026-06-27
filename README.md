# Brain Tap

A small brain game. You work down a grid of two columns of numbers; each row
tells your **left** hand and **right** hand how many to do. Answer each row by
either **tapping that many times** or **holding that many fingers** at once,
separately with each hand, then move to the next row.

```
left  right
 1     2     -> left hand: 1,  right hand: 2
 2     1     -> left hand: 2,  right hand: 1
 ...
```

Difficulty: **Beginner** uses 1–2, **Normal** uses 1–4.

## Modes

- **Paper** — generates a printable sheet (Ctrl/Cmd-P) so you can play away from a screen.
- **Keyboard** — the **left half** of the keyboard counts as your left hand, the **right half** as your right hand.
- **MIDI** — connect a MIDI keyboard via the [Web MIDI API](https://developer.mozilla.org/docs/Web/API/Web_MIDI_API). Notes **below middle C** are the left hand, **middle C and up** are the right hand.

And two ways to answer:

- **Tap N times** — tap/play the target number of times.
- **Hold N fingers** — hold the target number of keys/notes down at once (a chord).

It tracks your time and counts an error if you over-tap or hold too many fingers (the row resets so you can retry).

## Run locally

Requires [Deno](https://deno.com/).

```sh
deno task dev
```

Then open <http://localhost:8000>. The static site lives in `public/` — `index.html` + `game.js`, no build step.

## Deploy

Hosted on [Deno Deploy](https://deno.com/deploy). Entry point `main.ts` serves `public/` (binds the injected `PORT`).

## License

[Apache 2.0](./LICENSE) © 2026 Paul Kinlan.
