import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import maplibregl from 'maplibre-gl';
import ArtistCard from '../../ArtistCard';
import { CLUSTER_CONFIG } from '../../../constants/mapCluster';
import { InlineActionMenu } from '../../ui';
import type { Artist, LocationLanguage, LocationView } from '../../../types/artist';
import type { Gig, GigMarkerArtist } from '../../../types/gig';
import type { ArtistNameDisplayMode } from '../../../types/profile';
import { makeArtistPoint, getClusterZoom, isClusterFeature } from '../clusters/clusterIndex';
import {
    createArtistDebugCenterElement,
    createArtistMarkerElement,
    getArtistMarkerRenderKey,
    preloadArtistMarkerImages,
} from '../markers/artistMarker';
import {
    createClusterDebugRingElements,
    createExpandedVenueClusterMarkerElement,
    createClusterMarkerElement,
    getClusterDebugColor,
    getClusterVisualMetrics,
} from '../markers/clusterMarker';
import { buildClusterPalette, getStableColorHash } from '../../../utils/generatedClusterPalette';
import { getGigProvinceColor, getGigProvinceColorMap } from '../../../utils/gigProvinceColors';
import type {
    ArtistPoint,
    ArtistPointProperties,
    ClusterFeature,
    ClusterPoint,
    ExpandedClusterState,
    MarkerEntry,
    ArtistPopupLifecycleState,
} from '../types';
import { getCityById } from '../../../services/api';
import { formatGigDateTimeValue } from '../../../utils/dateFormatting';
import { getAvatarUrl } from '../../../utils/cloudinaryUrl';

const markerMoveDuration = 260;
const mergedClusterAppearDelay = markerMoveDuration;
const markerMoveLinkMaxDistance = 360;
const clusterCollapseAfterPopupCloseGraceMs = 800;
const debugClusterRingZIndex = 1200;
const debugClusterCenterZIndex = debugClusterRingZIndex + 1;
const focusedMarkerZIndex = 1000;
const selectedMarkerZIndex = focusedMarkerZIndex - 1;
const maxRandomMarkerZIndex = selectedMarkerZIndex - 1;
const markerPopupOffset = 32;

const markerAnimations = new WeakMap<maplibregl.Marker, number>();
const displayCoordinateDragHandlers = new WeakMap<maplibregl.Marker, {
    dragStart: () => void;
    dragEnd: () => Promise<void>;
}>();

const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);
// Use the shortest path when longitude crosses the dateline
const getWrappedLngDelta = (from: number, to: number) => ((((to - from) + 540) % 360) - 180);

const getMarkerCoordinates = (marker: maplibregl.Marker): [number, number] => {
    const lngLat = marker.getLngLat();
    return [lngLat.lng, lngLat.lat];
};

const getRandomMarkerZIndex = () => String(Math.floor(Math.random() * maxRandomMarkerZIndex) + 1);

const replaceMarkerElementContents = (target: HTMLElement, source: HTMLElement) => {
    target.setAttribute('aria-label', source.getAttribute('aria-label') ?? '');
    target.style.width = source.style.width;
    target.style.height = source.style.height;
    if (source.dataset.artistId) {
        target.dataset.artistId = source.dataset.artistId;
    } else {
        delete target.dataset.artistId;
    }
    if (source.dataset.clusterDebugColor) {
        target.dataset.clusterDebugColor = source.dataset.clusterDebugColor;
    } else {
        delete target.dataset.clusterDebugColor;
    }
    target.replaceChildren(...Array.from(source.childNodes));
};

const syncArtistMarkerHighlight = (
    element: HTMLElement,
    artistId: string,
    highlightedArtistIds?: Set<string>
) => {
    // Selected-day highlight is marker chrome outside avatar content
    element.classList.toggle('gig-marker-highlighted', highlightedArtistIds?.has(artistId) ?? false);
};

const setClusterElementExpandedHidden = (element: HTMLElement, hidden: boolean) => {
    // MapLibre marker updates can rewrite opacity
    element.style.opacity = hidden ? '0' : '1';
    element.style.visibility = hidden ? 'hidden' : '';
    element.style.pointerEvents = hidden ? 'none' : '';
};

const getClusterLeafKey = (leaves: GeoJSON.Feature<GeoJSON.Point, ArtistPointProperties>[]) => (
    leaves
        .map((leaf) => leaf.properties.artistId)
        .sort()
        .join('|')
);

const getLeafIdSet = (leaves: GeoJSON.Feature<GeoJSON.Point, ArtistPointProperties>[]) => (
    new Set(leaves.map((leaf) => leaf.properties.artistId))
);

const isLeafSubset = (candidate: Set<string>, parent: Set<string>) => {
    if (candidate.size > parent.size) return false;

    for (const artistId of candidate) {
        if (!parent.has(artistId)) return false;
    }

    return true;
};

const getGigArtistNames = (gig: Gig) => gig.artists.map((artist) => artist.name).join(', ') || gig.artist.name;

const getGigVenueClusterKey = (artist: Artist) => {
    const gig = (artist as Partial<GigMarkerArtist>).gig;
    if (!gig) return null;

    const venueName = (gig.placeLocation?.name ?? gig.venueName)?.trim();
    if (!venueName) return null;

    const { lat, lng } = gig.displayCoordinates;
    const coordinateKey = `${lat.toFixed(6)}:${lng.toFixed(6)}`;
    const venueKey = gig.placeLocationId
        ? `place:${gig.placeLocationId}`
        : `venue:${venueName.toLocaleLowerCase()}`;

    return {
        key: `${venueKey}:${coordinateKey}`,
        name: venueName,
    };
};

const getSameVenueGigCluster = (
    leaves: GeoJSON.Feature<GeoJSON.Point, ArtistPointProperties>[],
    artistsById: Map<string, Artist>
) => {
    if (leaves.length < 2) return null;

    // Venue clusters require all leaves to be gigs at the exact same venue point
    const venues = leaves.map((leaf) => {
        const artist = artistsById.get(leaf.properties.artistId);
        return artist ? getGigVenueClusterKey(artist) : null;
    });
    const firstVenue = venues[0];

    if (!firstVenue || !venues.every((venue) => venue?.key === firstVenue.key)) return null;

    const gigs = leaves
        .map((leaf) => (artistsById.get(leaf.properties.artistId) as Partial<GigMarkerArtist> | undefined)?.gig)
        .filter((gig): gig is Gig => !!gig);

    if (gigs.length !== leaves.length) return null;

    return {
        ...firstVenue,
        gigs,
    };
};

const VenueClusterGigRow = ({
    gig,
    dateFallback,
    onEditGig,
    onDeleteGig,
    isStarred,
    onToggleGigStar,
}: {
    gig: Gig;
    dateFallback?: string;
    onEditGig?: (gig: Gig) => void;
    onDeleteGig?: (gig: Gig) => void;
    isStarred?: boolean;
    onToggleGigStar?: (gig: Gig) => void;
}) => {
    const { t } = useTranslation();
    const [isArtistRowExpanded, setIsArtistRowExpanded] = useState(false);
    const [artistFitCount, setArtistFitCount] = useState<number | null>(null);
    const [optimisticStarred, setOptimisticStarred] = useState(isStarred);
    const artistRowRef = useRef<HTMLDivElement | null>(null);
    const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const artistNames = useMemo(() => gig.artists.length ? gig.artists : [gig.artist], [gig.artist, gig.artists]);
    const formattedDate = formatGigDateTimeValue(gig.date, gig.time, dateFallback);
    const title = gig.gigName || gig.tour?.name || '';

    useEffect(() => {
        setOptimisticStarred(isStarred);
    }, [isStarred]);

    useEffect(() => {
        const measureArtistText = (text: string) => {
            measureCanvasRef.current ??= document.createElement('canvas');
            const context = measureCanvasRef.current.getContext('2d');
            if (!context) return text.length * 8;

            context.font = '600 14px Arial, sans-serif';
            return context.measureText(text).width;
        };

        const updateArtistFitCount = () => {
            const row = artistRowRef.current;
            if (!row || artistNames.length <= 1) {
                setArtistFitCount(null);
                return;
            }

            const availableWidth = row.clientWidth;
            const toggleWidth = 38;
            const gapWidth = 6;
            let fitCount = artistNames.length;

            for (let count = artistNames.length; count > 1; count -= 1) {
                const label = artistNames.slice(0, count).map((artist) => artist.name).join(', ');
                const hiddenCount = artistNames.length - count;
                const requiredWidth = measureArtistText(label) + (hiddenCount > 0 ? toggleWidth + gapWidth : 0);

                // Collapse only when measured labels exceed actual row width
                if (requiredWidth <= availableWidth) {
                    fitCount = count;
                    break;
                }

                fitCount = count - 1;
            }

            setArtistFitCount((currentCount) => {
                const nextCount = Math.max(1, fitCount);
                return currentCount === nextCount ? currentCount : nextCount;
            });
        };

        updateArtistFitCount();

        const resizeObserver = new ResizeObserver(updateArtistFitCount);
        if (artistRowRef.current) {
            resizeObserver.observe(artistRowRef.current);
        }

        return () => resizeObserver.disconnect();
    }, [artistNames]);

    const collapsedArtistCount = artistFitCount ?? Math.min(artistNames.length, 2);
    const visibleArtists = isArtistRowExpanded ? artistNames : artistNames.slice(0, collapsedArtistCount);
    const hiddenArtistCount = artistNames.length - visibleArtists.length;
    const canToggleArtistRow = hiddenArtistCount > 0 || (isArtistRowExpanded && collapsedArtistCount < artistNames.length);
    const visibleArtistLabel = visibleArtists.map((artist) => artist.name).join(', ');

    return (
        <li className="group transition-colors duration-150 hover:bg-surface-secondary/30">
            <div className={`relative grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-5 ${isArtistRowExpanded ? 'items-start py-3' : 'items-center py-2.5'}`}>
                <div className={`flex min-w-0 flex-col justify-center ${isArtistRowExpanded ? 'gap-1.5' : 'gap-0.5'}`}>
                    {isArtistRowExpanded ? (
                        <div ref={artistRowRef} className="flex min-w-0 flex-wrap items-center gap-1.5">
                            {artistNames.map((artist) => (
                                <span key={artist.id} className="inline-flex max-w-full items-center rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold leading-5 text-text">
                                    <span className="min-w-0 truncate">{artist.name}</span>
                                </span>
                            ))}
                            {canToggleArtistRow && (
                                <button
                                    type="button"
                                    onClick={() => setIsArtistRowExpanded(false)}
                                    className="inline-flex h-6 w-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-transparent text-[11px] font-semibold leading-none text-text-secondary transition-colors hover:border-transparent hover:bg-surface-muted hover:text-text"
                                >
                                    -
                                </button>
                            )}
                        </div>
                    ) : (
                        <div ref={artistRowRef} className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                            <span className="min-w-0 truncate text-sm font-semibold leading-5 text-text">
                                {visibleArtistLabel}
                            </span>
                            {canToggleArtistRow && (
                                <button
                                    type="button"
                                    onClick={() => setIsArtistRowExpanded(true)}
                                    className="shrink-0 rounded-full border border-border-strong bg-transparent px-2 py-0.5 text-[11px] font-semibold leading-4 text-text-secondary transition-colors hover:border-transparent hover:bg-surface-muted hover:text-text"
                                >
                                    +{hiddenArtistCount}
                                </button>
                            )}
                        </div>
                    )}
                    <p className="min-w-0 truncate text-xs leading-4 text-text-secondary">{title}</p>
                </div>
                <span className={`inline-flex max-w-full items-center rounded-lg bg-surface-muted px-3 py-0.5 text-sm font-medium leading-5 text-text-secondary transition-opacity ${isArtistRowExpanded ? 'mt-0.5' : ''} ${(onToggleGigStar || onEditGig || onDeleteGig) ? 'group-hover:opacity-0' : ''}`}>
                    <span className="min-w-0 truncate">{formattedDate}</span>
                </span>
                <InlineActionMenu
                    className="right-5 top-1/2 -translate-y-1/2"
                    actions={[
                        ...(onToggleGigStar ? [{
                            key: 'star' as const,
                            label: optimisticStarred ? t('tour.actions.unstarGig') : t('tour.actions.starGig'),
                            title: optimisticStarred ? t('tour.actions.unstarGig') : t('tour.actions.starGig'),
                            active: optimisticStarred,
                            onClick: () => {
                                setOptimisticStarred((currentStarred) => !currentStarred);
                                onToggleGigStar(gig);
                            },
                        }] : []),
                        ...(onEditGig ? [{
                            key: 'edit' as const,
                            label: t('common.edit'),
                            onClick: () => onEditGig(gig),
                        }] : []),
                        ...(onDeleteGig ? [{
                            key: 'delete' as const,
                            label: t('common.delete'),
                            title: t('common.delete'),
                            onClick: () => onDeleteGig(gig),
                        }] : []),
                    ]}
                />
            </div>
        </li>
    );
};

