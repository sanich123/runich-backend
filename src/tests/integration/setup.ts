import 'dotenv/config';
import { jest } from '@jest/globals';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

process.env.JWT_SECRET ??= 'runich-integration-test-secret';
process.env.S3_BUCKET = 'runich-integration-test';
process.env.S3_ACCESS_KEY = 'runich-integration-access';
process.env.S3_SECRET_ACCESS_KEY = 'runich-integration-secret';

const objects = new Map<string, Uint8Array>();

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return typeof value === 'object' && value !== null && Symbol.asyncIterator in value;
}

async function toBytes(body: unknown) {
  if (body instanceof Uint8Array) return body;
  if (typeof body === 'string') return Buffer.from(body);
  if (isAsyncIterable(body)) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body) chunks.push(chunk);
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  }
  throw new Error('Integration S3 mock received an unsupported body');
}

const s3Send = jest.spyOn(S3Client.prototype, 'send');
s3Send.mockImplementation(async (command) => {
  if (command instanceof PutObjectCommand) {
    const { Bucket, Key, Body } = command.input;
    if (!Bucket || !Key || Body === undefined) throw new Error('Integration S3 put request is incomplete');
    objects.set(`${Bucket}/${Key}`, await toBytes(Body));
    return {} as never;
  }

  if (command instanceof GetObjectCommand) {
    const { Bucket, Key } = command.input;
    const body = Bucket && Key ? objects.get(`${Bucket}/${Key}`) : undefined;
    if (!body) throw new Error(`Integration S3 object not found: ${Bucket}/${Key}`);
    return { Body: { transformToByteArray: async () => body } } as never;
  }

  if (command instanceof DeleteObjectCommand) {
    const { Bucket, Key } = command.input;
    if (Bucket && Key) objects.delete(`${Bucket}/${Key}`);
    return {} as never;
  }

  if (command instanceof DeleteObjectsCommand) {
    const { Bucket, Delete } = command.input;
    for (const item of Delete?.Objects ?? []) {
      if (Bucket && item.Key) objects.delete(`${Bucket}/${item.Key}`);
    }
    return {} as never;
  }

  if (command instanceof ListObjectsV2Command) {
    const { Bucket, Prefix = '' } = command.input;
    const prefix = Bucket ? `${Bucket}/${Prefix}` : '';
    return {
      Contents: [...objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ Key: key.slice(`${Bucket}/`.length) })),
      IsTruncated: false,
    } as never;
  }

  throw new Error(`Integration S3 mock does not support ${command.constructor.name}`);
});
