import { createFileRoute } from '@tanstack/react-router';
import type { FillLayerSpecification, LineLayerSpecification, MapLayerMouseEvent } from 'maplibre-gl';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Crosshair, Download, PanelLeft, PanelLeftClose, X } from 'lucide-react';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import MapLibreMap, { Layer, type MapRef, Source } from 'react-map-gl/maplibre';
import { Button } from '../components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '../components/ui/combobox';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '../components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';

// Vite needs an explicit worker asset URL for MapLibre GL JS to load GeoJSON and other worker-backed sources.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

const mapIdApiKey = import.meta.env.VITE_MAPID_API_KEY;
const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const martinUrl = import.meta.env.VITE_MARTIN_URL ?? 'http://localhost:3001';
const satelliteMapStyle = `https://basemap.mapid.io/styles/satellite/style.json?key=${encodeURIComponent(mapIdApiKey)}`;
const darkMatterMapStyle = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const osmStreetMapStyle = {
  layers: [
    {
      id: 'openstreetmap',
      source: 'openstreetmap',
      type: 'raster' as const,
    },
  ],
  sources: {
    openstreetmap: {
      attribution: '© OpenStreetMap contributors',
      tileSize: 256,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      type: 'raster' as const,
    },
  },
  version: 8 as const,
};

const boundaryLineLayer: Omit<LineLayerSpecification, 'filter' | 'source'> = {
  'source-layer': 'kabkota',
  id: 'selected-kabkota-line',
  paint: {
    'line-color': '#facc15',
    'line-opacity': 0.95,
    'line-width': 1.5,
  },
  type: 'line',
};

const desaBoundaryLineLayer: Omit<LineLayerSpecification, 'filter' | 'source'> = {
  'source-layer': 'desa',
  id: 'selected-desa-line',
  paint: {
    'line-color': '#fb923c',
    'line-opacity': 1,
    'line-width': 2,
  },
  type: 'line',
};

const gridLineLayer: Omit<LineLayerSpecification, 'filter' | 'source'> = {
  'source-layer': 'grid',
  id: 'analysis-grid-line',
  minzoom: 9,
  paint: {
    'line-color': '#f8fafc',
    'line-opacity': 0.2,
    'line-width': 0.75,
  },
  type: 'line',
};

const gridHitLayer: Omit<FillLayerSpecification, 'filter' | 'source'> = {
  'source-layer': 'grid',
  id: 'grid-click-target',
  paint: { 'fill-opacity': 0 },
  type: 'fill',
};

const landcoverFillLayer: Omit<FillLayerSpecification, 'filter' | 'source' | 'source-layer'> = {
  id: 'landcover-fill',
  paint: {
    'fill-color': ['match', ['get', 'class_code'], 0, '#88b053', 1, '#419bdf', 2, '#c4281b', 3, '#e49635', '#94a3b8'],
    'fill-opacity': 0.6,
  },
  type: 'fill',
};

const landcoverLegend = [
  { code: 0, color: '#88b053', label: 'Vegetation' },
  { code: 1, color: '#419bdf', label: 'Water' },
  { code: 2, color: '#c4281b', label: 'Built-up' },
  { code: 3, color: '#e49635', label: 'Open land' },
];

const satelliteOption = { label: 'Sentinel 2', value: 'sentinel-2' };
const analysisOption = { label: 'Tutupan Lahan', value: 'tutupan-lahan' };
interface SelectOption {
  label: string;
  value: string;
}

const areaOptions: SelectOption[] = [
  { label: 'Kabupaten Malang', value: '35.07' },
  { label: 'Kota Malang', value: '35.73' },
  { label: 'Keduanya', value: 'all' },
];

function getAreaLandcoverFilter(area: SelectOption): LineLayerSpecification['filter'] {
  if (area.value === 'all') {
    return ['in', ['get', 'area'], ['literal', ['35.07', '35.73']]];
  }
  return ['==', ['get', 'area'], area.value];
}

