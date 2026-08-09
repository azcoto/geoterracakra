import { Module } from '@nestjs/common';
import { createDatabase } from '@geoterracakra/database';
import { WilayahController } from './wilayah.controller.js';
import { WilayahService } from './wilayah.service.js';

@Module({
  controllers: [WilayahController],
  providers: [WilayahService, { provide: 'DATABASE', useFactory: createDatabase }],
})
export class WilayahModule {}
