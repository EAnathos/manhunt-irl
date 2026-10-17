<script lang="ts">
  import type { ChatChannel, Role } from '@manhunt/types';
  import { voice, startTalking, stopTalking } from '$lib/stores/voice.svelte';

  interface Props {
    role: Role;
  }

  let { role }: Props = $props();

  let teamChannel = $derived<ChatChannel>(role === 'CHASSEUR' ? 'chasseurs' : 'proies');

  function press(e: PointerEvent, channel: ChatChannel) {
    e.preventDefault();
    // Keep receiving pointerup even if the finger slides off the button.
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    startTalking(channel);
  }

  function release() {
    if (voice.talking) stopTalking();
  }

  function channelLabel(channel: ChatChannel): string {
    return channel === 'tous' ? 'Tous' : 'Équipe';
  }
</script>

<svelte:window onblur={release} />

{#if voice.speakers.length > 0 || voice.talking || voice.micError}
  <div class="voice-status">
    {#if voice.micError}
      <div class="voice-line voice-error">{voice.micError}</div>
    {/if}
    {#if voice.talking}
      <div class="voice-line voice-me">
        <span class="voice-dot"></span> Tu parles · {channelLabel(voice.talking)}
      </div>
    {/if}
    {#each voice.speakers as speaker (speaker.sessionId)}
      <div class="voice-line">
        <span class="voice-bars"><i></i><i></i><i></i></span>
        {speaker.pseudo} <small>· {channelLabel(speaker.channel)}</small>
      </div>
    {/each}
  </div>
{/if}

<div class="voice-controls">
  <button
    class="ptt"
    class:ptt-hunter={role === 'CHASSEUR'}
    class:ptt-prey={role === 'PROIE'}
    class:active={voice.talking === teamChannel}
    onpointerdown={(e) => press(e, teamChannel)}
    onpointerup={release}
    onpointercancel={release}
    oncontextmenu={(e) => e.preventDefault()}
    aria-label="Maintenir pour parler à l'équipe"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
    <span>Équipe</span>
  </button>
  <button
    class="ptt ptt-all"
    class:active={voice.talking === 'tous'}
    onpointerdown={(e) => press(e, 'tous')}
    onpointerup={release}
    onpointercancel={release}
    oncontextmenu={(e) => e.preventDefault()}
    aria-label="Maintenir pour parler à tous"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
    <span>Tous</span>
  </button>
</div>

<style>
  .voice-controls {
    position: fixed;
    right: 16px;
    bottom: calc(110px + var(--safe-bottom));
    z-index: 80;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ptt {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    background: var(--surface);
    border: 2px solid var(--border);
    color: var(--text);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    /* Long-press must not select text or open the iOS callout */
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    touch-action: none;
    transition: transform 0.1s, background 0.1s;
  }
  .ptt-hunter {
    border-color: var(--hunter);
    color: var(--hunter);
  }
  .ptt-prey {
    border-color: var(--prey);
    color: var(--prey);
  }
  .ptt-all {
    border-color: var(--warning);
    color: var(--warning);
  }
  .ptt.active {
    transform: scale(1.12);
    background: currentColor;
    box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.15), 0 0 20px currentColor;
  }
  .ptt.active svg,
  .ptt.active span {
    color: #0f0f0f;
    fill: #0f0f0f;
  }

  .voice-status {
    position: fixed;
    right: 88px;
    bottom: calc(118px + var(--safe-bottom));
    z-index: 80;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    max-width: calc(100vw - 110px);
    pointer-events: none;
  }
  .voice-line {
    background: rgba(26, 26, 26, 0.9);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 0.8rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    white-space: nowrap;
  }
  .voice-line small {
    color: var(--text-muted);
    font-weight: 400;
  }
  .voice-me {
    border-color: var(--success);
    color: var(--success);
  }
  .voice-error {
    border-color: var(--accent);
    color: var(--accent);
    white-space: normal;
    border-radius: 12px;
  }
  .voice-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
    animation: voice-blink 1s ease-in-out infinite;
  }
  .voice-bars {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 12px;
  }
  .voice-bars i {
    width: 3px;
    background: var(--success);
    border-radius: 1px;
    animation: voice-bar 0.6s ease-in-out infinite alternate;
  }
  .voice-bars i:nth-child(2) { animation-delay: 0.2s; }
  .voice-bars i:nth-child(3) { animation-delay: 0.4s; }
  @keyframes voice-bar {
    from { height: 3px; }
    to { height: 12px; }
  }
  @keyframes voice-blink {
    50% { opacity: 0.3; }
  }
</style>
