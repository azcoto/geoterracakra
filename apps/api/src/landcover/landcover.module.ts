import { createDatabase } from '@geoterracakra/database';
import { Module } from '@nestjs/common';
import { LandcoverController } from './landcover.controller.js';
import { LandcoverService } from './landcover.service.js';

@Module({
  controllers: [LandcoverController],
  providers: [LandcoverService, { provide: 'DATABASE', useFactory: createDatabase }],
})
export class LandcoverModule {}
