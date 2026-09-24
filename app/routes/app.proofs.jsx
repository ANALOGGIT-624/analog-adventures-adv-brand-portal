import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  PORTAL_TYPES,
  getPortalSnapshot,
  upsertMetaobject,
} from "../lib/brand-portal.server";
import {
  newProofHandle,
  nextProofVersion,
  updateProof,
} from "../lib/proof-workflow.server";
import { createPrivateArtworkStorage } from "../lib/private-artwork-storage.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const snapshot = await getPortalSnapshot(admin);
  return {
    organizations: snapshot.organizations,
    campaigns: snapshot.campaigns,
    proofs: snapshot.proofs,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const organizationId = String(form.get("organization_store_id") || "");
  const campaignId = String(form.get("campaign_id") || "");
  const file = form.get("proof_file");
  try {
    const snapshot = await getPortalSnapshot(admin);
    const campaign = snapshot.campaigns.find(({ id }) => id === campaignId);
    const organization = snapshot.organizations.find(
      ({ id }) => id === organizationId,
    );
    if (
      !campaign ||
      !organization ||
      campaign.organization_store !== organization.id
    ) {
      throw new Error(
        "Choose a campaign that belongs to the selected organization.",
      );
    }
    const version = nextProofVersion(snapshot.proofs, campaign.id);
    const uploaded = await createPrivateArtworkStorage().upload({
      shop: session.shop,
      file,
    });
    const previous = snapshot.proofs
      .filter((proof) => proof.campaign_id === campaign.id)
      .sort(
        (a, b) => Number(b.version_number || 0) - Number(a.version_number || 0),
      )[0];
    if (previous && String(previous.status).toLowerCase() !== "approved") {
      await updateProof(admin, previous, { status: "superseded" });
    }
    const handle = newProofHandle(campaign, version);
    const proof = await upsertMetaobject(admin, {
      type: PORTAL_TYPES.artworkProof,
      handle,
      values: {
        proof_name: `${campaign.campaign_name} – Version ${version}`,
        proof_id: `${campaign.handle}-V${version}`.toUpperCase(),
        organization_store_id: organization.id,
        campaign_id: campaign.id,
        version_number: version,
        status: "submitted",
        private_asset_id: uploaded.assetId,
        original_filename: file.name,
        mime_type: file.type,
        content_hash: uploaded.contentHash,
        staff_notes: String(form.get("staff_notes") || "").trim(),
        submitted_at: new Date().toISOString(),
        previous_version_id: previous?.id,
      },
    });
    return { ok: true, proof };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

function tone(status) {
  if (status === "approved") return "success";
  if (status === "changes_requested") return "warning";
  if (status === "superseded") return "neutral";
  return "info";
}

function selectedFile(event) {
  const target = event.currentTarget;
  const files = target?.files || event.target?.files || event.detail?.files;
  return files?.[0] || null;
}

export default function Proofs() {
  const { organizations, campaigns, proofs } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [proofFile, setProofFile] = useState(null);
  const [proofFileError, setProofFileError] = useState("");
  const [proofInputKey, setProofInputKey] = useState(0);
  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Proof uploaded for organizer review");
      setProofFile(null);
      setProofFileError("");
      setProofInputKey((current) => current + 1);
    }
  }, [fetcher.data, shopify]);
  return (
    <s-page
      heading="Artwork proofs"
      subheading="Upload immutable campaign revisions and track organizer approval."
    >
      <s-section heading="Submit a proof">
        {fetcher.data?.error && (
          <s-banner heading="Proof was not uploaded" tone="critical">
            {fetcher.data.error}
          </s-banner>
        )}
        <fetcher.Form method="post" encType="multipart/form-data">
          <s-stack direction="block" gap="base">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-select
                label="Organization store"
                name="organization_store_id"
                required
              >
                <s-option value="">Select a store</s-option>
                {organizations.map((item) => (
                  <s-option key={item.id} value={item.id}>
                    {item.store_name}
                  </s-option>
                ))}
              </s-select>
              <s-select label="Campaign" name="campaign_id" required>
                <s-option value="">Select a campaign</s-option>
                {campaigns.map((item) => (
                  <s-option key={item.id} value={item.id}>
                    {item.campaign_name}
                  </s-option>
                ))}
              </s-select>
            </s-grid>
            <s-drop-zone
              key={proofInputKey}
              name="proof_file"
              label="Proof file"
              accept=".pdf,.svg,.png,.jpg,.jpeg"
              error={proofFileError || undefined}
              onChange={(event) => {
                const file = selectedFile(event);
                setProofFile(file);
                setProofFileError(
                  file ? "" : "Choose a PDF, SVG, PNG, or JPEG proof.",
                );
              }}
              onDropRejected={() => {
                setProofFile(null);
                setProofFileError(
                  "Choose a PDF, SVG, PNG, or JPEG proof up to 20 MB.",
                );
              }}
              required
            />
            {proofFile && (
              <s-text color="subdued">Selected proof: {proofFile.name}</s-text>
            )}
            <s-text-area
              label="Notes for the organizer"
              name="staff_notes"
              rows={3}
              maxLength={2000}
            />
            <s-button
              type="submit"
              variant="primary"
              loading={fetcher.state !== "idle"}
            >
              Upload and request approval
            </s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>
      <s-section heading="Version history">
        {proofs.length === 0 ? (
          <s-paragraph>No proofs have been submitted.</s-paragraph>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Proof</s-table-header>
              <s-table-header>Campaign</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Organizer feedback</s-table-header>
              <s-table-header>File</s-table-header>
              <s-table-header>Submitted</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {[...proofs]
                .sort(
                  (a, b) => Number(b.version_number) - Number(a.version_number),
                )
                .map((proof) => {
                  const campaign = campaigns.find(
                    ({ id }) => id === proof.campaign_id,
                  );
                  return (
                    <s-table-row key={proof.id}>
                      <s-table-cell>{proof.proof_name}</s-table-cell>
                      <s-table-cell>
                        {campaign?.campaign_name || "Unknown"}
                      </s-table-cell>
                      <s-table-cell>
                        <s-badge tone={tone(proof.status)}>
                          {proof.status}
                        </s-badge>
                      </s-table-cell>
                      <s-table-cell>
                        {proof.organizer_notes || "—"}
                      </s-table-cell>
                      <s-table-cell>
                        {proof.asset_file_url ? (
                          <s-link href={proof.asset_file_url} target="_blank">
                            Open proof
                          </s-link>
                        ) : (
                          "Processing"
                        )}
                      </s-table-cell>
                      <s-table-cell>
                        {proof.submitted_at
                          ? new Date(proof.submitted_at).toLocaleString()
                          : "—"}
                      </s-table-cell>
                    </s-table-row>
                  );
                })}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
