import type { ChatChannel, WSServerMessage } from '@manhunt/types';
import { onWsMessage, sendWs } from '$lib/api/ws';
import { getAudioContext, getVoiceOutput, resumeAudio } from '$lib/audio';

/**
 * Push-to-talk voice chat relayed through the game WebSocket.
 * Audio is sent as 16 kHz mono G.711 µ-law (16 KB/s): telephone quality,
 * light enough for 4G, and decodable everywhere with plain Web Audio.
 */
const SAMPLE_RATE = 16_000;
const MAX_TALK_MS = 30_000;
const JITTER_BUFFER_S = 0.15;
const SPEAKER_TIMEOUT_S = 1.5;

export const voice = $state<{
  /** Channel I'm currently talking on */
  talking: ChatChannel | null;
  speakers: Array<{ sessionId: string; pseudo: string; channel: ChatChannel }>;
  micError: string | null;
}>({
  talking: null,
  speakers: [],
  micError: null,
});

// ── µ-law codec (G.711) ──────────────────────────────────

const BIAS = 0x84;
const CLIP = 32635;

function encodeSample(sample: number): number {
  let s = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
  const sign = (s >> 8) & 0x80;
  if (sign) s = -s;
  if (s > CLIP) s = CLIP;
  s += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; exponent--, mask >>= 1);
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

const DECODE_TABLE = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  const s = (((mantissa << 3) + BIAS) << exponent) - BIAS;
  DECODE_TABLE[i] = (sign ? -s : s) / 32768;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(data: string): Uint8Array {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Downsample by averaging, then µ-law encode. */
function encodeChunk(input: Float32Array, inputRate: number): Uint8Array {
  const ratio = inputRate / SAMPLE_RATE;
  const length = Math.floor(input.length / ratio);
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = encodeSample(sum / Math.max(1, end - start));
  }
  return out;
}

// ── Capture ──────────────────────────────────────────────

let stream: MediaStream | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let processor: ScriptProcessorNode | null = null;
let sink: GainNode | null = null;
let seq = 0;
let maxTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;

export async function startTalking(channel: ChatChannel) {
  if (voice.talking) return;
  voice.talking = channel;
  voice.micError = null;
  seq = 0;
  const myAttempt = ++attempt;
  resumeAudio();
  const ctx = getAudioContext();

  let media: MediaStream;
  try {
    media = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    voice.micError = 'Micro refusé : autorise le micro pour ce site dans les réglages.';
    voice.talking = null;
    return;
  }

  // Released (or re-pressed) before the mic was ready.
  if (voice.talking !== channel || myAttempt !== attempt) {
    media.getTracks().forEach((t) => t.stop());
    return;
  }

  stream = media;
  source = ctx.createMediaStreamSource(media);
  // ScriptProcessor is deprecated but works on every target browser without a worklet file.
  processor = ctx.createScriptProcessor(4096, 1, 1);
  sink = ctx.createGain();
  sink.gain.value = 0; // must reach the destination to run, but silently
  processor.onaudioprocess = (e) => {
    if (!voice.talking) return;
    const bytes = encodeChunk(e.inputBuffer.getChannelData(0), ctx.sampleRate);
    sendWs({ type: 'voice_chunk', channel, seq: seq++, data: toBase64(bytes) });
  };
  source.connect(processor);
  processor.connect(sink);
  sink.connect(ctx.destination);

  maxTimer = setTimeout(stopTalking, MAX_TALK_MS);
}

export function stopTalking() {
  const channel = voice.talking;
  voice.talking = null;
  if (maxTimer) clearTimeout(maxTimer);
  maxTimer = null;
  if (processor) processor.onaudioprocess = null;
  source?.disconnect();
  processor?.disconnect();
  sink?.disconnect();
  // Release the mic right away: on iOS an open mic switches audio to the quiet "call" mode.
  stream?.getTracks().forEach((t) => t.stop());
  stream = source = processor = sink = null;
  if (channel) sendWs({ type: 'voice_end', channel });
}

// ── Playback ─────────────────────────────────────────────

const playheads = new Map<string, number>();
const speakerTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleSpeakerRemoval(sessionId: string, afterSeconds: number) {
  const prev = speakerTimers.get(sessionId);
  if (prev) clearTimeout(prev);
  speakerTimers.set(sessionId, setTimeout(() => {
    speakerTimers.delete(sessionId);
    playheads.delete(sessionId);
    voice.speakers = voice.speakers.filter((s) => s.sessionId !== sessionId);
  }, Math.max(0, afterSeconds) * 1000));
}

function playChunk(msg: Extract<WSServerMessage, { type: 'voice_chunk' }>) {
  const ctx = getAudioContext();
  resumeAudio();
  const bytes = fromBase64(msg.data);
  if (bytes.length === 0) return;
  const buffer = ctx.createBuffer(1, bytes.length, SAMPLE_RATE);
  const samples = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) samples[i] = DECODE_TABLE[bytes[i]];
  buffer.copyToChannel(samples, 0);

  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.connect(getVoiceOutput());
  const startAt = Math.max(ctx.currentTime + JITTER_BUFFER_S, playheads.get(msg.sessionId) ?? 0);
  node.start(startAt);
  const end = startAt + buffer.duration;
  playheads.set(msg.sessionId, end);

  if (!voice.speakers.some((s) => s.sessionId === msg.sessionId)) {
    voice.speakers = [...voice.speakers, { sessionId: msg.sessionId, pseudo: msg.pseudo, channel: msg.channel }];
  }
  // Safety net if voice_end is lost.
  scheduleSpeakerRemoval(msg.sessionId, end - ctx.currentTime + SPEAKER_TIMEOUT_S);
}

export function initVoice() {
  const unsub = onWsMessage((msg) => {
    if (msg.type === 'voice_chunk') {
      playChunk(msg);
    } else if (msg.type === 'voice_end') {
      const end = playheads.get(msg.sessionId) ?? 0;
      scheduleSpeakerRemoval(msg.sessionId, end - getAudioContext().currentTime + 0.1);
    }
  });
  return () => {
    unsub();
    stopTalking();
    for (const t of speakerTimers.values()) clearTimeout(t);
    speakerTimers.clear();
    playheads.clear();
    voice.speakers = [];
  };
}
