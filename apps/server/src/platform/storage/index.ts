// Object storage adapter (S3 API): MinIO locally, Cloudflare R2 later (ADR-0009), or Postgres
// (STORAGE_DRIVER=database) on hosts without a bucket. Only the photo pipeline (modules/photos)
// writes objects, after re-encoding them (ADR-0007); there are no presigned PUTs. Reads go through
// the API so every view is permission-checked.
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, eq, sql } from 'drizzle-orm';
import type { Config } from '../config';
import { drizzleOf } from '../db/pool';
import type { DatabaseHandle } from '../db/types';
import { storedObjects } from './schema';

export type Storage = {
  healthCheck(): Promise<boolean>;
  signedGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** The object's bytes, or null when it doesn't exist. */
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
};

export function createStorage(config: Config['storage'], db: DatabaseHandle): Storage {
  return config.driver === 'database' ? createDatabaseStorage(db) : createS3Storage(config);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Splits "<tenant id>/rest" so every row is keyed tenant first, like every other table. */
function tenantOf(key: string): string {
  const tenantId = key.slice(0, key.indexOf('/'));
  if (!UUID.test(tenantId)) throw new Error(`Storage keys start with a tenant id; got "${key}".`);
  return tenantId;
}

export function createDatabaseStorage(db: DatabaseHandle): Storage {
  const orm = () => drizzleOf(db);
  const byKey = (key: string) =>
    and(eq(storedObjects.tenantId, tenantOf(key)), eq(storedObjects.key, key));
  return {
    async healthCheck() {
      try {
        await orm().execute(sql`select 1 from ${storedObjects} limit 1`);
        return true;
      } catch {
        return false;
      }
    },
    signedGetUrl() {
      return Promise.reject(
        new Error('The database storage driver has no signed URLs; read through the API.'),
      );
    },
    async put(key, body, contentType) {
      const row = { tenantId: tenantOf(key), key, contentType, body: Buffer.from(body) };
      await orm()
        .insert(storedObjects)
        .values(row)
        .onConflictDoUpdate({
          target: [storedObjects.tenantId, storedObjects.key],
          set: { contentType, body: row.body },
        });
    },
    async get(key) {
      const [row] = await orm()
        .select({ body: storedObjects.body })
        .from(storedObjects)
        .where(byKey(key))
        .limit(1);
      return row ? new Uint8Array(row.body) : null;
    },
    async delete(key) {
      await orm().delete(storedObjects).where(byKey(key));
    },
  };
}

function createS3Storage(config: Extract<Config['storage'], { driver: 's3' }>): Storage {
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
