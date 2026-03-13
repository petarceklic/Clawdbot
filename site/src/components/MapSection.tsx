'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Sparkline from './Sparkline';

/* Leaflet is loaded globally via CDN in layout.tsx */
declare const L: any;

// --- Types ---
interface DisruptionEvent {
  id: number;
  summary: string;
  country: string;
  region: string;
  severity: number;
  type: string;
  commodity: string;
  routes: string;
  port: string;
  waterway: string;
  lat: number;
  lng: number;
  date: string;
}

interface TradeRoute {
  name: string;
  coords: [number, number][];
}

interface RiskIndex {
  score: number;
  label: string;
  sparkline: number[];
  change: number;
  trend: string;
}

interface SiteData {
  events: DisruptionEvent[];
  tradeRoutes: TradeRoute[];
  riskIndex: RiskIndex;
  stats: { disruptions: number; sources: number };
}

// --- Filter types ---
const FILTER_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'supply_cutoff', label: 'Supply Cutoff' },
  { key: 'strike', label: 'Strike' },
  { key: 'policy', label: 'Policy' },
  { key: 'protest', label: 'Protest' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'natural_event', label: 'Natural Event' },
] as const;

// --- Helpers ---
function getSeverityColor(severity: number): string {
  if (severity <= -3) return '#ee4466';
  if (severity === -2) return '#dd7744';
  if (severity === -1) return '#ccaa44';
  if (severity === 1) return '#15EE76';
  if (severity >= 2 && severity < 4) return '#15EE76';
  if (severity >= 4) return '#10dd6a';
  return '#15EE76';
}

function getMarkerSize(severity: number): number {
  const abs = Math.abs(severity);
  if (abs >= 4) return 22;
  if (abs >= 3) return 18;
  if (abs >= 2) return 14;
  return 7;
}

function createMarkerIcon(severity: number) {
  const size = getMarkerSize(severity);
  const color = getSeverityColor(severity);
  const abs = Math.abs(severity);

  const glowSize = size * 2.5;
  const center = glowSize / 2;
  const dur = abs >= 3 ? '1.5s' : abs >= 2 ? '2s' : '2.5s';

  const secondRing =
    abs >= 2
      ? `<circle cx="${center}" cy="${center}" r="${size / 2}" fill="none" stroke="${color}" stroke-width="0.8" opacity="0.2">
      <animate attributeName="r" from="${size / 2}" to="${size * 2}" dur="${dur}" begin="0.4s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.3" to="0" dur="${dur}" begin="0.4s" repeatCount="indefinite"/>
    </circle>`
      : '';

  const pulseCSS = `<circle cx="${center}" cy="${center}" r="${size / 2}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.4">
      <animate attributeName="r" from="${size / 2}" to="${size * 1.8}" dur="${dur}" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.5" to="0" dur="${dur}" repeatCount="indefinite"/>
    </circle>
    ${secondRing}`;

  const opacity = abs >= 3 ? 0.6 : abs >= 2 ? 0.5 : 0.35;

  const svg = `<svg width="${glowSize}" height="${glowSize}" viewBox="0 0 ${glowSize} ${glowSize}" xmlns="http://www.w3.org/2000/svg">
      ${pulseCSS}
      <circle cx="${center}" cy="${center}" r="${size / 2}" fill="${color}" opacity="${opacity}"/>
      <circle cx="${center}" cy="${center}" r="${size / 4}" fill="white" opacity="0.15"/>
    </svg>`;

  return L.divIcon({
    html: svg,
    className: 'map-marker',
    iconSize: [glowSize, glowSize],
    iconAnchor: [center, center],
  });
}

