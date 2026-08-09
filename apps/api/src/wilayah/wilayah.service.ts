import type { Database } from '@geoterracakra/database';
import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';

interface BoundaryRow {
  geometry: unknown;
  kode: string;
  nama: string;
}

interface DesaRow {
  kecamatan: string;
  kode: string;
  nama: string;
  parent: string;
}

interface BoundsRow {
  east: number;
  north: number;
  south: number;
  west: number;
}

@Injectable()
export class WilayahService {
  constructor(@Inject('DATABASE') private readonly db: Kysely<Database>) {}

  async getKabkotaBoundary(kode: string) {
    const result = await sql<BoundaryRow>`
      SELECT
        "KDPKAB" AS kode,
        "NAMOBJ" AS nama,
        ST_AsGeoJSON(geometry)::json AS geometry
      FROM kabkota
      WHERE "KDPKAB" = ${kode}
      LIMIT 1
    `.execute(this.db);
    const row = result.rows[0];

    if (!row) return null;

    return {
      geometry: row.geometry,
      properties: { kode: row.kode, nama: row.nama },
      type: 'Feature',
    };
  }

  async listDesa() {
    const result = await sql<DesaRow>`
      SELECT
        "KDEPUM" AS kode,
        "NAMOBJ" AS nama,
        "WADMKC" AS kecamatan,
        CASE "KDPKAB"
          WHEN '35.07' THEN 'Kabupaten Malang'
          WHEN '35.73' THEN 'Kota Malang'
        END AS parent
      FROM desa
      ORDER BY parent, kecamatan, nama, kode
    `.execute(this.db);

    return { data: result.rows };
  }

  async getDesaBounds(kode: string) {
    const result = await sql<BoundsRow>`
      SELECT
        ST_XMin(Box2D(geometry)) AS west,
        ST_YMin(Box2D(geometry)) AS south,
        ST_XMax(Box2D(geometry)) AS east,
        ST_YMax(Box2D(geometry)) AS north
      FROM desa
      WHERE "KDEPUM" = ${kode}
      LIMIT 1
    `.execute(this.db);
    const bounds = result.rows[0];

    if (!bounds) return null;

    return { bbox: [bounds.west, bounds.south, bounds.east, bounds.north] };
  }
}
