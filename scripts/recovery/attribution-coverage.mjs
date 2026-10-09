export const ORDER_ATTRIBUTION_TYPES = {
  attribution_manifest: "json",
  attribution_status: "single_line_text_field",
  organization_store_id: "single_line_text_field",
  campaign_id: "single_line_text_field",
  payout_rule_id: "single_line_text_field",
};

export function orderDefinitionCoverageGaps(definitions) {
  return Object.entries(ORDER_ATTRIBUTION_TYPES).flatMap(([key, type]) => {
    const definition = definitions?.[key];
    if (!definition) return [{ kind: "missing_order_definition", key }];
    if (definition.key !== key || definition.type?.name !== type ||
        definition.access?.admin !== "MERCHANT_READ")
      return [{ kind: "changed_order_definition", key }];
    return [];
  });
}

// Checkout tags survive independently of app-owned order metafields. Use them
// to detect lost attribution even when the number of backed-up orders is stable.
export function attributionCoverageGaps(order) {
  const tagged = (order.lineItems?.nodes || []).filter(line =>
    line.customAttributes?.some(a => a.key === "_aa_attribution" && a.value));
  const manifest = order.attributionManifest?.jsonValue;
  const status = order.attributionStatus?.value;
  if (!tagged.length && !manifest && !status) return [];
  const lines = manifest?.lines;
  if (status !== "verified" || !Array.isArray(lines) || !lines.length)
    return [{ kind: "missing_order_attribution", orderId: order.id }];
  const ids = new Set(lines.map(line => String(line.lineItemId).split("/").at(-1)));
  if (tagged.some(line => !ids.has(String(line.id).split("/").at(-1))))
    return [{ kind: "incomplete_order_attribution", orderId: order.id }];
  return [];
}
