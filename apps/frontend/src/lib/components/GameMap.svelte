<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Zone, LatLng, Role } from '@manhunt/types';
  import L from 'leaflet';
  import 'leaflet-rotate';
  import 'leaflet/dist/leaflet.css';
  import { orientation, enableOrientation } from '$lib/stores/orientation.svelte';

  interface Props {
    hunterPositions: Array<{ sessionId: string; pseudo: string; latitude: number; longitude: number }>;
    preyPositions: Array<{ sessionId: string; pseudo: string; latitude: number; longitude: number }>;
    myPosition: { latitude: number; longitude: number } | null;
    mySessionId: string;
    myRole: Role;
    zone?: Zone;
    gracePeriodActive: boolean;
    fullscreen?: boolean;
    /** Show the compass button (north-up / heading-up toggle) */
    compass?: boolean;
    /** Prey only: where hunters last saw me */
    lastPing?: { latitude: number; longitude: number; timestamp: number } | null;
    /** End of game: everyone's position, regardless of role */
    revealPositions?: Array<{ sessionId: string; pseudo: string; role: Role; latitude: number; longitude: number }>;
    meetingPoint?: LatLng | null;
    tall?: boolean;
    /** Shrinking zone: final radius, drawn as a dotted circle */
    finalZoneRadius?: number | null;
  }

  let {
    hunterPositions,
    preyPositions,
    myPosition,
    mySessionId,
    myRole,
    zone,
    gracePeriodActive,
    fullscreen = false,
    compass = false,
    lastPing = null,
    revealPositions,
    meetingPoint = null,
    tall = false,
    finalZoneRadius = null,
  }: Props = $props();

  // leaflet-rotate adds these at runtime
  type RotatableMap = L.Map & { setBearing(deg: number): void; getBearing(): number };

  let mapContainer: HTMLDivElement | undefined = $state();
  let map: RotatableMap | null = null;
  let markers = new Map<string, L.Marker>();
  let zoneLayer: L.Circle | null = null;
  let myMarker: L.Marker | null = null;
  let lastPingMarker: L.Marker | null = null;
  let meetingMarker: L.Marker | null = null;
  let initialized = $state(false);
  let fittedReveal = false;

  let headingMode = $state(false);
  let followMe = $state(false);
  let bearing = $state(0);

  const dotIcon = (color: string, size = 14) => L.divIcon({
    className: 'map-marker',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 6px ${color}99;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

  const hunterIcon = dotIcon('#ff4444');
  const preyIcon = dotIcon('#44aaff');

  const myIcon = L.divIcon({
    className: 'map-marker',
    html: `<div class="me-wrap">
      <div class="me-cone"></div>
      <div class="me-dot"></div>
    </div>`,
    iconSize: [80, 80],
    iconAnchor: [40, 40],
  });

  const lastPingIcon = L.divIcon({
    className: 'map-marker',
    html: '<div class="last-ping"><div class="last-ping-ring"></div></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  const meetingIcon = L.divIcon({
    className: 'map-marker',
    html: '<div class="meeting-point">★</div>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

  onMount(() => {
    if (!mapContainer) return;

    map = L.map(mapContainer, {
      zoomControl: false,
      attributionControl: false,
      rotate: true,
      rotateControl: false,
      touchRotate: false,
      bearing: 0,
    } as L.MapOptions) as RotatableMap;
    map.setView([46.6, 2.5], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    if (myPosition) {
      map.setView([myPosition.latitude, myPosition.longitude], 16);
    }

    map.on('dragstart', () => { followMe = false; });

    initialized = true;
  });

  onDestroy(() => {
    if (map) {
      map.remove();
      map = null;
    }
  });

  function upsertMarker(id: string, lat: number, lng: number, icon: L.DivIcon, label: string, permanent = false) {
    const existing = markers.get(id);
    if (existing) {
      existing.setLatLng([lat, lng]);
      return;
    }
    const m = L.marker([lat, lng], { icon })
      .bindTooltip(label, { permanent, direction: 'top', offset: [0, -10], className: permanent ? 'name-tag' : '' })
      .addTo(map!);
    markers.set(id, m);
  }

  // Live player markers
  $effect(() => {
    if (!map || !initialized) return;

    const activeIds = new Set<string>();

    if (revealPositions) {
      for (const p of revealPositions) {
        if (p.sessionId === mySessionId) continue;
        activeIds.add(p.sessionId);
        upsertMarker(p.sessionId, p.latitude, p.longitude, p.role === 'CHASSEUR' ? hunterIcon : preyIcon, p.pseudo, true);
      }
    } else if (myRole === 'CHASSEUR') {
      for (const h of hunterPositions) {
        if (h.sessionId === mySessionId) continue;
        activeIds.add(h.sessionId);
        upsertMarker(h.sessionId, h.latitude, h.longitude, hunterIcon, h.pseudo);
      }

      if (!gracePeriodActive) {
        for (const p of preyPositions) {
          activeIds.add(p.sessionId);
          upsertMarker(p.sessionId, p.latitude, p.longitude, preyIcon, p.pseudo);
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

  // My marker
  $effect(() => {
    if (!map || !initialized || !myPosition) return;
    if (myMarker) {
      myMarker.setLatLng([myPosition.latitude, myPosition.longitude]);
    } else {
      myMarker = L.marker([myPosition.latitude, myPosition.longitude], { icon: myIcon, zIndexOffset: 1000 })
        .bindTooltip('Moi', { permanent: false, direction: 'top', offset: [0, -10] })
        .addTo(map);

      // Center on the first GPS fix (the end-of-game view fits everyone instead).
      if (!revealPositions) {
        map.setView([myPosition.latitude, myPosition.longitude], 16);
      }
    }
    if (followMe) {
      map.panTo([myPosition.latitude, myPosition.longitude], { animate: false });
    }
  });

  // Heading cone + map rotation
  $effect(() => {
    if (!map || !initialized) return;
    const heading = orientation.heading;
    if (headingMode && heading != null) {
      map.setBearing(-heading);
    }
    const currentBearing = map.getBearing();
    bearing = currentBearing;

    const cone = myMarker?.getElement()?.querySelector<HTMLElement>('.me-cone');
    if (cone) {
      if (heading == null) {
        cone.style.display = 'none';
      } else {
        cone.style.display = 'block';
        // Markers stay upright on screen, so add the map rotation.
        cone.style.transform = `rotate(${heading + currentBearing}deg)`;
      }
    }
  });

  // Prey: last ping
  $effect(() => {
    if (!map || !initialized) return;
    if (!lastPing) {
      lastPingMarker?.remove();
      lastPingMarker = null;
      return;
    }
    if (lastPingMarker) {
      lastPingMarker.setLatLng([lastPing.latitude, lastPing.longitude]);
    } else {
      lastPingMarker = L.marker([lastPing.latitude, lastPing.longitude], { icon: lastPingIcon, zIndexOffset: -100 })
        .bindTooltip('Dernier ping vu par les Chasseurs', { direction: 'top', offset: [0, -12] })
        .addTo(map);
      if (!myPosition) map.setView([lastPing.latitude, lastPing.longitude], 16);
    }
  });

  // End of game: meeting point
  $effect(() => {
    if (!map || !initialized) return;
    if (!meetingPoint) {
      meetingMarker?.remove();
      meetingMarker = null;
      return;
    }
    if (meetingMarker) {
      meetingMarker.setLatLng([meetingPoint.latitude, meetingPoint.longitude]);
    } else {
      meetingMarker = L.marker([meetingPoint.latitude, meetingPoint.longitude], { icon: meetingIcon, zIndexOffset: 2000 })
        .bindTooltip('Point de rendez-vous', { permanent: true, direction: 'top', offset: [0, -16], className: 'name-tag meeting-tag' })
        .addTo(map);
    }
  });

  // End of game: fit everyone once
  $effect(() => {
    // Wait for the players' positions, not just the meeting point.
    if (!map || !initialized || !revealPositions?.length || fittedReveal) return;
    const points: L.LatLngTuple[] = revealPositions.map((p) => [p.latitude, p.longitude]);
    if (meetingPoint) points.push([meetingPoint.latitude, meetingPoint.longitude]);
    if (myPosition) points.push([myPosition.latitude, myPosition.longitude]);
    fittedReveal = true;
    if (points.length === 1) map.setView(points[0], 17);
    else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 18 });
  });

  let finalZoneLayer: L.Circle | null = null;

  // Zone circle: updated in place (a shrinking zone changes every second)
  $effect(() => {
    if (!map || !initialized) return;
    const centre = zone?.type === 'cercle' ? zone.centre : undefined;
    const radius = zone?.rayon;

    if (!centre || !radius) {
      zoneLayer?.remove();
      zoneLayer = null;
    } else if (zoneLayer) {
      zoneLayer.setLatLng([centre.latitude, centre.longitude]);
      zoneLayer.setRadius(radius);
    } else {
      zoneLayer = L.circle([centre.latitude, centre.longitude], {
        radius,
        color: '#ff4444',
        fillColor: '#ff4444',
        fillOpacity: 0.08,
        weight: 2,
        dashArray: '6 4',
      }).addTo(map);
    }

    // Shrinking zone: show where it will end up
    if (!centre || !finalZoneRadius || (radius != null && finalZoneRadius >= radius)) {
      finalZoneLayer?.remove();
      finalZoneLayer = null;
    } else if (finalZoneLayer) {
      finalZoneLayer.setLatLng([centre.latitude, centre.longitude]);
      finalZoneLayer.setRadius(finalZoneRadius);
    } else {
      finalZoneLayer = L.circle([centre.latitude, centre.longitude], {
        radius: finalZoneRadius,
        color: '#ffaa00',
        fill: false,
        weight: 2,
        opacity: 0.8,
        dashArray: '2 6',
        interactive: false,
      }).addTo(map);
    }
  });

  async function toggleCompass() {
    if (!map) return;
    if (headingMode) {
      headingMode = false;
      followMe = false;
      map.setBearing(0);
      bearing = 0;
      return;
    }
    await enableOrientation();
    headingMode = true;
    followMe = true;
    if (myPosition) map.setView([myPosition.latitude, myPosition.longitude], Math.max(map.getZoom(), 17));
  }
</script>

<div bind:this={mapContainer} class="map-container" class:fullscreen class:tall></div>

{#if compass}
  <button
    class="compass-btn"
    class:active={headingMode}
    onclick={toggleCompass}
    aria-label={headingMode ? 'Orienter la carte vers le nord' : 'Orienter la carte selon le téléphone'}
  >
    <svg width="26" height="26" viewBox="0 0 24 24" style="transform: rotate({bearing}deg)">
      <polygon points="12,2 15.5,12 8.5,12" fill="#ff4444" />
      <polygon points="12,22 15.5,12 8.5,12" fill="currentColor" opacity="0.6" />
    </svg>
    <span class="compass-label">{headingMode ? 'Boussole' : 'Nord'}</span>
  </button>
{/if}

<style>
  .map-container {
    width: 100%;
    height: 280px;
    border-radius: var(--radius);
    overflow: hidden;
    /* Own stacking context so Leaflet panes (z-index 400+) stay below app overlays */
    position: relative;
    z-index: 0;
  }
  .map-container.tall {
    height: 55vh;
  }
  .map-container.fullscreen {
    position: fixed;
    inset: 0;
    height: 100%;
    border-radius: 0;
    z-index: 0;
  }
  :global(.map-marker) {
    background: none !important;
    border: none !important;
  }

  :global(.me-wrap) {
    position: relative;
    width: 80px;
    height: 80px;
  }
  :global(.me-dot) {
    position: absolute;
    left: 29px;
    top: 29px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #44cc44;
    border: 3px solid #fff;
    box-shadow: 0 0 8px rgba(68, 204, 68, 0.6);
  }
  :global(.me-cone) {
    display: none;
    position: absolute;
    inset: 0;
    background: conic-gradient(from -32deg at 50% 50%, rgba(68, 204, 68, 0.75) 0deg 64deg, transparent 64deg);
    border-radius: 50%;
    -webkit-mask: radial-gradient(circle closest-side, #000 15%, transparent 100%);
    mask: radial-gradient(circle closest-side, #000 15%, transparent 100%);
    transition: transform 0.1s linear;
  }

  :global(.last-ping) {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px dashed #44aaff;
    background: rgba(68, 170, 255, 0.15);
    position: relative;
  }
  :global(.last-ping-ring) {
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    border: 2px solid #44aaff;
    animation: ping-ring 2s ease-out infinite;
  }
  @keyframes -global-ping-ring {
    0% { transform: scale(1); opacity: 0.8; }
    100% { transform: scale(2.2); opacity: 0; }
  }

  :global(.meeting-point) {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #ffaa00;
    border: 3px solid #fff;
    color: #0f0f0f;
    font-size: 18px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 16px rgba(255, 170, 0, 0.8);
  }
  :global(.leaflet-tooltip.name-tag) {
    font-weight: 600;
    font-size: 0.75rem;
    padding: 2px 6px;
  }
  :global(.leaflet-tooltip.meeting-tag) {
    background: #ffaa00;
    border-color: #ffaa00;
    color: #0f0f0f;
  }

  .compass-btn {
    position: fixed;
    top: calc(72px + var(--safe-top));
    right: 16px;
    z-index: 80;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  }
  .compass-btn.active {
    border-color: var(--success);
    box-shadow: 0 0 10px rgba(68, 204, 68, 0.5);
  }
  .compass-btn svg {
    transition: transform 0.1s linear;
  }
  .compass-label {
    font-size: 0.5rem;
    font-weight: 700;
    text-transform: uppercase;
    margin-top: -2px;
    opacity: 0.8;
  }
</style>
