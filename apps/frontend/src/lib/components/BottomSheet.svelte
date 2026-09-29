<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    peekContent?: Snippet;
    open?: boolean;
  }

  let { children, peekContent, open = $bindable(false) }: Props = $props();

  let sheetEl: HTMLDivElement | undefined = $state();
  let startY = 0;
  let currentTranslate = 0;
  let dragging = false;

  function onTouchStart(e: TouchEvent) {
    dragging = true;
    startY = e.touches[0].clientY;
    if (sheetEl) sheetEl.style.transition = 'none';
  }

  function onTouchMove(e: TouchEvent) {
    if (!dragging || !sheetEl) return;
    const deltaY = e.touches[0].clientY - startY;
    if (open) {
      currentTranslate = Math.max(0, deltaY);
    } else {
      currentTranslate = Math.min(0, deltaY);
    }
    sheetEl.style.transform = open
      ? `translateY(${currentTranslate}px)`
      : `translateY(calc(100% - var(--peek-height) + ${currentTranslate}px))`;
  }

  function onTouchEnd() {
    if (!dragging || !sheetEl) return;
    dragging = false;
    sheetEl.style.transition = '';
    const threshold = 80;
    if (open && currentTranslate > threshold) {
      open = false;
    } else if (!open && currentTranslate < -threshold) {
      open = true;
    }
    currentTranslate = 0;
    sheetEl.style.transform = '';
  }

  function onHandleClick() {
    open = !open;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="bottom-sheet-backdrop" class:visible={open} onclick={() => open = false}></div>

<div
  bind:this={sheetEl}
  class="bottom-sheet"
  class:open
  ontouchstart={onTouchStart}
  ontouchmove={onTouchMove}
  ontouchend={onTouchEnd}
  role="dialog"
  tabindex="-1"
>
  <button class="handle-zone" onclick={onHandleClick} aria-label="Toggle panel">
    <div class="handle"></div>
  </button>
  {#if peekContent}
    <div class="peek-content">
      {@render peekContent()}
    </div>
  {/if}
  <div class="sheet-body">
    {@render children()}
  </div>
</div>

<style>
  .bottom-sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.3s ease;
    z-index: 90;
  }
  .bottom-sheet-backdrop.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .bottom-sheet {
    --peek-height: 90px;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 85vh;
    background: var(--surface);
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
    z-index: 100;
    transform: translateY(calc(100% - var(--peek-height)));
    transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
    box-shadow: 0 -4px 30px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    touch-action: none;
  }
  .bottom-sheet.open {
    transform: translateY(0);
  }

  .handle-zone {
    display: flex;
    justify-content: center;
    padding: 12px 0 4px;
    cursor: grab;
    background: none;
    border: none;
    width: 100%;
    font-size: 0;
  }
  .handle-zone:active {
    cursor: grabbing;
  }
  .handle {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
  }

  .peek-content {
    padding: 8px 20px 12px;
    flex-shrink: 0;
  }

  .sheet-body {
    flex: 1;
    overflow-y: auto;
    padding: 0 20px 24px;
    overscroll-behavior: contain;
  }
</style>
