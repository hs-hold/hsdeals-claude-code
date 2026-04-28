import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, MapPinned } from 'lucide-react';

export interface CompMarkerInput {
  address: string;
  number: number;
  label?: string;
}

interface PropertyMapProps {
  latitude: number;
  longitude: number;
  address: string;
  comps?: CompMarkerInput[];
  /** Suffix appended to comp addresses for geocoding accuracy, e.g. "Atlanta, GA". */
  cityStateZip?: string;
}

const GEOCODE_CACHE_KEY = 'mapbox_geocode_cache_v1';

function readGeocodeCache(): Record<string, [number, number]> {
  try {
    const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeGeocodeCache(cache: Record<string, [number, number]>) {
  try { localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache)); } catch { /* full */ }
}

async function geocode(address: string, token: string): Promise<[number, number] | null> {
  const cache = readGeocodeCache();
  if (cache[address]) return cache[address];
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?limit=1&access_token=${token}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const center = json?.features?.[0]?.center;
    if (!Array.isArray(center) || center.length !== 2) return null;
    const lngLat: [number, number] = [center[0], center[1]];
    cache[address] = lngLat;
    writeGeocodeCache(cache);
    return lngLat;
  } catch { return null; }
}

function makeNumberedMarkerEl(num: number): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = [
    'width:24px', 'height:24px', 'border-radius:50%',
    'background:#3b82f6', 'color:white',
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-size:12px', 'font-weight:700',
    'border:2px solid white', 'box-shadow:0 1px 3px rgba(0,0,0,0.4)',
    'cursor:pointer',
  ].join(';');
  el.textContent = String(num);
  return el;
}

export function PropertyMap({ latitude, longitude, address, comps, cityStateZip }: PropertyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const subjectMarker = useRef<mapboxgl.Marker | null>(null);
  const compMarkers = useRef<mapboxgl.Marker[]>([]);
  const tokenRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showComps, setShowComps] = useState(false);
  const [loadingComps, setLoadingComps] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapContainer.current) return;
      try {
        const { data, error: fnError } = await supabase.functions.invoke('get-mapbox-token');
        if (fnError || !data?.token) { setError('Map unavailable'); return; }
        if (!isMounted) return;

        tokenRef.current = data.token;
        mapboxgl.accessToken = data.token;

        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [longitude, latitude],
          zoom: 15,
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        subjectMarker.current = new mapboxgl.Marker({ color: '#10b981' })
          .setLngLat([longitude, latitude])
          .setPopup(new mapboxgl.Popup().setHTML(`<p class="text-black font-medium text-sm">${address}</p>`))
          .addTo(map.current);
      } catch (err) {
        console.error('Map init error:', err);
        setError('Map unavailable');
      }
    }

    initMap();

    return () => {
      isMounted = false;
      compMarkers.current.forEach(m => m.remove());
      compMarkers.current = [];
      subjectMarker.current?.remove();
      map.current?.remove();
    };
  }, [latitude, longitude, address]);

  useEffect(() => {
    if (!map.current || !tokenRef.current) return;

    compMarkers.current.forEach(m => m.remove());
    compMarkers.current = [];

    if (!showComps || !comps?.length) return;

    let cancelled = false;
    setLoadingComps(true);

    (async () => {
      const bounds = new mapboxgl.LngLatBounds([longitude, latitude], [longitude, latitude]);
      for (const c of comps) {
        if (cancelled) break;
        const fullAddr = cityStateZip ? `${c.address}, ${cityStateZip}` : c.address;
        const lngLat = await geocode(fullAddr, tokenRef.current!);
        if (cancelled || !lngLat || !map.current) continue;
        const marker = new mapboxgl.Marker({ element: makeNumberedMarkerEl(c.number) })
          .setLngLat(lngLat)
          .setPopup(new mapboxgl.Popup().setHTML(
            `<p class="text-black text-sm"><strong>#${c.number}</strong> ${c.label ?? c.address}</p>`,
          ))
          .addTo(map.current);
        compMarkers.current.push(marker);
        bounds.extend(lngLat);
      }
      if (!cancelled && map.current && compMarkers.current.length > 0) {
        map.current.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 600 });
      }
      if (!cancelled) setLoadingComps(false);
    })();

    return () => { cancelled = true; };
  }, [showComps, comps, cityStateZip, latitude, longitude]);

  if (error) {
    return (
      <div className="w-full h-48 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div ref={mapContainer} className="w-full h-48 rounded-lg overflow-hidden" />
      {comps && comps.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full h-7 text-xs"
          onClick={() => setShowComps(v => !v)}
          disabled={loadingComps}
        >
          {loadingComps ? (
            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Loading {comps.length} comps…</>
          ) : showComps ? (
            <><MapPinned className="w-3 h-3 mr-1" /> Hide comps on map</>
          ) : (
            <><MapPinned className="w-3 h-3 mr-1" /> Show {comps.length} comps on map</>
          )}
        </Button>
      )}
    </div>
  );
}
