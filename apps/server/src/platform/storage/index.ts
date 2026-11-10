// Object storage adapter (S3 API): MinIO locally, Cloudflare R2 later (ADR-0009). Only the photo
// pipeline (modules/photos) writes objects, after re-encoding them (ADR-0007); there are no
// presigned PUTs. Reads go through the API so every view is permission-checked.
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from '../config';

export type Storage = {
  healthCheck(): Promise<boolean>;
  signedGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** The object's bytes, or null when it doesn't exist. */
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
};

export function createStorage(config: Config['storage']): Storage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  return {
    async healthCheck() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
        return true;
      } catch {
        return false;
      }
    },
    signedGetUrl(key, expiresInSeconds = 300) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
        expiresIn: expiresInSeconds,
      });
    },
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        return res.Body ? await res.Body.transformToByteArray() : null;
      } catch (err) {
        if (err instanceof Error && (err.name === 'NoSuchKey' || err.name === 'NotFound'))
          return null;
        throw err;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
