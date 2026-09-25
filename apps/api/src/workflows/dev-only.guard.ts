import { Injectable, NotFoundException } from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';
@Injectable()
export class DevOnlyGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_ROUTES !== 'true') {
      throw new NotFoundException();
    }
    return true;
  }
}
