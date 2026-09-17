import { useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import {
  PORTAL_TYPES,
  slugify,
  upsertMetaobject,
} from "../lib/brand-portal.server";
import { getCampaignReportData } from "../lib/campaign-report.server";
import {
  buildProductionQueues,
  createProductionBatchValues,
  updateProductionBatchValues,
} from "../lib/production-batches.server";

async function fulfillmentData(admin) {
  const { snapshot, reconciliations } = await getCampaignReportData(admin);
  return {
    batches: snapshot.productionBatches,
    queues: buildProductionQueues(reconciliations, snapshot.productionBatches),
  };
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return fulfillmentData(admin);
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  try {
    const { batches, queues } = await fulfillmentData(admin);

    if (intent === "create_batch") {
      const campaignId = String(formData.get("campaign_id") || "");
      const queue = queues.find(({ campaign }) => campaign.id === campaignId);
      const values = createProductionBatchValues(
        queue,
        formData.get("internal_notes"),
      );
      const batch = await upsertMetaobject(admin, {
        type: PORTAL_TYPES.productionBatch,
        handle: slugify(values.batch_id),
        values,
      });
      return {
        ok: true,
        intent,
        batch,
        message: `${values.batch_name} created`,
      };
    }

    if (intent === "update_batch") {
      const batchId = String(formData.get("batch_record_id") || "");
      const batch = batches.find(({ id }) => id === batchId);
      if (!batch)
        throw new Error("The selected production batch was not found.");
      const values = updateProductionBatchValues(
        batch,
        formData.get("status"),
        formData.get("internal_notes"),
      );
      const updatedBatch = await upsertMetaobject(admin, {
        type: PORTAL_TYPES.productionBatch,
        handle: batch.handle,
        values,
      });
      return {
        ok: true,
        intent,
        batch: updatedBatch,
        message: `${batch.batch_name} moved to ${values.status.replaceAll("_", " ")}`,
      };
    }

    return { ok: false, error: "Choose a valid fulfillment action." };
  } catch (error) {
    return { ok: false, error: error.message, intent };
  }
};

function label(value) {
  return String(value || "").replaceAll("_", " ");
}

function displayBatchLines(batch) {
  try {
    const parsed = JSON.parse(batch?.line_items || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function nextStatuses(status) {
  switch (String(status).toLowerCase()) {
    case "queued":
      return ["in_production", "cancelled"];
    case "in_production":
      return ["ready_to_ship", "cancelled"];
    case "ready_to_ship":
      return ["completed", "in_production", "cancelled"];
    default:
      return [];
  }
}

export default function Fulfillment() {
  const { batches, queues } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const busy = fetcher.state !== "idle";
  const eligibleQueues = queues.filter(
    ({ blocked, outstandingUnits }) => !blocked && outstandingUnits > 0,
  );

  useEffect(() => {
    if (fetcher.data?.ok) shopify.toast.show(fetcher.data.message);
  }, [fetcher.data, shopify]);

  return (
    <s-page
      heading="Fulfillment and production"
      subheading="Group server-verified, unfulfilled campaign items into auditable production batches."
    >
      {fetcher.data?.error && (
        <s-banner heading="Batch action failed" tone="critical">
          {fetcher.data.error}
        </s-banner>
      )}

      <s-section heading="Outstanding production by campaign">
        {queues.length === 0 ? (
          <s-banner heading="No campaign production found" tone="info">
            Attributed order lines will appear here after orders are placed.
          </s-banner>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Campaign</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Fulfillment</s-table-header>
              <s-table-header>Orders</s-table-header>
              <s-table-header>Unbatched units</s-table-header>
              <s-table-header>Readiness</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {queues.map((queue) => (
                <s-table-row key={queue.campaign.id}>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-200">
                      <s-text type="strong">
                        {queue.campaign.campaign_name}
                      </s-text>
                      <s-text color="subdued">
                        {queue.campaign.campaign_id}
                      </s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>{label(queue.campaign.status)}</s-table-cell>
                  <s-table-cell>
                    {label(queue.campaign.fulfillment_mode)}
                  </s-table-cell>
                  <s-table-cell>{queue.orderCount}</s-table-cell>
                  <s-table-cell>{queue.outstandingUnits}</s-table-cell>
                  <s-table-cell>
                    {queue.blocked
                      ? "Waiting for campaign close"
                      : queue.outstandingUnits
                        ? "Ready to batch"
                        : "Nothing unbatched"}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Create production batch">
        <s-paragraph>
          A batch snapshots current unfulfilled quantities, customization, SKU,
          and approved proof references. Existing non-cancelled batches reserve
          their quantities so the same units cannot be batched twice.
        </s-paragraph>
        {eligibleQueues.length === 0 ? (
          <s-banner heading="No campaigns are ready to batch" tone="info">
            Close campaigns configured for after-close production, or wait for
            new attributed and unfulfilled orders.
          </s-banner>
        ) : (
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="create_batch" />
            <s-stack direction="block" gap="base">
              <s-select label="Campaign" name="campaign_id" required>
                <s-option value="">Select a campaign</s-option>
                {eligibleQueues.map((queue) => (
                  <s-option key={queue.campaign.id} value={queue.campaign.id}>
                    {queue.campaign.campaign_name} ({queue.outstandingUnits}{" "}
                    units)
                  </s-option>
                ))}
              </s-select>
              <s-text-area
                label="Internal production notes"
                name="internal_notes"
                placeholder="Material, machine, packing, or handoff notes"
              />
              <s-button type="submit" variant="primary" loading={busy}>
                Create batch snapshot
              </s-button>
            </s-stack>
          </fetcher.Form>
        )}
      </s-section>

      <s-section heading="Production batches">
        {batches.length === 0 ? (
          <s-paragraph>No production batches have been created.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {batches.map((batch) => {
              const transitions = nextStatuses(batch.status);
              const lines = displayBatchLines(batch);
              return (
                <s-box
                  key={batch.id}
                  border="base"
                  padding="base"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="base">
                    <s-grid gridTemplateColumns="2fr 1fr 1fr 1fr" gap="base">
                      <s-stack direction="block" gap="small-200">
                        <s-text type="strong">{batch.batch_name}</s-text>
                        <s-text color="subdued">{batch.batch_id}</s-text>
                      </s-stack>
                      <s-text>{label(batch.status)}</s-text>
                      <s-text>{batch.order_count} orders</s-text>
                      <s-text>{batch.unit_count} units</s-text>
                    </s-grid>
                    <s-text color="subdued">
                      {label(batch.fulfillment_mode)} · {lines.length}{" "}
                      production lines · created{" "}
                      {new Date(batch.created_at).toLocaleString()}
                    </s-text>
                    {batch.internal_notes && (
                      <s-paragraph>{batch.internal_notes}</s-paragraph>
                    )}
                    {transitions.length > 0 ? (
                      <fetcher.Form method="post">
                        <input
                          type="hidden"
                          name="intent"
                          value="update_batch"
                        />
                        <input
                          type="hidden"
                          name="batch_record_id"
                          value={batch.id}
                        />
                        <s-grid gridTemplateColumns="1fr 2fr auto" gap="base">
                          <s-select label="Next status" name="status" required>
                            <s-option value="">Choose status</s-option>
                            {transitions.map((status) => (
                              <s-option key={status} value={status}>
                                {label(status)}
                              </s-option>
                            ))}
                          </s-select>
                          <s-text-field
                            label="Internal notes"
                            name="internal_notes"
                            value={batch.internal_notes || ""}
                          />
                          <s-button type="submit" loading={busy}>
                            Update
                          </s-button>
                        </s-grid>
                      </fetcher.Form>
                    ) : (
                      <s-text color="subdued">
                        This {label(batch.status)} batch is locked.
                      </s-text>
                    )}
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Operational safeguards">
        <s-unordered-list>
          <s-list-item>
            Batch status does not mark Shopify orders fulfilled; staff must
            complete shipping or pickup fulfillment in Shopify.
          </s-list-item>
          <s-list-item>
            Refunded, cancelled, already fulfilled, and already batched units
            are excluded from new batches.
          </s-list-item>
          <s-list-item>
            Completed and cancelled batches are locked to preserve the audit
            trail.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
