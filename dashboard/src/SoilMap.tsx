import { useEffect, useRef } from "react";
import L from "leaflet";
import type { MapPoint } from "./types";

// The soil map.
//
// WHY LEAFLET AND NOT GOOGLE MAPS.
// Leaflet is free, open source, and draws its tiles from OpenStreetMap with
// no account, no API key and no billing details. Google Maps would need a
// billing account before it drew a single tile, which is a poor thing to
// require of a university project.

// Roughly the middle of Sri Lanka, for when there is nothing to show yet.
const SRI_LANKA: [number, number] = [7.8731, 80.7718];

// Each flag gets its own colour, so an officer can see trouble on the map
// without reading anything.
const FLAG_COLOURS: Record<string, string> = {
  OK: "#40916c",
  FLAGGED: "#e8842c",
  QUARANTINED: "#c92a2a",
};

interface Props {
  points: MapPoint[];
  onPointClick?: (readingId: number) => void;
}

export default function SoilMap({ points, onPointClick }: Props) {
  // Two refs, for two different lifetimes.
  //
  // containerRef is the div Leaflet draws into.
  // mapRef holds the Leaflet map itself, so it is created ONCE and survives
  // every redraw. Creating it on each render would throw "Map container is
  // already initialized" and leak a map object every time.
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // ---------- create the map once ----------
  useEffect(() => {
    if (mapRef.current || !containerRef.current) {
      return;
    }

    const map = L.map(containerRef.current).setView(SRI_LANKA, 7);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    // All the dots live in one layer group, so updating them is a single
    // clearLayers() rather than tracking every marker by hand.
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      // Tear the map down when this component goes away. Leaflet attaches
      // listeners to the window, and without remove() they stay behind.
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // ---------- redraw the dots whenever the points change ----------
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;

    if (!map || !layer) {
      return;
    }

    layer.clearLayers();

    if (points.length === 0) {
      return;
    }

    for (const p of points) {
      const colour = FLAG_COLOURS[p.quality_flag] ?? "#868e96";

      // circleMarker, not marker: a plain circle needs no image file, stays
      // the same size at every zoom, and can be coloured by flag.
      const dot = L.circleMarker([p.raw_lat, p.raw_lng], {
        radius: 7,
        color: "#fff",
        weight: 2,
        fillColor: colour,
        fillOpacity: 0.9,
      });

      const where = p.gn_division || "unassigned";

      dot.bindPopup(
        `<strong>Reading #${p.reading_id}</strong><br/>` +
        `${p.crop}<br/>` +
        `${where}<br/>` +
        `<span style="color:${colour}">${p.quality_flag}</span>`
      );

      if (onPointClick) {
        dot.on("click", () => onPointClick(p.reading_id));
      }

      dot.addTo(layer);
    }

    // Move the view to fit whatever we are showing, so the officer is not
    // left staring at an empty sea because the data is somewhere else.
    const bounds = L.latLngBounds(
      points.map((p) => [p.raw_lat, p.raw_lng] as [number, number])
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [points, onPointClick]);

  return (
    <div>
      <div id="map" ref={containerRef} />

      <div className="legend">
        <span>
          <i className="dot" style={{ background: FLAG_COLOURS.OK }} /> OK
        </span>
        <span>
          <i className="dot" style={{ background: FLAG_COLOURS.FLAGGED }} />{" "}
          Flagged
        </span>
        <span>
          <i
            className="dot"
            style={{ background: FLAG_COLOURS.QUARANTINED }}
          />{" "}
          Quarantined
        </span>
        <span style={{ marginLeft: "auto" }}>
          {points.length} reading{points.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
