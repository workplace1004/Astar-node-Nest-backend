import { Body, Controller, Post } from '@nestjs/common';
import { BirthChartService, BirthChartPreviewDto } from './birth-chart.service';

@Controller('birth-chart')
export class BirthChartController {
  constructor(private readonly birthChartService: BirthChartService) {}

  @Post('preview')
  preview(@Body() dto: BirthChartPreviewDto) {
    return this.birthChartService.getPreview(dto);
  }
}
