<script lang="ts">
  import type { ChatMessage, ChatChannel } from '@manhunt/types';
  import type { Snippet } from 'svelte';

  interface Props {
    open?: boolean;
    messages: ChatMessage[];
    visibleChannels: ChatChannel[];
    activeChannel: ChatChannel;
    onChannelChange: (ch: ChatChannel) => void;
    onSend: (text: string) => void;
    unreadCount?: number;
  }

  let {
    open = $bindable(false),
    messages,
    visibleChannels,
    activeChannel,
    onChannelChange,
    onSend,
    unreadCount = 0,
  }: Props = $props();

  let chatInput = $state('');
  let chatEndRef: HTMLDivElement | undefined = $state();
  let drawerEl: HTMLDivElement | undefined = $state();
  let startX = 0;
  let currentTranslate = 0;
  let dragging = false;

  let filteredMessages = $derived(
    messages.filter((m) => m.channel === activeChannel)
  );

  function send() {
    const text = chatInput.trim();
    if (!text) return;
    onSend(text);
    chatInput = '';
    setTimeout(() => chatEndRef?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function onTouchStart(e: TouchEvent) {
    dragging = true;
    startX = e.touches[0].clientX;
    if (drawerEl) drawerEl.style.transition = 'none';
  }

  function onTouchMove(e: TouchEvent) {
    if (!dragging || !drawerEl) return;
    const deltaX = e.touches[0].clientX - startX;
    currentTranslate = Math.max(0, deltaX);
    drawerEl.style.transform = `translateX(${currentTranslate}px)`;
  }

  function onTouchEnd() {
    if (!dragging || !drawerEl) return;
    dragging = false;
    drawerEl.style.transition = '';
    if (currentTranslate > 100) {
      open = false;
    }
    currentTranslate = 0;
    drawerEl.style.transform = '';
  }

  $effect(() => {
    if (open && chatEndRef) {
      setTimeout(() => chatEndRef?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  });
</script>

<!-- Toggle button (always visible) -->
<button class="chat-toggle" onclick={() => open = !open} aria-label="Ouvrir le chat">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
  {#if unreadCount > 0}
    <span class="unread-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>
  {/if}
</button>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="drawer-backdrop" class:visible={open} onclick={() => open = false}></div>

<!-- Drawer -->
<div
  bind:this={drawerEl}
  class="chat-drawer"
  class:open
  ontouchstart={onTouchStart}
  ontouchmove={onTouchMove}
  ontouchend={onTouchEnd}
  role="dialog"
  tabindex="-1"
>
  <div class="drawer-header">
    <h3>Chat</h3>
    <button class="close-btn" onclick={() => open = false} aria-label="Fermer">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>

  <div class="channel-tabs">
    {#each visibleChannels as ch}
      <button
        class="channel-tab"
        class:active={activeChannel === ch}
        onclick={() => onChannelChange(ch)}
      >
        {ch === 'tous' ? 'Tous' : ch === 'proies' ? 'Proies' : 'Chasseurs'}
      </button>
    {/each}
  </div>

  <div class="messages-area">
    {#each filteredMessages as msg}
      <div class="message">
        <span class="msg-time">{formatTime(msg.timestamp)}</span>
        <span class="msg-pseudo">{msg.pseudo}</span>
        <span class="msg-text">{msg.text}</span>
      </div>
    {/each}
    {#if filteredMessages.length === 0}
      <p class="empty-msg">Aucun message</p>
    {/if}
    <div bind:this={chatEndRef}></div>
  </div>

  <div class="chat-input-area">
    <input
      type="text"
      placeholder="Message..."
      bind:value={chatInput}
      onkeydown={(e) => { if (e.key === 'Enter') send(); }}
    />
    <button class="send-btn" onclick={send} disabled={!chatInput.trim()} aria-label="Envoyer">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    </button>
  </div>
</div>

<style>
  .chat-toggle {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 80;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  }
  .chat-toggle:active {
    background: var(--surface-hover);
  }

  .unread-dot {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 20px;
    height: 20px;
    border-radius: 10px;
    background: var(--accent);
    color: white;
    font-size: 0.65rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    box-shadow: 0 0 8px rgba(255, 68, 68, 0.6);
    animation: pulse-dot 2s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.15); }
  }

  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
    z-index: 110;
  }
  .drawer-backdrop.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .chat-drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(85vw, 360px);
    background: var(--bg);
    z-index: 120;
    transform: translateX(100%);
    transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
    display: flex;
    flex-direction: column;
    touch-action: pan-y;
  }
  .chat-drawer.open {
    transform: translateX(0);
  }

  .drawer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .drawer-header h3 {
    font-size: 1.1rem;
    font-weight: 700;
    margin: 0;
  }
  .close-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--surface);
    border: none;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .channel-tabs {
    display: flex;
    gap: 4px;
    padding: 12px 20px;
    flex-shrink: 0;
  }
  .channel-tab {
    flex: 1;
    padding: 8px 4px;
    font-size: 0.8rem;
    font-weight: 600;
    border-radius: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-muted);
    text-transform: capitalize;
  }
  .channel-tab.active {
    background: var(--accent);
    border-color: var(--accent);
    color: white;
  }

  .messages-area {
    flex: 1;
    overflow-y: auto;
    padding: 12px 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overscroll-behavior: contain;
  }

  .message {
    font-size: 0.82rem;
    line-height: 1.4;
  }
  .msg-time {
    color: var(--text-muted);
    font-size: 0.7rem;
    margin-right: 6px;
  }
  .msg-pseudo {
    font-weight: 600;
    margin-right: 6px;
  }
  .msg-text {
    color: var(--text);
  }
  .empty-msg {
    color: var(--text-muted);
    font-size: 0.82rem;
    text-align: center;
    padding: 2rem 0;
  }

  .chat-input-area {
    display: flex;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }
  .chat-input-area input {
    flex: 1;
    padding: 10px 14px;
    font-size: 0.9rem;
  }
  .send-btn {
    width: 44px;
    height: 44px;
    border-radius: var(--radius);
    background: var(--accent);
    border: none;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    flex-shrink: 0;
  }
  .send-btn:disabled {
    opacity: 0.4;
  }
</style>
