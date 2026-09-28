<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Zone } from '@manhunt/types';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';

  interface Props {
    hunterPositions: Array<{ sessionId: string; pseudo: string; latitude: number; longitude: number }>;
    preyPositions: Array<{ sessionId: string; pseudo: string; latitude: number; longitude: number }>;
    myPosition: { latitude: number; longitude: number } | null;
    mySessionId: string;
    myRole: 'CHASSEUR' | 'PROIE';
    zone?: Zone;
    gracePeriodActive: boolean;
  }

  let { hunterPositions, preyPositions, myPosition, mySessionId, myRole, zone, gracePeriodActive }: Props = $props();

  let mapContainer: HTMLDivElement | undefined = $state();
  let map: L.Map | null = null;
  let markers = new Map<string, L.Marker>();
  let zoneLayer: L.Circle | null = null;
  let myMarker: L.Marker | null = null;
  let initialized = false;

  const hunterIcon = L.divIcon({
    className: 'map-marker',
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#ff4444;border:2px solid #fff;box-shadow:0 0 6px rgba(255,68,68,0.6);"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  const preyIcon = L.divIcon({
    className: 'map-marker',
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#44aaff;border:2px solid #fff;box-shadow:0 0 6px rgba(68,170,255,0.6);"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  const myIcon = L.divIcon({
    className: 'map-marker',
    html: '<div style="width:16px;height:16px;border-radius:50%;background:#44cc44;border:3px solid #fff;box-shadow:0 0 8px rgba(68,204,68,0.6);"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  onMount(() => {
    if (!mapContainer) return;

    map = L.map(mapContainer, {
      zoomControl: false,
      attributionControl: false,
    }).setView([46.6, 2.5], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    if (myPosition) {
      map.setView([myPosition.latitude, myPosition.longitude], 16);
    }

    initialized = true;
  });

  onDestroy(() => {
    if (map) {
      map.remove();
      map = null;
    }
  });

  $effect(() => {
    if (!map || !initialized) return;

    const activeIds = new Set<string>();

    if (myRole === 'CHASSEUR') {
      for (const h of hunterPositions) {
        activeIds.add(h.sessionId);
        if (h.sessionId === mySessionId) continue;
        const existing = markers.get(h.sessionId);
        if (existing) {
          existing.setLatLng([h.latitude, h.longitude]);
        } else {
          const m = L.marker([h.latitude, h.longitude], { icon: hunterIcon })
            .bindTooltip(h.pseudo, { permanent: false, direction: 'top', offset: [0, -10] })
            .addTo(map!);
          markers.set(h.sessionId, m);
        }
      }

      if (!gracePeriodActive) {
        for (const p of preyPositions) {
          activeIds.add(p.sessionId);
          const existing = markers.get(p.sessionId);
          if (existing) {
            existing.setLatLng([p.latitude, p.longitude]);
          } else {
            const m = L.marker([p.latitude, p.longitude], { icon: preyIcon })
              .bindTooltip(p.pseudo, { permanent: false, direction: 'top', offset: [0, -10] })
              .addTo(map!);
            markers.set(p.sessionId, m);
          }
        }
      }
    }

    for (const [id, m] of markers) {
      if (!activeIds.has(id)) {
        m.remove();
        markers.delete(id);
      }
    }
  });

  $effect(() => {
    if (!map || !initialized || !myPosition) return;
    if (myMarker) {
      myMarker.setLatLng([myPosition.latitude, myPosition.longitude]);
    } else {
      myMarker = L.marker([myPosition.latitude, myPosition.longitude], { icon: myIcon })
        .bindTooltip('Moi', { permanent: false, direction: 'top', offset: [0, -10] })
        .addTo(map);

      if (!markers.size) {
        map.setView([myPosition.latitude, myPosition.longitude], 16);
      }
    }
  });

  $effect(() => {
    if (!map || !initialized) return;

    if (zoneLayer) {
      zoneLayer.remove();
      zoneLayer = null;
    }

    if (zone?.type === 'cercle' && zone.centre && zone.rayon) {
      zoneLayer = L.circle([zone.centre.latitude, zone.centre.longitude], {
        radius: zone.rayon,
        color: '#ff4444',
        fillColor: '#ff4444',
        fillOpacity: 0.08,
        weight: 2,
        dashArray: '6 4',
      }).addTo(map);
    }
  });
</script>

<div bind:this={mapContainer} style="width: 100%; height: 280px; border-radius: var(--radius); overflow: hidden;"></div>

<style>
  :global(.map-marker) {
    background: none !important;
    border: none !important;
  }
</style>