function createTooltipContent(event: DisruptionEvent): string {
  const sevColor = getSeverityColor(event.severity);
  const sevSign = event.severity > 0 ? '+' : '';

  let tagsHtml = `<span class="tooltip-tag">${event.type}</span>`;
  tagsHtml += `<span class="tooltip-tag">${event.commodity}</span>`;
  if (event.port) tagsHtml += `<span class="tooltip-tag">${event.port}</span>`;
  if (event.waterway)
    tagsHtml += `<span class="tooltip-tag">${event.waterway}</span>`;

  let routesHtml = '';
  if (event.routes) {
    routesHtml = `<div class="tooltip-routes">Routes: ${event.routes}</div>`;
  }

  return `<div class="tooltip-header">
      <span class="tooltip-severity" style="background: ${sevColor}22; color: ${sevColor};">${sevSign}${event.severity}</span>
      <span class="tooltip-country">${event.country}</span>
    </div>
    <div class="tooltip-summary">${event.summary}</div>
    <div class="tooltip-tags">${tagsHtml}</div>
    ${routesHtml}`;
}

function formatEventDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return '';
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const month = parseInt(dateStr.substring(4, 6), 10) - 1;
  const day = parseInt(dateStr.substring(6, 8), 10);
  return `${months[month]} ${day}`;
}

