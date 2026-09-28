<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getRules } from '$lib/api/http';
  import type { RuleSection } from '@manhunt/types';

  let rules = $state<RuleSection[]>([]);
  let loading = $state(true);
  let error = $state('');

  onMount(async () => {
    try {
      rules = await getRules();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  });
</script>

<div class="container">
  <div class="flex-between" style="margin-bottom: 1rem;">
    <h1>Règles du jeu</h1>
    <button class="btn-secondary" style="padding: 0.5rem 1rem;" onclick={() => history.back()}>
      ← Retour
    </button>
  </div>

  {#if loading}
    <div class="card" style="text-align: center; color: var(--text-muted);">
      Chargement...
    </div>
  {:else if error}
    <div class="card">
      <p class="error">{error}</p>
    </div>
  {:else}
    {#each rules as rule}
      <div class="card" style="padding: 1rem;">
        <h2 style="color: var(--accent); margin-bottom: 0.35rem; font-size: 1rem;">{rule.title}</h2>
        <p style="line-height: 1.5; color: var(--text-muted); font-size: 0.8rem;">{rule.content}</p>
      </div>
    {/each}
  {/if}
</div>
