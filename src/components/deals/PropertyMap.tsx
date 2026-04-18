import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';

interface CompMarker {
  address: string;
  salePrice: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  distance?: number;
}

interface PropertyMapProps {
  latitude: number;
  longitude: number;
  address: string;
  comps?: CompMarker[];
}

export function PropertyMap({ latitude, longitude, address, comps }: PropertyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapContainer.current) return;

      try {
        const { data, error: fnError } = await supabase.functions.invoke('get-mapbox-token');

        if (fnError || !data?.token) {
          setError('Map unavailable');
          return;
        }

        if (!isMounted) return;

        mapboxgl.accessToken = data.token;

        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [longitude, latitude],
          zoom: 15,
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // Subject property marker (green)
        const subjectEl = document.createElement('div');
        subjectEl.style.cssText = `
          width:18px;height:18px;border-radius:50%;background:#10b981;
          border:2px solid #fff;box-shadow:0 0 6px rgba(16,185,129,0.7);
          cursor:pointer;
        `;
        const subjectMarker = new mapboxgl.Marker({ element: subjectEl })
          .setLngLat([longitude, latitude])
          .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(
            `<p style="margin:0;font-weight:600;font-size:12px;color:#111">${address}</p>
             <p style="margin:2px 0 0;font-size:11px;color:#666">Subject Property</p>`
          ))
          .addTo(map.current);
        markers.current.push(subjectMarker);

        // Geocode and add comp markers
        if (comps && comps.length > 0) {
          const bounds = new mapboxgl.LngLatBounds([longitude, latitude], [longitude, latitude]);

          const geocodeResults = await Promise.all(
            comps.map(async (comp, idx) => {
              try {
                const encoded = encodeURIComponent(comp.address);
                const res = await fetch(
                  `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${data.token}&limit=1&types=address`
                );
                const json = await res.json();
                const feature = json.features?.[0];
                if (!feature) return null;
                return { comp, idx, lng: feature.center[0], lat: feature.center[1] };
              } catch {
                return null;
              }
            })
          );

          if (!isMounted) return;

          geocodeResults.forEach((result) => {
            if (!result || !map.current) return;
            const { comp, idx, lng, lat } = result;

            // Numbered amber marker
            const el = document.createElement('div');
            el.style.cssText = `
              width:22px;height:22px;border-radius:50%;
              background:#f59e0b;border:2px solid #fff;
              display:flex;align-items:center;justify-content:center;
              font-size:10px;font-weight:700;color:#fff;
              box-shadow:0 0 5px rgba(245,158,11,0.6);cursor:pointer;
              font-family:system-ui,sans-serif;
            `;
            el.textContent = String(idx + 1);

            const price = comp.salePrice ? `$${comp.salePrice.toLocaleString()}` : 'N/A';
            const details = [
              comp.bedrooms != null && comp.bathrooms != null ? `${comp.bedrooms}bd/${comp.bathrooms}ba` : null,
              comp.sqft ? `${comp.sqft.toLocaleString()} sqft` : null,
              comp.distance != null ? `${comp.distance.toFixed(2)} mi away` : null,
            ].filter(Boolean).join(' · ');

            const marker = new mapboxgl.Marker({ element: el })
              .setLngLat([lng, lat])
              .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(
                `<p style="margin:0;font-size:11px;font-weight:600;color:#111">#${idx + 1} — ${price}</p>
                 <p style="margin:2px 0 0;font-size:10px;color:#555">${comp.address}</p>
                 ${details ? `<p style="margin:2px 0 0;font-size:10px;color:#888">${details}</p>` : ''}`
              ))
              .addTo(map.current);

            markers.current.push(marker);
            bounds.extend([lng, lat]);
          });

          // Fit map to show all markers with padding
          if (geocodeResults.some(r => r !== null) && map.current) {
            map.current.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 800 });
          }
        }

      } catch (err) {
        console.error('Map init error:', err);
        setError('Map unavailable');
      }
    }

    initMap();

    return () => {
      isMounted = false;
      markers.current.forEach(m => m.remove());
      markers.current = [];
      map.current?.remove();
    };
  }, [latitude, longitude, address, comps]);

  if (error) {
    return (
      <div className="w-full h-48 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground text-sm">
        {error}
      </div>
    );
  }

  return (
    <div ref={mapContainer} className="w-full h-48 rounded-lg overflow-hidden" />
  );
}
