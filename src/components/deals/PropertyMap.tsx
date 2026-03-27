import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';

interface PropertyMapProps {
  latitude: number;
  longitude: number;
  address: string;
}

export function PropertyMap({ latitude, longitude, address }: PropertyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
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

        marker.current = new mapboxgl.Marker({ color: '#10b981' })
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
      marker.current?.remove();
      map.current?.remove();
    };
  }, [latitude, longitude, address]);

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
