import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

/**
 * MinIO-backed object storage for report files.
 *
 * Download URLs: presigned GET URLs valid for 7 days (the bucket is private).
 * This is preferred over path-style URLs since the bucket is not public.
 * For local dev MinIO the presigned URL will point to localhost:9000.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private bucketEnsured = false;

  constructor() {
    this.endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
    this.bucket = process.env.S3_BUCKET ?? 'kpi-nexus-local';

    this.client = new S3Client({
      endpoint: this.endpoint,
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
        secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
      },
      // REQUIRED for MinIO: without this, the SDK uses virtual-hosted-style
      // which doesn't work with local MinIO endpoints.
      forcePathStyle: true,
    });
  }

  /**
   * Ensure the bucket exists (creates it if not). Idempotent — a race where
   * two callers both do HeadBucket → NotFound → CreateBucket is handled by
   * swallowing the BucketAlreadyExists / BucketAlreadyOwnedByYou errors.
   */
  private async ensureBucket(): Promise<void> {
    if (this.bucketEnsured) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.bucketEnsured = true;
    } catch (err: unknown) {
      // HeadBucket returns 404 / NotFound when the bucket doesn't exist.
      const code = (err as { name?: string })?.name;
      if (code === 'NotFound' || code === 'NoSuchBucket' || code === '404') {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.logger.log(`Created S3 bucket: ${this.bucket}`);
          this.bucketEnsured = true;
        } catch (createErr: unknown) {
          const createCode = (createErr as { name?: string })?.name;
          if (
            createCode === 'BucketAlreadyExists' ||
            createCode === 'BucketAlreadyOwnedByYou'
          ) {
            // Race — another process created it first. Fine.
            this.bucketEnsured = true;
          } else {
            throw createErr;
          }
        }
      } else {
        throw err;
      }
    }
  }

  /**
   * Upload a file to S3/MinIO.
   * @returns The object key (relative path in the bucket).
   */
  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.ensureBucket();
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    this.logger.log(`Uploaded to S3: ${this.bucket}/${key}`);
    return key;
  }

  /**
   * Get a presigned GET URL for the object, valid for 7 days.
   * The URL points to the MinIO endpoint configured via S3_ENDPOINT.
   */
  async getDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: SEVEN_DAYS_SECONDS,
    });
    return url;
  }
}
