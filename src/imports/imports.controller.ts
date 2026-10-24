import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard.js';
import { ImportsService } from './imports.service.js';

@UseGuards(AuthGuard)
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post()
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  upload(
    @Req() request: { user: { id: string } },
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    if (!file || !file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('Upload a .csv file in the "file" field');
    }

    return this.importsService.upload(request.user.id, file);
  }

  @Get()
  list(@Req() request: { user: { id: string } }) {
    return this.importsService.list(request.user.id);
  }

  @Get(':id')
  findOne(
    @Req() request: { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importsService.findOne(request.user.id, id);
  }
}
