// Cluster layers — apps/web/src/features/map-view/MapView.tsx

map.addLayer({
  id: "clusters",
  type: "circle",
  source: "stations",
  filter: ["has", "point_count"],
  paint: {
    "circle-color": [
      "step",
      ["get", "point_count"],
      "#0198FD",
      10,
      "#0198FD",
      30,
      "#0198FD",
    ],
    "circle-radius": ["step", ["get", "point_count"], 15, 3, 20, 5, 25],
    "circle-stroke-width": 3,
    "circle-stroke-color": "#ffffff",
    "circle-stroke-opacity": 1,
    "circle-radius-transition": { duration: 0, delay: 0 },
    "circle-color-transition": { duration: 0, delay: 0 },
  },
});

map.addLayer({
  id: "cluster-count",
  type: "symbol",
  source: "stations",
  filter: ["has", "point_count"],
  layout: {
    "text-field": ["to-string", ["get", "point_count"]],
    "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
    "text-size": ["step", ["get", "point_count"], 14, 10, 16, 30, 18],
    "text-allow-overlap": true,
    "text-ignore-placement": true,
  },
  paint: {
    "text-color": "#ffffff",
    "text-halo-color": "#ffffff",
    "text-halo-width": 1,
  },
});
