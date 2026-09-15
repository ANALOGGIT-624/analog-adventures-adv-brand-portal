import { createHash } from "node:crypto";
import {
  PORTAL_TYPES,
  slugify,
  upsertMetaobject,
} from "./brand-portal.server.js";

export const MAX_PROOF_BYTES = 20 * 1024 * 1024;
export const ALLOWED_PROOF_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "application/pdf",
]);

export function approvedProofForCampaign(proofs, campaignId) {
  return (proofs || [])
    .filter(
      (proof) =>
        proof.campaign_id === campaignId &&
        String(proof.status).toLowerCase() === "approved",
    )
    .sort(
      (a, b) => Number(b.version_number || 0) - Number(a.version_number || 0),
    )[0];
}

export function nextProofVersion(proofs, campaignId) {
  return (
    Math.max(
      0,
      ...(proofs || [])
        .filter((proof) => proof.campaign_id === campaignId)
        .map((proof) => Number(proof.version_number || 0)),
    ) + 1
  );
}

export function proofValues(proof, overrides = {}) {
  const keys = [
    "proof_name",
    "proof_id",
    "organization_store_id",
    "campaign_id",
    "version_number",
    "status",
    "asset_file",
    "original_filename",
    "mime_type",
    "content_hash",
    "staff_notes",
    "organizer_notes",
    "submitted_at",
    "reviewed_at",
    "reviewed_by_customer_id",
    "previous_version_id",
  ];
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = overrides[key] ?? proof[key];
      return value === undefined || value === null || value === ""
        ? []
        : [[key, value]];
    }),
  );
}

export function validateProofFile(file) {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a proof file to upload.");
  }
  if (!ALLOWED_PROOF_TYPES.has(file.type)) {
    throw new Error("Upload a PDF, SVG, PNG, or JPEG proof.");
  }
  if (file.size > MAX_PROOF_BYTES) {
    throw new Error("Proof files must be 20 MB or smaller.");
  }
}

async function graphql(admin, query, variables) {
  const response = await admin.graphql(query, { variables });
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map(({ message }) => message).join("; "));
  }
  return payload.data;
}

export async function uploadProofFile(admin, file) {
  validateProofFile(file);
  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  const staged = await graphql(
    admin,
    `
      #graphql
      mutation StageProof($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      input: [
        {
          resource: "FILE",
          filename: file.name,
          mimeType: file.type,
          fileSize: String(file.size),
          httpMethod: "POST",
        },
      ],
    },
  );
  const stagedResult = staged.stagedUploadsCreate;
  if (stagedResult.userErrors.length) {
    throw new Error(
      stagedResult.userErrors.map(({ message }) => message).join("; "),
    );
  }
  const target = stagedResult.stagedTargets[0];
  const upload = new FormData();
  target.parameters.forEach(({ name, value }) => upload.append(name, value));
  upload.append("file", new Blob([bytes], { type: file.type }), file.name);
  const uploadResponse = await fetch(target.url, {
    method: "POST",
    body: upload,
  });
  if (!uploadResponse.ok)
    throw new Error("Shopify rejected the staged proof upload.");

  const created = await graphql(
    admin,
    `
      #graphql
      mutation CreateProofFile($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            id
            fileStatus
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      files: [
        {
          originalSource: target.resourceUrl,
          contentType: "FILE",
          filename: file.name,
        },
      ],
    },
  );
  if (created.fileCreate.userErrors.length) {
    throw new Error(
      created.fileCreate.userErrors.map(({ message }) => message).join("; "),
    );
  }
  const stored = created.fileCreate.files[0];
  if (!stored?.id)
    throw new Error("Shopify did not return the uploaded proof file.");
  return { fileId: stored.id, hash };
}

export async function updateProof(admin, proof, overrides) {
  return upsertMetaobject(admin, {
    type: PORTAL_TYPES.artworkProof,
    handle: proof.handle,
    values: proofValues(proof, overrides),
  });
}

export function newProofHandle(campaign, version) {
  return slugify(`${campaign.handle}-proof-v${version}-${Date.now()}`);
}
