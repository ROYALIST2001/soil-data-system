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

// Each flag gets its own colour, so an officer can see trouble on the map
// without reading anything.
const FLAG_COLOURS: Record<string, string> = {
  OK: "#40916c",
  FLAGGED: "#e8842c",
  QUARANTINED: "#c92a2a",
};

// The container must be at least this big before a map is built into it.
//
// THIS IS THE WHOLE TRICK, AND IT TOOK A LONG TIME TO FIND.
//
// Leaflet measures its container when the map is created. If that happens
// while the box has no width - which it does, because React builds
// components before the browser lays them out, and does it twice over in
// development - the map records a width of zero and every later calculation
// is made against nothing.
//
// The symptom is bizarre. The map REPORTS the right zoom while DRAWING
// tiles from a completely different one: getZoom() says 7 and the screen
// shows half of Asia. No error, nothing in the console. Worse, the throwaway
// first instance and the real one end up sharing a container and fighting.
//
// invalidateSize() afterwards does not reliably undo it. So we do not build
// the map at all until there is something real to build it into.
const MIN_USABLE_SIZE = 200;

// Sri Lanka fills the view at about zoom 7. Anything further out is showing
// half of Asia to display a handful of dots on one island.
const MIN_SENSIBLE_ZOOM = 6.5;

// Roughly the middle of Sri Lanka, for the moment before there is data.
const SRI_LANKA: [number, number] = [7.8731, 80.7718];

interface Props {
  points: MapPoint[];
  onPointClick?: (readingId: number) => void;
}

export default function SoilMap({ points, onPointClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // The latest points and click handler, held in refs.
  //
  // The map is created asynchronously, once the container has a size, so
  // what it draws has to be read at that moment rather than captured when
  // the effect was set up.
  //
  // The click handler especially: the parent passes an inline arrow
  // function, which is a new value on every render. Depending on it re-ran
  // the whole thing constantly.
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const clickRef = useRef(onPointClick);
  clickRef.current = onPointClick;

  // Draw the dots and move the view to show them.
  function render(map: L.Map): void {
    const layer = layerRef.current;
    if (!layer) return;

    const data = pointsRef.current;

    layer.clearLayers();
    if (data.length === 0) return;

    for (const p of data) {
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

      dot.on("click", () => clickRef.current?.(p.reading_id));
      dot.addTo(layer);
    }

    // Move the view to fit whatever we are showing, so the officer is not
    // left staring at an empty sea because the data is somewhere else.
    const bounds = L.latLngBounds(
      data.map((p) => [p.raw_lat, p.raw_lng] as [number, number])
    );

    // WORK THE ZOOM OUT, THEN SET THE VIEW OUTRIGHT.
    //
    // The obvious call here is fitBounds, and it was - but it animates. The
    // map's own state moved to the right zoom while the tile layer never
    // heard about it, so the map REPORTED zoom 7 and kept drawing the zoom
    // 3 tiles it already had. Nothing failed; the tiles for the new zoom
    // were simply never requested.
    //
    // getBoundsZoom works out the same number without moving anything, and
    // setView with animate:false applies it as a hard reset, which always
    // makes every layer redraw.
    let zoom = map.getBoundsZoom(bounds, false, L.point(40, 40));

    // Never further out than the island, never closer than a field.
    zoom = Math.max(MIN_SENSIBLE_ZOOM, Math.min(zoom, 13));

    map.setView(bounds.getCenter(), zoom, { animate: false });
  }

  // ---------- build the map, once, when there is room for it ----------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    // Wait for a container with a real size, then build. The observer
    // covers every case: the pane opening, the map scrolling into view, the
    // window being resized, and the browser simply not having laid the page
    // out yet.
    const observer = new ResizeObserver((entries) => {
      if (cancelled) return;

      const box = entries[0]?.contentRect;
      if (!box || box.width < MIN_USABLE_SIZE || box.height < MIN_USABLE_SIZE) {
        return;
      }

      if (!mapRef.current) {
        // Give it a view immediately. A Leaflet map with no centre or zoom
        // is in a half-made state: layers added to it have nothing to
        // position against, and it draws from zoom 0 until something sets
        // a view. Starting on Sri Lanka means the very first frame is
        // already roughly right, and fitBounds only refines it.
        const map = L.map(container).setView(SRI_LANKA, 7);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);

        // All the dots live in one layer group, so updating them is a
        // single clearLayers() rather than tracking every marker by hand.
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;

        render(map);
        return;
      }

      // Already built, and the box changed size. Re-measure and re-fit:
      // measuring alone keeps the old centre, which may have been worked
      // out against a different shape.
      mapRef.current.invalidateSize();
      render(mapRef.current);
    });

    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();

      // Tear the map down. Leaflet attaches listeners to the window, and
      // without remove() they stay behind - and a second map built into the
      // same container fights with the first.
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Built once. New points are drawn by the effect below.
  }, []);

  // ---------- redraw when the data changes ----------
  useEffect(() => {
    if (mapRef.current) {
      render(mapRef.current);
    }
  }, [points]);

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
