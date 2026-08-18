// Unclustered pin layers — apps/web/src/features/map-view/MapView.tsx
// variant === "full" | "blank"

map.addLayer({
  id: "unclustered-circle",
  type: "circle",
  source: "stations",
  filter: ["!", ["has", "point_count"]],
  paint: {
    "circle-radius": ["case", ["get", "selected"], 14, 12],
    "circle-color": "#ffffff",
    "circle-stroke-width": 2,
    "circle-stroke-color": "#0198FD",
    "circle-stroke-opacity": 1,
  },
});

map.addLayer({
  id: "unclustered-point",
  type: "symbol",
  source: "stations",
  filter: ["!", ["has", "point_count"]],
  layout: {
    "icon-image": [
      "match",
      ["min", 6, ["to-number", ["coalesce", ["get", "filled_slots"], 6]]],
      0, "station-icon-0",
      1, "station-icon-1",
      2, "station-icon-2",
      3, "station-icon-3",
      4, "station-icon-4",
      5, "station-icon-5",
      6, "station-icon-6",
      "station-icon-6",
    ],
    "icon-size":
      variant === "full"
        ? ["case", ["get", "selected"], 1.2, 1]
        : 1,
    "icon-allow-overlap": true,
    "icon-ignore-placement": true,
  },
});

// Web icon load (loadStationIcons.ts): register placeholders, then
// fetch /Icon{0..6}.svg, rasterize 54x53 @ 2x, map.addImage/updateImage
// with id "station-icon-{n}" and pixelRatio: 2.
