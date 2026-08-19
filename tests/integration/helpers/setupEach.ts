import { beforeEach } from 'vitest';
import { truncateAllTables } from './db.js';

beforeEach(async () => {
  await truncateAllTables();
});
