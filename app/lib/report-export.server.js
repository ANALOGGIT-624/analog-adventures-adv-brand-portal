function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvDocument(columns, rows) {
  const header = columns.map(({ label }) => csvCell(label)).join(",");
  const body = rows.map((row) =>
    columns.map(({ key }) => csvCell(row[key])).join(","),
  );
  return [header, ...body].join("\r\n") + "\r\n";
}

function money(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

export function salesReport(reconciliation) {
  const columns = [
    ["campaignId", "Campaign ID"],
    ["campaignName", "Campaign"],
    ["order", "Order"],
    ["createdAt", "Created at"],
    ["orderedUnits", "Ordered units"],
    ["refundedUnits", "Refunded units"],
    ["eligibleUnits", "Eligible units"],
    ["grossRevenue", "Gross revenue"],
    ["refunds", "Refunds"],
    ["calculatedProceeds", "Calculated proceeds"],
    ["currency", "Currency"],
  ].map(([key, label]) => ({ key, label }));
  const rows = reconciliation.orders.map((order) => ({
    campaignId: reconciliation.campaign.campaign_id,
    campaignName: reconciliation.campaign.campaign_name,
    order: order.name,
    createdAt: order.createdAt,
    orderedUnits: order.units,
    refundedUnits: order.refundedUnits,
    eligibleUnits: order.eligibleUnits,
    grossRevenue: money(order.grossRevenueCents),
    refunds: money(order.refundsCents),
    calculatedProceeds: money(order.proceedsCents),
    currency: reconciliation.currency,
  }));
  return { columns, rows };
}

export function productionReport(reconciliation) {
  const columns = [
    ["campaignId", "Campaign ID"],
    ["campaignName", "Campaign"],
    ["fulfillmentMode", "Fulfillment mode"],
    ["productionAfterClose", "Production after close"],
    ["order", "Order"],
    ["orderCreatedAt", "Order created at"],
    ["item", "Item"],
    ["variant", "Variant"],
    ["sku", "SKU"],
    ["personalization", "Personalization"],
    ["orderedUnits", "Ordered units"],
    ["currentUnits", "Current units"],
    ["outstandingUnits", "Outstanding units"],
    ["fulfillmentState", "Fulfillment state"],
    ["proofVersion", "Approved proof version"],
    ["proofId", "Approved proof ID"],
    ["proofHash", "Approved proof SHA-256"],
  ].map(([key, label]) => ({ key, label }));
  const rows = reconciliation.orders.flatMap((order) =>
    order.lines.map((line) => ({
      campaignId: reconciliation.campaign.campaign_id,
      campaignName: reconciliation.campaign.campaign_name,
      fulfillmentMode: reconciliation.campaign.fulfillment_mode,
      productionAfterClose:
        String(reconciliation.campaign.production_after_close) === "true"
          ? "Yes"
          : "No",
      order: order.name,
      orderCreatedAt: order.createdAt,
      item: line.itemName,
      variant: line.variantTitle,
      sku: line.sku,
      personalization: line.customization,
      orderedUnits: line.orderedUnits,
      currentUnits: line.currentUnits,
      outstandingUnits: line.unfulfilledUnits,
      fulfillmentState: line.fulfillmentState,
      proofVersion: line.proofVersion,
      proofId: line.proofId,
      proofHash: line.proofContentHash,
    })),
  );
  return { columns, rows };
}

export function payoutReport(reconciliation, statement) {
  const columns = [
    ["statementId", "Statement ID"],
    ["campaignId", "Campaign ID"],
    ["campaignName", "Campaign"],
    ["status", "Statement status"],
    ["periodStart", "Period start"],
    ["periodEnd", "Period end"],
    ["orders", "Orders"],
    ["eligibleUnits", "Eligible units"],
    ["reconciledGross", "Reconciled gross revenue"],
    ["reconciledRefunds", "Reconciled refunds"],
    ["reconciledProceeds", "Reconciled proceeds"],
    ["savedDeductions", "Saved deductions"],
    ["savedOrganizationProceeds", "Saved organization proceeds"],
    ["currency", "Currency"],
    ["paidAt", "Paid at"],
  ].map(([key, label]) => ({ key, label }));
  const rows = [
    {
      statementId: statement?.statement_id || "Not reconciled",
      campaignId: reconciliation.campaign.campaign_id,
      campaignName: reconciliation.campaign.campaign_name,
      status: statement?.status || "none",
      periodStart: statement?.period_start || "",
      periodEnd: statement?.period_end || "",
      orders: reconciliation.orderCount,
      eligibleUnits: reconciliation.eligibleUnits,
      reconciledGross: money(reconciliation.grossRevenueCents),
      reconciledRefunds: money(reconciliation.refundsCents),
      reconciledProceeds: money(reconciliation.proceedsCents),
      savedDeductions: Number(statement?.deductions || 0).toFixed(2),
      savedOrganizationProceeds: Number(
        statement?.organization_proceeds || 0,
      ).toFixed(2),
      currency: statement?.currency || reconciliation.currency,
      paidAt: statement?.paid_at || "",
    },
  ];
  return { columns, rows };
}
