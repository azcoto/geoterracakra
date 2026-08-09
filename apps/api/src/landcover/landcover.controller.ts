import { BadRequestException, Controller, Get, Inject, NotFoundException, Param, ParseIntPipe, Query } from '@nestjs/common';
import { LandcoverService } from './landcover.service.js';

const supportedYears = new Set([2020, 2021, 2022, 2023, 2025]);

@Controller('landcover')
export class LandcoverController {
  constructor(@Inject(LandcoverService) private readonly landcoverService: LandcoverService) {}

  @Get('grid/:gridId/statistics')
  async getGridStatistics(@Param('gridId', ParseIntPipe) gridId: number, @Query('year') yearValue: string) {
    const year = Number(yearValue);
    if (!Number.isInteger(year) || !supportedYears.has(year)) {
      throw new BadRequestException('year must be one of 2020, 2021, 2022, 2023, or 2025');
    }

    const statistics = await this.landcoverService.getGridStatistics(gridId, year);
    if (!statistics) {
      throw new NotFoundException(`Landcover data for grid ${gridId} in ${year} was not found`);
    }

    return statistics;
  }

  @Get('grid/:gridId/features')
  async getGridFeatures(@Param('gridId', ParseIntPipe) gridId: number, @Query('year') yearValue: string) {
    const year = Number(yearValue);
    if (!Number.isInteger(year) || !supportedYears.has(year)) {
      throw new BadRequestException('year must be one of 2020, 2021, 2022, 2023, or 2025');
    }

    const featureCollection = await this.landcoverService.getGridFeatures(gridId, year);
    if (!featureCollection) {
      throw new NotFoundException(`Landcover data for grid ${gridId} in ${year} was not found`);
    }

    return featureCollection;
  }
}
