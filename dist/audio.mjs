let context;
let master;
let enabled = true;
let unlocked = false;
let musicTimer;
let musicStep = 0;

function getContext() {
  if (!context) {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.42;
    master.connect(context.destination);
  }
  return context;
}

function note(frequency, delay = 0, duration = .15, loudness = .08, wave = 'sine') {
  if (!enabled || !unlocked || document.hidden) return;
  const audio = getContext();
  if (!audio) return;
  const start = audio.currentTime + delay;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(.0001, start);
  gain.gain.exponentialRampToValueAtTime(loudness, start + .018);
  gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start(start);
  oscillator.stop(start + duration + .025);
}

function musicPulse() {
  if (!enabled || !unlocked || document.hidden) return;
  const melody = [392, 440, 523.25, 440, 349.23, 392, 329.63, 392];
  note(melody[musicStep % melody.length], 0, .32, .018, 'triangle');
  if (musicStep % 4 === 0) note(196, 0, .46, .013, 'sine');
  musicStep++;
}

function startMusic() {
  if (musicTimer || !enabled || !unlocked || document.hidden) return;
  musicPulse();
  musicTimer = setInterval(musicPulse, 620);
}

function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}

export function unlockAudio() {
  if (!enabled) return;
  const audio = getContext();
  if (!audio) return;
  unlocked = true;
  audio.resume().catch(() => {});
  startMusic();
}

export function setSoundEnabled(value) {
  enabled = Boolean(value);
  if (!enabled) {
    stopMusic();
    if (master) master.gain.setTargetAtTime(.0001, context.currentTime, .02);
  } else if (unlocked) {
    if (master) master.gain.setTargetAtTime(.42, context.currentTime, .02);
    context?.resume().catch(() => {});
    startMusic();
  }
}

export function playSound(kind) {
  if (!enabled || !unlocked) return;
  switch (kind) {
    case 'select': note(520, 0, .085, .07, 'sine'); note(700, .045, .07, .035, 'sine'); break;
    case 'match': note(523.25, 0, .12, .10, 'triangle'); note(659.25, .095, .13, .10, 'triangle'); note(783.99, .19, .18, .10, 'triangle'); break;
    case 'tool': note(440, 0, .11, .07, 'triangle'); note(587.33, .11, .16, .07, 'triangle'); break;
    case 'undo': note(587.33, 0, .11, .06, 'sine'); note(392, .11, .15, .06, 'sine'); break;
    case 'lose': note(392, 0, .2, .08, 'triangle'); note(329.63, .19, .23, .08, 'triangle'); note(261.63, .4, .38, .07, 'triangle'); break;
    case 'win': [523.25, 659.25, 783.99, 1046.5].forEach((tone, index) => note(tone, index * .12, .24, .09, 'triangle')); break;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopMusic();
  else startMusic();
});
