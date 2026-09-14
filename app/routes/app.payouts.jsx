import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getPortalSnapshot } from "../lib/brand-portal.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const snapshot = await getPortalSnapshot(admin);
  return {
    payoutRules: snapshot.payoutRules,
    payoutStatements: snapshot.payoutStatements,
  };
};

function money(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(Number(value || 0));
}

export default function Payouts() {
  const { payoutRules, payoutStatements } = useLoaderData();

  return (
    <s-page
      heading="Payouts"
      subheading="Review the precise proceeds formula and retain an auditable settlement history."
    >
      <s-section heading="Payout rules">
        {payoutRules.length === 0 ? (
          <s-banner heading="A payout rule is required" tone="warning">
            Create a fixed-dollar or percentage payout rule in Shopify custom
            data before launching an organization campaign.
          </s-banner>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Rule</s-table-header>
              <s-table-header>Method</s-table-header>
              <s-table-header>Rate</s-table-header>
              <s-table-header>Basis</s-table-header>
              <s-table-header>Settlement delay</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {payoutRules.map((rule) => (
                <s-table-row key={rule.id}>
                  <s-table-cell>{rule.rule_name}</s-table-cell>
                  <s-table-cell>{rule.method}</s-table-cell>
                  <s-table-cell>{rule.rate}</s-table-cell>
                  <s-table-cell>{rule.basis}</s-table-cell>
                  <s-table-cell>
                    {rule.settlement_delay_days || "0"} days
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Payout statements">
        {payoutStatements.length === 0 ? (
          <s-paragraph>
            Statements will appear here after a campaign closes and returns or
            adjustments have been reconciled.
          </s-paragraph>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Statement</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Gross revenue</s-table-header>
              <s-table-header>Refunds</s-table-header>
              <s-table-header>Organization proceeds</s-table-header>
              <s-table-header>Paid</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {payoutStatements.map((statement) => (
                <s-table-row key={statement.id}>
                  <s-table-cell>{statement.statement_id}</s-table-cell>
                  <s-table-cell>
                    <s-badge
                      tone={
                        String(statement.status).toLowerCase() === "paid"
                          ? "success"
                          : "info"
                      }
                    >
                      {statement.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    {money(statement.gross_revenue, statement.currency)}
                  </s-table-cell>
                  <s-table-cell>
                    {money(statement.refunds, statement.currency)}
                  </s-table-cell>
                  <s-table-cell>
                    {money(
                      statement.organization_proceeds,
                      statement.currency,
                    )}
                  </s-table-cell>
                  <s-table-cell>{statement.paid_at || "Pending"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}
