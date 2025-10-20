import { Global, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';

@Global()
@Injectable()
export class PrismaService extends PrismaClient {
    constructor(ConfigService:ConfigService){
        super({
            datasources:{
                db:{
                    url:ConfigService.get('DATABASE_URL')
                }
            }
        })
      }
}
