// Production source setup — apps/web/src/features/map-view/MapView.tsx
map.addSource("stations", {
  type: "geojson",
  data: geojson,
  cluster: true,
  clusterMaxZoom: 22,
  clusterRadius: 25,
});
