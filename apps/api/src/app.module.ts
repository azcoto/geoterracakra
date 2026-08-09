import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { LandcoverModule } from './landcover/landcover.module.js';
import { WilayahModule } from './wilayah/wilayah.module.js';

@Module({
  imports: [HealthModule, LandcoverModule, WilayahModule],
})
export class AppModule {}
