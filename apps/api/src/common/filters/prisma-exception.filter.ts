import { ArgumentsHost, Catch, ConflictException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/** Menerjemahkan error Prisma umum ke HTTP tanpa membocorkan detail database. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Prisma');

  override catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    let mapped: HttpException | undefined;
    if (e.code === 'P2002') mapped = new ConflictException('Data sudah ada');
    else if (e.code === 'P2025') mapped = new NotFoundException('Data tidak ditemukan');
    if (!mapped) this.logger.error(`${e.code}: ${e.message}`);
    super.catch(mapped ?? e, host);
  }
}
