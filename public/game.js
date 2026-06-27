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
  variant: "numbers",      // numbers | shapes
  mode: "keyboard",        // paper | keyboard | touch | midi
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

// ---- shapes variant: spiral generators (SVG, viewBox 0 0 100 100) -----------
const SHAPE_TYPES = ["round", "square", "triangle"];
const SHAPE_COLOR = { round: "#3a9f57", square: "#7b62d6", triangle: "#d6457f" };

function roundSpiralPath() {
  const turns = 3.4, steps = 240, maxR = 44, cx = 50, cy = 50;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * 2 * Math.PI;
    const r = (i / steps) * maxR;
    const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
  }
  return d.trim();
}

// Angular spiral expanding from the centre: turn by `turnDeg` each segment,
// segment length grows every two turns. Used for square (90°) and triangle (120°).
function angularSpiralPath(turnDeg, segments, base) {
  let x = 50, y = 50, ang = turnDeg === 120 ? -90 : 0;
  let d = "M50 50 ";
  for (let i = 0; i < segments; i++) {
    const len = base * (Math.floor(i / 2) + 1);
    const r = (ang * Math.PI) / 180;
    x += len * Math.cos(r); y += len * Math.sin(r);
    d += "L" + x.toFixed(1) + " " + y.toFixed(1) + " ";
    ang += turnDeg;
  }
  return d.trim();
}

