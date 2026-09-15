import test from "node:test";
import assert from "node:assert/strict";
import {
  approvedProofForCampaign,
  nextProofVersion,
  proofValues,
} from "../app/lib/proof-workflow.server.js";

test("next proof version is isolated by campaign", () => {
  const proofs = [
    { campaign_id: "a", version_number: "2" },
    { campaign_id: "b", version_number: "9" },
  ];
  assert.equal(nextProofVersion(proofs, "a"), 3);
  assert.equal(nextProofVersion(proofs, "c"), 1);
});

test("latest approved proof becomes the production snapshot", () => {
  const proofs = [
    { id: "one", campaign_id: "a", status: "approved", version_number: "1" },
    {
      id: "two",
      campaign_id: "a",
      status: "changes_requested",
      version_number: "2",
    },
    { id: "three", campaign_id: "a", status: "approved", version_number: "3" },
  ];
  assert.equal(approvedProofForCampaign(proofs, "a").id, "three");
});

test("proof updates preserve immutable file and version fields", () => {
  const values = proofValues(
    {
      proof_name: "V1",
      proof_id: "P-V1",
      organization_store_id: "org",
      campaign_id: "campaign",
      version_number: "1",
      status: "submitted",
      asset_file: "file",
      content_hash: "hash",
    },
    { status: "approved" },
  );
  assert.equal(values.status, "approved");
  assert.equal(values.asset_file, "file");
  assert.equal(values.version_number, "1");
});
