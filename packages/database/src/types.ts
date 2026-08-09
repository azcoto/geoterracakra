import type { Generated } from 'kysely';

export interface Database {
  grid: GridTable;
  landcover: LandcoverTable;
  wilayah: WilayahTable;
}

/** Reusable 0.02° analysis grid with its intersecting administrative area. */
export interface GridTable {
  bps_kode: string;
  geom: unknown;
  id: Generated<bigint>;
  wilayah_kode: string | null;
}

/** Vectorized landcover features, partitioned by analysis grid and observation year. */
export interface LandcoverTable {
  class_code: number;
  geom: unknown;
  grid_id: bigint;
  id: Generated<bigint>;
  methodology: string;
  source: string;
  year: number;
}

/** Administrative hierarchy lookup imported from the cCGIS wilayah dataset. */
export interface WilayahTable {
  administrative_level: Generated<WilayahAdministrativeLevel>;
  kode: string;
  nama: string;
}

export type WilayahAdministrativeLevel = 'provinsi' | 'kabupaten_kota' | 'kecamatan' | 'desa_kelurahan';
