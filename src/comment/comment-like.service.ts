import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/database/prisma/prisma.service';

@Injectable()
export class CommentLikeService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { profileId: string; authorId: string; commentId: string }) {
    return this.prisma.commentLike.create({ data });
  }

  delete(id: string) {
    return this.prisma.commentLike.delete({ where: { id } });
  }

  findByCommentId(commentId: string) {
    return this.prisma.commentLike.findMany({ where: { commentId }, select: { authorId: true, id: true } });
  }
}
