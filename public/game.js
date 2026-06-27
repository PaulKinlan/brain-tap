// Brain Tap — a left/right counting game.
//
// Work down a grid of rows. Each row has a LEFT number and a RIGHT number.
// Answer each row by either tapping that many times, or holding that many
// "fingers" at once, separately with your left and right hand.
//
// Three input modes:
//   paper    — just generates a printable sheet, no input handling.
//   keyboard — left half of the keyboard = left hand, right half = right hand.
//   midi     — Web MIDI: notes below middle C (60) = left hand, >= 60 = right.
//
// Two count modes:
//   taps     — tap the target number of times (count note-on / keydown events).
//   fingers  — hold the target number of keys/notes down at once (chord).

const $ = (id) => document.getElementById(id);

const state = {
  mode: "keyboard",        // paper | keyboard | midi
  diff: "normal",          // beginner (1-2) | normal (1-4)
  count: "taps",           // taps | fingers
  rows: 8,
  grid: [],                // [{left, right}]
  current: 0,
  prog: { left: 0, right: 0 },     // taps mode: running counts for current row
  held: { left: new Set(), right: new Set() }, // fingers mode: keys/notes down
  errors: 0,
  startedAt: 0,
  running: false,
  done: false,
};

const MIDI_SPLIT = 60; // middle C — below = left hand, at/above = right hand

// ---- grid generation --------------------------------------------------------

function maxFor(diff) { return diff === "beginner" ? 2 : 4; }

function rand(n) { return 1 + Math.floor(Math.random() * n); }

function generate() {
  const m = maxFor(state.diff);
  state.grid = Array.from({ length: state.rows }, () => ({ left: rand(m), right: rand(m) }));
  state.current = 0;
  state.prog = { left: 0, right: 0 };
  state.held = { left: new Set(), right: new Set() };
  state.errors = 0;
  state.startedAt = 0;
  state.running = false;
  state.done = false;
  render();
  updateStatus();
  announce(state.mode === "paper"
    ? "New sheet ready. Print it or play on screen."
    : `New game. Row 1: left ${state.grid[0].left}, right ${state.grid[0].right}.`);
}

// ---- rendering --------------------------------------------------------------

function pips(target, on, side) {
  let s = '<div class="pips">';
  for (let i = 0; i < target; i++) s += `<span class="pip ${i < on ? "on" : ""}"></span>`;
  return s + "</div>";
}

function render() {
  const body = $("rows-body");
  const playable = state.mode !== "paper";
  body.innerHTML = state.grid.map((row, i) => {
    const active = playable && i === state.current && !state.done;
    const done = playable && i < state.current;
    const lOn = active ? handCount("left") : 0;
    const rOn = active ? handCount("right") : 0;
    return `<tr class="${active ? "active" : ""} ${done ? "done" : ""}" data-row="${i}">
      <td class="num l">${row.left}${active ? pips(row.left, lOn, "left") : ""}</td>
      <td class="cur">${active ? "▶" : done ? "✓" : i + 1}</td>
      <td class="num r">${row.right}${active ? pips(row.right, rOn, "right") : ""}</td>
    </tr>`;
  }).join("");
  $("hands").hidden = !playable || state.done;
  updateHands();
}

function updateHands() {
  if (state.done || state.mode === "paper" || !state.grid.length) return;
  const row = state.grid[state.current];
  if (!row) return;
  $("lh").textContent = `${handCount("left")}/${row.left}`;
  $("rh").textContent = `${handCount("right")}/${row.right}`;
}

function handCount(side) {
  return state.count === "fingers" ? state.held[side].size : state.prog[side];
}

function updateStatus() {
  $("progress").textContent = `Row ${Math.min(state.current + (state.done ? 0 : 1), state.rows)} / ${state.rows}`;
  $("errors").textContent = `errors ${state.errors}`;
}

let timerRAF;
function tickTimer() {
  if (!state.running) return;
  const s = (performance.now() - state.startedAt) / 1000;
  $("timer").textContent = s.toFixed(1) + "s";
  timerRAF = requestAnimationFrame(tickTimer);
}

function announce(msg) { $("live").textContent = msg; }

function flashRow(kind) {
  const tr = document.querySelector(`tr[data-row="${state.current}"]`);
  if (!tr) return;
  tr.classList.remove("flash-ok", "flash-bad");
  void tr.offsetWidth; // restart animation
  tr.classList.add(kind === "ok" ? "flash-ok" : "flash-bad");
}

// ---- gameplay ---------------------------------------------------------------

function startIfNeeded() {
  if (!state.running && !state.done) {
    state.running = true;
    state.startedAt = performance.now();
    tickTimer();
  }
}

// A "hit" on a hand: a tap (taps mode) or a key/note pressed down (fingers mode).
function onHit(side, idLabel) {
  if (state.mode === "paper" || state.done) return;
  startIfNeeded();
  const row = state.grid[state.current];
  const target = row[side];

  if (state.count === "fingers") {
    state.held[side].add(idLabel);
    if (state.held[side].size > target) { // too many fingers down — error
      registerError();
      return;
    }
  } else { // taps
    state.prog[side]++;
    if (state.prog[side] > target) { // over-tapped — error, reset the row
      registerError();
      return;
    }
  }
  render();
  checkRowComplete();
}

// Fingers mode only: releasing a key/note.
function onRelease(side, idLabel) {
  if (state.count !== "fingers" || state.mode === "paper" || state.done) return;
  state.held[side].delete(idLabel);
  render();
}

