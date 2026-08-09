import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import { WilayahService } from './wilayah.service.js';

@Controller('wilayah')
export class WilayahController {
  constructor(@Inject(WilayahService) private readonly wilayahService: WilayahService) {}

  @Get('kabkota/:kode')
  async getKabkotaBoundary(@Param('kode') kode: string) {
    const boundary = await this.wilayahService.getKabkotaBoundary(kode);

    if (!boundary) {
      throw new NotFoundException(`Kabupaten/Kota ${kode} was not found`);
    }

    return boundary;
  }

  @Get('desa')
  getDesa() {
    return this.wilayahService.listDesa();
  }

  @Get('desa/:kode/bounds')
  async getDesaBounds(@Param('kode') kode: string) {
    const bounds = await this.wilayahService.getDesaBounds(kode);

    if (!bounds) {
      throw new NotFoundException(`Desa/Kelurahan ${kode} was not found`);
    }

    return bounds;
  }
}
