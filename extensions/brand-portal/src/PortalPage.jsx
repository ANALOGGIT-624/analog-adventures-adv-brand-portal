import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default async () => {
  render(<PortalPage />, document.body);
};

function money(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(value || 0));
}

function PortalPage() {
  const [state, setState] = useState({
    status: "loading",
    data: null,
    error: "",
  });
  const apiUrlSetting = shopify.settings.value.portal_api_url;
  const apiUrl = typeof apiUrlSetting === "string" ? apiUrlSetting : "";
  const authenticatedCustomer = shopify.authenticatedAccount.customer.value;

  useEffect(() => {
    if (!apiUrl) {
      setState({ status: "configuration", data: null, error: "" });
      return;
    }

    let cancelled = false;
    async function loadPortal() {
      try {
        const token = await shopify.sessionToken.get();
        const response = await fetch(apiUrl, {
          headers: { Authorization: "Bearer " + token },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Portal request failed.");
        if (!cancelled) setState({ status: "ready", data, error: "" });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            data: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    loadPortal();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  if (!authenticatedCustomer) {
    return (
      <s-page heading="Brand Portal">
        <s-banner heading="Sign in required" tone="warning">
          Sign in to view your organization stores and campaign results.
        </s-banner>
      </s-page>
    );
  }

  if (state.status === "configuration") {
    return (
      <s-page heading="Brand Portal">
        <s-banner heading="Portal setup is not complete" tone="warning">
          Analog Adventures is finishing the secure portal connection.
        </s-banner>
      </s-page>
    );
  }

  if (state.status === "loading") {
    return (
      <s-page heading="Brand Portal">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-spinner accessibilityLabel="Loading Brand Portal" />
          <s-text>Loading your organization portal…</s-text>
        </s-stack>
      </s-page>
    );
  }

  if (state.status === "error") {
    return (
      <s-page heading="Brand Portal">
        <s-banner heading="We could not load the portal" tone="critical">
          {state.error}
        </s-banner>
      </s-page>
    );
  }

  if (!state.data) return null;

  const { customer, organizations, campaigns, statements } = state.data;
  const liveCampaigns = campaigns.filter(
    ({ status }) => String(status).toLowerCase() === "live",
  );
  const proceeds = statements.reduce(
    (total, statement) => total + statement.organizationProceeds,
    0,
  );

  return (
    <s-page
      heading="Brand Portal"
      subheading={"Welcome, " + (customer.name || "organization partner")}
    >
      {organizations.length === 0 ? (
        <s-banner heading="No organization is assigned" tone="info">
          Contact Analog Adventures to connect your customer account to an
          approved organization.
        </s-banner>
      ) : (
        <>
          <s-section heading="Overview">
            <s-grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap="base">
              <s-box padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Organization stores</s-text>
                  <s-heading>{organizations.length}</s-heading>
                </s-stack>
              </s-box>
              <s-box padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Live campaigns</s-text>
                  <s-heading>{liveCampaigns.length}</s-heading>
                </s-stack>
              </s-box>
              <s-box padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Recorded proceeds</s-text>
                  <s-heading>{money(proceeds)}</s-heading>
                </s-stack>
              </s-box>
            </s-grid>
          </s-section>

          <s-section heading="Your stores">
            <s-stack direction="block" gap="base">
              {organizations.map((organization) => (
                <s-box
                  key={organization.id}
                  padding="base"
                  border="base"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="small-200">
                    <s-stack direction="inline" gap="base" alignItems="center">
                      <s-heading>{organization.name}</s-heading>
                      <s-badge tone="neutral">
                        {organization.status}
                      </s-badge>
                    </s-stack>
                    <s-text>{organization.description}</s-text>
                    <s-text color="subdued">
                      Public path: /community/stores/{organization.slug}
                    </s-text>
                  </s-stack>
                </s-box>
              ))}
            </s-stack>
          </s-section>

          <s-section heading="Campaigns">
            {campaigns.length === 0 ? (
              <s-text>No campaigns are assigned yet.</s-text>
            ) : (
              <s-stack direction="block" gap="base">
                {campaigns.map((campaign) => (
                  <s-box
                    key={campaign.id}
                    padding="base"
                    border="base"
                    borderRadius="base"
                  >
                    <s-stack direction="block" gap="small-200">
                      <s-stack
                        direction="inline"
                        gap="base"
                        alignItems="center"
                      >
                        <s-heading>{campaign.name}</s-heading>
                        <s-badge tone="neutral">
                          {campaign.status}
                        </s-badge>
                      </s-stack>
                      <s-text>
                        {campaign.startsAt || "Start date pending"} –{" "}
                        {campaign.closesAt || "Close date pending"}
                      </s-text>
                      <s-text color="subdued">
                        Fulfillment: {campaign.fulfillmentMode}
                      </s-text>
                      {campaign.fundraisingGoal > 0 && (
                        <s-text>
                          Fundraising goal: {money(campaign.fundraisingGoal)}
                        </s-text>
                      )}
                    </s-stack>
                  </s-box>
                ))}
              </s-stack>
            )}
          </s-section>

          <s-section heading="Payout statements">
            {statements.length === 0 ? (
              <s-text>
                Statements appear after campaign sales and adjustments are
                reconciled.
              </s-text>
            ) : (
              <s-stack direction="block" gap="base">
                {statements.map((statement) => (
                  <s-box
                    key={statement.id}
                    padding="base"
                    border="base"
                    borderRadius="base"
                  >
                    <s-stack direction="inline" gap="base" alignItems="center">
                      <s-text type="strong">{statement.statementId}</s-text>
                      <s-badge tone="neutral">
                        {statement.status}
                      </s-badge>
                      <s-text>
                        {money(
                          statement.organizationProceeds,
                          statement.currency,
                        )}
                      </s-text>
                    </s-stack>
                  </s-box>
                ))}
              </s-stack>
            )}
          </s-section>
        </>
      )}
    </s-page>
  );
}
