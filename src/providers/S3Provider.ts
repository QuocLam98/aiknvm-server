import { defineProvider } from './Application'
import ConfigProvider from './ConfigProvider'
import { S3Client } from "bun";

export default defineProvider([
  ConfigProvider,
], async (context) => {
  
  const client = new S3Client({
    accessKeyId: context.service.config.ACCESSKEYID,
    secretAccessKey: context.service.config.SECRETACCESSKEY,
    bucket: context.service.config.BUCKET,
    endpoint: context.service.config.ENDPOINT
    // sessionToken: "..."
    // acl: "public-read",
    // endpoint: "https://s3.us-east-1.amazonaws.com",
    // endpoint: "https://<account-id>.r2.cloudflarestorage.com", // Cloudflare R2
    // endpoint: "https://<region>.digitaloceanspaces.com", // DigitalOcean Spaces
    // endpoint: "http://localhost:9000", // MinIO
  });

  const getUrl = context.service.config.ENDPOINT + "/" + context.service.config.BUCKET + "/"

  return { client, getUrl }
})