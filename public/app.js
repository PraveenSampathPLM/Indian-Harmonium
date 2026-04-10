const notes = [
  { id: "sa", key: "a", label: "Sa", frequency: 261.63, kind: "white" },
  { id: "re-flat", key: "w", label: "re", frequency: 277.18, kind: "black" },
  { id: "re", key: "s", label: "Re", frequency: 293.66, kind: "white" },
  { id: "ga-flat", key: "e", label: "ga", frequency: 311.13, kind: "black" },
  { id: "ga", key: "d", label: "Ga", frequency: 329.63, kind: "white" },
  { id: "ma", key: "f", label: "Ma", frequency: 349.23, kind: "white" },
  { id: "ma-sharp", key: "t", label: "Ma'", frequency: 369.99, kind: "black" },
  { id: "pa", key: "g", label: "Pa", frequency: 392.0, kind: "white" },
  { id: "dha-flat", key: "y", label: "dha", frequency: 415.3, kind: "black" },
  { id: "dha", key: "h", label: "Dha", frequency: 440.0, kind: "white" },
  { id: "ni-flat", key: "u", label: "ni", frequency: 466.16, kind: "black" },
  { id: "ni", key: "j", label: "Ni", frequency: 493.88, kind: "white" },
  { id: "sa-high", key: "k", label: "Sa'", frequency: 523.25, kind: "white" }
];

const droneConfig = {
  sa: 261.63,
  pa: 392.0,
  saHigh: 523.25
};

const keyboardEl = document.getElementById("keyboard");
const startButton = document.getElementById("startButton");
const pumpButton = document.getElementById("pumpButton");
const pressureFill = document.getElementById("pressureFill");
const pressureValue = document.getElementById("pressureValue");
const lidStateEl = document.getElementById("lidState");
const lidMetaEl = document.getElementById("lidMeta");
const toggleButtons = Array.from(document.querySelectorAll(".toggle-button"));

const keyElements = new Map();
const activeNotes = new Map();
const droneVoices = new Map();
const pressedKeys = new Set();

let audioContext;
let masterGain;
let pressure = 0.16;
let manualBoost = 0;
let isPumpHeld = false;
let lastLidChange = 0;
let lidOpen = true;
let lidAngle = null;
let animationStarted = false;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createKey(note) {
  const key = document.createElement("button");
  key.className = `key ${note.kind}`;
  key.dataset.note = note.id;
  key.innerHTML = `
    <span class="key-content">
      <span class="sargam">${note.label}</span>
      <span class="binding">${note.key}</span>
    </span>
  `;

  key.addEventListener("pointerdown", async () => {
    await unlockAudio();
    startNote(note.id);
  });

  key.addEventListener("pointerup", () => stopNote(note.id));
  key.addEventListener("pointerleave", () => stopNote(note.id));
  key.addEventListener("pointercancel", () => stopNote(note.id));

  keyElements.set(note.id, key);
  keyboardEl.appendChild(key);
}

notes.forEach(createKey);

function unlockAudio() {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(audioContext.destination);
  }

  return audioContext.resume();
}

function createVoice(frequency, tone = 1) {
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  const osc1 = audioContext.createOscillator();
  const osc2 = audioContext.createOscillator();
  const osc3 = audioContext.createOscillator();

  osc1.type = "sawtooth";
  osc2.type = "triangle";
  osc3.type = "square";
  osc1.frequency.value = frequency;
  osc2.frequency.value = frequency * 2;
  osc3.frequency.value = frequency * 0.5;

  gain.gain.value = 0;
  filter.type = "lowpass";
  filter.frequency.value = 1900 * tone;
  filter.Q.value = 2;

  osc1.connect(gain);
  osc2.connect(gain);
  osc3.connect(gain);
  gain.connect(filter);
  filter.connect(masterGain);

  osc1.start();
  osc2.start();
  osc3.start();

  return { gain, filter, oscillators: [osc1, osc2, osc3] };
}

function startNote(noteId) {
  if (!audioContext || activeNotes.has(noteId)) {
    return;
  }

  const note = notes.find((item) => item.id === noteId);
  if (!note) {
    return;
  }

  const voice = createVoice(note.frequency, note.kind === "black" ? 1.15 : 1);
  const now = audioContext.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(0, now);
  voice.gain.gain.linearRampToValueAtTime(0.12, now + 0.04);
  activeNotes.set(noteId, voice);
  keyElements.get(noteId)?.classList.add("active");
}

function stopNote(noteId) {
  if (!audioContext) {
    return;
  }

  const voice = activeNotes.get(noteId);
  if (!voice) {
    return;
  }

  const now = audioContext.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
  voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  setTimeout(() => {
    voice.oscillators.forEach((oscillator) => oscillator.stop());
  }, 220);
  activeNotes.delete(noteId);
  keyElements.get(noteId)?.classList.remove("active");
}

