import "server-only";

import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { config } from "@/lib/config";

/**
 * Thin S3 wrapper. Works with AWS S3 and S3-compatible stores (Backblaze B2,
 * Cloudflare R2, RustFS) — a custom endpoint enables path-style addressing.
 */

function makeClient(): S3Client {
  const hasEndpoint = config.backup.endpoint.length > 0;
  return new S3Client({
    region: config.backup.region,
    endpoint: hasEndpoint ? config.backup.endpoint : undefined,
    forcePathStyle: hasEndpoint,
    credentials: config.backup.accessKeyId
      ? {
          accessKeyId: config.backup.accessKeyId,
          secretAccessKey: config.backup.secretAccessKey,
        }
      : undefined,
  });
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType?: string,
): Promise<void> {
  const client = makeClient();
  await client.send(
    new PutObjectCommand({
      Bucket: config.backup.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** All object keys under a prefix (handles pagination). */
export async function listKeys(prefix: string): Promise<Set<string>> {
  const client = makeClient();
  const keys = new Set<string>();
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: config.backup.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key) keys.add(obj.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export async function getObject(key: string): Promise<Buffer> {
  const client = makeClient();
  const res = await client.send(
    new GetObjectCommand({ Bucket: config.backup.bucket, Key: key }),
  );
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}
