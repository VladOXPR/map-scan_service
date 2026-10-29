// Interaction handlers — apps/web/src/features/map-view/MapView.tsx

const onClusterClick = (e) => {
  const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
  const clusterId = features[0]?.properties?.cluster_id;
  const source = map.getSource("stations");
  source.getClusterExpansionZoom(clusterId, (err, zoom) => {
    if (err) return;
    const coords = features[0].geometry.coordinates;
    map.easeTo({ center: coords, zoom: zoom ?? undefined });
  });
};

const onPointClick = (e) => {
  if (variant !== "full") return;
  const props = e.features?.[0]?.properties ?? {};
  const station = stations.find((s) => String(s.id) === String(props.id));
  if (station) setSelectedStation(station);
};

const onBackgroundClick = (e) => {
  if (variant !== "full") return;
  const features = map.queryRenderedFeatures(e.point, {
    layers: ["clusters", "unclustered-point", "unclustered-circle"],
  });
  if (features.length === 0) setSelectedStation(null);
};

map.on("click", "clusters", onClusterClick);
map.on("click", "unclustered-point", onPointClick);
map.on("click", "unclustered-circle", onPointClick);
map.on("click", onBackgroundClick);
