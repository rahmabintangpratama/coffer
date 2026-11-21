// One worked example per provider preset in design/providers.json: the field
// values a person would enter and the connection they must produce. The tests
// check the engine against these, and `pnpm demo:presets` prints them. All
// keys are made up. Where a provider's real behavior is not known (Storj's
// region, IDrive e2's region), the case says what the engine does, not what
// the provider does; those rows belong in the compatibility matrix.
export interface PresetCase {
  id: string;
  label: string;
  values: Record<string, string>;
  bucket?: string;
  expected: {
    endpoint: string;
    region: string;
    forcePathStyle: boolean;
    bucket?: string;
  };
}

const keys = { accessKeyId: "AKIAEXAMPLEKEY", secretAccessKey: "example-secret-key" };
const accountId = "0123456789abcdef0123456789abcdef";

export const presetCases: PresetCase[] = [
  {
    id: "aws-s3",
    label: "Amazon S3",
    values: { region: "eu-central-1", ...keys },
    bucket: "my-bucket",
    expected: { endpoint: "https://s3.eu-central-1.amazonaws.com", region: "eu-central-1", forcePathStyle: false, bucket: "my-bucket" },
  },
  {
    id: "cloudflare-r2",
    label: "Cloudflare R2",
    values: { accountId, jurisdiction: "default", ...keys },
    bucket: "files",
    expected: { endpoint: `https://${accountId}.r2.cloudflarestorage.com`, region: "auto", forcePathStyle: false, bucket: "files" },
  },
  {
    id: "cloudflare-r2",
    label: "Cloudflare R2 (EU jurisdiction)",
    values: { accountId, jurisdiction: "eu", ...keys },
    expected: { endpoint: `https://${accountId}.eu.r2.cloudflarestorage.com`, region: "auto", forcePathStyle: false },
  },
  {
    id: "cloudflare-r2",
    label: "Cloudflare R2 (FedRAMP jurisdiction)",
    values: { accountId, jurisdiction: "fedramp", ...keys },
    expected: { endpoint: `https://${accountId}.fedramp.r2.cloudflarestorage.com`, region: "auto", forcePathStyle: false },
  },
  {
    id: "backblaze-b2",
    label: "Backblaze B2",
    values: { region: "eu-central-003", ...keys },
    expected: { endpoint: "https://s3.eu-central-003.backblazeb2.com", region: "eu-central-003", forcePathStyle: false },
  },
  {
    id: "wasabi",
    label: "Wasabi",
    values: { region: "us-east-2", ...keys },
    expected: { endpoint: "https://s3.us-east-2.wasabisys.com", region: "us-east-2", forcePathStyle: false },
  },
  {
    id: "digitalocean-spaces",
    label: "DigitalOcean Spaces",
    values: { datacenter: "nyc3", ...keys },
    expected: { endpoint: "https://nyc3.digitaloceanspaces.com", region: "us-east-1", forcePathStyle: false },
  },
  {
    id: "akamai-linode",
    label: "Akamai (Linode)",
    values: { cluster: "us-ord-10", ...keys },
    expected: { endpoint: "https://us-ord-10.linodeobjects.com", region: "us-ord-10", forcePathStyle: false },
  },
  {
    id: "vultr",
    label: "Vultr",
    values: { location: "ewr1", ...keys },
    expected: { endpoint: "https://ewr1.vultrobjects.com", region: "ewr1", forcePathStyle: false },
  },
  {
    id: "hetzner",
    label: "Hetzner",
    values: { location: "fsn1", ...keys },
    expected: { endpoint: "https://fsn1.your-objectstorage.com", region: "fsn1", forcePathStyle: false },
  },
  {
    id: "scaleway",
    label: "Scaleway",
    values: { region: "fr-par", ...keys },
    expected: { endpoint: "https://s3.fr-par.scw.cloud", region: "fr-par", forcePathStyle: false },
  },
  {
    id: "google-gcs",
    label: "Google Cloud Storage",
    values: { ...keys },
    expected: { endpoint: "https://storage.googleapis.com", region: "auto", forcePathStyle: false },
  },
  {
    id: "ibm-cos",
    label: "IBM Cloud Object Storage",
    values: { region: "us-south", ...keys },
    expected: { endpoint: "https://s3.us-south.cloud-object-storage.appdomain.cloud", region: "us-south", forcePathStyle: false },
  },
  {
    id: "oracle-oci",
    label: "Oracle OCI",
    values: { namespace: "axaxnpcrorw5", region: "eu-frankfurt-1", ...keys },
    expected: {
      endpoint: "https://axaxnpcrorw5.compat.objectstorage.eu-frankfurt-1.oraclecloud.com",
      region: "eu-frankfurt-1",
      forcePathStyle: true,
    },
  },
  {
    id: "tencent-cos",
    label: "Tencent COS",
    values: {
      appId: "1250000000",
      region: "ap-guangzhou",
      accessKeyId: "tencent-example-id-00000000000000000",
      secretAccessKey: "abcdefghijklmnopqrstuvwxyz012345",
    },
    bucket: "photos",
    expected: { endpoint: "https://cos.ap-guangzhou.myqcloud.com", region: "ap-guangzhou", forcePathStyle: false, bucket: "photos-1250000000" },
  },
  {
    id: "alibaba-oss",
    label: "Alibaba OSS",
    values: { region: "cn-hangzhou", ...keys },
    expected: { endpoint: "https://s3.oss-cn-hangzhou.aliyuncs.com", region: "cn-hangzhou", forcePathStyle: false },
  },
  {
    id: "huawei-obs",
    label: "Huawei OBS",
    values: { region: "cn-north-4", ...keys },
    expected: { endpoint: "https://obs.cn-north-4.myhuaweicloud.com", region: "cn-north-4", forcePathStyle: false },
  },
  {
    id: "minio",
    label: "MinIO",
    values: { endpoint: "http://localhost:9000", ...keys },
    bucket: "data",
    expected: { endpoint: "http://localhost:9000", region: "us-east-1", forcePathStyle: true, bucket: "data" },
  },
  {
    id: "supabase",
    label: "Supabase Storage (S3 keys)",
    values: { projectRef: "abcdefghijklmnopqrst", region: "eu-central-1", authMode: "keys", ...keys },
    expected: {
      endpoint: "https://abcdefghijklmnopqrst.storage.supabase.co/storage/v1/s3",
      region: "eu-central-1",
      forcePathStyle: true,
    },
  },
  {
    id: "storj",
    label: "Storj",
    values: { ...keys },
    expected: { endpoint: "https://gateway.storjshare.io", region: "us-east-1", forcePathStyle: true },
  },
  {
    id: "tigris",
    label: "Tigris",
    values: { accessKeyId: "tid_examplekey", secretAccessKey: "tsec_examplesecret" },
    expected: { endpoint: "https://t3.storage.dev", region: "auto", forcePathStyle: false },
  },
  {
    id: "idrive-e2",
    label: "IDrive e2 (region read from the host)",
    values: { endpoint: "https://s3.eu-west-1.idrivee2.com", ...keys },
    expected: { endpoint: "https://s3.eu-west-1.idrivee2.com", region: "eu-west-1", forcePathStyle: false },
  },
  {
    id: "custom",
    label: "Other S3-compatible (https host)",
    values: { endpoint: "https://s3.example.com", ...keys },
    bucket: "data",
    expected: { endpoint: "https://s3.example.com", region: "us-east-1", forcePathStyle: false, bucket: "data" },
  },
];