const VenueClusterGigList = ({
    venueName,
    gigs,
    venueColor,
    onEditGig,
    onDeleteGig,
    starredGigIds,
    onToggleGigStar,
}: {
    venueName: string;
    gigs: Gig[];
    venueColor?: string;
    onEditGig?: (gig: Gig) => void;
    onDeleteGig?: (gig: Gig) => void;
    starredGigIds?: Set<string>;
    onToggleGigStar?: (gig: Gig) => void;
}) => {
    const { i18n } = useTranslation();
    const dateFallback = i18n.resolvedLanguage || i18n.language || undefined;
    const sortedGigs = [...gigs].sort((first, second) => (
        first.date.localeCompare(second.date) || (first.time ?? '').localeCompare(second.time ?? '') || getGigArtistNames(first).localeCompare(getGigArtistNames(second))
    ));
    const primaryArtist = gigs[0]?.artists[0] ?? gigs[0]?.artist;
    const headerBackgroundUrl = getAvatarUrl(primaryArtist?.sourceImage, primaryArtist?.avatarCrop) || primaryArtist?.sourceImage;
    const headerPrimaryColor = venueColor ?? buildClusterPalette(1, getStableColorHash(`venue-header:${venueName}`))[0];
    const headerLightColor = `color-mix(in srgb, ${headerPrimaryColor} 42%, white)`;
    const headerMidColor = `color-mix(in srgb, ${headerPrimaryColor} 62%, white)`;
    const headerColorField = `linear-gradient(115deg, ${headerLightColor} 0%, ${headerMidColor} 42%, ${headerPrimaryColor} 100%)`;

    return (
        <div className="flex w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg bg-surface font-sans shadow-lg ring-1 ring-border/40">
            <div className="relative flex items-center justify-between gap-3 overflow-hidden border-b border-border/60 bg-surface px-5 py-3.5">
                {headerBackgroundUrl && (
                    <>
                        <img
                            aria-hidden="true"
                            src={headerBackgroundUrl}
                            alt=""
                            className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl"
                        />
                    </>
                )}
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-3 opacity-35 blur-lg"
                    style={{ background: headerColorField }}
                />
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-surface/40" />
                <h3 className="relative z-10 min-w-0 truncate text-base font-semibold tracking-tight text-text">{venueName}</h3>
                <p className="relative z-10 shrink-0 text-xs font-medium text-text-secondary">{gigs.length} gigs</p>
            </div>
            <ul className="max-h-[18rem] overflow-y-auto divide-y divide-border">
                {sortedGigs.map((gig) => (
                    <VenueClusterGigRow
                        key={gig.id}
                        gig={gig}
                        dateFallback={dateFallback}
                        onEditGig={onEditGig}
                        onDeleteGig={onDeleteGig}
                        isStarred={starredGigIds?.has(gig.id) ?? false}
                        onToggleGigStar={onToggleGigStar}
                    />
                ))}
            </ul>
        </div>
    );
};

// Include only fields that change spatial output
const getArtistIndexSignature = (artists: Artist[], view: LocationView) => (
    `${view}|${artists.map((artist) => {
        const active = artist.activeLocation.coordinates;
        const original = artist.originalLocation.coordinates;
        return [
            artist.id,
            active.lat,
            active.lng,
            original.lat,
            original.lng,
            artist.updatedAt ? new Date(artist.updatedAt).getTime() : '',
        ].join(':');
    }).join('|')}`
);

type ScreenPixel = {
    x: number;
    y: number;
};

type ScreenArtistPoint = {
    point: ArtistPoint;
    pixel: ScreenPixel;
};

type ScreenCluster = {
    points: ScreenArtistPoint[];
    center: ScreenPixel;
    radius: number;
};

type ScreenObstacle = {
    center: ScreenPixel;
    radius: number;
};

const getPointDistance = (first: ScreenPixel, second: ScreenPixel) => {
    const dx = first.x - second.x;
    const dy = first.y - second.y;
    return Math.sqrt(dx * dx + dy * dy);
};

const getClusterId = (points: ScreenArtistPoint[]) => {
    const key = points.map(({ point }) => point.properties.artistId).sort().join('|');
    let hash = 0;

    // Stable numeric id keeps marker reuse tied to leaf membership
    for (let index = 0; index < key.length; index += 1) {
        hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
    }

    return Math.abs(hash) || 1;
};

const measureScreenCluster = (points: ScreenArtistPoint[]): ScreenCluster => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    points.forEach(({ pixel }) => {
        minX = Math.min(minX, pixel.x);
        maxX = Math.max(maxX, pixel.x);
        minY = Math.min(minY, pixel.y);
        maxY = Math.max(maxY, pixel.y);
    });

    const center = {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
    };
    const radius = points.reduce((maxRadius, { pixel }) => (
        Math.max(maxRadius, getPointDistance(center, pixel))
    ), 0);

    return { points, center, radius };
};

const getScreenClusterCoverageRadius = (cluster: ScreenCluster) => (
    Math.max(
        CLUSTER_CONFIG.minClusterSize / 2,
        cluster.radius
    )
);

const getScreenClusterOverlap = (first: ScreenCluster, second: ScreenCluster) => (
    getScreenClusterCoverageRadius(first)
    + getScreenClusterCoverageRadius(second)
    - getPointDistance(first.center, second.center)
);

const splitFarthestClusterPoint = (cluster: ScreenCluster) => {
    if (cluster.points.length <= 1) return null;

    let farthestIndex = 0;
    let farthestDistance = -Infinity;

    // Farthest member defines the current cluster radius
    cluster.points.forEach(({ point, pixel }, index) => {
        const distance = getPointDistance(cluster.center, pixel);
        const currentId = point.properties.artistId;
        const farthestId = cluster.points[farthestIndex].point.properties.artistId;
        if (distance > farthestDistance || (distance === farthestDistance && currentId > farthestId)) {
            farthestIndex = index;
            farthestDistance = distance;
        }
    });

    const removedPoint = cluster.points[farthestIndex];
    const remainingPoints = cluster.points.filter((_, index) => index !== farthestIndex);

    return {
        trimmed: measureScreenCluster(remainingPoints),
        removed: measureScreenCluster([removedPoint]),
        removedDistance: farthestDistance,
    };
};

const hasArtistMarkerCollision = (points: ScreenArtistPoint[]) => {
    // Readability gate for preserving separated child markers
    for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
            if (getPointDistance(points[firstIndex].pixel, points[secondIndex].pixel) <= CLUSTER_CONFIG.artistMarkerCollisionDistance) {
                return true;
            }
        }
    }

    return false;
};

const resolveMarkerCollisions = (
    offsets: ScreenPixel[],
    spacing: number,
    obstacleSpacing: number,
    obstacles: ScreenObstacle[] = []
) => {
    const positions = offsets.map((offset) => ({ ...offset }));

    // Deterministic pair and obstacle separation for expanded marker layout
    for (let pass = 0; pass < 18; pass += 1) {
        let moved = false;

        for (let firstIndex = 0; firstIndex < positions.length; firstIndex += 1) {
            for (let secondIndex = firstIndex + 1; secondIndex < positions.length; secondIndex += 1) {
                const dx = positions[firstIndex].x - positions[secondIndex].x;
                const dy = positions[firstIndex].y - positions[secondIndex].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance >= spacing) continue;

                const fallbackAngle = ((firstIndex * 31 + secondIndex * 17) % 360) * (Math.PI / 180);
                const normalX = distance > 0 ? dx / distance : Math.cos(fallbackAngle);
                const normalY = distance > 0 ? dy / distance : Math.sin(fallbackAngle);
                const push = (spacing - distance) / 2;

                positions[firstIndex].x += normalX * push;
                positions[firstIndex].y += normalY * push;
                positions[secondIndex].x -= normalX * push;
                positions[secondIndex].y -= normalY * push;
                moved = true;
            }
        }

        positions.forEach((position, positionIndex) => {
            obstacles.forEach((obstacle, obstacleIndex) => {
                const dx = position.x - obstacle.center.x;
                const dy = position.y - obstacle.center.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const requiredDistance = obstacleSpacing / 2 + obstacle.radius;
                if (distance >= requiredDistance) return;

                const fallbackAngle = ((positionIndex * 43 + obstacleIndex * 19) % 360) * (Math.PI / 180);
                const normalX = distance > 0 ? dx / distance : Math.cos(fallbackAngle);
                const normalY = distance > 0 ? dy / distance : Math.sin(fallbackAngle);
                const push = requiredDistance - distance;

                position.x += normalX * push;
                position.y += normalY * push;
                moved = true;
            });
        });

        if (!moved) break;
    }

    return positions;
};