function getAreaBoundaryFilter(area: SelectOption): LineLayerSpecification['filter'] {
  if (area.value === 'all') {
    return ['in', ['get', 'KDPKAB'], ['literal', ['35.07', '35.73']]];
  }
  return ['==', ['get', 'KDPKAB'], area.value];
}

interface DesaOption {
  kecamatan: string;
  kode: string;
  nama: string;
  parent: string;
}

interface GridStatistics {
  classes: { areaM2: number; classCode: number; percentage: number }[];
  gridId: number;
  totalAreaM2: number;
  year: number;
}

interface SelectedGrid {
  id: number;
  point: { x: number; y: number };
}

function getDesaLabel(item: unknown) {
  return (item as DesaOption | null)?.nama ?? '';
}

function getDesaValue(item: unknown) {
  return (item as DesaOption | null)?.kode ?? '';
}

export const Route = createFileRoute('/')({
  component: LandcoverMap,
});

function LandcoverMap() {
  const mapRef = useRef<MapRef>(null);
  const [basemap, setBasemap] = useState<'satellite' | 'street' | 'dark'>('satellite');
  const [isPanelMinimized, setIsPanelMinimized] = useState(false);
  const [areBoundariesVisible, setAreBoundariesVisible] = useState(true);
  const [isGridVisible, setIsGridVisible] = useState(false);
  const [isLandcoverVisible, setIsLandcoverVisible] = useState(false);
  const [selectedYear, setSelectedYear] = useState<SelectOption | null>(null);
  const [selectedArea, setSelectedArea] = useState<SelectOption>(areaOptions[0]);
  const [yearOptions, setYearOptions] = useState<SelectOption[]>([]);
  const [processedYear, setProcessedYear] = useState<string | null>(null);
  const [desa, setDesa] = useState<DesaOption[]>([]);
  const [selectedDesa, setSelectedDesa] = useState<DesaOption | null>(null);
  const [isDesaLoading, setIsDesaLoading] = useState(true);
  const [selectedGrid, setSelectedGrid] = useState<SelectedGrid | null>(null);
  const [gridStatistics, setGridStatistics] = useState<GridStatistics | null>(null);
  const [isGridStatisticsLoading, setIsGridStatisticsLoading] = useState(false);
  const [isGridDownloadLoading, setIsGridDownloadLoading] = useState(false);
  const [gridStatisticsError, setGridStatisticsError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDesa() {
      try {
        const response = await fetch(`${apiUrl}/wilayah/desa`, { signal: controller.signal });
        if (!response.ok) throw new Error('Unable to load Desa/Kelurahan');

        const payload = (await response.json()) as { data: DesaOption[] };
        setDesa(payload.data);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setDesa([]);
        }
      } finally {
        if (!controller.signal.aborted) setIsDesaLoading(false);
      }
    }

    loadDesa();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadYears() {
      try {
        const response = await fetch(`${apiUrl}/landcover/years`, { signal: controller.signal });
        if (!response.ok) throw new Error('Unable to load available years');

        const payload = (await response.json()) as { data: number[] };
        const options = (payload.data ?? []).map((year) => ({ label: String(year), value: String(year) }));
        setYearOptions(options);
        if (options.length > 0) {
          setSelectedYear(options[options.length - 1]);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setYearOptions([{ label: '2024', value: '2024' }]);
          setSelectedYear({ label: '2024', value: '2024' });
        }
      }
    }

    loadYears();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedDesa) return;
    const desaToFocus = selectedDesa;

    const controller = new AbortController();

    async function focusDesa() {
      const response = await fetch(`${apiUrl}/wilayah/desa/${desaToFocus.kode}/bounds`, { signal: controller.signal });
      if (!response.ok) return;

      const { bbox } = (await response.json()) as { bbox: [number, number, number, number] };
      if (controller.signal.aborted) return;

      mapRef.current?.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { duration: 700, maxZoom: 14, padding: { bottom: 80, left: 380, right: 80, top: 80 } },
      );
    }

    focusDesa();
    return () => controller.abort();
  }, [selectedDesa]);

  function processLandcover() {
    if (!selectedYear) return;
    setProcessedYear(selectedYear.value);
    setIsLandcoverVisible(true);
    setSelectedGrid(null);
  }

  async function handleGridClick(event: MapLayerMouseEvent) {
    if (!processedYear) return;

    const feature = event.features?.find((candidate) => candidate.layer.id === gridHitLayer.id);
    const gridId = Number(feature?.properties?.id);
    if (!Number.isSafeInteger(gridId)) return;

    setSelectedGrid({ id: gridId, point: event.point });
    setGridStatistics(null);
    setGridStatisticsError(null);
    setIsGridStatisticsLoading(true);

    try {
      const response = await fetch(`${apiUrl}/landcover/grid/${gridId}/statistics?year=${processedYear}`);
      if (!response.ok) throw new Error('Unable to load grid statistics');
      setGridStatistics((await response.json()) as GridStatistics);
    } catch {
      setGridStatisticsError('Statistik grid tidak tersedia.');
    } finally {
      setIsGridStatisticsLoading(false);
    }
  }

  async function downloadGridStatistics() {
    if (!gridStatistics) return;

    setIsGridDownloadLoading(true);
    try {
      const response = await fetch(`${apiUrl}/landcover/grid/${gridStatistics.gridId}/features?year=${gridStatistics.year}`);
      if (!response.ok) throw new Error('Unable to download landcover features');

      const featureCollection = await response.json();
      const url = URL.createObjectURL(new Blob([JSON.stringify(featureCollection)], { type: 'application/geo+json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `landcover-grid-${gridStatistics.gridId}-${gridStatistics.year}.geojson`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setGridStatisticsError('GeoJSON tidak dapat diunduh.');
    } finally {
      setIsGridDownloadLoading(false);
    }
  }

  return (
    <main aria-label="Landcover map" className="map-page">
      <MapLibreMap
        initialViewState={{ latitude: -7.98, longitude: 112.63, zoom: 9.5 }}
        interactiveLayerIds={isGridVisible ? [gridHitLayer.id] : []}
        mapStyle={basemap === 'satellite' ? satelliteMapStyle : basemap === 'dark' ? darkMatterMapStyle : osmStreetMapStyle}
        onClick={handleGridClick}
        ref={mapRef}
        style={{ height: '100%', width: '100%' }}
      >
        {processedYear && isLandcoverVisible && (
          <Source
            id={`landcover-${processedYear}`}
            key={`${processedYear}-${selectedArea.value}`}
            tiles={[`${martinUrl}/landcover_mvt/{z}/{x}/{y}?year=${processedYear}&area=${selectedArea.value}`]}
            type="vector"
          >
            <Layer {...landcoverFillLayer} source-layer="landcover" />
          </Source>
        )}
        {isGridVisible && (
          <Source id="grid" type="vector" url={`${martinUrl}/grid`}>
            <Layer {...gridHitLayer} />
            <Layer {...gridLineLayer} />
          </Source>
        )}
        {areBoundariesVisible && (
          <Source id="kabkota" type="vector" url={`${martinUrl}/kabkota`}>
            <Layer {...boundaryLineLayer} filter={getAreaBoundaryFilter(selectedArea)} />
          </Source>
        )}
        {areBoundariesVisible && selectedDesa && (
          <Source id="desa" type="vector" url={`${martinUrl}/desa`}>
            <Layer {...desaBoundaryLineLayer} filter={['==', ['get', 'KDEPUM'], selectedDesa.kode]} />
          </Source>
        )}
      </MapLibreMap>
      {selectedGrid && (
        <Popover
          onOpenChange={(open) => {
            if (!open) setSelectedGrid(null);
          }}
          open
        >
          <PopoverTrigger
            render={
              <button
                aria-label={`Grid ${selectedGrid.id} statistics`}
                className="grid-statistics-anchor"
                style={{ left: selectedGrid.point.x, top: selectedGrid.point.y }}
                type="button"
              />
            }
          />
          <PopoverContent align="center" className="grid-statistics-popover" side="top" sideOffset={10}>
            <Button aria-label="Close grid statistics" className="grid-statistics-close" onClick={() => setSelectedGrid(null)} size="icon-sm" type="button" variant="ghost">
              <X aria-hidden="true" />
            </Button>
            <PopoverHeader>
              <PopoverTitle>Statistik Grid</PopoverTitle>
              <p>
                Grid #{selectedGrid.id} · {processedYear}
              </p>
            </PopoverHeader>
            {isGridStatisticsLoading && <p className="text-muted-foreground">Memuat statistik…</p>}
            {gridStatisticsError && <p className="text-destructive">{gridStatisticsError}</p>}
            {gridStatistics && (
              <>
                <ul className="grid-statistics-list">
                  {gridStatistics.classes.map((item) => {
                    const legend = landcoverLegend.find((candidate) => candidate.code === item.classCode);
                    return (
                      <li key={item.classCode}>
                        <span className="grid-statistics-class">
                          <span aria-hidden="true" className="landcover-legend-swatch" style={{ backgroundColor: legend?.color ?? '#94a3b8' }} />
                          {legend?.label ?? `Class ${item.classCode}`}
                        </span>
                        <strong>{item.percentage.toFixed(1)}%</strong>
                      </li>
                    );
                  })}
                </ul>
                <Button className="w-full" disabled={isGridDownloadLoading} onClick={downloadGridStatistics} size="sm" type="button" variant="outline">
                  <Download aria-hidden="true" />
                  {isGridDownloadLoading ? 'Menyiapkan GeoJSON…' : 'Unduh GeoJSON'}
                </Button>
              </>
            )}
          </PopoverContent>
        </Popover>
      )}
      {isPanelMinimized ? (
        <Button aria-label="Show landcover panel" className="map-panel-restore" onClick={() => setIsPanelMinimized(false)} size="sm" variant="outline">
          <PanelLeft aria-hidden="true" />
          Explore
        </Button>
      ) : (
        <Card aria-label="Landcover controls" className="map-panel" role="complementary">
          <CardHeader>
            <div>
              <p className="map-panel-eyebrow">Landcover explorer</p>
              <CardTitle>Kabupaten &amp; Kota Malang</CardTitle>
            </div>
            <CardAction>
              <Button aria-label="Minimize landcover panel" className="map-panel-minimize" onClick={() => setIsPanelMinimized(true)} size="icon" variant="ghost">
                <PanelLeftClose aria-hidden="true" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <label className="map-panel-label" htmlFor="wilayah">
                Wilayah
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {areaOptions.map((option) => (
                  <Button
                    aria-pressed={selectedArea.value === option.value}
                    className={
                      selectedArea.value === option.value
                        ? 'map-panel-area-button bg-primary text-primary-foreground hover:bg-primary/80'
                        : 'map-panel-area-button border-border bg-background text-foreground shadow-xs hover:bg-muted dark:border-input dark:bg-input/30 dark:hover:bg-input/50'
                    }
                    key={option.value}
                    onClick={() => setSelectedArea(option)}
                    size="sm"
                    type="button"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <label className="map-panel-label" htmlFor="citra-satelit">
                Citra Satelit
              </label>
              <Select defaultValue={satelliteOption} disabled itemToStringLabel={(item) => item.label} itemToStringValue={(item) => item.value}>
                <SelectTrigger className="w-full" id="citra-satelit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={satelliteOption}>Sentinel 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4 grid gap-2">
              <label className="map-panel-label" htmlFor="analisis">
                Analisis
              </label>
              <Select defaultValue={analysisOption} disabled itemToStringLabel={(item) => item.label} itemToStringValue={(item) => item.value}>
                <SelectTrigger className="w-full" id="analisis">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={analysisOption}>Tutupan Lahan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4 grid gap-2">
              <label className="map-panel-label" htmlFor="tahun">
                Tahun
              </label>
              <Select
                disabled={yearOptions.length === 0 || selectedYear === null}
                itemToStringLabel={(item) => item.label}
                itemToStringValue={(item) => item.value}
                onValueChange={(value) => setSelectedYear(value as SelectOption)}
                value={selectedYear}
              >
                <SelectTrigger className="w-full" id="tahun">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((option) => (
                    <SelectItem key={option.value} value={option}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="mt-4 w-full" onClick={processLandcover} type="button">
              PROSES
            </Button>
            <div className="map-panel-section">
              <label className="map-panel-label" htmlFor="desa-kelurahan">
                Desa/Kelurahan
              </label>
              <Combobox items={desa} itemToStringLabel={getDesaLabel} itemToStringValue={getDesaValue} onValueChange={(value) => setSelectedDesa(value as DesaOption | null)}>
                <ComboboxInput disabled={isDesaLoading} id="desa-kelurahan" placeholder={isDesaLoading ? 'Memuat Desa/Kelurahan…' : 'Cari Desa/Kelurahan'} showClear />
                <ComboboxContent>
                  <ComboboxEmpty>{isDesaLoading ? 'Memuat data…' : 'Desa/Kelurahan tidak ditemukan.'}</ComboboxEmpty>
                  <ComboboxList>
                    {(item: DesaOption) => (
                      <ComboboxItem key={item.kode} value={item}>
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="truncate font-medium">{item.nama}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {item.kecamatan}, {item.parent}
                          </span>
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <label className="text-sm font-medium" htmlFor="landcover-toggle">
                Tampilkan tutupan lahan
              </label>
              <Switch checked={isLandcoverVisible} disabled={!processedYear} id="landcover-toggle" onCheckedChange={setIsLandcoverVisible} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <label className="text-sm font-medium" htmlFor="boundary-toggle">
                Tampilkan batas wilayah
              </label>
              <Switch checked={areBoundariesVisible} id="boundary-toggle" onCheckedChange={setAreBoundariesVisible} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <label className="text-sm font-medium" htmlFor="grid-toggle">
                Tampilkan grid
              </label>
              <Switch checked={isGridVisible} id="grid-toggle" onCheckedChange={setIsGridVisible} />
            </div>
          </CardContent>
        </Card>
      )}
      {processedYear && (
        <Card aria-label={`Landcover legend for ${processedYear}`} className="landcover-legend" size="sm">
          <CardHeader className="landcover-legend-header">
            <CardTitle className="landcover-legend-title">Tutupan Lahan</CardTitle>
            <span className="landcover-legend-year">{processedYear}</span>
          </CardHeader>
          <CardContent>
            <ul className="landcover-legend-items">
              {landcoverLegend.map((item) => (
                <li key={item.label}>
                  <span aria-hidden="true" className="landcover-legend-swatch" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Button
        aria-label="Center map on Kota dan Kabupaten Malang"
        className="map-recenter"
        onClick={() => mapRef.current?.flyTo({ center: [112.63, -7.98], duration: 700, zoom: 9.5 })}
        size="icon"
        title="Center map"
        variant="outline"
      >
        <Crosshair aria-hidden="true" />
      </Button>
      <fieldset aria-label="Basemap" className="basemap-selector">
        <button
          aria-pressed={basemap === 'satellite'}
          className={basemap === 'satellite' ? 'basemap-button basemap-button-active' : 'basemap-button'}
          onClick={() => setBasemap('satellite')}
          type="button"
        >
          Satellite
        </button>
        <button
          aria-pressed={basemap === 'street'}
          className={basemap === 'street' ? 'basemap-button basemap-button-active' : 'basemap-button'}
          onClick={() => setBasemap('street')}
          type="button"
        >
          OSM Street
        </button>
        <button
          aria-pressed={basemap === 'dark'}
          className={basemap === 'dark' ? 'basemap-button basemap-button-active' : 'basemap-button'}
          onClick={() => setBasemap('dark')}
          type="button"
        >
          Dark Matter
        </button>
      </fieldset>
    </main>
  );
}
