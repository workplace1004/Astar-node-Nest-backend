import { Module } from '@nestjs/common';
import { BirthChartController } from './birth-chart.controller';
import { BirthChartService } from './birth-chart.service';

@Module({
  controllers: [BirthChartController],
  providers: [BirthChartService],
})
export class BirthChartModule {}