const buildGeometricClusters = (
    artists: Artist[],
    view: LocationView,
    map: maplibregl.Map,
    mapZoom: number,
    keepCollisionClustersAtMaxZoom = false
) => {
    if (mapZoom >= CLUSTER_CONFIG.disableClusteringAtZoomLevel + 0.5 && !keepCollisionClustersAtMaxZoom) {
        return {
            features: artists.map((artist) => makeArtistPoint(artist, view)),
            leavesByClusterId: new Map<number, ArtistPoint[]>(),
        };
    }

    const screenClusters = artists
        .map((artist) => {
            const point = makeArtistPoint(artist, view);
            return {
                points: [{
                    point,
                    pixel: map.project(point.geometry.coordinates as [number, number]),
                }],
            };
        })
        .map((cluster) => measureScreenCluster(cluster.points));

    let merged = true;
    while (merged) {
        merged = false;
        let bestMerge: { firstIndex: number; secondIndex: number; cluster: ScreenCluster } | null = null;

        // Smallest valid merge preserves tight local clusters first
        for (let firstIndex = 0; firstIndex < screenClusters.length; firstIndex += 1) {
            for (let secondIndex = firstIndex + 1; secondIndex < screenClusters.length; secondIndex += 1) {
                const candidate = measureScreenCluster([
                    ...screenClusters[firstIndex].points,
                    ...screenClusters[secondIndex].points,
                ]);
                if (candidate.radius > CLUSTER_CONFIG.maxClusterRadius) continue;
                if (bestMerge && candidate.radius >= bestMerge.cluster.radius) continue;
                bestMerge = { firstIndex, secondIndex, cluster: candidate };
            }
        }

        if (bestMerge) {
            screenClusters.splice(bestMerge.secondIndex, 1);
            screenClusters.splice(bestMerge.firstIndex, 1, bestMerge.cluster);
            merged = true;
        }
    }

    let collisionTrimmed = true;
    while (collisionTrimmed) {
        collisionTrimmed = false;
        let bestTrim: {
            targetIndex: number;
            trimmed: ScreenCluster;
            removed: ScreenCluster;
            overlapAfterTrim: number;
            overlapBeforeTrim: number;
            removedDistance: number;
        } | null = null;

        // Overlapping truthful footprints eject their farthest member
        for (let firstIndex = 0; firstIndex < screenClusters.length; firstIndex += 1) {
            for (let secondIndex = firstIndex + 1; secondIndex < screenClusters.length; secondIndex += 1) {
                const firstCluster = screenClusters[firstIndex];
                const secondCluster = screenClusters[secondIndex];
                const overlapBeforeTrim = getScreenClusterOverlap(firstCluster, secondCluster);
                if (overlapBeforeTrim <= 0) continue;

                const candidates = [
                    { targetIndex: firstIndex, split: splitFarthestClusterPoint(firstCluster), other: secondCluster },
                    { targetIndex: secondIndex, split: splitFarthestClusterPoint(secondCluster), other: firstCluster },
                ];

                for (const { targetIndex, split, other } of candidates) {
                    if (!split) continue;

                    const overlapAfterTrim = Math.max(0, getScreenClusterOverlap(split.trimmed, other));
                    const candidate = {
                        targetIndex,
                        trimmed: split.trimmed,
                        removed: split.removed,
                        overlapAfterTrim,
                        overlapBeforeTrim,
                        removedDistance: split.removedDistance,
                    };
                    const isBetter = !bestTrim
                        || candidate.overlapBeforeTrim > bestTrim.overlapBeforeTrim
                        || (
                            candidate.overlapBeforeTrim === bestTrim.overlapBeforeTrim
                            && candidate.overlapAfterTrim < bestTrim.overlapAfterTrim
                        )
                        || (
                            candidate.overlapBeforeTrim === bestTrim.overlapBeforeTrim
                            && candidate.overlapAfterTrim === bestTrim.overlapAfterTrim
                            && candidate.removedDistance > bestTrim.removedDistance
                        );
                    if (isBetter) {
                        bestTrim = candidate;
                    }
                }
            }
        }

        if (bestTrim) {
            screenClusters.splice(bestTrim.targetIndex, 1, bestTrim.trimmed);
            screenClusters.push(bestTrim.removed);
            collisionTrimmed = true;
        }
    }

    const canvas = map.getCanvas();
    const padding = CLUSTER_CONFIG.maxClusterRadius;
    const isVisiblePixel = (pixel: ScreenPixel) => (
        pixel.x >= -padding
        && pixel.x <= canvas.clientWidth + padding
        && pixel.y >= -padding
        && pixel.y <= canvas.clientHeight + padding
    );
    const leavesByClusterId = new Map<number, ArtistPoint[]>();
    const features: ClusterFeature[] = [];

    screenClusters.forEach((cluster) => {
        const isVisible = isVisiblePixel(cluster.center)
            || cluster.points.some(({ pixel }) => isVisiblePixel(pixel));
        if (!isVisible) return;

        // Non-overlapping child markers stay individually readable
        if (cluster.points.length === 1 || !hasArtistMarkerCollision(cluster.points)) {
            cluster.points.forEach(({ point }) => features.push(point));
            return;
        }

        const id = getClusterId(cluster.points);
        const centerLngLat = map.unproject([cluster.center.x, cluster.center.y]);
        const leaves = cluster.points.map(({ point }) => point);
        leavesByClusterId.set(id, leaves);
        features.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [centerLngLat.lng, centerLngLat.lat],
            },
            properties: {
                cluster: true,
                cluster_id: id,
                point_count: leaves.length,
                point_count_abbreviated: leaves.length,
            },
        });
    });

    return { features, leavesByClusterId };
};

interface UseArtistMarkersOptions {
    mapRef: RefObject<maplibregl.Map | null>;
    mapReady: boolean;
    displayArtists: Artist[];
    view: LocationView;
    locationLanguage: LocationLanguage;
    artistNameDisplayMode: ArtistNameDisplayMode;
    clusterColorDebugEnabled: boolean;
    selectedCityIdRef: RefObject<string | null>;
    setSelectedCityId: Dispatch<SetStateAction<string | null>>;
    onEditArtist?: (artist: Artist) => void;
    onDeleteArtist?: (artist: Artist) => void;
    onArtistPopupOpenChange?: (open: boolean) => void;
    artistPopupLifecycleRef?: RefObject<ArtistPopupLifecycleState>;
    canAdjustDisplayCoordinates?: boolean;
    onDisplayCoordinateEditStart?: (cityId: string) => void;
    onDisplayCoordinateEditEnd?: () => void;
    onDisplayCoordinateChange?: (
        artist: Artist,
        view: LocationView,
        coordinates: { lat: number; lng: number }
    ) => Promise<void> | void;
    highlightedArtistIds?: Set<string>;
    renderPopupContent?: (artist: Artist, showActions: boolean) => ReactNode;
    starredGigIds?: Set<string>;
    onToggleGigStar?: (gig: Gig) => void;
    keepCollisionClustersAtMaxZoom?: boolean;
}

