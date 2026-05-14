import { useState, type CSSProperties } from 'react';
import { Alert, Button, CloseButton, IconButton, Input, Spinner } from '../ui';
import ArtistCard from '../ArtistCard';
import AddArtistButton from '../Map/buttons/AddArtistButton';
import ViewArtistListButton from '../Map/buttons/ViewArtistListButton';
import { MapErrorOverlay } from '../Map/MapErrorOverlay';
import { SelectionPrompt } from '../Map/SelectionPrompt';
import { ArrowDownIcon, ChevronDownIcon, CloseIcon, CopyIcon, EditIcon, SearchIcon, TrashIcon, UserIcon } from '../icons/GeneralIcons';
import { LocationIcon, MapPinIcon, NorthIcon } from '../icons/MapIcons';
import type { Artist, LocationView } from '../../types/artist';
import type { MapTileTheme } from '../Map/config/mapStyles';

// Achizu map and frontend interaction inventory

const darkVars = {
    '--color-background': '#1C1C1E',
    '--color-surface': '#1C1C1E',
    '--color-surface-secondary': '#2C2C2E',
    '--color-surface-muted': '#313134',
    '--color-text': '#F2F2F7',
    '--color-text-secondary': '#C7C7CC',
    '--color-text-muted': '#8E8E93',
    '--color-border': '#38383A',
    '--color-border-strong': '#48484A',
    '--color-error': '#E35A66',
} as CSSProperties;

const sampleArtist: Artist = {
    id: 'template-artist',
    name: 'kanekoayano',
    romanizedName: 'Kaneko Ayano',
    originalLocation: {
        city: 'Yokohama',
        province: 'Kanagawa',
        country: 'Japan',
        coordinates: { lat: 35.4437, lng: 139.638 },
        displayName: 'Yokohama, Kanagawa, Japan',
        type: 'city',
    },
    activeLocation: {
        city: 'Tokyo',
        province: 'Tokyo',
        country: 'Japan',
        coordinates: { lat: 35.6762, lng: 139.6503 },
        displayName: 'Tokyo, Japan',
        type: 'city',
    },
    originalLocationDisplayCoordinates: { lat: 35.4437, lng: 139.638 },
    activeLocationDisplayCoordinates: { lat: 35.6762, lng: 139.6503 },
    socialLinks: {
        website: 'https://example.com',
        youtube: 'https://youtube.com',
        instagram: 'https://instagram.com',
    },
    debutYear: 2016,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    originalCityId: 'yokohama',
    activeCityId: 'tokyo',
};

const panelClass = 'overflow-hidden rounded-lg border border-border bg-surface p-4';
const mapButtonClass = 'bg-surface w-10 h-10 flex items-center justify-center text-text-secondary hover:text-primary transition-colors';

