import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';
import { isUniqueConstraintError } from 'src/common/utils/database-errors';

@Injectable()
export class CommentLikeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(data: { profileId: string; authorId: string; commentId: string }) {
    const where = { authorId_commentId: { authorId: data.authorId, commentId: data.commentId } };
    try {
      return await this.prisma.commentLike.upsert({
        where,
        update: {},
        create: data,
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      return this.prisma.commentLike.findUnique({ where });
    }
  }

  delete(id: string, authorId?: string) {
    return this.prisma.commentLike.delete({ where: authorId ? { id, authorId } : { id } });
  }

  findByCommentId(commentId: string) {
    return this.prisma.commentLike.findMany({ where: { commentId }, select: { authorId: true, id: true } });
  }
}
