import type { Database } from '@geoterracakra/database';
import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';

interface ClassAreaRow {
  area_m2: number;
  class_code: number;
}

interface LandcoverFeatureRow {
  class_code: number;
  geometry: unknown;
  id: number;
}

interface LandcoverYearRow {
  year: number;
}

@Injectable()
export class LandcoverService {
  constructor(@Inject('DATABASE') private readonly db: Kysely<Database>) {}

  async listYears() {
    const result = await sql<LandcoverYearRow>`
      SELECT DISTINCT year
      FROM landcover
      WHERE source = 'malang-landcover'
      ORDER BY year
    `.execute(this.db);

    return { data: result.rows.map((row) => row.year) };
  }

  async getGridStatistics(gridId: number, year: number) {
    const result = await sql<ClassAreaRow>`
      SELECT
        class_code,
        SUM(ST_Area(ST_Transform(geom, 6933)))::double precision AS area_m2
      FROM landcover
      WHERE grid_id = ${gridId}
        AND year = ${year}
        AND source = 'malang-landcover'
      GROUP BY class_code
      ORDER BY class_code
    `.execute(this.db);

    if (result.rows.length === 0) return null;

    const totalAreaM2 = result.rows.reduce((total, row) => total + Number(row.area_m2), 0);

    return {
      classes: result.rows.map((row) => ({
        areaM2: Number(row.area_m2),
        classCode: row.class_code,
        percentage: totalAreaM2 === 0 ? 0 : (Number(row.area_m2) / totalAreaM2) * 100,
      })),
      gridId,
      totalAreaM2,
      year,
    };
  }

  async getGridFeatures(gridId: number, year: number) {
    const result = await sql<LandcoverFeatureRow>`
      SELECT id, class_code, ST_AsGeoJSON(geom)::json AS geometry
      FROM landcover
      WHERE grid_id = ${gridId}
        AND year = ${year}
        AND source = 'malang-landcover'
      ORDER BY class_code, id
    `.execute(this.db);

    if (result.rows.length === 0) return null;

    return {
      features: result.rows.map((row) => ({
        geometry: row.geometry,
        properties: {
          class_code: row.class_code,
          grid_id: gridId,
          methodology: 'manual',
          source: 'malang-landcover',
          year,
        },
        type: 'Feature',
      })),
      type: 'FeatureCollection',
    };
  }
}
