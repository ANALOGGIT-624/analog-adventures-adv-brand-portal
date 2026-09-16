import { getPortalSnapshot } from "./brand-portal.server";
import {
  getAttributedOrdersForReconciliation,
  reconcileCampaignOrders,
} from "./payout-reconciliation.server";

export async function getCampaignReportData(admin) {
  const [snapshot, orders] = await Promise.all([
    getPortalSnapshot(admin),
    getAttributedOrdersForReconciliation(admin),
  ]);
  const reconciliations = snapshot.campaigns.map((campaign) => {
    const reconciliation = reconcileCampaignOrders(orders, campaign.id);
    const payoutRule = snapshot.payoutRules.find(
      ({ id }) => id === campaign.payout_rule,
    );
    reconciliation.settlementDelayDays = Math.max(
      reconciliation.settlementDelayDays,
      Number(payoutRule?.settlement_delay_days || 0),
    );
    return { campaign, ...reconciliation };
  });
  return { snapshot, reconciliations };
}
