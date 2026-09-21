export function publicPayoutStatement(statement, campaign, payoutRule) {
  const closesAt = campaign?.closes_at ? new Date(campaign.closes_at) : null;
  if (closesAt && !Number.isNaN(closesAt.getTime())) {
    closesAt.setUTCDate(
      closesAt.getUTCDate() + Number(payoutRule?.settlement_delay_days || 0),
    );
  }

  return {
    id: statement.id,
    statementId: statement.statement_id,
    campaignId: statement.campaign,
    campaignName: campaign?.campaign_name || "Campaign",
    status: statement.status,
    periodStart: statement.period_start,
    periodEnd: statement.period_end,
    grossRevenue: Number(statement.gross_revenue || 0),
    refunds: Number(statement.refunds || 0),
    deductions: Number(statement.deductions || 0),
    organizationProceeds: Number(statement.organization_proceeds || 0),
    currency: statement.currency || "USD",
    settlementEligibleAt:
      closesAt && !Number.isNaN(closesAt.getTime())
        ? closesAt.toISOString()
        : null,
    paidAt: statement.paid_at,
  };
}
