import { join } from 'node:path';
import { resolveMigrationPath } from '../migration-path';

describe('resolveMigrationPath', () => {
  it('resolves nested archive files inside the job directory', () => {
    expect(resolveMigrationPath('/tmp/migration-job', 'activities/run.gpx')).toBe(
      join('/tmp/migration-job', 'activities', 'run.gpx'),
    );
    expect(resolveMigrationPath('/tmp/migration-job', 'activities\\run.fit')).toBe(
      join('/tmp/migration-job', 'activities', 'run.fit'),
    );
  });

  it.each(['../outside.gpx', '/tmp/outside.gpx', 'C:/outside.gpx', '', 'activities/../../outside.gpx'])(
    'rejects a path outside the job directory: %s',
    (filePath) => {
      expect(() => resolveMigrationPath('/tmp/migration-job', filePath)).toThrow('Недопустимый путь');
    },
  );
});
