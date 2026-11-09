// Object storage adapter (S3 API): MinIO locally, Cloudflare R2 later (ADR-0009). Phase 0 needs
// only a health check and short-lived signed GET URLs; uploads go through the server-side photo
// pipeline in phase 1 (ADR-0007), never through presigned PUTs.
import { GetObjectCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from '../config';

export type Storage = {
  healthCheck(): Promise<boolean>;
  signedGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
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
  };
}
