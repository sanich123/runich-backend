-- Keep the oldest row for each logical follow and remove only redundant duplicates.
WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "user_id", "friendId"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS row_number
    FROM "Friend"
)
DELETE FROM "Friend"
WHERE "id" IN (SELECT "id" FROM ranked WHERE row_number > 1);

-- Keep the oldest row for each logical activity like and remove only redundant duplicates.
WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "authorId", "activityId"
            ORDER BY "date" ASC, "id" ASC
        ) AS row_number
    FROM "Like"
)
DELETE FROM "Like"
WHERE "id" IN (SELECT "id" FROM ranked WHERE row_number > 1);

-- Keep the oldest row for each logical comment like and remove only redundant duplicates.
WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "authorId", "commentId"
            ORDER BY "date" ASC, "id" ASC
        ) AS row_number
    FROM "CommentLike"
)
DELETE FROM "CommentLike"
WHERE "id" IN (SELECT "id" FROM ranked WHERE row_number > 1);

CREATE UNIQUE INDEX "Friend_user_id_friendId_key"
ON "Friend"("user_id", "friendId");

CREATE INDEX "Friend_friendId_idx"
ON "Friend"("friendId");

CREATE INDEX "Like_activityId_idx"
ON "Like"("activityId");

CREATE UNIQUE INDEX "Like_authorId_activityId_key"
ON "Like"("authorId", "activityId");

CREATE INDEX "Comment_activityId_idx"
ON "Comment"("activityId");

CREATE INDEX "CommentLike_commentId_idx"
ON "CommentLike"("commentId");

CREATE UNIQUE INDEX "CommentLike_authorId_commentId_key"
ON "CommentLike"("authorId", "commentId");
