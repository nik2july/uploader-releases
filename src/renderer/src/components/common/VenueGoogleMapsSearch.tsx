/// <reference types="google.maps" />
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Search,
  ExternalLink,
  Check,
  Loader2,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

export const hasValidGoogleMapsKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY' && API_KEY.length > 5;

export interface PlaceResult {
  id?: string;
  displayName?: string;
  formattedAddress?: string;
  location?: { lat: number; lng: number };
  googleMapsURI?: string;
}

export interface VenueGoogleMapsSearchProps {
  venue?: string;
  address?: string;
  mapLink?: string;
  onSelectVenue: (venueName: string, address: string, mapUrl: string) => void;
  className?: string;
}

// Fallback search using Photon API (OpenStreetMap-powered geocoding) for instant results without API keys
async function searchPlacesFallback(query: string): Promise<PlaceResult[]> {
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !data.features) return [];

    return data.features.map((f: any, idx: number) => {
      const props = f.properties || {};
      const name = props.name || props.street || query;
      const parts = [
        props.housenumber,
        props.street,
        props.district || props.suburb,
        props.city || props.town || props.village || props.county,
        props.state,
        props.country,
        props.postcode,
      ].filter(Boolean);

      const formattedAddress = parts.length > 0 ? parts.join(', ') : (props.city || props.country || query);
      const coords = f.geometry?.coordinates; // [lng, lat]
      const lat = coords ? coords[1] : undefined;
      const lng = coords ? coords[0] : undefined;
      const fullQuery = `${name}, ${formattedAddress}`;

      return {
        id: `osm-${idx}-${props.osm_id || Date.now()}`,
        displayName: name,
        formattedAddress: formattedAddress,
        location: lat && lng ? { lat, lng } : undefined,
        googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullQuery)}`,
      };
    });
  } catch (e) {
    console.warn('Fallback place search failed:', e);
    return [];
  }
}

/**
 * Suggestion list rendered through a portal.
 *
 * The venue field lives inside the quotation/event modals, whose body is an
 * `overflow-y-auto` scroll container. An absolutely positioned dropdown is clipped
 * by that container, so the list was being rendered at full size but never shown.
 * Anchoring it to the input with fixed coordinates in a portal escapes the clip.
 */
const SuggestionsPortal: React.FC<{
  anchorEl: HTMLElement | null;
  results: PlaceResult[];
  onPick: (place: PlaceResult) => void;
  label: string;
}> = ({ anchorEl, results, onPick, label }) => {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!anchorEl) return;
    const update = () => setRect(anchorEl.getBoundingClientRect());
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorEl]);

  if (!rect || results.length === 0) return null;

  // Flip above the field when there is not enough room below.
  const spaceBelow = window.innerHeight - rect.bottom;
  const dropUp = spaceBelow < 240 && rect.top > spaceBelow;
  const maxHeight = Math.max(160, Math.min(224, dropUp ? rect.top - 12 : spaceBelow - 12));

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        top: dropUp ? undefined : rect.bottom + 4,
        bottom: dropUp ? window.innerHeight - rect.top + 4 : undefined,
        maxHeight,
        zIndex: 9999,
      }}
      data-venue-suggestions=""
      className="bg-white rounded-xl border border-[#d4c1a3] shadow-xl overflow-hidden overflow-y-auto"
    >
      <div className="px-3 py-1.5 bg-[#f9f8f6] border-b border-[#d4c1a3] text-[10px] font-bold text-[#7a2e33] uppercase tracking-wider flex items-center justify-between sticky top-0">
        <span>{label}</span>
        <span>{results.length} found</span>
      </div>
      {results.map((item, idx) => (
        <button
          key={item.id || idx}
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={() => onPick(item)}
          className="w-full px-3 py-2 text-left text-xs hover:bg-[#f9f8f6] flex items-start gap-2 border-b border-gray-100 last:border-0 transition-colors cursor-pointer group"
        >
          <div className="p-1 rounded-md bg-[#7a2e33]/10 text-[#7a2e33] mt-0.5 group-hover:bg-[#7a2e33] group-hover:text-white transition-colors shrink-0">
            <MapPin className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[#111417] truncate">{item.displayName || 'Venue Location'}</p>
            <p className="text-[11px] text-[#6b6660] truncate">{item.formattedAddress}</p>
          </div>
          <Check className="w-3.5 h-3.5 text-[#7a2e33] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </button>
      ))}
    </div>,
    document.body
  );
};

const VenueSearchGoogleMapsInner: React.FC<VenueGoogleMapsSearchProps & {
  query: string;
  setQuery: (q: string) => void;
  addressVal: string;
  setAddressVal: (a: string) => void;
  mapLinkVal: string;
  setMapLinkVal: (m: string) => void;
  showMap: boolean;
  setShowMap: (s: boolean) => void;
  selectedLocation: { lat: number; lng: number } | null;
  setSelectedLocation: (l: { lat: number; lng: number } | null) => void;
}> = ({
  onSelectVenue,
  query,
  setQuery,
  addressVal,
  setAddressVal,
  mapLinkVal,
  setMapLinkVal,
  showMap,
  setShowMap,
  selectedLocation,
  setSelectedLocation,
}) => {
  const placesLib = useMapsLibrary('places');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // The list is portalled to <body>, so it is not inside dropdownRef.
      if (target && target.closest('[data-venue-suggestions]')) return;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live place search (Google Places API with fallback)
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        if (placesLib) {
          const { places } = await placesLib.Place.searchByText({
            textQuery: query,
            fields: ['displayName', 'formattedAddress', 'location', 'id', 'googleMapsURI'],
            maxResultCount: 6,
          });

          if (places && places.length > 0) {
            const mapped: PlaceResult[] = places.map((p: google.maps.places.Place) => {
              const loc = p.location ? { lat: p.location.lat(), lng: p.location.lng() } : undefined;
              return {
                id: p.id,
                displayName: p.displayName || '',
                formattedAddress: p.formattedAddress || '',
                location: loc,
                googleMapsURI:
                  p.googleMapsURI ||
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.displayName ? `${p.displayName}, ${p.formattedAddress}` : p.formattedAddress || query)}`,
              };
            });
            setResults(mapped);
            setIsOpen(true);
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Google Places API search failed, falling back:', err);
      }

      // Fallback search
      const fallbackResults = await searchPlacesFallback(query);
      setResults(fallbackResults);
      if (fallbackResults.length > 0) setIsOpen(true);
      setIsLoading(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [query, placesLib]);

  const handleSelect = (place: PlaceResult) => {
    const venueName = place.displayName || query;
    const formattedAddr = place.formattedAddress || '';
    const fullCombinedAddress = formattedAddr ? (venueName ? `${venueName}, ${formattedAddr}` : formattedAddr) : venueName;
    const url =
      place.googleMapsURI ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullCombinedAddress)}`;

    setAddressVal(fullCombinedAddress);
    setMapLinkVal(url);
    if (place.location) {
      setSelectedLocation(place.location);
      setShowMap(true);
    }
    onSelectVenue(venueName, fullCombinedAddress, url);
    setIsOpen(false);
  };

  return (
    <div className="space-y-3" ref={dropdownRef}>
      {/* 2-Column Grid */}
      <div className="p-3.5 bg-[#ffffff] border border-[#d4c1a3] rounded-xl">
        {/* Address search — the map link is derived from whatever is picked here,
            so there is no separate URL field to paste into. */}
        <div className="space-y-1.5 relative">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-bold text-[#111417] uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#7a2e33]" />
              <span>Enter Complete Address</span>
            </label>
            <div className="flex items-center gap-2">
              {isLoading && <Loader2 className="w-3 h-3 text-[#7a2e33] animate-spin" />}
              {(addressVal || mapLinkVal) && (
                <button
                  type="button"
                  onClick={() => setShowMap(!showMap)}
                  className="text-[10px] text-[#7a2e33] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                >
                  {showMap ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                  <span>{showMap ? 'Hide Map' : 'Preview Map'}</span>
                </button>
              )}
              {(mapLinkVal || addressVal) && (
                <a
                  href={mapLinkVal || `https://maps.google.com/?q=${encodeURIComponent(addressVal)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[#7a2e33] hover:underline flex items-center gap-1 font-semibold"
                >
                  <span>Open Map</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#7a2e33]">
              <Search className="w-3.5 h-3.5" />
            </div>

            <input
              ref={inputRef}
              type="text"
              placeholder="Search venue or enter address (e.g. The Leela Palace, Udaipur)..."
              value={addressVal}
              onChange={e => {
                const val = e.target.value;
                setAddressVal(val);
                setQuery(val);
                const computedMapUrl = val.trim()
                  ? `https://maps.google.com/?q=${encodeURIComponent(val.trim())}`
                  : '';
                setMapLinkVal(computedMapUrl);
                onSelectVenue(val.split(',')[0] || val, val, computedMapUrl);
              }}
              onFocus={() => {
                if (results.length > 0) setIsOpen(true);
              }}
              className="w-full pl-8.5 pr-8 py-2 bg-white border border-[#d4c1a3] rounded-lg text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33]"
            />

            {addressVal && (
              <button
                type="button"
                onClick={() => {
                  setAddressVal('');
                  setQuery('');
                  setMapLinkVal('');
                  setSelectedLocation(null);
                  setShowMap(false);
                  onSelectVenue('', '', '');
                }}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#6b6660] hover:text-[#111417] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown (portalled so the modal's scroll container cannot clip it) */}
          {isOpen && (
            <SuggestionsPortal
              anchorEl={inputRef.current}
              results={results}
              onPick={handleSelect}
              label="Google Maps Suggestions"
            />
          )}
        </div>
      </div>

      {/* Interactive Map Preview Card */}
      {showMap && (addressVal || mapLinkVal) && (
        <div className="rounded-xl overflow-hidden border border-[#d4c1a3] shadow-xs bg-white">
          <div className="h-48 w-full relative bg-[#f9f8f6]">
            {selectedLocation ? (
              <Map
                defaultCenter={selectedLocation}
                center={selectedLocation}
                defaultZoom={15}
                mapId="DEMO_MAP_ID"
                style={{ width: '100%', height: '100%' }}
                gestureHandling="cooperative"
                disableDefaultUI={false}
              >
                <AdvancedMarker position={selectedLocation}>
                  <Pin background="#7a2e33" glyphColor="#ffffff" borderColor="#4a000e" />
                </AdvancedMarker>
              </Map>
            ) : (
              <iframe
                title="Google Maps Location Preview"
                src={`https://maps.google.com/maps?q=${encodeURIComponent(addressVal || 'India')}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                className="w-full h-full border-0"
                loading="lazy"
              />
            )}
          </div>
          <div className="px-3.5 py-2 bg-[#ffffff] flex items-center justify-between border-t border-[#d4c1a3]">
            <div className="flex items-center gap-1.5 min-w-0 pr-2">
              <MapPin className="w-3.5 h-3.5 text-[#7a2e33] shrink-0" />
              <span className="text-[11px] font-semibold text-[#111417] truncate">
                {addressVal || 'Selected Location'}
              </span>
            </div>
            <a
              href={mapLinkVal || `https://maps.google.com/?q=${encodeURIComponent(addressVal)}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-bold text-[#7a2e33] hover:underline flex items-center gap-1 shrink-0"
            >
              <span>Open in Google Maps</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

// Fallback component when Google Maps SDK key is absent
const VenueSearchDirectFallback: React.FC<VenueGoogleMapsSearchProps & {
  query: string;
  setQuery: (q: string) => void;
  addressVal: string;
  setAddressVal: (a: string) => void;
  mapLinkVal: string;
  setMapLinkVal: (m: string) => void;
  showMap: boolean;
  setShowMap: (s: boolean) => void;
  selectedLocation: { lat: number; lng: number } | null;
  setSelectedLocation: (l: { lat: number; lng: number } | null) => void;
}> = ({
  onSelectVenue,
  query,
  setQuery,
  addressVal,
  setAddressVal,
  mapLinkVal,
  setMapLinkVal,
  showMap,
  setShowMap,
  selectedLocation,
  setSelectedLocation,
}) => {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      // The list is portalled to <body>, so it is not inside dropdownRef.
      if (target && target.closest('[data-venue-suggestions]')) return;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live place search with debounce
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      const fallbackResults = await searchPlacesFallback(query);
      setResults(fallbackResults);
      if (fallbackResults.length > 0) setIsOpen(true);
      setIsLoading(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (place: PlaceResult) => {
    const venueName = place.displayName || query;
    const formattedAddr = place.formattedAddress || '';
    const fullCombinedAddress = formattedAddr ? (venueName ? `${venueName}, ${formattedAddr}` : formattedAddr) : venueName;
    const url =
      place.googleMapsURI ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullCombinedAddress)}`;

    setAddressVal(fullCombinedAddress);
    setMapLinkVal(url);
    if (place.location) {
      setSelectedLocation(place.location);
    }
    setShowMap(true);
    onSelectVenue(venueName, fullCombinedAddress, url);
    setIsOpen(false);
  };

  return (
    <div className="space-y-3" ref={dropdownRef}>
      {/* 2-Column Grid */}
      <div className="p-3.5 bg-[#ffffff] border border-[#d4c1a3] rounded-xl">
        {/* Address search — the map link is derived from whatever is picked here,
            so there is no separate URL field to paste into. */}
        <div className="space-y-1.5 relative">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-bold text-[#111417] uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#7a2e33]" />
              <span>Enter Complete Address</span>
            </label>
            <div className="flex items-center gap-2">
              {isLoading && <Loader2 className="w-3 h-3 text-[#7a2e33] animate-spin" />}
              {(addressVal || mapLinkVal) && (
                <button
                  type="button"
                  onClick={() => setShowMap(!showMap)}
                  className="text-[10px] text-[#7a2e33] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                >
                  {showMap ? <EyeOff className="w-2.5 h-2.5" /> : <Eye className="w-2.5 h-2.5" />}
                  <span>{showMap ? 'Hide Map' : 'Preview Map'}</span>
                </button>
              )}
              {(mapLinkVal || addressVal) && (
                <a
                  href={mapLinkVal || `https://maps.google.com/?q=${encodeURIComponent(addressVal)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[#7a2e33] hover:underline flex items-center gap-1 font-semibold"
                >
                  <span>Open Map</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#7a2e33]">
              <Search className="w-3.5 h-3.5" />
            </div>

            <input
              ref={inputRef}
              type="text"
              placeholder="Search venue or enter address (e.g. The Leela Palace, Udaipur)..."
              value={addressVal}
              onChange={e => {
                const val = e.target.value;
                setAddressVal(val);
                setQuery(val);
                const computedMapUrl = val.trim()
                  ? `https://maps.google.com/?q=${encodeURIComponent(val.trim())}`
                  : '';
                setMapLinkVal(computedMapUrl);
                onSelectVenue(val.split(',')[0] || val, val, computedMapUrl);
              }}
              onFocus={() => {
                if (results.length > 0) setIsOpen(true);
              }}
              className="w-full pl-8.5 pr-8 py-2 bg-white border border-[#d4c1a3] rounded-lg text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33]"
            />

            {addressVal && (
              <button
                type="button"
                onClick={() => {
                  setAddressVal('');
                  setQuery('');
                  setMapLinkVal('');
                  setSelectedLocation(null);
                  setShowMap(false);
                  onSelectVenue('', '', '');
                }}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#6b6660] hover:text-[#111417] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown (portalled so the modal's scroll container cannot clip it) */}
          {isOpen && (
            <SuggestionsPortal
              anchorEl={inputRef.current}
              results={results}
              onPick={handleSelect}
              label="Venue Suggestions"
            />
          )}
        </div>
      </div>

      {/* Interactive Google Map Preview Card */}
      {showMap && (addressVal || mapLinkVal) && (
        <div className="rounded-xl overflow-hidden border border-[#d4c1a3] shadow-xs bg-white">
          <div className="h-48 w-full relative bg-[#f9f8f6]">
            <iframe
              title="Google Maps Location Preview"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(addressVal || 'India')}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
              className="w-full h-full border-0"
              loading="lazy"
            />
          </div>
          <div className="px-3.5 py-2 bg-[#ffffff] flex items-center justify-between border-t border-[#d4c1a3]">
            <div className="flex items-center gap-1.5 min-w-0 pr-2">
              <MapPin className="w-3.5 h-3.5 text-[#7a2e33] shrink-0" />
              <span className="text-[11px] font-semibold text-[#111417] truncate">
                {addressVal || 'Selected Location'}
              </span>
            </div>
            <a
              href={mapLinkVal || `https://maps.google.com/?q=${encodeURIComponent(addressVal)}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-bold text-[#7a2e33] hover:underline flex items-center gap-1 shrink-0"
            >
              <span>Open in Google Maps</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

export const VenueGoogleMapsSearch: React.FC<VenueGoogleMapsSearchProps> = ({
  venue = '',
  address = '',
  mapLink = '',
  onSelectVenue,
}) => {
  const [query, setQuery] = useState(address || venue || '');
  const [addressVal, setAddressVal] = useState(address || venue || '');
  const [mapLinkVal, setMapLinkVal] = useState(mapLink || '');
  const [showMap, setShowMap] = useState(Boolean(address || mapLink));
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const combined = address || venue || '';
    setAddressVal(combined);
    setQuery(combined);
    setMapLinkVal(mapLink || (combined ? `https://maps.google.com/?q=${encodeURIComponent(combined)}` : ''));
    if (combined && !showMap) {
      setShowMap(true);
    }
  }, [address, venue, mapLink]);

  if (!hasValidGoogleMapsKey) {
    return (
      <VenueSearchDirectFallback
        venue={venue}
        address={address}
        mapLink={mapLink}
        onSelectVenue={onSelectVenue}
        query={query}
        setQuery={setQuery}
        addressVal={addressVal}
        setAddressVal={setAddressVal}
        mapLinkVal={mapLinkVal}
        setMapLinkVal={setMapLinkVal}
        showMap={showMap}
        setShowMap={setShowMap}
        selectedLocation={selectedLocation}
        setSelectedLocation={setSelectedLocation}
      />
    );
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      <VenueSearchGoogleMapsInner
        venue={venue}
        address={address}
        mapLink={mapLink}
        onSelectVenue={onSelectVenue}
        query={query}
        setQuery={setQuery}
        addressVal={addressVal}
        setAddressVal={setAddressVal}
        mapLinkVal={mapLinkVal}
        setMapLinkVal={setMapLinkVal}
        showMap={showMap}
        setShowMap={setShowMap}
        selectedLocation={selectedLocation}
        setSelectedLocation={setSelectedLocation}
      />
    </APIProvider>
  );
};
