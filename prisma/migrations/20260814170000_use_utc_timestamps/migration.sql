-- Existing timestamp-without-time-zone values were written as UTC wall-clock
-- values by the application. Interpret them as UTC while changing the columns
-- to timestamptz so their instants are preserved.
ALTER TABLE "Activity"
  ALTER COLUMN "date" TYPE TIMESTAMPTZ(6) USING "date" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Friend"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Comment"
  ALTER COLUMN "date" TYPE TIMESTAMPTZ(6) USING "date" AT TIME ZONE 'UTC';

ALTER TABLE "CommentLike"
  ALTER COLUMN "date" TYPE TIMESTAMPTZ(6) USING "date" AT TIME ZONE 'UTC';

ALTER TABLE "Like"
  ALTER COLUMN "date" TYPE TIMESTAMPTZ(6) USING "date" AT TIME ZONE 'UTC';