function shapeSvg(type) {
  const d = type === "round" ? roundSpiralPath()
    : type === "square" ? angularSpiralPath(90, 8, 8.5)
    : angularSpiralPath(120, 9, 10);
  return `<svg viewBox="0 0 100 100" aria-label="${type} spiral" role="img">` +
    `<path d="${d}" fill="none" stroke="${SHAPE_COLOR[type]}" stroke-width="3" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ---- grid generation --------------------------------------------------------

function maxFor(diff) { return diff === "beginner" ? 2 : 4; }

function rand(n) { return 1 + Math.floor(Math.random() * n); }

function generate() {
  if (state.variant === "shapes") {
    // Each row is a spiral type (same shape both columns, like the paper game),
    // to be traced by hand. Non-interactive — a print/trace activity.
    state.grid = Array.from({ length: state.rows }, () => ({
      shape: SHAPE_TYPES[Math.floor(Math.random() * SHAPE_TYPES.length)],
    }));
    state.current = 0;
    state.done = false;
    state.running = false;
    render();
    updateStatus();
    applyMode();
    announce("New shapes sheet ready. Trace each spiral with your left and right hand, or print it.");
    return;
  }
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
  applyMode();
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
  if (state.variant === "shapes") {
    body.innerHTML = state.grid.map((row) =>
      `<tr><td class="shape l">${shapeSvg(row.shape)}</td><td class="cur"></td>` +
      `<td class="shape r">${shapeSvg(row.shape)}</td></tr>`).join("");
    $("hands").hidden = true;
    return;
  }
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
  updateTouchZones();
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
  updateMini();
}

function updateMini() {
  if (state.variant === "shapes") { $("statusMini").textContent = `${state.rows} shapes`; return; }
  const s = state.running ? (performance.now() - state.startedAt) / 1000 : 0;
  $("statusMini").innerHTML =
    `Row ${Math.min(state.current + (state.done ? 0 : 1), state.rows)}/${state.rows}` +
    ` · ${s.toFixed(1)}s · ${state.errors} err`;
}

let timerRAF;
function tickTimer() {
  if (!state.running) return;
  const s = (performance.now() - state.startedAt) / 1000;
  $("timer").textContent = s.toFixed(1) + "s";
  updateMini();
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
  applyMode(); // hide the touch zones now the game is done
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
  const shapes = state.variant === "shapes";
  // In the shapes variant only the sheet + print/new/rows make sense.
  $("rowMode").hidden = shapes;
  $("rowDiff").hidden = shapes;
  $("rowCount").hidden = shapes;
  $("midiRow").hidden = shapes || state.mode !== "midi";
  // Touch zones overlay only in touch mode (numbers variant, not finished).
  const touchOn = !shapes && state.mode === "touch" && !state.done;
  const tz = $("touchzones");
  tz.classList.toggle("show", touchOn);
  tz.setAttribute("aria-hidden", String(!touchOn));
  // While the full-screen touch surface is up, hide the topbar + hint so nothing
  // bleeds through behind the zones.
  document.querySelector(".topbar").hidden = touchOn;
  $("hint").hidden = touchOn;

  if (shapes) {
    $("hint").textContent = "Shapes: trace each spiral with your left and right hand (same shape, both hands). Hit Print for a paper sheet.";
    return;
  }
  const hints = {
    paper: "Paper mode: print this sheet (Ctrl/Cmd-P) and play away from the screen.",
    keyboard: "Keyboard mode: tap keys on the LEFT half of the keyboard for your left hand, the RIGHT half for your right. " +
      (state.count === "fingers" ? "Hold the right number of keys down at once." : "Tap the right number of times."),
    touch: "Touch mode: tap the LEFT side of the screen for your left hand, the RIGHT side for your right. " +
      (state.count === "fingers" ? "Hold the right number of fingers down on each side at once." : "Tap the right number of times on each side."),
    midi: "MIDI mode: connect a keyboard. Notes below middle C = left hand, middle C and up = right hand. " +
      (state.count === "fingers" ? "Press the right number of notes together." : "Play the right number of notes."),
  };
  $("hint").textContent = hints[state.mode];
}

// ---- touch input: left half of the screen = left hand, right half = right ----
// Uses Pointer Events so multi-touch is counted via distinct pointerIds.
const pointerSide = new Map(); // pointerId -> "left" | "right"

function bindZone(el, side) {
  el.addEventListener("pointerdown", (e) => {
    if (state.mode !== "touch" || state.variant === "shapes" || state.done) return;
    e.preventDefault();
    pointerSide.set(e.pointerId, side);
    // fingers: identity by pointerId; taps: unique label so each press counts.
    onHit(side, state.count === "fingers" ? "p" + e.pointerId : "p" + e.pointerId + "-" + tapSeq++);
    updateTouchZones();
  }, { passive: false });
}
let tapSeq = 0;
function releasePointer(e) {
  const side = pointerSide.get(e.pointerId);
  if (side === undefined) return;
  pointerSide.delete(e.pointerId);
  if (state.count === "fingers") { onRelease(side, "p" + e.pointerId); updateTouchZones(); }
}
window.addEventListener("pointerup", releasePointer);
window.addEventListener("pointercancel", releasePointer);

function updateTouchZones() {
  if (state.mode !== "touch" || state.variant === "shapes") return;
  const row = state.grid[state.current];
  if (!row || state.done) { $("zoneLcnt").textContent = ""; $("zoneRcnt").textContent = ""; return; }
  $("zoneLcnt").textContent = `${handCount("left")} / ${row.left}`;
  $("zoneRcnt").textContent = `${handCount("right")} / ${row.right}`;
}

$("variant").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  setSeg("variant", "variant", b.dataset.variant, "variant");
  applyMode(); generate();
});
$("mode").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  setSeg("mode", "mode", b.dataset.mode, "mode");
  applyMode(); generate();
});
bindZone($("zoneL"), "left");
bindZone($("zoneR"), "right");

// Options overlay open/close.
function openOptions() { $("optionsOverlay").classList.add("show"); }
function closeOptions() { $("optionsOverlay").classList.remove("show"); }
$("optionsBtn").addEventListener("click", openOptions);
$("optionsDone").addEventListener("click", closeOptions);
$("touchExit").addEventListener("click", openOptions);
$("optionsOverlay").addEventListener("click", (e) => { if (e.target === $("optionsOverlay")) closeOptions(); });
// Changing the game variant or input mode closes the panel so you see the result.
$("variant").addEventListener("click", (e) => { if (e.target.closest("button")) closeOptions(); });
$("mode").addEventListener("click", (e) => { if (e.target.closest("button") && e.target.dataset.mode !== "midi") closeOptions(); });
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