export const useArtistMarkers = ({
    mapRef,
    mapReady,
    displayArtists,
    view,
    locationLanguage,
    artistNameDisplayMode,
    clusterColorDebugEnabled,
    selectedCityIdRef,
    setSelectedCityId,
    onEditArtist,
    onDeleteArtist,
    onArtistPopupOpenChange,
    artistPopupLifecycleRef,
    canAdjustDisplayCoordinates = false,
    onDisplayCoordinateEditStart,
    onDisplayCoordinateEditEnd,
    onDisplayCoordinateChange,
    highlightedArtistIds,
    renderPopupContent,
    starredGigIds,
    onToggleGigStar,
    keepCollisionClustersAtMaxZoom = false,
}: UseArtistMarkersOptions) => {
    // Marker sets owned by this hook
    const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
    const expandedRef = useRef<Map<string, ExpandedClusterState>>(new Map());
    const collapsingClusterHidesRef = useRef<Map<string, Pick<ExpandedClusterState, 'hiddenClusterKey' | 'hiddenClusterLeafKey'>>>(new Map());
    const visibleClustersRef = useRef<ClusterPoint[]>([]);
    const visibleClusterRadiiRef = useRef<Map<number, number>>(new Map());
    const clusterColorRecordsRef = useRef<Map<string, { color: string; leafIds: Set<string>; size: number }>>(new Map());
    const clusterColorSeedRef = useRef(Math.floor(Math.random() * 0xffffffff));

    // Current map data and popup handles
    const clusterLeavesRef = useRef<Map<number, ArtistPoint[]>>(new Map());
    const clusterDebugColorsRef = useRef<Map<string, string>>(new Map());
    const artistsByIdRef = useRef<Map<string, Artist>>(new Map());
    const activePopupRef = useRef<maplibregl.Popup | null>(null);
    const artistMarkerZIndexRef = useRef<Map<string, string>>(new Map());
    const lastSelectedArtistIdRef = useRef<string | null>(null);
    const popupOptionsRef = useRef({
        locationLanguage,
        onEditArtist,
        onDeleteArtist,
        view,
        renderPopupContent,
        starredGigIds,
        onToggleGigStar,
    });
    const displayCoordinateEditOptionsRef = useRef({
        canAdjustDisplayCoordinates,
        onDisplayCoordinateEditStart,
        onDisplayCoordinateEditEnd,
        onDisplayCoordinateChange,
        view,
    });

    // Previous render state used to compare map changes
    const lastClusterZoomRef = useRef<number | null>(null);
    const lastMapZoomRef = useRef<number | null>(null);
    const clusterIndexSignatureRef = useRef<string | null>(null);

    // Merge timing and delayed cluster inserts
    const mergeHoldUntilRef = useRef(0);
    const mergeHoldTokenRef = useRef(0);
    const mergeHoldTargetKeysRef = useRef<Set<string>>(new Set());
    const pendingMergeTimersRef = useRef<Set<number>>(new Set());
    const clusterTransitionUntilRef = useRef(0);
    const [hasExpandedClusters, setHasExpandedClusters] = useState(false);
    const displayGigs = useMemo(() => (
        displayArtists
            .map((artist) => (artist as Partial<GigMarkerArtist>).gig)
            .filter((gig): gig is Gig => !!gig)
    ), [displayArtists]);
    const gigProvinceColors = useMemo(() => getGigProvinceColorMap(displayGigs), [displayGigs]);

    const assignClusterColors = useCallback((
        visibleClusters: ClusterPoint[],
        leavesByClusterId: Map<number, ArtistPoint[]>
    ) => {
        const previousRecords = clusterColorRecordsRef.current;
        const nextRecords = new Map<string, { color: string; leafIds: Set<string>; size: number }>();
        const clusterEntries = visibleClusters.map((cluster) => {
            const leaves = leavesByClusterId.get(cluster.properties.cluster_id) ?? [];
            const leafKey = getClusterLeafKey(leaves);
            const leafIds = getLeafIdSet(leaves);

            return {
                cluster,
                leafKey,
                leafIds,
                size: leaves.length,
            };
        });
        const inheritedLeafKeys = new Set<string>();

        clusterEntries.forEach((entry) => {
            const previousRecord = previousRecords.get(entry.leafKey);
            if (!previousRecord) return;

            nextRecords.set(entry.leafKey, {
                color: previousRecord.color,
                leafIds: entry.leafIds,
                size: entry.size,
            });
            inheritedLeafKeys.add(entry.leafKey);
        });

        previousRecords.forEach((record) => {
            const splitChildren = clusterEntries
                .filter((entry) => !inheritedLeafKeys.has(entry.leafKey) && isLeafSubset(entry.leafIds, record.leafIds))
                .sort((first, second) => second.size - first.size || first.leafKey.localeCompare(second.leafKey));
            const inheritingChild = splitChildren[0];
            if (!inheritingChild) return;

            nextRecords.set(inheritingChild.leafKey, {
                color: record.color,
                leafIds: inheritingChild.leafIds,
                size: inheritingChild.size,
            });
            inheritedLeafKeys.add(inheritingChild.leafKey);
        });

        const seededPalette = buildClusterPalette(Math.max(1, clusterEntries.length), clusterColorSeedRef.current, { distinguishableRatio: 0.45 });
        const usedColors = new Set(Array.from(nextRecords.values()).map((record) => record.color));
        const availableColors = seededPalette.filter((color) => !usedColors.has(color));
        let colorCursor = 0;

        clusterEntries
            .filter((entry) => !nextRecords.has(entry.leafKey))
            .sort((first, second) => (
                getStableColorHash(`${clusterColorSeedRef.current}:${first.leafKey}`)
                - getStableColorHash(`${clusterColorSeedRef.current}:${second.leafKey}`)
            ))
            .forEach((entry) => {
                const color = availableColors[colorCursor] ?? seededPalette[colorCursor % seededPalette.length];
                colorCursor += 1;

                nextRecords.set(entry.leafKey, {
                    color,
                    leafIds: entry.leafIds,
                    size: entry.size,
                });
            });

        clusterColorRecordsRef.current = nextRecords;
        return nextRecords;
    }, []);

    useEffect(() => {
        // Popup callbacks update independently from marker reconciliation
        popupOptionsRef.current = {
            locationLanguage,
            onEditArtist,
            onDeleteArtist,
            view,
            renderPopupContent,
            starredGigIds,
            onToggleGigStar,
        };
    }, [locationLanguage, onDeleteArtist, onEditArtist, onToggleGigStar, renderPopupContent, starredGigIds, view]);

    useEffect(() => {
        displayCoordinateEditOptionsRef.current = {
            canAdjustDisplayCoordinates,
            onDisplayCoordinateEditStart,
            onDisplayCoordinateEditEnd,
            onDisplayCoordinateChange,
            view,
        };
    }, [
        canAdjustDisplayCoordinates,
        onDisplayCoordinateChange,
        onDisplayCoordinateEditEnd,
        onDisplayCoordinateEditStart,
        view,
    ]);

    const isPointInsideRing = useCallback((point: [number, number], ring: number[][]) => {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i];
            const [xj, yj] = ring[j];
            const intersects = ((yi > point[1]) !== (yj > point[1]))
                && (point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi);
            if (intersects) inside = !inside;
        }
        return inside;
    }, []);

    const isInsideBoundary = useCallback((
        coordinates: { lat: number; lng: number },
        boundary: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }
    ) => {
        const point: [number, number] = [coordinates.lng, coordinates.lat];
        const polygons = boundary.type === 'Polygon'
            ? [boundary.coordinates as number[][][]]
            : boundary.coordinates as number[][][][];

        return polygons.some((polygon) => (
            polygon.length > 0
            && isPointInsideRing(point, polygon[0])
            && polygon.slice(1).every((hole) => !isPointInsideRing(point, hole))
        ));
    }, [isPointInsideRing]);

    const bindDisplayCoordinateEditing = useCallback((
        marker: maplibregl.Marker,
        artist: Artist,
        clusterDisabled: boolean
    ) => {
        const element = marker.getElement();
        const options = displayCoordinateEditOptionsRef.current;
        const cityId = options.view === 'active' ? artist.activeCityId : artist.originalCityId;
        const canEdit = options.canAdjustDisplayCoordinates && clusterDisabled && Boolean(cityId);
        const startCoordinates = options.view === 'active'
            ? artist.activeLocationDisplayCoordinates
            : artist.originalLocationDisplayCoordinates;
        let longPressTimer: number | null = null;
        let pointerStartedAsTouch = false;
        let touchDragActive = false;
        let touchDragPointerId: number | null = null;
        let touchDragBoundary: Awaited<ReturnType<typeof getCityById>> | null = null;

        const desktopPointer = window.matchMedia('(pointer: fine)').matches;
        marker.setDraggable(canEdit && desktopPointer);
        element.classList.toggle('display-coordinate-editable', canEdit);

        element.onpointerdown = canEdit ? (event) => {
            pointerStartedAsTouch = event.pointerType === 'touch';
            if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
                return;
            }
            if (event.pointerType === 'touch') {
                touchDragPointerId = event.pointerId;
                longPressTimer = window.setTimeout(() => {
                    touchDragActive = true;
                    element.classList.add('display-coordinate-edit-armed');
                    element.classList.add('display-coordinate-dragging');
                    element.dataset.displayCoordinateDragging = 'true';
                    element.setPointerCapture(event.pointerId);
                    mapRef.current?.dragPan.disable();
                    options.onDisplayCoordinateEditStart?.(cityId);
                    void getCityById(cityId).then((city) => {
                        touchDragBoundary = city;
                    });
                }, 450);
            }
        } : null;
        element.onpointerup = element.onpointercancel = async () => {
            if (longPressTimer !== null) {
                window.clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            element.classList.remove('display-coordinate-edit-armed');
            if (touchDragActive) {
                const lngLat = marker.getLngLat();
                const nextCoordinates = { lat: lngLat.lat, lng: lngLat.lng };
                try {
                    const city = touchDragBoundary ?? await getCityById(cityId);
                    if (!city.boundary || !isInsideBoundary(nextCoordinates, city.boundary)) {
                        marker.setLngLat([startCoordinates.lng, startCoordinates.lat]);
                    } else {
                        await options.onDisplayCoordinateChange?.(artist, options.view, nextCoordinates);
                    }
                } finally {
                    touchDragActive = false;
                    touchDragPointerId = null;
                    touchDragBoundary = null;
                    delete element.dataset.displayCoordinateDragging;
                    element.classList.remove('display-coordinate-dragging');
                    element.dataset.suppressArtistClick = 'true';
                    window.setTimeout(() => {
                        delete element.dataset.suppressArtistClick;
                    }, 300);
                    mapRef.current?.dragPan.enable();
                    options.onDisplayCoordinateEditEnd?.();
                }
            } else if (pointerStartedAsTouch && !element.dataset.displayCoordinateDragging) {
                marker.setDraggable(false);
            }
        };
        element.onpointermove = canEdit ? (event) => {
            if (event.pointerType !== 'touch') return;
            if (touchDragActive && touchDragPointerId === event.pointerId) {
                event.preventDefault();
                event.stopPropagation();
                const map = mapRef.current;
                if (!map) return;
                const rect = map.getCanvas().getBoundingClientRect();
                const lngLat = map.unproject([event.clientX - rect.left, event.clientY - rect.top]);
                marker.setLngLat([lngLat.lng, lngLat.lat]);
                return;
            }
            if (longPressTimer !== null) {
                // Moving before the hold completes means this is map panning, not editing.
                window.clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        } : null;

        const previousDragHandlers = displayCoordinateDragHandlers.get(marker);
        if (previousDragHandlers) {
            marker.off('dragstart', previousDragHandlers.dragStart);
            marker.off('dragend', previousDragHandlers.dragEnd);
            displayCoordinateDragHandlers.delete(marker);
        }
        if (!canEdit || !cityId) return;

        const dragStart = () => {
            element.dataset.displayCoordinateDragging = 'true';
            element.classList.add('display-coordinate-dragging');
            options.onDisplayCoordinateEditStart?.(cityId);
        };
        const dragEnd = async () => {
            const lngLat = marker.getLngLat();
            const nextCoordinates = { lat: lngLat.lat, lng: lngLat.lng };
            try {
                const city = await getCityById(cityId);
                if (!city.boundary || !isInsideBoundary(nextCoordinates, city.boundary)) {
                    marker.setLngLat([startCoordinates.lng, startCoordinates.lat]);
                    return;
                }
                await options.onDisplayCoordinateChange?.(artist, options.view, nextCoordinates);
            } finally {
                delete element.dataset.displayCoordinateDragging;
                element.classList.remove('display-coordinate-dragging');
                element.dataset.suppressArtistClick = 'true';
                window.setTimeout(() => {
                    delete element.dataset.suppressArtistClick;
                }, 300);
                element.classList.remove('display-coordinate-edit-armed');
                marker.setDraggable(canEdit && desktopPointer);
                options.onDisplayCoordinateEditEnd?.();
            }
        };

        marker.on('dragstart', dragStart);
        marker.on('dragend', dragEnd);
        displayCoordinateDragHandlers.set(marker, { dragStart, dragEnd });
    }, [isInsideBoundary]);

    const syncArtistMarkerStackOrder = useCallback((artistId: string, element: HTMLElement, clusterDisabled: boolean) => {
        if (!clusterDisabled) {
            element.style.zIndex = '';
            return;
        }

        let zIndex = artistMarkerZIndexRef.current.get(artistId);
        if (!zIndex) {
            // Stable random stack order while clustering is disabled
            zIndex = getRandomMarkerZIndex();
            artistMarkerZIndexRef.current.set(artistId, zIndex);
        }

        element.style.zIndex = zIndex;
    }, []);

    const promoteSelectedArtistMarker = useCallback((artistId: string, element: HTMLElement) => {
        const previousArtistId = lastSelectedArtistIdRef.current;
        if (previousArtistId && previousArtistId !== artistId) {
            // Previous selection returns to the randomized stack
            artistMarkerZIndexRef.current.delete(previousArtistId);
            const previousEntry = markersRef.current.get(`artist-${previousArtistId}`);
            if (previousEntry?.kind === 'artist') {
                syncArtistMarkerStackOrder(previousArtistId, previousEntry.marker.getElement(), true);
            }
        }

        // Last selected marker remains above the randomized layer
        const zIndex = String(selectedMarkerZIndex);
        lastSelectedArtistIdRef.current = artistId;
        artistMarkerZIndexRef.current.set(artistId, zIndex);
        element.style.zIndex = zIndex;
    }, [syncArtistMarkerStackOrder]);

    const clearPendingMergeTimers = useCallback(() => {
        pendingMergeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        pendingMergeTimersRef.current.clear();
    }, []);

    const findNearestPosition = useCallback((
        target: [number, number],
        positions: [number, number][],
        maxPixelDistance = Infinity
    ): [number, number] | null => {
        const map = mapRef.current;
        if (!map || positions.length === 0) return null;

        const targetPixel = map.project(target);
        let nearest = positions[0];
        let nearestDistance = Infinity;

        positions.forEach((position) => {
            const pixel = map.project(position);
            const distance = (pixel.x - targetPixel.x) ** 2 + (pixel.y - targetPixel.y) ** 2;
            if (distance < nearestDistance) {
                nearest = position;
                nearestDistance = distance;
            }
        });

        return nearestDistance <= maxPixelDistance ** 2 ? nearest : null;
    }, [mapRef]);

    const animateMarkerTo = useCallback((
        marker: maplibregl.Marker,
        target: [number, number],
        onDone?: () => void
    ) => {
        const map = mapRef.current;
        if (!map) {
            // Finish immediately after map cleanup
            marker.setLngLat(target);
            onDone?.();
            return;
        }

        // One active animation per marker
        const previousFrame = markerAnimations.get(marker);
        if (previousFrame !== undefined) {
            window.cancelAnimationFrame(previousFrame);
        }

        // Longitude may wrap around the dateline
        const start = getMarkerCoordinates(marker);
        const lngDelta = getWrappedLngDelta(start[0], target[0]);
        const latDelta = target[1] - start[1];
        const startedAt = performance.now();

        const tick = (now: number) => {
            const progress = Math.min(1, (now - startedAt) / markerMoveDuration);
            const eased = easeOutCubic(progress);
            marker.setLngLat([
                start[0] + lngDelta * eased,
                start[1] + latDelta * eased,
            ]);

            if (progress < 1) {
                markerAnimations.set(marker, window.requestAnimationFrame(tick));
                return;
            }

            // End on the exact target coordinate
            markerAnimations.delete(marker);
            marker.setLngLat(target);
            onDone?.();
        };

        markerAnimations.set(marker, window.requestAnimationFrame(tick));
    }, [mapRef]);

    const animateLineSource = useCallback((
        sourceId: string,
        from: GeoJSON.FeatureCollection<GeoJSON.LineString>,
        to: GeoJSON.FeatureCollection<GeoJSON.LineString>
    ) => {
        const map = mapRef.current;
        // Each source line needs a matching target line
        if (!map || from.features.length !== to.features.length) return;

        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (!source) return;

        const startedAt = performance.now();
        const tick = (now: number) => {
            // Move all connector endpoints on the same clock
            const progress = Math.min(1, (now - startedAt) / markerMoveDuration);
            const eased = easeOutCubic(progress);

            source.setData({
                type: 'FeatureCollection',
                features: from.features.map((feature, index) => {
                    const targetFeature = to.features[index];
                    const [fromStart, fromEnd] = feature.geometry.coordinates;
                    const [toStart, toEnd] = targetFeature.geometry.coordinates;
                    const mix = (fromCoord: number, toCoord: number) => fromCoord + (toCoord - fromCoord) * eased;

                    return {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: [
                                [mix(fromStart[0], toStart[0]), mix(fromStart[1], toStart[1])],
                                [mix(fromEnd[0], toEnd[0]), mix(fromEnd[1], toEnd[1])],
                            ],
                        },
                        properties: {},
                    };
                }),
            });

            if (progress < 1) {
                window.requestAnimationFrame(tick);
            }
        };

        window.requestAnimationFrame(tick);
    }, [mapRef]);

    // Marker callbacks read the latest artist records
    useEffect(() => {
        artistsByIdRef.current = new Map(displayArtists.map((artist) => [artist.id, artist]));
        preloadArtistMarkerImages(displayArtists);

        // Random stack entries only belong to the current artist set
        const artistIds = new Set(displayArtists.map((artist) => artist.id));
        artistMarkerZIndexRef.current.forEach((_, artistId) => {
            if (!artistIds.has(artistId)) {
                artistMarkerZIndexRef.current.delete(artistId);
            }
        });
        if (lastSelectedArtistIdRef.current && !artistIds.has(lastSelectedArtistIdRef.current)) {
            lastSelectedArtistIdRef.current = null;
        }
    }, [displayArtists]);

    const removeMarkerEntry = useCallback((entry: MarkerEntry, destination?: [number, number], onDone?: () => void) => {
        // Active popup can outlive its marker while panning
        if (entry.popup && entry.popup !== activePopupRef.current) {
            entry.popup.remove();
        }
        if (destination) {
            entry.marker.getElement().style.pointerEvents = 'none';
            animateMarkerTo(entry.marker, destination, () => {
                entry.marker.remove();
                onDone?.();
            });
            return;
        }

        const previousFrame = markerAnimations.get(entry.marker);
        if (previousFrame !== undefined) {
            window.cancelAnimationFrame(previousFrame);
            markerAnimations.delete(entry.marker);
        }
        entry.marker.remove();
        onDone?.();
    }, [animateMarkerTo]);

    const clearMarkers = useCallback(() => {
        clearPendingMergeTimers();
        mergeHoldUntilRef.current = 0;
        mergeHoldTokenRef.current += 1;
        mergeHoldTargetKeysRef.current.clear();
        markersRef.current.forEach((entry) => removeMarkerEntry(entry));
        markersRef.current.clear();
        collapsingClusterHidesRef.current.clear();
    }, [clearPendingMergeTimers, removeMarkerEntry]);

    const setArtistPopupLifecycle = useCallback((open: boolean) => {
        if (artistPopupLifecycleRef?.current) {
            // Popup timing protects cluster transitions during rebuilds
            artistPopupLifecycleRef.current.open = open;
            artistPopupLifecycleRef.current.openedAt = open ? performance.now() : artistPopupLifecycleRef.current.openedAt;
            artistPopupLifecycleRef.current.closedAt = open ? 0 : performance.now();
        }
        onArtistPopupOpenChange?.(open);
    }, [artistPopupLifecycleRef, onArtistPopupOpenChange]);

    const closeActiveArtistPopup = useCallback(() => {
        if (activePopupRef.current) {
            activePopupRef.current.remove();
            return;
        }

        // MapLibre can leave popup DOM after ref changes
        const popupElements = mapRef.current?.getContainer().querySelectorAll('.artist-popup');
        if (!popupElements?.length) return;

        popupElements.forEach((element) => element.remove());
        setArtistPopupLifecycle(false);
    }, [mapRef, setArtistPopupLifecycle]);

    const isClusterSourceHidden = useCallback((key: string, leafKey: string) => {
        // Cluster ids can change while leaf membership stays the same
        const matches = (state: Pick<ExpandedClusterState, 'hiddenClusterKey' | 'hiddenClusterLeafKey'>) => (
            state.hiddenClusterKey === key || state.hiddenClusterLeafKey === leafKey
        );

        return Array.from(expandedRef.current.values()).some(matches)
            || Array.from(collapsingClusterHidesRef.current.values()).some(matches);
    }, []);

    // Keep expanded clusters during popup close and marker rebuild overlap
    const shouldKeepExpandedClusters = useCallback(() => (
        !!artistPopupLifecycleRef?.current?.open
        || (
            !!artistPopupLifecycleRef?.current?.closedAt
            && performance.now() - artistPopupLifecycleRef.current.closedAt < clusterCollapseAfterPopupCloseGraceMs
        )
    ), [artistPopupLifecycleRef]);

    // Remove expanded-cluster markers and connector lines
    const removeExpandedClusterArtifacts = useCallback((animate = true) => {
        const map = mapRef.current;
        if (!map) return;

        // Expanded markers are not part of the normal marker map
        expandedRef.current.forEach((state, clusterKey) => {
            collapsingClusterHidesRef.current.set(clusterKey, {
                hiddenClusterKey: state.hiddenClusterKey,
                hiddenClusterLeafKey: state.hiddenClusterLeafKey,
            });
            let remainingMarkers = state.markers.length;
            const restoreHiddenCluster = () => {
                collapsingClusterHidesRef.current.delete(clusterKey);
                markersRef.current.forEach((entry, key) => {
                    if (entry.kind !== 'cluster') return;
                    if (key !== state.hiddenClusterKey && entry.leafKey !== state.hiddenClusterLeafKey) return;
                    setClusterElementExpandedHidden(entry.marker.getElement(), false);
                });
            };

            if (remainingMarkers === 0) {
                restoreHiddenCluster();
            }
            state.debugRingMarkers.forEach((marker) => marker.remove());
            state.markers.forEach((marker) => {
                marker.getElement().style.pointerEvents = 'none';
                if (!animate) {
                    // Zoom cleanup removes expanded markers immediately
                    marker.remove();
                    remainingMarkers -= 1;
                    if (remainingMarkers === 0) {
                        restoreHiddenCluster();
                    }
                    return;
                }
                animateMarkerTo(marker, state.clusterCenter, () => {
                    marker.remove();
                    remainingMarkers -= 1;
                    if (remainingMarkers === 0) {
                        restoreHiddenCluster();
                    }
                });
            });
            if (map.getLayer(state.layerId)) map.removeLayer(state.layerId);
            if (map.getSource(state.sourceId)) map.removeSource(state.sourceId);
        });
        expandedRef.current.clear();
    }, [animateMarkerTo, mapRef]);

    const collapseExpandedClusters = useCallback((animate = true) => {
        removeExpandedClusterArtifacts(animate);
        setHasExpandedClusters(false);
    }, [removeExpandedClusterArtifacts]);

    // Show ArtistCard in a MapLibre popup
    const openArtistPopup = useCallback((artist: Artist, marker: maplibregl.Marker) => {
        const map = mapRef.current;
        if (!map) return;

        setArtistPopupLifecycle(true);
        activePopupRef.current?.remove();
        activePopupRef.current = null;
        markersRef.current.forEach((entry) => entry.marker.getElement().classList.remove('marker-focused'));

        const popupContainer = document.createElement('div');
        const root = createRoot(popupContainer);
        const { locationLanguage, onEditArtist, onDeleteArtist, view, renderPopupContent } = popupOptionsRef.current;
        const showActions = !!(onEditArtist || onDeleteArtist);
        // React renders the content, MapLibre places the popup
        root.render(
            renderPopupContent
                ? renderPopupContent(artist, showActions)
                : <ArtistCard artist={artist} showActions={showActions} locationLanguage={locationLanguage} />
        );

        const popup = new maplibregl.Popup({
            closeButton: false,
            // MapView handles outside clicks together with cluster state
            closeOnClick: false,
            className: 'artist-popup',
            maxWidth: '320px',
            offset: markerPopupOffset,
        })
            .setDOMContent(popupContainer)
            .setLngLat(marker.getLngLat())
            .addTo(map);
        activePopupRef.current = popup;

        marker.getElement().classList.add('marker-focused');
        if (map.getZoom() >= CLUSTER_CONFIG.disableClusteringAtZoomLevel + 0.5) {
            promoteSelectedArtistMarker(artist.id, marker.getElement());
        }
        setSelectedCityId(view === 'active' ? artist.activeCityId : artist.originalCityId);

        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const editButton = target.closest('[data-action="edit"]');
            const deleteButton = target.closest('[data-action="delete"]');

            if (editButton && onEditArtist) {
                event.preventDefault();
                event.stopPropagation();
                popup.remove();
                onEditArtist(artist);
            } else if (deleteButton && onDeleteArtist) {
                event.preventDefault();
                event.stopPropagation();
                onDeleteArtist(artist);
            }
        };

        popupContainer.addEventListener('click', handleClick);
        popup.on('close', () => {
            // Remove listeners and React state owned by this popup
            popupContainer.removeEventListener('click', handleClick);
            marker.getElement().classList.remove('marker-focused');
            root.unmount();
            markersRef.current.forEach((entry) => {
                if (entry.popup === popup) {
                    entry.popup = undefined;
                    entry.root = undefined;
                }
            });
            if (activePopupRef.current === popup) {
                activePopupRef.current = null;
            }
            setArtistPopupLifecycle(false);
            setSelectedCityId((current) => current === selectedCityIdRef.current ? null : current);
        });

        const key = `artist-${artist.id}`;
        const entry = markersRef.current.get(key);
        if (entry) {
            // Replace the previous popup handle for this marker
            entry.popup?.remove();
            entry.root?.unmount();
            entry.popup = popup;
            entry.root = root;
        }
    }, [mapRef, promoteSelectedArtistMarker, selectedCityIdRef, setArtistPopupLifecycle, setSelectedCityId]);

    const openVenueClusterPopup = useCallback((
        venueCluster: NonNullable<ReturnType<typeof getSameVenueGigCluster>>,
        center: [number, number],
        sourceElement: HTMLElement
    ) => {
        const map = mapRef.current;
        if (!map) return;

        setArtistPopupLifecycle(true);
        activePopupRef.current?.remove();
        activePopupRef.current = null;
        markersRef.current.forEach((entry) => entry.marker.getElement().classList.remove('marker-focused'));

        const { onEditArtist, onDeleteArtist, starredGigIds, onToggleGigStar } = popupOptionsRef.current;
        const getGigMarkerArtist = (gig: Gig) => (
            Array.from(artistsByIdRef.current.values()).find((artist) => (
                (artist as Partial<GigMarkerArtist>).gig?.id === gig.id
            ))
        );
        const handleEditGig = onEditArtist
            ? (gig: Gig) => {
                const artist = getGigMarkerArtist(gig);
                if (artist) onEditArtist(artist);
            }
            : undefined;
        const handleDeleteGig = onDeleteArtist
            ? (gig: Gig) => {
                const artist = getGigMarkerArtist(gig);
                if (artist) onDeleteArtist(artist);
            }
            : undefined;

        const popupContainer = document.createElement('div');
        const root = createRoot(popupContainer);
        const venueColor = venueCluster.gigs[0]
            ? getGigProvinceColor(venueCluster.gigs[0], gigProvinceColors)
            : undefined;
        root.render(
            <VenueClusterGigList
                venueName={venueCluster.name}
                gigs={venueCluster.gigs}
                venueColor={venueColor}
                onEditGig={handleEditGig}
                onDeleteGig={handleDeleteGig}
                starredGigIds={starredGigIds}
                onToggleGigStar={onToggleGigStar}
            />
        );

        const popup = new maplibregl.Popup({
            closeButton: false,
            // MapView owns outside-click behavior for active map popups
            closeOnClick: false,
            className: 'artist-popup',
            maxWidth: '320px',
            offset: markerPopupOffset,
        })
            .setDOMContent(popupContainer)
            .setLngLat(center)
            .addTo(map);

        activePopupRef.current = popup;
        sourceElement.classList.add('marker-focused');

        popup.on('close', () => {
            // Venue cluster popup has no marker entry to own React cleanup
            sourceElement.classList.remove('marker-focused');
            root.unmount();
            if (activePopupRef.current === popup) {
                activePopupRef.current = null;
            }
            setArtistPopupLifecycle(false);
        });
    }, [gigProvinceColors, mapRef, setArtistPopupLifecycle]);

    // Open a cluster into separate artist markers
    const expandCluster = useCallback((
        feature: ClusterPoint,
        sourceElement?: HTMLElement,
        preserveArtistLocations = false,
        showDebugRings = false
    ) => {
        const map = mapRef.current;
        if (!map) return;

        const clusterId = feature.properties.cluster_id;
        const clusterKey = `expanded-${clusterId}`;

        if (expandedRef.current.has(clusterKey)) {
            collapseExpandedClusters();
            return;
        }

        const leaves = clusterLeavesRef.current.get(clusterId) ?? [];
        if (leaves.length === 0) return;
        const clusterDebugColor = getClusterDebugColor(feature, leaves, map);
        const artistClusterColors = new Map(leaves.map((leaf) => [leaf.properties.artistId, clusterDebugColor]));
        artistClusterColors.forEach((color, artistId) => clusterDebugColorsRef.current.set(artistId, color));
        const expandedLeafKey = getClusterLeafKey(leaves);
        const clusterMarkerKey = `cluster-${clusterId}`;
        // Ignore clicks while zoom or merge work is still changing markers
        if (map.isZooming() || clusterTransitionUntilRef.current > performance.now()) {
            return;
        }

        // Manual expansion cancels delayed merge work
        mergeHoldUntilRef.current = 0;
        mergeHoldTokenRef.current += 1;
        mergeHoldTargetKeysRef.current.clear();
        clearPendingMergeTimers();
        clusterTransitionUntilRef.current = 0;

        if (sourceElement) {
            setClusterElementExpandedHidden(sourceElement, true);
        }
        // Hide rendered clusters that represent the same leaves
        markersRef.current.forEach((entry, key) => {
            if (entry.kind !== 'cluster') return;
            if (key !== clusterMarkerKey && entry.leafKey !== expandedLeafKey) return;
            setClusterElementExpandedHidden(entry.marker.getElement(), true);
        });

        const [clusterLng, clusterLat] = feature.geometry.coordinates;
        const clusterCenter: [number, number] = [clusterLng, clusterLat];
        const clusterPixel = map.project([clusterLng, clusterLat]);
        const debugVisualMarkers = showDebugRings
            ? createClusterDebugRingElements(
                feature,
                leaves,
                map,
                undefined,
                CLUSTER_CONFIG.maxClusterRadius
            ).map(({ element, center }) => {
                // Debug centers stay above cluster outlines
                element.style.zIndex = element.classList.contains('artist-maplibre-cluster-debug-center')
                    ? String(debugClusterCenterZIndex)
                    : String(debugClusterRingZIndex);

                return new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(center).addTo(map);
            })
            : [];
        const artistDebugCenterMarkers = showDebugRings
            ? leaves.map((leaf) => {
                // Artist location centers share the top debug layer
                const element = createArtistDebugCenterElement(clusterDebugColor);
                element.style.zIndex = String(debugClusterCenterZIndex);

                return new maplibregl.Marker({ element, anchor: 'center' })
                    .setLngLat(leaf.geometry.coordinates as [number, number])
                    .addTo(map);
            })
            : [];
        const debugRingMarkers = [...debugVisualMarkers, ...artistDebugCenterMarkers];
        const markerObstacleRadius = CLUSTER_CONFIG.outerCollisionDistance / 2;
        const obstacleEntries: ScreenObstacle[] = [];

        // Outside visible markers and cluster circles block expanded positions
        markersRef.current.forEach((entry, key) => {
            if (entry.kind === 'cluster' && (key === clusterMarkerKey || entry.leafKey === expandedLeafKey)) return;
            if (entry.marker.getElement().style.visibility === 'hidden') return;

            const [lng, lat] = getMarkerCoordinates(entry.marker);
            const pixel = map.project([lng, lat]);
            const clusterIdMatch = key.match(/^cluster-(\d+)$/);
            const radius = entry.kind === 'cluster' && clusterIdMatch
                ? visibleClusterRadiiRef.current.get(Number(clusterIdMatch[1])) ?? markerObstacleRadius
                : markerObstacleRadius;

            obstacleEntries.push({
                center: { x: pixel.x - clusterPixel.x, y: pixel.y - clusterPixel.y },
                radius,
            });
        });
        expandedRef.current.forEach((state) => {
            state.markerTargets.forEach((target) => {
                const pixel = map.project(target);

                // Existing expanded markers block new expanded marker targets
                obstacleEntries.push({
                    center: { x: pixel.x - clusterPixel.x, y: pixel.y - clusterPixel.y },
                    radius: markerObstacleRadius,
                });
            });
        });
        type ExpandedDisplayItem = {
            kind: 'artist';
            leaves: ArtistPoint[];
            artists: Artist[];
            artist: Artist;
        } | {
            kind: 'venue';
            leaves: ArtistPoint[];
            artists: Artist[];
            venueCluster: NonNullable<ReturnType<typeof getSameVenueGigCluster>>;
        };

        const venueGroups = new Map<string, {
            venue: NonNullable<ReturnType<typeof getGigVenueClusterKey>>;
            leaves: ArtistPoint[];
            gigs: Gig[];
        }>();
        leaves.forEach((leaf) => {
            const artist = artistsByIdRef.current.get(leaf.properties.artistId);
            if (!artist) return;
            const venue = getGigVenueClusterKey(artist);
            const gig = (artist as Partial<GigMarkerArtist>).gig;
            if (!venue || !gig) return;

            const group = venueGroups.get(venue.key) ?? { venue, leaves: [], gigs: [] };
            group.leaves.push(leaf);
            group.gigs.push(gig);
            venueGroups.set(venue.key, group);
        });

        const emittedVenueGroups = new Set<string>();
        const expandedItems: ExpandedDisplayItem[] = leaves.flatMap<ExpandedDisplayItem>((leaf) => {
            const artist = artistsByIdRef.current.get(leaf.properties.artistId);
            if (!artist) return [];

            const venue = getGigVenueClusterKey(artist);
            const venueGroup = venue ? venueGroups.get(venue.key) : undefined;
            if (venue && venueGroup && venueGroup.leaves.length > 1) {
                if (emittedVenueGroups.has(venue.key)) return [];
                emittedVenueGroups.add(venue.key);

                return [{
                    kind: 'venue' as const,
                    leaves: venueGroup.leaves,
                    artists: venueGroup.leaves
                        .map((groupLeaf) => artistsByIdRef.current.get(groupLeaf.properties.artistId))
                        .filter((groupArtist): groupArtist is Artist => !!groupArtist),
                    venueCluster: {
                        ...venueGroup.venue,
                        gigs: venueGroup.gigs,
                    },
                }];
            }

            return [{
                kind: 'artist' as const,
                leaves: [leaf],
                artists: [artist],
                artist,
            }];
        });
        const getExpandedItemOrigin = (item: ExpandedDisplayItem): [number, number] => {
            if (item.kind === 'artist') {
                return item.leaves[0].geometry.coordinates as [number, number];
            }

            // Grouped venues share the same measured center as their rendered marker
            return getClusterVisualMetrics(feature, item.leaves, map).center;
        };

        // Space expanded display items in screen pixels
        const rawOffsets = expandedItems.map((item) => {
            const [lng, lat] = getExpandedItemOrigin(item);
            const pixel = map.project([lng, lat]);
            return { x: pixel.x - clusterPixel.x, y: pixel.y - clusterPixel.y };
        });

        const positions = preserveArtistLocations
            ? rawOffsets.map((offset) => ({ ...offset }))
            : resolveMarkerCollisions(
                rawOffsets,
                CLUSTER_CONFIG.gridSpacing,
                CLUSTER_CONFIG.outerCollisionDistance,
                obstacleEntries
            );
        console.info('[Achizu map] expanded cluster layout', {
            clusterId,
            leafCount: leaves.length,
            obstacleCount: obstacleEntries.length,
            expandedClusterCount: expandedRef.current.size,
            preserveArtistLocations,
        });
        console.table(expandedItems.map((item, index) => {
            const origin = getExpandedItemOrigin(item);
            const targetPixel = { x: clusterPixel.x + positions[index].x, y: clusterPixel.y + positions[index].y };
            const target = map.unproject([targetPixel.x, targetPixel.y]);

            return {
                index,
                kind: item.kind,
                label: item.kind === 'venue' ? item.venueCluster.name : item.artist.name,
                leafCount: item.leaves.length,
                originLng: origin[0],
                originLat: origin[1],
                rawOffsetX: rawOffsets[index].x,
                rawOffsetY: rawOffsets[index].y,
                resolvedOffsetX: positions[index].x,
                resolvedOffsetY: positions[index].y,
                targetLng: target.lng,
                targetLat: target.lat,
            };
        }));

        // Expanded marker and connector collections
        const lines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
        const collapsedLines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
        const expandedMarkers: maplibregl.Marker[] = [];
        const markerTargets: [number, number][] = [];
        const renderExpandedArtistMarkers = !showDebugRings;

        // Build markers and connector lines in display-item order
        expandedItems.forEach((item, index) => {
            const position = positions[index];
            const itemOriginLngLat = getExpandedItemOrigin(item);
            const expandedLngLat = preserveArtistLocations
                ? { lng: itemOriginLngLat[0], lat: itemOriginLngLat[1] }
                : map.unproject([clusterPixel.x + position.x, clusterPixel.y + position.y]);
            const markerTarget: [number, number] = [expandedLngLat.lng, expandedLngLat.lat];

            if (renderExpandedArtistMarkers && item.kind === 'artist') {
                const artist = item.artist;
                // Interactive artist markers stay out of raw debug overlays
                const element = createArtistMarkerElement(
                    artist,
                    artistNameDisplayMode,
                    clusterColorDebugEnabled ? clusterDebugColor : undefined
                );
                syncArtistMarkerHighlight(element, artist.id, highlightedArtistIds);
                const marker = new maplibregl.Marker({
                    element,
                    anchor: 'center',
                    subpixelPositioning: true,
                })
                    .setLngLat(clusterCenter)
                    .addTo(map);

                marker.getElement().classList.add('expanded-cluster-marker');
                animateMarkerTo(marker, markerTarget);
                marker.getElement().addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openArtistPopup(artist, marker);
                });
                expandedMarkers.push(marker);
            } else if (renderExpandedArtistMarkers && item.kind === 'venue') {
                const venueColor = item.venueCluster.gigs[0]
                    ? getGigProvinceColor(item.venueCluster.gigs[0], gigProvinceColors)
                    : undefined;
                const element = createExpandedVenueClusterMarkerElement(
                    item.leaves.length,
                    item.venueCluster.name,
                    venueColor
                );
                const marker = new maplibregl.Marker({
                    element,
                    anchor: 'center',
                    subpixelPositioning: true,
                })
                    .setLngLat(clusterCenter)
                    .addTo(map);

                preloadArtistMarkerImages(item.artists);
                marker.getElement().classList.add('expanded-cluster-marker');
                animateMarkerTo(marker, markerTarget, () => {
                    const actual = getMarkerCoordinates(marker);
                    const targetPixel = map.project(markerTarget);
                    const actualPixel = map.project(actual);
                    const canvasRect = map.getCanvas().getBoundingClientRect();
                    const containerRect = map.getContainer().getBoundingClientRect();
                    const markerParentRect = marker.getElement().parentElement?.getBoundingClientRect();
                    const markerRect = marker.getElement().getBoundingClientRect();
                    const circleRect = marker.getElement().querySelector('[data-expanded-venue-circle="true"]')?.getBoundingClientRect();
                    const circleCenterInCanvas = circleRect ? {
                        x: circleRect.left + circleRect.width / 2 - canvasRect.left,
                        y: circleRect.top + circleRect.height / 2 - canvasRect.top,
                    } : null;
                    const circleCenterInContainer = circleRect ? {
                        x: circleRect.left + circleRect.width / 2 - containerRect.left,
                        y: circleRect.top + circleRect.height / 2 - containerRect.top,
                    } : null;

                    // Settled geometry verifies marker anchor against connector target
                    console.info('[Achizu map] expanded venue marker settled', {
                        clusterId,
                        venueName: item.venueCluster.name,
                        markerTarget,
                        actual,
                        screenDelta: {
                            x: actualPixel.x - targetPixel.x,
                            y: actualPixel.y - targetPixel.y,
                        },
                        circleToTargetDelta: circleCenterInContainer ? {
                            x: circleCenterInContainer.x - targetPixel.x,
                            y: circleCenterInContainer.y - targetPixel.y,
                        } : null,
                        canvasCircleToTargetDelta: circleCenterInCanvas ? {
                            x: circleCenterInCanvas.x - targetPixel.x,
                            y: circleCenterInCanvas.y - targetPixel.y,
                        } : null,
                        connectorEndpoints: item.leaves.map((leaf) => {
                            const endpoint = leaf.geometry.coordinates as [number, number];
                            const endpointPixel = map.project(endpoint);

                            return {
                                artistId: leaf.properties.artistId,
                                lng: endpoint[0],
                                lat: endpoint[1],
                                screenX: endpointPixel.x,
                                screenY: endpointPixel.y,
                            };
                        }),
                        markerRect: {
                            left: markerRect.left,
                            top: markerRect.top,
                            width: markerRect.width,
                            height: markerRect.height,
                        },
                        elementMetrics: {
                            offsetWidth: marker.getElement().offsetWidth,
                            offsetHeight: marker.getElement().offsetHeight,
                            clientWidth: marker.getElement().clientWidth,
                            clientHeight: marker.getElement().clientHeight,
                        },
                        containerRect: {
                            left: containerRect.left,
                            top: containerRect.top,
                            width: containerRect.width,
                            height: containerRect.height,
                        },
                        canvasRect: {
                            left: canvasRect.left,
                            top: canvasRect.top,
                            width: canvasRect.width,
                            height: canvasRect.height,
                        },
                        markerParentRect: markerParentRect ? {
                            left: markerParentRect.left,
                            top: markerParentRect.top,
                            width: markerParentRect.width,
                            height: markerParentRect.height,
                        } : null,
                        circleRect: circleRect ? {
                            left: circleRect.left,
                            top: circleRect.top,
                            width: circleRect.width,
                            height: circleRect.height,
                        } : null,
                    });
                });
                marker.getElement().addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openVenueClusterPopup(item.venueCluster, getMarkerCoordinates(marker), marker.getElement());
                });
                expandedMarkers.push(marker);
            }

            item.leaves.forEach((leaf) => {
                const originalLngLat = leaf.geometry.coordinates as [number, number];

                // Expanded line connects the display marker to the real location
                lines.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: preserveArtistLocations
                            ? [originalLngLat, originalLngLat]
                            : [[expandedLngLat.lng, expandedLngLat.lat], originalLngLat],
                    },
                    properties: {},
                });
                // Collapsed line starts from the cluster center
                collapsedLines.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [clusterCenter, originalLngLat],
                    },
                    properties: {},
                });
            });
            markerTargets.push(markerTarget);
        });

        const sourceId = `expanded-cluster-lines-${clusterId}`;
        const layerId = `expanded-cluster-lines-${clusterId}`;
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        // Draw connector lines from the collapsed state first
        map.addSource(sourceId, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: collapsedLines,
            },
        });
        map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': '#666',
                'line-width': 1.5,
                'line-opacity': 0.7,
                'line-dasharray': [2, 2],
            },
        });
        const collapsedLineCollection: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
            type: 'FeatureCollection',
            features: collapsedLines,
        };
        const expandedLineCollection: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
            type: 'FeatureCollection',
            features: lines,
        };
        animateLineSource(sourceId, collapsedLineCollection, expandedLineCollection);

        expandedRef.current.set(clusterKey, {
            markers: expandedMarkers,
            sourceId,
            layerId,
            hiddenClusterKey: clusterMarkerKey,
            hiddenClusterLeafKey: expandedLeafKey,
            clusterCenter,
            debugRingMarkers,
            artistClusterColors,
            markerTargets,
        });
        setHasExpandedClusters(true);
    }, [animateLineSource, animateMarkerTo, artistNameDisplayMode, clearPendingMergeTimers, clusterColorDebugEnabled, collapseExpandedClusters, gigProvinceColors, highlightedArtistIds, mapRef, openArtistPopup]);

    const bindClusterMarkerClick = useCallback((
        element: HTMLElement,
        feature: ClusterPoint,
        leaves: ArtistPoint[],
        center: [number, number]
    ) => {
        element.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (element.style.pointerEvents === 'none') return;

            const sameVenue = getSameVenueGigCluster(leaves, artistsByIdRef.current);
            if (sameVenue) {
                openVenueClusterPopup(sameVenue, center, element);
                return;
            }

            expandCluster(feature, element);
        };
    }, [expandCluster, openVenueClusterPopup]);

    const refreshArtistMarkerElement = useCallback((
        entry: MarkerEntry,
        artistId: string,
        nextRenderKey: string,
        fallbackDebugColor?: string
    ): string => {
        const artist = artistsByIdRef.current.get(artistId);
        if (!artist) return entry.markerRenderKey ?? nextRenderKey;

        if (entry.markerRenderKey === nextRenderKey) {
            return nextRenderKey;
        }

        const debugColor = clusterColorDebugEnabled
            ? clusterDebugColorsRef.current.get(artistId) ?? fallbackDebugColor
            : undefined;
        replaceMarkerElementContents(
            entry.marker.getElement(),
            createArtistMarkerElement(artist, artistNameDisplayMode, debugColor)
        );

        return nextRenderKey;
    }, [artistNameDisplayMode, clusterColorDebugEnabled]);

    // Sync visible geometric cluster features with DOM markers
    const renderVisibleMarkers = useCallback(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;

        // Build visible clusters from the current projected geometry
        const bounds = map.getBounds();
        const mapZoom = map.getZoom();
        const zoom = getClusterZoom(mapZoom);
        const clusterDisabled = mapZoom >= CLUSTER_CONFIG.disableClusteringAtZoomLevel + 0.5;
        const { features: clusters, leavesByClusterId } = buildGeometricClusters(
            displayArtists,
            view,
            map,
            mapZoom,
            keepCollisionClustersAtMaxZoom
        );
        clusterLeavesRef.current = leavesByClusterId;

        // Counts and zooms from the previous render
        const nextMarkerKeys = new Set<string>();
        const previousMarkerCount = markersRef.current.size;
        const nextMarkerCount = clusters.length;
        const previousClusterZoom = lastClusterZoomRef.current;
        const previousMapZoom = lastMapZoomRef.current;

        // Compare cluster zoom and MapLibre zoom separately
        const isZoomSplit = previousClusterZoom !== null && zoom > previousClusterZoom;
        const isZoomMerge = previousClusterZoom !== null && zoom < previousClusterZoom;
        const isMapZoomIn = previousMapZoom !== null && mapZoom > previousMapZoom + 0.01;
        const isMapZoomChange = previousMapZoom !== null && Math.abs(mapZoom - previousMapZoom) > 0.01;
        lastClusterZoomRef.current = zoom;
        lastMapZoomRef.current = mapZoom;

        // Transition timing for split and merge animations
        const now = performance.now();
        const hasActiveMergeHold = mergeHoldUntilRef.current > now;

        // Only zoom changes link old marker positions to new ones
        const isMergeStart = isZoomMerge || (isMapZoomChange && nextMarkerCount < previousMarkerCount);
        const isSplit = !hasActiveMergeHold && (isMapZoomIn || isZoomSplit || (isMapZoomChange && nextMarkerCount > previousMarkerCount));
        const isMerge = hasActiveMergeHold || isMergeStart;
        const shouldLinkMarkerMotion = isSplit || isMerge;
        if (shouldLinkMarkerMotion) {
            clusterTransitionUntilRef.current = Math.max(clusterTransitionUntilRef.current, now + markerMoveDuration);
        } else if (clusterTransitionUntilRef.current < now) {
            clusterTransitionUntilRef.current = 0;
        }

        if (isSplit) {
            mergeHoldUntilRef.current = 0;
            mergeHoldTokenRef.current += 1;
            mergeHoldTargetKeysRef.current.clear();
        } else if (isMergeStart) {
            // Wait before showing clusters created by a merge
            mergeHoldUntilRef.current = Math.max(mergeHoldUntilRef.current, now + mergedClusterAppearDelay);
            mergeHoldTokenRef.current += 1;
        }

        const shouldDelayMergedClusters = mergeHoldUntilRef.current > now;
        if (!shouldDelayMergedClusters) {
            mergeHoldTargetKeysRef.current.clear();
        }

        // Clusters waiting for merge animation to finish
        const pendingMergeAdds: Array<{
            key: string;
            element: HTMLElement;
            center: [number, number];
            feature: ClusterPoint;
            leafKey: string;
            leaves: ArtistPoint[];
            token: number;
        }> = [];
        let pendingMergeRemovalCount = 0;
        let pendingMergeFinalized = false;
        let pendingMergeTimer: number | null = null;
        const addPendingMergedClusters = () => {
            // Outgoing markers must finish moving first
            if (pendingMergeFinalized || pendingMergeRemovalCount > 0) return;

            // Merge hold keeps the new cluster hidden briefly
            const remainingHold = mergeHoldUntilRef.current - performance.now();
            if (remainingHold > 0) {
                if (pendingMergeTimer === null) {
                    pendingMergeTimer = window.setTimeout(() => {
                        pendingMergeTimersRef.current.delete(pendingMergeTimer!);
                        pendingMergeTimer = null;
                        addPendingMergedClusters();
                    }, remainingHold);
                    pendingMergeTimersRef.current.add(pendingMergeTimer);
                }
                return;
            }

            // Ignore inserts from older merge cycles
            pendingMergeFinalized = true;
            pendingMergeAdds.forEach(({ key, element, center, feature, leafKey, leaves, token }) => {
                if (mergeHoldTokenRef.current !== token || markersRef.current.has(key)) {
                    return;
                }
                bindClusterMarkerClick(element, feature, leaves, center);
                const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(center).addTo(map);
                setClusterElementExpandedHidden(element, isClusterSourceHidden(key, leafKey));
                markersRef.current.set(key, { marker, kind: 'cluster', leafKey });
                mergeHoldTargetKeysRef.current.delete(key);
            });
        };
        // Count removals that a delayed cluster is waiting on
        const trackMergeRemoval = (remove: (onDone: () => void) => void) => {
            pendingMergeRemovalCount += 1;
            remove(() => {
                pendingMergeRemovalCount -= 1;
                addPendingMergedClusters();
            });
        };
        const isInsideCurrentBounds = (position: [number, number]) => bounds.contains(position);

        // Coordinates used to choose animation start and end points
        const previousPositions = Array.from(markersRef.current.values())
            .map((entry) => getMarkerCoordinates(entry.marker))
            .filter(isInsideCurrentBounds);
        const nextPositions = new Map<string, [number, number]>();

        // Split renders artists directly, so old cluster markers are removed
        if (isSplit) {
            markersRef.current.forEach((entry, key) => {
                if (entry.kind !== 'cluster') return;
                removeMarkerEntry(entry);
                markersRef.current.delete(key);
            });
        }

        const visibleClusters = clusters.filter((feature): feature is ClusterPoint => !!feature.properties.cluster);
        const useStableArtistStackOrder = clusterDisabled || visibleClusters.length === 0;
        const clusterColorRecords = assignClusterColors(visibleClusters, leavesByClusterId);
        const clusterVisuals = new Map<number, ReturnType<typeof getClusterVisualMetrics>>();
        const nextClusterDebugColors = new Map<string, string>();

        // Measure cluster sizes from real clustered artist centers
        visibleClusters.forEach((cluster) => {
            const clusterId = cluster.properties.cluster_id;
            const leaves = leavesByClusterId.get(clusterId) ?? [];
            const visual = getClusterVisualMetrics(cluster, leaves, map);
            const leafKey = getClusterLeafKey(leaves);
            const debugColor = clusterColorRecords.get(leafKey)?.color ?? getClusterDebugColor(cluster, leaves, map);
            clusterVisuals.set(clusterId, visual);
            leaves.forEach((leaf) => {
                nextClusterDebugColors.set(leaf.properties.artistId, debugColor);
            });
        });

        const clusterRadii = new Map(
            Array.from(clusterVisuals.entries()).map(([clusterId, visual]) => [clusterId, visual.radius])
        );
        visibleClustersRef.current = visibleClusters;
        visibleClusterRadiiRef.current = new Map(clusterRadii);
        clusterDebugColorsRef.current = nextClusterDebugColors;
        // Store next marker positions before removing stale markers
        clusters.forEach((feature) => {
            const [lng, lat] = feature.geometry.coordinates as [number, number];
            const key = isClusterFeature(feature)
                ? `cluster-${feature.properties.cluster_id}`
                : `artist-${feature.properties.artistId}`;
            const position: [number, number] = isClusterFeature(feature)
                ? clusterVisuals.get(feature.properties.cluster_id)?.center ?? [lng, lat]
                : [lng, lat];
            nextPositions.set(key, position);
        });

        const mergeTargetKeys = new Set<string>();
        const staleMarkerDestinations = new Map<string, [number, number]>();
        if (shouldDelayMergedClusters) {
            // Send outgoing markers toward the nearest incoming cluster
            markersRef.current.forEach((entry, key) => {
                if (nextPositions.has(key)) return;
                const currentPosition = getMarkerCoordinates(entry.marker);
                if (!isInsideCurrentBounds(currentPosition)) return;

                let nearestKey: string | null = null;
                let nearestPosition: [number, number] | null = null;
                let nearestDistance = Infinity;
                const currentPixel = map.project(currentPosition);

                nextPositions.forEach((position, nextKey) => {
                    if (!nextKey.startsWith('cluster-')) return;
                    const pixel = map.project(position);
                    const distance = (pixel.x - currentPixel.x) ** 2 + (pixel.y - currentPixel.y) ** 2;
                    if (distance < nearestDistance) {
                        nearestKey = nextKey;
                        nearestPosition = position;
                        nearestDistance = distance;
                    }
                });

                if (!nearestKey || !nearestPosition || nearestDistance > markerMoveLinkMaxDistance ** 2) return;
                mergeTargetKeys.add(nearestKey);
                mergeHoldTargetKeysRef.current.add(nearestKey);
                staleMarkerDestinations.set(key, nearestPosition);
            });
        }

        clusters.forEach((feature) => {
            const [lng, lat] = feature.geometry.coordinates;

            if (isClusterFeature(feature)) {
                // Load images for artists inside this cluster
                const leaves = leavesByClusterId.get(feature.properties.cluster_id) ?? [];
                const sameVenue = getSameVenueGigCluster(leaves, artistsByIdRef.current);
                const leafKey = getClusterLeafKey(leaves);
                const clusterColor = clusterColorRecords.get(leafKey)?.color;
                const venueColor = sameVenue?.gigs[0]
                    ? getGigProvinceColor(sameVenue.gigs[0], gigProvinceColors)
                    : undefined;
                const { element, center } = createClusterMarkerElement(
                    feature,
                    leaves,
                    map,
                    clusterColorDebugEnabled,
                    sameVenue ? { style: 'venue', venueName: sameVenue.name, color: venueColor } : { color: clusterColor }
                );
                const clusterArtists = leaves
                    .map((leaf) => artistsByIdRef.current.get(leaf.properties.artistId))
                    .filter((artist): artist is Artist => !!artist);
                preloadArtistMarkerImages(clusterArtists);
                const key = `cluster-${feature.properties.cluster_id}`;
                const existingEntry = markersRef.current.get(key);
                const canReuseClusterEntry = existingEntry?.kind === 'cluster' && existingEntry.leafKey === leafKey;
                const isExpandedSourceCluster = isClusterSourceHidden(key, leafKey);

                if (shouldDelayMergedClusters && (mergeTargetKeys.has(key) || mergeHoldTargetKeysRef.current.has(key))) {
                    // Add merged clusters after outgoing markers arrive
                    if (existingEntry) {
                        trackMergeRemoval((onDone) => removeMarkerEntry(existingEntry, center, onDone));
                        markersRef.current.delete(key);
                    }
                    pendingMergeAdds.push({
                        key,
                        element,
                        center,
                        feature,
                        leafKey,
                        leaves,
                        token: mergeHoldTokenRef.current,
                    });
                    nextMarkerKeys.add(key);
                    return;
                }

                if (canReuseClusterEntry) {
                    // Keep the marker instance when leaf membership is unchanged
                    const existingElement = existingEntry.marker.getElement();
                    replaceMarkerElementContents(existingElement, element);
                    setClusterElementExpandedHidden(existingElement, isExpandedSourceCluster);
                    bindClusterMarkerClick(existingElement, feature, leaves, center);
                    animateMarkerTo(existingEntry.marker, center);
                    nextMarkerKeys.add(key);
                    return;
                } else if (existingEntry?.kind === 'cluster') {
                    // Same cluster id can refer to different leaves after zoom changes
                    removeMarkerEntry(existingEntry, isMerge ? center : undefined);
                    markersRef.current.delete(key);
                }

                bindClusterMarkerClick(element, feature, leaves, center);
                const start = shouldLinkMarkerMotion
                    ? findNearestPosition(center, previousPositions, markerMoveLinkMaxDistance) ?? center
                    : center;

                const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(start).addTo(map);
                setClusterElementExpandedHidden(element, isExpandedSourceCluster);
                if (shouldLinkMarkerMotion) {
                    animateMarkerTo(marker, center);
                }

                markersRef.current.set(key, { marker, kind: 'cluster', leafKey });
                nextMarkerKeys.add(key);
                return;
            }

            // Reuse artist markers so popup state can stay attached
            const artist = artistsByIdRef.current.get(feature.properties.artistId);
            if (!artist) return;
            const key = `artist-${artist.id}`;
            const existingEntry = markersRef.current.get(key);
            const target: [number, number] = [lng, lat];
            const debugColor = clusterColorDebugEnabled ? clusterDebugColorsRef.current.get(artist.id) : undefined;
            const highlighted = highlightedArtistIds?.has(artist.id) ?? false;
            const markerRenderKey = `${getArtistMarkerRenderKey(artist, artistNameDisplayMode)}|${debugColor ?? ''}|${highlighted ? 'highlighted' : ''}`;
            const marker = existingEntry?.kind === 'artist'
                ? existingEntry.marker
                : new maplibregl.Marker({
                    element: createArtistMarkerElement(artist, artistNameDisplayMode, debugColor),
                    anchor: 'center',
                    subpixelPositioning: true,
                }).setLngLat(
                    shouldLinkMarkerMotion
                        ? findNearestPosition(target, previousPositions, markerMoveLinkMaxDistance) ?? target
                        : target
                ).addTo(map);
            let nextMarkerRenderKey = markerRenderKey;

            if (existingEntry?.kind === 'artist') {
                nextMarkerRenderKey = refreshArtistMarkerElement(existingEntry, artist.id, markerRenderKey);
                animateMarkerTo(marker, target);
            } else if (shouldLinkMarkerMotion) {
                animateMarkerTo(marker, target);
            }
            syncArtistMarkerHighlight(marker.getElement(), artist.id, highlightedArtistIds);
            marker.getElement().onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (
                    marker.getElement().dataset.displayCoordinateDragging
                    || marker.getElement().dataset.suppressArtistClick
                ) return;
                openArtistPopup(artist, marker);
            };
            bindDisplayCoordinateEditing(marker, artist, clusterDisabled);
            syncArtistMarkerStackOrder(artist.id, marker.getElement(), useStableArtistStackOrder);

            markersRef.current.set(key, {
                marker,
                kind: 'artist',
                markerRenderKey: nextMarkerRenderKey,
                popup: existingEntry?.popup,
                root: existingEntry?.root,
            });
            nextMarkerKeys.add(key);
        });

        // Remove markers missing from the current cluster result
        markersRef.current.forEach((entry, key) => {
            if (nextMarkerKeys.has(key)) return;
            const currentPosition = getMarkerCoordinates(entry.marker);
            const destination = shouldLinkMarkerMotion || shouldDelayMergedClusters
                ? staleMarkerDestinations.get(key) ?? (isInsideCurrentBounds(currentPosition)
                    ? findNearestPosition(
                        currentPosition,
                        Array.from(nextPositions.values()),
                        markerMoveLinkMaxDistance
                    )
                    : null)
                : null;
            const removalDestination = isSplit && entry.kind === 'cluster' ? undefined : destination ?? undefined;
            if (shouldDelayMergedClusters && removalDestination) {
                trackMergeRemoval((onDone) => removeMarkerEntry(entry, removalDestination, onDone));
            } else {
                removeMarkerEntry(entry, removalDestination);
            }
            markersRef.current.delete(key);
        });
        addPendingMergedClusters();
    }, [animateMarkerTo, artistNameDisplayMode, bindClusterMarkerClick, bindDisplayCoordinateEditing, clusterColorDebugEnabled, displayArtists, findNearestPosition, gigProvinceColors, highlightedArtistIds, isClusterSourceHidden, keepCollisionClustersAtMaxZoom, mapReady, mapRef, openArtistPopup, refreshArtistMarkerElement, removeMarkerEntry, syncArtistMarkerStackOrder, view]);

    useEffect(() => {
        // Compare only fields used by geometric clustering
        const nextSignature = getArtistIndexSignature(displayArtists, view);
        if (clusterIndexSignatureRef.current === nextSignature) {
            // Same index inputs keep expanded clusters intact
            renderVisibleMarkers();
            return;
        }

        // New cluster inputs need a fresh visible render
        clusterIndexSignatureRef.current = nextSignature;

        lastClusterZoomRef.current = null;
        lastMapZoomRef.current = null;
        mergeHoldUntilRef.current = 0;
        mergeHoldTokenRef.current += 1;
        mergeHoldTargetKeysRef.current.clear();
        clearPendingMergeTimers();
        // Popup close can happen just before this rebuild
        if (!shouldKeepExpandedClusters()) {
            removeExpandedClusterArtifacts();
            window.setTimeout(() => setHasExpandedClusters(false), 0);
        }

        renderVisibleMarkers();
    }, [clearPendingMergeTimers, displayArtists, removeExpandedClusterArtifacts, renderVisibleMarkers, shouldKeepExpandedClusters, view]);

    // Toolbar action for visible clusters
    const expandAllVisibleClusters = useCallback(() => {
        visibleClustersRef.current.forEach((cluster) => expandCluster(cluster));
    }, [expandCluster]);

    // Repaint expanded markers when marker chrome changes
    useEffect(() => {
        renderVisibleMarkers();
        expandedRef.current.forEach((state) => {
            state.markers.forEach((marker) => {
                const artistId = marker.getElement().dataset.artistId;
                if (!artistId) return;
                const artist = artistsByIdRef.current.get(artistId);
                if (!artist) return;
                replaceMarkerElementContents(
                    marker.getElement(),
                    createArtistMarkerElement(
                        artist,
                        artistNameDisplayMode,
                        clusterColorDebugEnabled ? state.artistClusterColors.get(artistId) : undefined
                    )
                );
                syncArtistMarkerHighlight(marker.getElement(), artistId, highlightedArtistIds);
            });
        });
    }, [artistNameDisplayMode, clusterColorDebugEnabled, highlightedArtistIds, renderVisibleMarkers]);

    // Debug action for validating true clustered artist coordinates
    const expandAllVisibleClustersAtLocations = useCallback(() => {
        visibleClustersRef.current.forEach((cluster) => expandCluster(cluster, undefined, true, true));
    }, [expandCluster]);

    return {
        clearMarkers,
        closeActiveArtistPopup,
        collapseExpandedClusters,
        expandAllVisibleClusters,
        expandAllVisibleClustersAtLocations,
        expandedRef,
        hasExpandedClusters,
        markersRef,
        openArtistPopup,
        renderVisibleMarkers,
    };
};
