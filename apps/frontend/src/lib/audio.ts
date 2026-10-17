/**
 * Shared Web Audio graph: background music + voice playback.
 * Music goes through a GainNode because iOS ignores HTMLAudioElement.volume,
 * which is the only way to duck it when someone talks.
 */
const MUSIC_VOLUME = 0.3;
const DUCKED_VOLUME = 0.04;

let ctx: AudioContext | null = null;
let musicEl: HTMLAudioElement | null = null;
let musicGain: GainNode | null = null;
let voiceGain: GainNode | null = null;
let ducked = false;

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

/** Browsers start the context suspended until a user gesture: call this from gestures / visibility changes. */
export function resumeAudio() {
  const c = getAudioContext();
  if (c.state !== 'running') c.resume().catch(() => {});
}

export function getVoiceOutput(): GainNode {
  const c = getAudioContext();
  if (!voiceGain) {
    voiceGain = c.createGain();
    voiceGain.gain.value = 1;
    voiceGain.connect(c.destination);
  }
  return voiceGain;
}

export function startMusic() {
  resumeAudio();
  if (!musicEl) {
    const c = getAudioContext();
    musicEl = new Audio('/hunted.mp3');
    musicEl.loop = true;
    musicGain = c.createGain();
    musicGain.gain.value = ducked ? DUCKED_VOLUME : MUSIC_VOLUME;
    c.createMediaElementSource(musicEl).connect(musicGain);
    musicGain.connect(c.destination);
  }
  if (musicEl.paused) musicEl.play().catch(() => {});
}

export function stopMusic() {
  if (musicEl) {
    musicEl.pause();
    musicEl.src = '';
    musicEl = null;
  }
  musicGain?.disconnect();
  musicGain = null;
}

/** Smoothly lower the music while someone is talking, then bring it back. */
export function setMusicDucked(value: boolean) {
  ducked = value;
  if (!musicGain || !ctx) return;
  const target = value ? DUCKED_VOLUME : MUSIC_VOLUME;
  // Fast fade down, slower fade back up.
  musicGain.gain.setTargetAtTime(target, ctx.currentTime, value ? 0.08 : 0.4);
}
