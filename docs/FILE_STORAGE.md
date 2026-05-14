# File Storage Architecture

## Overview

All user-uploaded files are stored in **AWS S3** using the shared bucket `sige-backups`.
The storage module (`server/storage.ts`) provides three functions that all backend routers use:

| Function | Purpose |
|---|---|
| `storagePut(key, data, contentType)` | Upload a file, returns `{ key, url }` |
| `storageGet(key)` | Get a fresh presigned download URL for an existing file |
| `storageDelete(key)` | Delete a file from S3 |

## S3 Bucket Layout

```
sige-backups/
├── backups/                          ← DB backups (cron en droplet → scripts/backup-cron.sh)
│   └── sige-backup-YYYY-MM-DD.sql.gz
└── uploads/                          ← App files (managed by storage.ts)
    ├── documents/{companyId}/        ← Policy, values, objectives docs
    ├── procedures/{userId}/          ← Procedure record files
    ├── orgchart/{chartId}/           ← Organization chart PDFs
    └── generated/                    ← AI-generated images
```

The `uploads/` prefix is added automatically by `storage.ts` — callers pass relative keys
like `documents/1/abc.pdf` and the module prepends `uploads/`.

## Presigned URLs

S3 objects are **private**. Access is via presigned URLs that expire after **1 hour**.

**Important**: The presigned URL returned by `storagePut` is stored in the DB for reference,
but it will expire. Any query endpoint that returns file URLs to the frontend **must**
regenerate them using `storageGet(fileKey)`. This is already implemented in:

- `organizationChart.getFiles` — refreshes org chart PDF URLs
- `documents.getByCompanyAndType` — refreshes document URLs
- `procedures.getById` — refreshes procedure record file URLs

For ephemeral responses (like `imageGeneration`), the URL is used immediately by the client
so the 1h expiry is fine without refresh logic.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_ACCESS_KEY_ID` | Yes | — | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | — | IAM secret key |
| `AWS_S3_BUCKET` | No | `sige-backups` | Bucket name |
| `AWS_S3_REGION` | No | `us-east-2` | Bucket region |

These are the same credentials used by the backup system. El usuario IAM debe tener permisos mínimos necesarios (por ejemplo `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`) sobre el bucket y prefijos usados (`backups/`, `uploads/`).

## Upload Flow (Frontend → S3)

All uploads go through tRPC mutations (no multipart, no presigned upload URLs):

```
Frontend                          Backend                         S3
   │                                │                              │
   │  Read file as ArrayBuffer      │                              │
   │  Convert to Array<number>      │                              │
   │  Call tRPC mutation ──────────►│                              │
   │                                │  Buffer.from(array)          │
   │                                │  storagePut(key, buf, type)──►│
   │                                │                              │  PutObject
   │                                │◄── { key, url } ────────────│
   │                                │  Save key+url to DB          │
   │◄── success ────────────────────│                              │
```

Files are sent as JSON payloads (number arrays or base64 strings). The Express body limit
is set to 50MB in `server/_core/index.ts`.

### Upload Patterns by Component

| Component | Encoding | Backend Route | File Types |
|---|---|---|---|
| `DocumentManager.tsx` | `Array.from(Uint8Array)` | `documents.uploadPolicyDocument` | PDF, DOC, DOCX |
| `OrganizationChartUpload.tsx` | `Array.from(Uint8Array)` | `organizationChart.uploadPDF` | PDF |
| `ProceduresCharacterization.tsx` | Base64 string | `procedures.uploadFile` | Any |
| `ProcessMap.tsx` | localStorage (no S3) | — | Images |

## Deletion

When deleting records that have files, the backend:
1. Reads the `fileKey` from the DB row
2. Calls `storageDelete(fileKey)` to remove from S3 (non-fatal on failure)
3. Deletes the DB row

This is implemented in:
- `organizationChart.deletePDF`
- `organizationChart.uploadPDF` (replaces previous file)
- `documents.delete`
- `procedures.delete` (cascades to record files)
- `procedures.deleteRecord`

## Known Limitations

- **No multipart upload**: Files are serialized as JSON, adding ~33% overhead for base64
  and increasing memory usage. Fine for documents under 50MB but not ideal for large files.
- **ProcessMap images use localStorage**: Limited to ~5-10MB per origin. Should be migrated
  to S3 in a future iteration.
- **No upload progress indicator**: The tRPC mutation is all-or-nothing; there's no
  streaming progress feedback to the user.
