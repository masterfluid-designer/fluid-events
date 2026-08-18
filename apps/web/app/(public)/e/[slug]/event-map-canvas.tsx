'use client';

import { useEffect, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { divIcon, latLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Toile Leaflet de la section « Où ça se passe » (2026-08-18).
 *
 * Le commentaire qui trônait dans event-location.tsx affirmait qu'une vraie
 * carte « imposerait une clé d'API facturée » : c'est faux. Leaflet est une
 * librairie libre et les tuiles OpenStreetMap/CARTO utilisées ici ne demandent
 * ni compte ni clé. La seule contrepartie est l'attribution, obligatoire, que
 * `TileLayer` affiche en bas à droite — elle ne doit jamais être retirée.
 *
 * Ce fichier n'est JAMAIS rendu côté serveur (voir event-map.tsx) : Leaflet
 * touche `window` dès l'import.
 */

export interface MapVenue {
  id: string;
  /** Rang du lieu : « Lieu du festival », « Lieu de l'after »… */
  label: string;
  /** Nom lisible affiché dans la bulle du point. */
  name: string;
  latitude: number;
  longitude: number;
}

/**
 * Point sur mesure plutôt que l'icône par défaut de Leaflet : celle-ci
 * référence ses PNG par une URL relative que le bundler casse (l'increvable
 * « marker introuvable » de Leaflet + Webpack). Un marqueur SVG en ligne n'a
 * aucun fichier à retrouver, et prend au passage la couleur de l'événement.
 */
function venueIcon() {
  return divIcon({
    className: '',
    html: `<span style="display:block;width:28px;height:28px;border-radius:9999px 9999px 2px 9999px;transform:rotate(45deg);background:var(--color-primary);box-shadow:0 2px 10px rgba(0,0,0,.45)"></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });
}

/** Suit le thème réel de la page — la classe `dark` posée sur <html>. */
function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setIsDark(root.classList.contains('dark'));
    read();
    // Le thème peut basculer sans rechargement (bouton de l'en-tête) : sans
    // observateur, la carte resterait sur ses tuiles claires en pleine nuit.
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

export default function EventMapCanvas({ venues }: { venues: MapVenue[] }) {
  const isDark = useIsDark();

  if (venues.length === 0) return null;

  // Cadrage : un seul lieu → on se centre dessus à un zoom de quartier ;
  // plusieurs → on ajuste pour que tous tiennent, avec une marge pour que les
  // points ne collent pas aux bords.
  const single = venues.length === 1;
  const bounds = latLngBounds(venues.map((v) => [v.latitude, v.longitude] as [number, number]));

  return (
    <MapContainer
      {...(single
        ? { center: [venues[0].latitude, venues[0].longitude] as [number, number], zoom: 14 }
        : { bounds, boundsOptions: { padding: [48, 48] as [number, number] } })}
      // La molette ne prend PAS la main sur le défilement de la page : sur une
      // page longue, une carte qui capture le scroll piège le visiteur.
      scrollWheelZoom={false}
      className="h-full w-full"
      // Leaflet peint son propre fond ; sans ça une tuile lente laisse voir un
      // rectangle blanc au milieu d'une page sombre.
      style={{ background: isDark ? '#1b1a18' : '#f3f1ec' }}
    >
      <TileLayer
        // Tuiles CARTO (dérivées d'OpenStreetMap) — libres, sans clé.
        url={
          isDark
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        }
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      />
      {venues.map((venue) => (
        <Marker key={venue.id} position={[venue.latitude, venue.longitude]} icon={venueIcon()}>
          <Popup>
            <span className="text-xs font-bold uppercase tracking-wide">{venue.label}</span>
            <br />
            {venue.name}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
