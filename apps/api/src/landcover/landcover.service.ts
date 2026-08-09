import type { Database } from '@geoterracakra/database';
import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';

interface ClassAreaRow {
  area_m2: number;
  class_code: number;
}

interface GridGeometryRow {
  geometry: unknown;
}

@Injectable()
export class LandcoverService {
  constructor(@Inject('DATABASE') private readonly db: Kysely<Database>) {}

  async getGridStatistics(gridId: number, year: number) {
    const gridResult = await sql<GridGeometryRow>`
      SELECT ST_AsGeoJSON(geom)::json AS geometry
      FROM grid
      WHERE id = ${gridId}
    `.execute(this.db);
    const grid = gridResult.rows[0];
    if (!grid) return null;

    const result = await sql<ClassAreaRow>`
      SELECT
        class_code,
        SUM(ST_Area(ST_Transform(geom, 6933)))::double precision AS area_m2
      FROM landcover
      WHERE grid_id = ${gridId}
        AND year = ${year}
        AND source = 'esri-landcover'
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
      geometry: grid.geometry,
      gridId,
      totalAreaM2,
      year,
    };
  }
}