function setDrone(name, active) {
  if (!audioContext) {
    return;
  }

  if (active && !droneVoices.has(name)) {
    const voice = createVoice(droneConfig[name], 0.9);
    const now = audioContext.currentTime;
    voice.gain.gain.setValueAtTime(0, now);
    voice.gain.gain.linearRampToValueAtTime(0.045, now + 0.4);
    droneVoices.set(name, voice);
    return;
  }

  if (!active && droneVoices.has(name)) {
    const voice = droneVoices.get(name);
    const now = audioContext.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    setTimeout(() => {
      voice.oscillators.forEach((oscillator) => oscillator.stop());
    }, 560);
    droneVoices.delete(name);
  }
}

async function startInstrument() {
  await unlockAudio();
  startButton.textContent = "Harmonium Ready";
  startButton.disabled = true;
  startButton.style.opacity = "0.7";

  if (!animationStarted) {
    animationStarted = true;
    requestAnimationFrame(tick);
    connectLidStream();
  }
}

startButton.addEventListener("click", startInstrument);

function boostPressure(amount) {
  manualBoost = clamp(manualBoost + amount, 0, 0.7);
  pressure = clamp(pressure + amount, 0.08, 1);
}

function tick() {
  const angleRatio = typeof lidAngle === "number" ? clamp(lidAngle / 120, 0.04, 1) : lidOpen ? 0.38 : 0.12;
  const target = typeof lidAngle === "number" ? 0.08 + angleRatio * 0.62 : lidOpen ? 0.38 : 0.12;
  const pulseDecay = Date.now() - lastLidChange < 520 ? 0.16 : 0;
  manualBoost = clamp(manualBoost - (isPumpHeld ? -0.009 : 0.006), 0, 0.75);
  pressure += (target + pulseDecay + manualBoost - pressure) * 0.08;
  pressure = clamp(pressure, 0.05, 1);

  if (audioContext && masterGain) {
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.linearRampToValueAtTime(0.02 + pressure * 0.18, now + 0.05);
  }

  pressureFill.style.width = `${Math.round(pressure * 100)}%`;
  pressureValue.textContent = `${Math.round(pressure * 100)}%`;
  requestAnimationFrame(tick);
}

function updateLidState(state) {
  lidOpen = state.isOpen;
  lidAngle = typeof state.angle === "number" ? state.angle : null;
  lidStateEl.textContent = lidAngle !== null ? `${lidAngle.toFixed(1)}°` : lidOpen ? "Open" : "Closing / closed";
  lidMetaEl.textContent =
    state.sensorMode === "angle"
      ? `Live angle from ${state.source} | ${lidOpen ? "open" : "near closed"}`
      : state.source === "ioreg"
        ? "Falling back to macOS `AppleClamshellState`"
        : "Using manual fallback state";

  if (state.pulse) {
    lastLidChange = Date.now();
    if (typeof state.delta === "number" && Math.abs(state.delta) > 1) {
      boostPressure(clamp(Math.abs(state.delta) / 40, 0.02, 0.18));
    } else {
      boostPressure(0.18);
    }
  }
}

async function fetchInitialLidState() {
  try {
    const response = await fetch("/api/lid");
    const state = await response.json();
    updateLidState({ ...state, pulse: false });
  } catch {
    lidStateEl.textContent = "Unavailable";
    lidMetaEl.textContent = "Could not read sensor state. Manual pump still works.";
  }
}

function connectLidStream() {
  fetchInitialLidState();
  const events = new EventSource("/events");
  events.onmessage = (event) => {
    updateLidState(JSON.parse(event.data));
  };
}

pumpButton.addEventListener("pointerdown", async () => {
  await unlockAudio();
  isPumpHeld = true;
  boostPressure(0.12);
});

pumpButton.addEventListener("pointerup", () => {
  isPumpHeld = false;
});

pumpButton.addEventListener("pointerleave", () => {
  isPumpHeld = false;
});

document.addEventListener("keydown", async (event) => {
  if (event.repeat) {
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    await unlockAudio();
    isPumpHeld = true;
    boostPressure(0.1);
    return;
  }

  const note = notes.find((item) => item.key === event.key.toLowerCase());
  if (!note) {
    return;
  }

  await unlockAudio();
  pressedKeys.add(note.id);
  startNote(note.id);
});

document.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    isPumpHeld = false;
    return;
  }

  const note = notes.find((item) => item.key === event.key.toLowerCase());
  if (!note || !pressedKeys.has(note.id)) {
    return;
  }

  pressedKeys.delete(note.id);
  stopNote(note.id);
});

toggleButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    await unlockAudio();
    const active = !button.classList.contains("active");
    button.classList.toggle("active", active);
    setDrone(button.dataset.drone, active);
  });
});

fetchInitialLidState();