function registerError() {
  state.errors++;
  flashRow("bad");
  // reset the current row's progress so it can be retried cleanly
  state.prog = { left: 0, right: 0 };
  state.held = { left: new Set(), right: new Set() };
  announce("Too many — row reset, try again.");
  render();
  updateStatus();
}

function checkRowComplete() {
  const row = state.grid[state.current];
  const leftOk = handCount("left") === row.left;
  const rightOk = handCount("right") === row.right;
  if (!(leftOk && rightOk)) return;

  // For fingers mode, completion holds until both are released, then advance.
  flashRow("ok");
  state.current++;
  state.prog = { left: 0, right: 0 };
  state.held = { left: new Set(), right: new Set() };
  updateStatus();

  if (state.current >= state.rows) { finish(); return; }
  const next = state.grid[state.current];
  announce(`Good. Row ${state.current + 1}: left ${next.left}, right ${next.right}.`);
  render();
}

function finish() {
  state.running = false;
  state.done = true;
  cancelAnimationFrame(timerRAF);
  const secs = (performance.now() - state.startedAt) / 1000;
  $("finalTime").textContent = secs.toFixed(1) + "s";
  $("finalLine").textContent = `${state.rows} rows · ${state.errors} error${state.errors === 1 ? "" : "s"} · ${(secs / state.rows).toFixed(2)}s per row`;
  $("overlay").classList.add("show");
  announce(`Finished in ${secs.toFixed(1)} seconds with ${state.errors} errors.`);
  render();
}

// ---- keyboard input ---------------------------------------------------------
// Left half of the keyboard counts as the left hand, right half as the right.
const LEFT_KEYS = new Set("12345`qwertasdfgzxcvb".split(""));
const RIGHT_KEYS = new Set("67890-=yuiophjkl;nm,./".split(""));

function sideForKey(k) {
  k = k.toLowerCase();
  if (LEFT_KEYS.has(k)) return "left";
  if (RIGHT_KEYS.has(k)) return "right";
  return null;
}

window.addEventListener("keydown", (e) => {
  if (state.mode !== "keyboard") return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
  if (e.repeat) return; // ignore auto-repeat so a held key = one finger
  const side = sideForKey(e.key);
  if (!side) return;
  e.preventDefault();
  onHit(side, e.code);
});
window.addEventListener("keyup", (e) => {
  if (state.mode !== "keyboard") return;
  const side = sideForKey(e.key);
  if (!side) return;
  onRelease(side, e.code);
});

// ---- Web MIDI ---------------------------------------------------------------
let midiAccess;
async function connectMidi() {
  if (!navigator.requestMIDIAccess) {
    setMidiStatus("Web MIDI not supported in this browser", false);
    return;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess();
    populateMidiInputs();
    midiAccess.onstatechange = populateMidiInputs;
    setMidiStatus("connected", true);
  } catch (err) {
    setMidiStatus("permission denied", false);
  }
}

function populateMidiInputs() {
  const sel = $("midiInputs");
  const inputs = midiAccess ? [...midiAccess.inputs.values()] : [];
  sel.hidden = inputs.length === 0;
  sel.innerHTML = inputs.map((i) => `<option value="${i.id}">${i.name}</option>`).join("");
  for (const input of inputs) input.onmidimessage = onMidi;
  if (inputs.length) setMidiStatus(`connected · ${inputs.length} device${inputs.length === 1 ? "" : "s"}`, true);
  else setMidiStatus("no devices found — plug one in", false);
}

function onMidi(e) {
  if (state.mode !== "midi") return;
  const [status, note, velocity] = e.data;
  const cmd = status & 0xf0;
  const side = note < MIDI_SPLIT ? "left" : "right";
  if (cmd === 0x90 && velocity > 0) onHit(side, "n" + note);       // note on
  else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) onRelease(side, "n" + note); // note off
}

function setMidiStatus(text, ok) {
  const el = $("midiStatus");
  el.textContent = text;
  el.className = "pill " + (ok ? "ok" : "bad");
}

// ---- mode / control wiring --------------------------------------------------

function setSeg(groupId, attr, value, key) {
  for (const b of $(groupId).querySelectorAll("button")) {
    b.setAttribute("aria-pressed", String(b.dataset[attr] === value));
  }
  state[key] = value;
}

function applyMode() {
  $("midiRow").hidden = state.mode !== "midi";
  const hints = {
    paper: "Paper mode: print this sheet (Ctrl/Cmd-P) and play away from the screen.",
    keyboard: "Keyboard mode: tap keys on the LEFT half of the keyboard for your left hand, the RIGHT half for your right. " +
      (state.count === "fingers" ? "Hold the right number of keys down at once." : "Tap the right number of times."),
    midi: "MIDI mode: connect a keyboard. Notes below middle C = left hand, middle C and up = right hand. " +
      (state.count === "fingers" ? "Press the right number of notes together." : "Play the right number of notes."),
  };
  $("hint").textContent = hints[state.mode];
}

$("mode").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  setSeg("mode", "mode", b.dataset.mode, "mode");
  applyMode(); generate();
});
$("diff").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  setSeg("diff", "diff", b.dataset.diff, "diff"); generate();
});
$("count").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  setSeg("count", "count", b.dataset.count, "count"); applyMode(); generate();
});
$("rows").addEventListener("change", (e) => {
  const n = Math.max(2, Math.min(40, Number(e.target.value) || 8));
  state.rows = n; e.target.value = n; generate();
});
$("new").addEventListener("click", generate);
$("print").addEventListener("click", () => window.print());
$("again").addEventListener("click", () => { $("overlay").classList.remove("show"); generate(); });
$("midiConnect").addEventListener("click", connectMidi);

// ---- boot -------------------------------------------------------------------
applyMode();
generate();
