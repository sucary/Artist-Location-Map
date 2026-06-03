// Map clustering distance and marker layout thresholds

export const CLUSTER_COLOR_PALETTE = [
  '#5C7797',
  '#52847B',
  '#896F43',
  '#8B565E',
  '#5B4C75',
] as const;

export const CLUSTER_CONFIG = {
  disableClusteringAtZoomLevel: 8,
  maxClusterRadius: 100,
  // Same-cluster markers keep the original readability gap
  artistMarkerCollisionDistance: 44,
  gridSpacing: 44,
  // Outside markers and cluster circles allow slight visual overlap
  outerCollisionDistance: 36,
  minClusterSize: 28,
  maxClusterSize: 400,
  maxOffsetRatio: 0.25,
  refreshDelay: 100,
} as const;
