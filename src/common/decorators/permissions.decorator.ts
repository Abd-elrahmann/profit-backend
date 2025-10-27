import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';
export const Permissions = (module: string, action: 'canView' | 'canAdd' | 'canUpdate' | 'canDelete' | 'canPost') =>
  SetMetadata(PERMISSION_KEY, { module, action });