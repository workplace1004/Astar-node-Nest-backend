import { Body, Controller, Get, Post } from '@nestjs/common';
import { BirthChartService, BirthChartPreviewDto } from './birth-chart.service';

@Controller('birth-chart')
export class BirthChartController {
  constructor(private readonly birthChartService: BirthChartService) {}

  @Get('content-style')
  async getContentStyle() {
    const config = await this.birthChartService.getContentStyleConfig();
    return { config };
  }

  @Post('preview')
  preview(@Body() dto: BirthChartPreviewDto) {
    return this.birthChartService.getPreview(dto);
  }
}