// --- Component ---
export default function MapSection() {
  const [data, setData] = useState<SiteData | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const sectionRef = useRef<HTMLElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const initializedRef = useRef(false);

  // Fetch data on mount
  useEffect(() => {
    fetch('/data.json')
      .then((res) => res.json())
      .then((d: SiteData) => setData(d))
      .catch(() => {});
  }, []);

  // Initialize map when section enters viewport AND data is loaded
  const initMap = useCallback(() => {
    if (
      initializedRef.current ||
      !data ||
      !mapContainerRef.current ||
      typeof L === 'undefined'
    )
      return;
    initializedRef.current = true;

    const { events, tradeRoutes } = data;

    const map = L.map(mapContainerRef.current, {
      center: [30, 30],
      zoom: 3,
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
      minZoom: 2,
      maxZoom: 8,
    });

    L.tileLayer(
      'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }
    ).addTo(map);

    // Trade route polylines
    tradeRoutes.forEach((route: TradeRoute) => {
      const latLngs = route.coords.map((c: [number, number]) => [c[1], c[0]]);
      L.polyline(latLngs, {
        color: '#22aadd',
        weight: 1.5,
        opacity: 0.08,
        dashArray: '8 6',
        interactive: false,
      }).addTo(map);
    });

    // Event markers with staggered drop-in
    const allMarkers: any[] = [];
    events.forEach((event: DisruptionEvent, i: number) => {
      const icon = createMarkerIcon(event.severity);
      const marker = L.marker([event.lat, event.lng], { icon, opacity: 0 });

      marker.bindPopup(createTooltipContent(event), {
        className: 'map-popup',
        offset: [0, -getMarkerSize(event.severity) / 2 - 4],
        maxWidth: 280,
        minWidth: 200,
        closeButton: true,
        autoPan: true,
      });

      marker._eventData = event;
      allMarkers.push(marker);

      setTimeout(() => {
        marker.addTo(map);
        marker.setOpacity(1);
        const el = marker.getElement();
        if (el) {
          el.style.transform += ' scale(0)';
          el.style.transition =
            'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease';
          requestAnimationFrame(() => {
            el.style.transform = el.style.transform.replace(
              'scale(0)',
              'scale(1)'
            );
          });
        }
      }, 300 + i * 80);
    });

    markersRef.current = allMarkers;
    mapInstanceRef.current = map;
  }, [data]);

  // IntersectionObserver to lazy-init map
  useEffect(() => {
    if (!data) return;
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          initMap();
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(section);

    return () => observer.disconnect();
  }, [data, initMap]);

  // Filter handler
  const handleFilter = (filterKey: string) => {
    setActiveFilter(filterKey);

    const map = mapInstanceRef.current;
    if (!map) return;

    map.closePopup();

    markersRef.current.forEach((marker: any) => {
      const event = marker._eventData as DisruptionEvent;
      const show = filterKey === 'all' || event.type === filterKey;

      if (show) {
        if (!map.hasLayer(marker)) {
          marker.addTo(map);
        }
      } else {
        if (map.hasLayer(marker)) {
          map.removeLayer(marker);
        }
      }
    });
  };

  // Disruption list click handler
  const handleDisruptionClick = (event: DisruptionEvent) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.flyTo([event.lat, event.lng], 5, { duration: 1 });
    const marker = markersRef.current.find(
      (m: any) => m._eventData.id === event.id
    );
    if (marker) {
      setTimeout(() => marker.openPopup(), 500);
    }
  };

  // Build sorted disruption list (top 20)
  const sortedEvents = data
    ? [...data.events]
        .sort(
          (a, b) =>
            (b.date || '').localeCompare(a.date || '') ||
            Math.abs(b.severity) - Math.abs(a.severity)
        )
        .slice(0, 20)
    : [];

  // Risk index data
  const riskScore = data ? data.riskIndex.score : null;
  const riskLabel = data ? data.riskIndex.label : 'Loading';
  const riskChange = data
    ? `${data.riskIndex.trend === 'up' ? '+' : '-'}${data.riskIndex.change} from yesterday`
    : '\u2014';
  const riskTrend = data ? data.riskIndex.trend : 'up';
  const riskColor = riskTrend === 'up' ? '#ff3344' : '#15EE76';

  return (
    <section className="map-section" id="platform" ref={sectionRef}>
      <div className="map-container">
        {/* Map Toolbar */}
        <div className="map-toolbar">
          <div className="map-toolbar-left">
            <span className="map-toolbar-title">
              GLOBAL DISRUPTION MAP &mdash; SELECTED EVENTS
            </span>
            <span className="map-live-badge">
              <span
                className="map-live-dot"
                style={{ animation: 'none' }}
              ></span>
              UPDATED DAILY
            </span>
          </div>
          <div className="map-toolbar-right">
            <div className="map-filters" id="mapFilters">
              {FILTER_TYPES.map((f) => (
                <button
                  key={f.key}
                  className={`map-filter${activeFilter === f.key ? ' active' : ''}`}
                  data-filter={f.key}
                  onClick={() => handleFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Map Canvas + Side Panel */}
        <div className="map-canvas-wrapper">
          <div
            id="map"
            className="map-canvas"
            ref={mapContainerRef}
          ></div>

          {/* Side Panel */}
          <div className="map-panel" id="mapPanel">
            <div className="map-panel-section">
              <span className="map-panel-label">TRADE RISK INDEX</span>
              <div className="risk-index">
                <div className="risk-index-top">
                  <span
                    className={`risk-index-arrow risk-index-arrow--${riskTrend}`}
                    style={{ color: riskColor }}
                  >
                    &#9650;
                  </span>
                  <span className="risk-index-score" id="riskScore">
                    {riskScore !== null ? riskScore : '\u2014'}
                  </span>
                  <div className="risk-index-chip risk-index-chip--elevated">
                    <span className="risk-index-chip-dot"></span>
                    <span id="riskLabel">{riskLabel}</span>
                  </div>
                </div>
                <div className="risk-index-sparkline-row">
                  {data ? (
                    <Sparkline
                      sparkline={data.riskIndex.sparkline}
                      trend={data.riskIndex.trend}
                    />
                  ) : (
                    <canvas
                      id="riskSparkline"
                      width={60}
                      height={28}
                    />
                  )}
                  <span className="risk-index-change" id="riskChange">
                    {riskChange}
                  </span>
                </div>
              </div>
            </div>

            <div className="map-panel-divider"></div>

            <div className="map-panel-section">
              <span className="map-panel-label">RECENT DISRUPTIONS</span>
              <div className="disruption-list" id="disruptionList">
                {sortedEvents.map((event) => {
                  const color = getSeverityColor(event.severity);
                  const dateStr = formatEventDate(event.date);
                  return (
                    <div
                      key={event.id}
                      className="disruption-item"
                      onClick={() => handleDisruptionClick(event)}
                    >
                      <div className="disruption-item-header">
                        <span
                          className="disruption-item-dot"
                          style={{
                            background: color,
                            boxShadow: `0 0 6px ${color}44`,
                          }}
                        ></span>
                        <div className="disruption-item-title">
                          {event.summary}
                        </div>
                      </div>
                      <div className="disruption-item-meta">
                        <span className="disruption-item-desc">
                          {event.country} &middot; {event.commodity}
                        </span>
                        <span className="disruption-item-time">{dateStr}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
