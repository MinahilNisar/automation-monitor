import { SetMetadata } from '@nestjs/common';
export const MACHINE_AUTH = 'machine-auth';
// Only explicitly marked API-key routes bypass browser-origin checks.
export const MachineAuth = () => SetMetadata(MACHINE_AUTH, true);