export function DarkModeInteractionTemplate() {
    const [view, setView] = useState<LocationView>('original');
    const [tileTheme, setTileTheme] = useState<MapTileTheme>('dark');
    const [sortOpen, setSortOpen] = useState(true);
    const [showDialogPreview, setShowDialogPreview] = useState(false);
    const [templateToggle, setTemplateToggle] = useState(true);

    return (
        <div style={darkVars} className="space-y-4 rounded-xl border border-border bg-background p-4 text-text">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-semibold text-text">Achizu Dark Mode Source Template</h3>
                    <p className="mt-1 text-sm text-text-secondary">
                        Source-matched frontend elements. Cluster markers and cluster controls are intentionally omitted.
                    </p>
                </div>
                <span className="rounded-md border border-border bg-surface-secondary px-3 py-1 text-xs font-medium text-text-secondary">
                    Uses existing classes and icons
                </span>
            </div>

            <section className={panelClass}>
                <h4 className="text-sm font-semibold text-text">Map Overlay Buttons</h4>
                <p className="mt-1 text-xs text-text-secondary">Rendered with the same absolute wrappers, shadows, icons, hover, and active classes as the map.</p>
                <div className="relative mt-4 h-80 overflow-hidden rounded-lg border border-border bg-surface-secondary">
                    <AddArtistButton onClick={() => undefined} />
                    <ViewArtistListButton onClick={() => undefined} />
                    <SelectionPrompt onCancel={() => undefined} />

                    <div className="absolute bottom-2 right-2 z-[1000] flex items-end gap-2 font-sans">
                        <div className="relative flex flex-col items-end gap-2">
                            <div role="group" aria-label="Toggle location view" className="flex overflow-hidden rounded-md bg-surface shadow-md">
                                <button aria-pressed={view === 'original'} onClick={() => setView('original')} className={`w-16 py-2 text-sm font-medium transition-colors ${view === 'original' ? 'bg-primary-contrast text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary'}`}>
                                    Origin
                                </button>
                                <button aria-pressed={view === 'active'} onClick={() => setView('active')} className={`w-16 py-2 text-sm font-medium transition-colors ${view === 'active' ? 'bg-primary-contrast text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary'}`}>
                                    Active
                                </button>
                            </div>
                            <div role="group" aria-label="Toggle map theme" className="flex overflow-hidden rounded-md bg-surface shadow-md">
                                <button aria-pressed={tileTheme === 'light'} onClick={() => setTileTheme('light')} className={`w-16 py-2 text-sm font-medium transition-colors ${tileTheme === 'light' ? 'bg-primary-contrast text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary'}`}>
                                    Light
                                </button>
                                <button aria-pressed={tileTheme === 'dark'} onClick={() => setTileTheme('dark')} className={`w-16 py-2 text-sm font-medium transition-colors ${tileTheme === 'dark' ? 'bg-primary-contrast text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary'}`}>
                                    Dark
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <button aria-label="Reset map direction" className={`${mapButtonClass} rounded-md shadow-md disabled:cursor-default`} title="Reset map direction">
                                <NorthIcon />
                            </button>
                            <button aria-label="Locate me" className={`${mapButtonClass} rounded-md shadow-md`} title="Locate me">
                                <LocationIcon />
                            </button>
                            <div className="flex flex-col overflow-hidden rounded-md shadow-md">
                                <button aria-label="Zoom in" className={`${mapButtonClass} border-b border-border`} title="Zoom in">
                                    <span className="text-lg font-medium">+</span>
                                </button>
                                <button aria-label="Zoom out" className={mapButtonClass} title="Zoom out">
                                    <span className="text-lg font-medium">-</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-2">
                <section className={panelClass}>
                    <h4 className="text-sm font-semibold text-text">Shared UI Components</h4>
                    <div className="mt-4 grid gap-3">
                        <div className="flex flex-wrap gap-2">
                            <Button variant="primary">Primary variant</Button>
                            <Button variant="secondary">Secondary</Button>
                            <Button variant="ghost">Ghost</Button>
                            <Button variant="secondary" isLoading>Saving</Button>
                            <Button variant="secondary" disabled>Disabled</Button>
                        </div>
                        <Input label="Input default" placeholder="Artist name" helperText="Helper text uses text-text-secondary" />
                        <Input label="Input error" placeholder="Artist name" error="Validation error" />
                        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2">
                            <span className="text-sm font-medium text-text-secondary">Interactive toggle</span>
                            <button
                                aria-label="Toggle template setting"
                                type="button"
                                role="switch"
                                aria-checked={templateToggle}
                                onClick={() => setTemplateToggle((value) => !value)}
                                className="relative inline-flex h-6 w-9 shrink-0 cursor-pointer items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                            >
                                <span className={`pointer-events-none absolute left-1 top-1/2 h-3 w-7 -translate-y-1/2 rounded-full transition-colors duration-200 ${templateToggle ? 'bg-primary/35' : 'bg-border-strong'}`} />
                                <span className={`pointer-events-none relative h-5 w-5 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.35)] transition-colors transition-transform duration-200 ${templateToggle ? 'translate-x-4 bg-primary' : 'translate-x-0 bg-text-secondary'}`} />
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <IconButton aria-label="Search"><SearchIcon /></IconButton>
                            <IconButton aria-label="Edit"><EditIcon /></IconButton>
                            <IconButton aria-label="Delete"><TrashIcon /></IconButton>
                            <CloseButton />
                            <Spinner className="text-primary" />
                        </div>
                        <Alert variant="success" header="Saved">Artist changes are stored.</Alert>
                        <Alert variant="warning" header="Needs review">Location is country-level.</Alert>
                        <Alert variant="error" header="Upload failed">The image could not be processed.</Alert>
                    </div>
                </section>

                <section className={panelClass}>
                    <h4 className="text-sm font-semibold text-text">Main Search</h4>
                    <p className="mt-1 text-xs text-text-secondary">Mirrors MainSearch and SearchResultRow classes without calling the API hook.</p>
                    <div className="relative mt-4 w-full font-sans sm:w-80">
                        <div className="relative">
                            <input
                                role="combobox"
                                aria-expanded="true"
                                aria-controls="template-search-results"
                                aria-autocomplete="list"
                                aria-haspopup="listbox"
                                type="text"
                                value="kane"
                                readOnly
                                className="h-12 w-full min-w-0 rounded-lg border border-border bg-surface pl-3.5 pr-13 text-base shadow-md focus:border-primary focus:outline-none focus:ring-[1.5px] focus:ring-inset focus:ring-primary sm:pl-5"
                            />
                            <IconButton aria-label="Clear search" size="sm" className="absolute right-8 top-1/2 -translate-y-1/2 rounded hover:bg-surface-muted">
                                <CloseIcon className="h-4 w-4" />
                            </IconButton>
                            <button aria-label="Search" type="button" className="absolute right-0 top-0 flex h-12 w-9 items-center justify-center rounded-r-lg text-text-secondary transition-colors hover:bg-primary hover:text-white">
                                <SearchIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <div id="template-search-results" role="listbox" className="mt-1 max-h-96 overflow-hidden rounded-md border border-border bg-surface shadow-md">
                            <div role="group" className="bg-surface-muted px-4 py-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">Artists</div>
                            <button role="option" aria-selected="true" className="flex w-full cursor-pointer items-center gap-3 bg-surface-muted px-4 py-3 text-left transition-colors">
                                <div className="h-9 w-9 rounded-full border border-border bg-surface-secondary" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-text">kanekoayano</p>
                                    <p className="truncate text-xs text-text-secondary">Tokyo, Japan</p>
                                </div>
                            </button>
                            <button role="option" className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted">
                                <div className="flex h-10 w-8 items-center justify-center">
                                    <UserIcon className="h-5 w-5 text-text-secondary" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-text">gary</p>
                                    <span className="text-xs text-text-secondary">View map</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </section>

                <section className={`${panelClass} xl:col-span-2`}>
                    <h4 className="text-sm font-semibold text-text">Artist List and Card</h4>
                    <div className="mt-4 grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
                        <div className="w-full overflow-hidden rounded-lg bg-surface shadow-xl">
                            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                                <h2 className="text-lg font-semibold text-text">Artists (3)</h2>
                                <div className="flex items-center gap-2">
                                    <button type="button" className="rounded p-1.5 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-secondary">
                                        <CopyIcon className="h-5 w-5" />
                                    </button>
                                    <CloseButton size="md" />
                                </div>
                            </div>
                            <div className="px-4 py-2">
                                <Input aria-label="Search artists" placeholder="Search artists" rightIcon={<SearchIcon className="h-4 w-4" />} />
                                <div className="mt-2 flex min-w-0 items-center gap-2">
                                    <span className="shrink-0 text-sm font-medium text-text-secondary">Sort</span>
                                    <button type="button" onClick={() => setSortOpen((open) => !open)} className="relative w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-8 text-left text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary">
                                        <span className="block truncate">Date added</span>
                                        <ChevronDownIcon className={`absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary transition-transform ${sortOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    <button type="button" className="rounded p-2 text-text-muted transition-colors hover:bg-surface-muted hover:text-text-secondary">
                                        <ArrowDownIcon className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                            <ul className="divide-y divide-border">
                                <li className="group">
                                    <div role="button" aria-current="true" tabIndex={0} className="flex w-full cursor-pointer items-center gap-3 bg-surface-muted px-4 py-3 transition-colors hover:bg-surface-muted focus:bg-surface-muted focus:outline-none">
                                        <div className="h-10 w-10 rounded-full border border-border bg-surface-secondary" />
                                        <div className="min-w-0 flex-1 text-left">
                                            <p className="truncate whitespace-nowrap text-sm font-medium text-text">kanekoayano</p>
                                            <p className="truncate whitespace-nowrap text-xs text-text-secondary">Tokyo, Japan</p>
                                        </div>
                                        <div className="flex shrink-0 gap-1">
                                            <IconButton aria-label="Go to location" size="sm" className="rounded text-text-secondary hover:bg-primary hover:!text-white app-dark:hover:!text-white"><MapPinIcon className="h-4 w-4" /></IconButton>
                                            <IconButton aria-label="Edit" size="sm" className="rounded text-text-secondary hover:bg-primary hover:!text-white app-dark:hover:!text-white"><EditIcon className="h-4 w-4" /></IconButton>
                                            <IconButton aria-label="Delete" size="sm" className="rounded text-text-secondary hover:bg-[rgb(220,38,38)] hover:!text-white app-dark:hover:!text-white"><TrashIcon className="h-4 w-4" /></IconButton>
                                        </div>
                                    </div>
                                </li>
                            </ul>
                        </div>
                        <div className="flex min-w-0 justify-center overflow-auto rounded-lg border border-border bg-surface-secondary p-3">
                            <ArtistCard artist={sampleArtist} showActions locationLanguage="en" />
                        </div>
                    </div>
                </section>

                <section className={`${panelClass} xl:col-span-2`}>
                    <h4 className="text-sm font-semibold text-text">Artist Form and Cropper Surfaces</h4>
                    <div className="mx-auto mt-4 max-w-3xl overflow-hidden rounded-lg bg-surface shadow-xl">
                        <div className="relative z-[80] h-32 w-full shrink-0 cursor-pointer bg-surface-muted bg-cover bg-center group/profile">
                            <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover/profile:bg-black/30">
                                <EditIcon aria-hidden="true" className="h-6 w-6 text-white opacity-0 transition-opacity group-hover/profile:opacity-100" />
                            </div>
                            <button type="button" className="group/avatar absolute -bottom-8 left-4 z-10 h-20 w-20 cursor-pointer overflow-hidden rounded-full border-4 border-surface bg-border shadow-md">
                                <div className="flex h-full w-full items-center justify-center bg-surface-muted text-2xl font-medium text-text-muted">k</div>
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover/avatar:opacity-100">
                                    <EditIcon aria-hidden="true" className="h-6 w-6 text-white" />
                                </div>
                            </button>
                            <div className="absolute bottom-2 left-28 right-4 z-10">
                                <button className="min-h-[1.75rem] overflow-hidden whitespace-nowrap border-b-2 border-transparent p-0 text-lg font-bold leading-tight text-white text-shadow-overlay">
                                    kanekoayano
                                </button>
                            </div>
                        </div>
                        <div className="grid gap-3 px-4 pb-4 pt-12">
                            <Input label="Artist name" value="kanekoayano" readOnly />
                            <div className="flex items-end gap-2 rounded-md p-1">
                                <div className="flex-1">
                                    <label className="mb-1 block text-sm font-bold text-text">Original location</label>
                                    <div className="relative">
                                        <input className="w-full rounded-md border border-border-strong bg-surface py-2 pl-3 pr-20 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary" value="Tokyo" readOnly />
                                        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
                                            <button aria-label="Search location" type="button" className="rounded p-1 text-text-secondary transition-colors hover:bg-primary hover:text-white">
                                                <SearchIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <button aria-label="Manual select" type="button" className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:bg-primary hover:text-white">
                                    <MapPinIcon className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="rounded-md border border-border-strong bg-surface shadow-lg">
                                <button type="button" className="w-full border-b border-border px-3 py-2 text-left text-sm hover:bg-surface-secondary">
                                    <div className="font-medium text-text">Tokyo, Japan</div>
                                    <div className="mt-0.5 text-xs text-text-secondary">city</div>
                                </button>
                            </div>
                            <div className="overflow-hidden rounded-lg bg-surface shadow-xl">
                                <div className="flex border-b border-border">
                                    <button type="button" className="flex-1 -mb-px border-b-2 border-primary py-2.5 text-sm font-medium text-primary">Avatar</button>
                                    <button type="button" className="flex-1 py-2.5 text-sm font-medium text-text-secondary hover:text-text">Banner</button>
                                </div>
                                <div className="relative h-48 bg-black">
                                    <button type="button" className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-black/60 hover:text-white">
                                        Re-upload
                                    </button>
                                    <div className="absolute inset-8 rounded-full border-2 border-text/70" />
                                </div>
                                <div className="flex gap-3 border-t border-border p-4">
                                    <button type="button" className="flex-1 rounded-md border border-transparent bg-[#F3F4F6] px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-[#E5E7EB] app-dark:bg-[#2C2C2E] app-dark:text-text app-dark:hover:bg-[#3A3A3C]">Cancel</button>
                                    <button type="button" className="flex-1 rounded-md border border-transparent bg-primary-contrast px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-contrast-hover disabled:cursor-not-allowed disabled:opacity-50">Save</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className={`${panelClass} xl:col-span-2`}>
                    <h4 className="text-sm font-semibold text-text">Dialogs, Banners, and Error Overlays</h4>
                    <div className="relative mt-4 grid min-h-80 gap-3 overflow-hidden rounded-lg border border-border bg-surface-secondary p-4">
                        <div className="relative z-10 max-w-full pt-[22px] font-sans">
                            <div className="absolute -top-px left-1/2 z-20 max-w-[70%] -translate-x-1/2">
                                <span className="block truncate rounded-t-lg bg-surface-secondary px-4 py-1 text-center text-sm font-medium leading-none text-text shadow-md">Featured</span>
                            </div>
                            <div role="status" className="relative z-10 flex min-h-10 max-w-full items-stretch overflow-hidden rounded-lg border border-border bg-surface shadow-md">
                                <div className="min-w-0 flex-1 p-2"><span className="block truncate whitespace-nowrap text-sm text-text">Viewing featured artists</span></div>
                                <div aria-hidden="true" className="h-6 w-px shrink-0 self-center bg-border" />
                                <button className="flex shrink-0 items-center justify-center px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-muted">Return</button>
                            </div>
                        </div>
                        <button type="button" onClick={() => setShowDialogPreview(true)} className="w-fit rounded-md border border-border-strong bg-surface px-4 py-2 text-sm text-text hover:bg-surface-secondary">
                            Show confirm dialog
                        </button>
                        <div className="relative h-28 overflow-hidden rounded-md border border-border">
                            <MapErrorOverlay message="Map failed to load" />
                        </div>
                        {showDialogPreview && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center px-4">
                                <div aria-hidden="true" className="absolute inset-0 bg-black/25" onClick={() => setShowDialogPreview(false)} />
                                <section role="dialog" aria-modal="true" className="relative w-[calc(100%-1rem)] max-w-80 rounded-lg border border-border bg-surface p-4 shadow-xl focus:outline-none sm:w-80">
                                    <h2 className="text-base font-semibold text-error app-dark:text-primary app-dark:font-bold">Delete artist</h2>
                                    <div className="mt-3 text-sm leading-5 text-text-secondary">ConfirmDialog surface and actions, contained inside this preview frame.</div>
                                    <div className="mt-4 flex gap-3">
                                        <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowDialogPreview(false)}>Cancel</Button>
                                        <Button type="button" className="flex-1 bg-error hover:bg-error/90" onClick={() => setShowDialogPreview(false)}>Delete</Button>
                                    </div>
                                </section>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
