import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { displayDate } from "./display-date.js";

/* eslint-disable react/prop-types */

export default async () => {
  render(<PortalPage />, document.body);
};

function money(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(value || 0));
}

function requestLabel(value) {
  return String(value || "").replace(/_/g, " ");
}

function fieldValue(event) {
  const target = event.currentTarget;
  return target && "value" in target ? String(target.value || "") : "";
}

function selectedFile(event) {
  const target = event.currentTarget;
  const files = target?.files || event.target?.files || event.detail?.files;
  return files?.[0] || null;
}

function OrganizationRequests({
  apiUrl,
  organizations,
  campaigns,
  initialRequests = [],
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [form, setForm] = useState({
    requestType: organizations.length ? "new_campaign" : "new_store",
    organizationId: organizations[0]?.id || "",
    campaignId: "",
    title: "",
    details: "",
    requestedStartDate: "",
    requestedCloseDate: "",
    artworkFile: null,
    artworkInputKey: 0,
    artworkError: "",
    busy: false,
    error: "",
    success: "",
  });
  const availableCampaigns = campaigns.filter(
    ({ organizationStoreId }) => organizationStoreId === form.organizationId,
  );

  async function submitRequest(event) {
    event.preventDefault();
    setForm((current) => ({ ...current, busy: true, error: "", success: "" }));
    try {
      const token = await shopify.sessionToken.get();
      const payload = new FormData();
      payload.append("intent", "create-request");
      payload.append("requestType", form.requestType);
      payload.append("organizationId", form.organizationId);
      payload.append("campaignId", form.campaignId);
      payload.append("title", form.title);
      payload.append("details", form.details);
      payload.append("requestedStartDate", form.requestedStartDate);
      payload.append("requestedCloseDate", form.requestedCloseDate);
      if (form.artworkFile) {
        payload.append("artwork_file", form.artworkFile, form.artworkFile.name);
      }
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
        },
        body: payload,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Request was not submitted.");
      setRequests((current) => [result.request, ...current]);
      setForm((current) => ({
        ...current,
        title: "",
        details: "",
        requestedStartDate: "",
        requestedCloseDate: "",
        artworkFile: null,
        artworkInputKey: current.artworkInputKey + 1,
        artworkError: "",
        busy: false,
        error: "",
        success: "Your request was submitted for staff review.",
      }));
    } catch (error) {
      setForm((current) => ({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return (
    <s-section heading="Request a change or new campaign">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Submit a proposal for Analog Adventures staff to review. Requests do
          not change a live store or campaign automatically.
        </s-paragraph>
        {form.error && (
          <s-banner heading="Request was not submitted" tone="critical">
            {form.error}
          </s-banner>
        )}
        {form.success && (
          <s-banner heading="Request received" tone="success">
            {form.success}
          </s-banner>
        )}
        <s-form onSubmit={submitRequest}>
          <s-stack direction="block" gap="base">
            <s-select
              label="Request type"
              value={form.requestType}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  requestType: fieldValue(event),
                  campaignId: "",
                }))
              }
            >
              <s-option value="new_store">New organization store</s-option>
              <s-option value="new_campaign">New campaign</s-option>
              <s-option value="product_change">
                Product selection change
              </s-option>
              <s-option value="branding_change">Branding change</s-option>
              <s-option value="campaign_relaunch">Campaign relaunch</s-option>
            </s-select>
            {form.requestType !== "new_store" && (
              <s-select
                label="Organization"
                value={form.organizationId}
                required
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    organizationId: fieldValue(event),
                    campaignId: "",
                  }))
                }
              >
                <s-option value="">Choose an organization</s-option>
                {organizations.map((organization) => (
                  <s-option key={organization.id} value={organization.id}>
                    {organization.name}
                  </s-option>
                ))}
              </s-select>
            )}
            {form.requestType === "campaign_relaunch" && (
              <s-select
                label="Campaign to relaunch"
                value={form.campaignId}
                required
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    campaignId: fieldValue(event),
                  }))
                }
              >
                <s-option value="">Choose a campaign</s-option>
                {availableCampaigns.map((campaign) => (
                  <s-option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </s-option>
                ))}
              </s-select>
            )}
            <s-text-field
              label="Request title"
              value={form.title}
              required
              onInput={(event) =>
                setForm((current) => ({
                  ...current,
                  title: fieldValue(event),
                }))
              }
            />
            <s-text-area
              label="Products, branding, timing, and other details"
              value={form.details}
              rows={4}
              required
              onInput={(event) =>
                setForm((current) => ({
                  ...current,
                  details: fieldValue(event),
                }))
              }
            />
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-date-field
                label="Requested start date"
                value={form.requestedStartDate}
                onInput={(event) =>
                  setForm((current) => ({
                    ...current,
                    requestedStartDate: fieldValue(event),
                  }))
                }
              />
              <s-date-field
                label="Requested close date"
                value={form.requestedCloseDate}
                onInput={(event) =>
                  setForm((current) => ({
                    ...current,
                    requestedCloseDate: fieldValue(event),
                  }))
                }
              />
            </s-grid>
            <s-drop-zone
              key={form.artworkInputKey}
              label="Logo or source artwork (optional)"
              name="artwork_file"
              accept=".pdf,.svg,.png,.jpg,.jpeg"
              disabled={form.busy}
              error={form.artworkError || undefined}
              onChange={(event) => {
                const file = selectedFile(event);
                setForm((current) => ({
                  ...current,
                  artworkFile: file,
                  artworkError: file
                    ? ""
                    : "Choose a PDF, SVG, PNG, or JPEG file.",
                }));
              }}
              onDropRejected={() =>
                setForm((current) => ({
                  ...current,
                  artworkFile: null,
                  artworkError: "Choose a PDF, SVG, PNG, or JPEG file.",
                }))
              }
            />
            {form.artworkFile && (
              <s-text color="subdued">
                Selected artwork: {form.artworkFile.name}
              </s-text>
            )}
            <s-button type="submit" variant="primary" loading={form.busy}>
              Submit request
            </s-button>
          </s-stack>
        </s-form>
        <s-heading>Request history</s-heading>
        {requests.length === 0 ? (
          <s-text>No requests submitted yet.</s-text>
        ) : (
          <s-stack direction="block" gap="base">
            {requests.map((request) => (
              <s-box
                key={request.id}
                padding="base"
                border="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="small-200">
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-text type="strong">{request.title}</s-text>
                    <s-badge tone="neutral">
                      {requestLabel(request.status)}
                    </s-badge>
                  </s-stack>
                  <s-text color="subdued">
                    {requestLabel(request.type)} · {request.requestId}
                  </s-text>
                  {request.artworkUrl && (
                    <s-link href={request.artworkUrl} target="_blank">
                      Open submitted artwork
                      {request.artworkFilename
                        ? ` (${request.artworkFilename})`
                        : ""}
                    </s-link>
                  )}
                  {request.staffNotes && (
                    <s-text>Staff note: {request.staffNotes}</s-text>
                  )}
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-stack>
    </s-section>
  );
}

function PortalPage() {
  const [state, setState] = useState({
    status: "loading",
    data: null,
    error: "",
  });
  const [review, setReview] = useState({
    handle: "",
    notes: "",
    busy: false,
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
        if (!response.ok)
          throw new Error(data.error || "Portal request failed.");
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

  const {
    customer,
    organizations,
    campaigns,
    statements,
    proofs = [],
    requests = [],
  } = state.data;
  const liveCampaigns = campaigns.filter(
    ({ status }) => String(status).toLowerCase() === "live",
  );
  const proceeds = statements.reduce(
    (total, statement) => total + statement.organizationProceeds,
    0,
  );

  async function submitReview(proofHandle, intent) {
    setReview((current) => ({
      ...current,
      handle: proofHandle,
      busy: true,
      error: "",
    }));
    try {
      const token = await shopify.sessionToken.get();
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent,
          proofHandle,
          notes: review.handle === proofHandle ? review.notes : "",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Proof review failed.");
      setState((current) => ({
        ...current,
        data: {
          ...current.data,
          proofs: current.data.proofs.map((proof) =>
            proof.handle === proofHandle
              ? {
                  ...proof,
                  status:
                    intent === "approve-proof"
                      ? "approved"
                      : "changes_requested",
                  organizerNotes: review.notes,
                  reviewedAt: new Date().toISOString(),
                }
              : proof,
          ),
        },
      }));
      setReview({ handle: "", notes: "", busy: false, error: "" });
    } catch (error) {
      setReview((current) => ({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  return (
    <s-page
      heading="Brand Portal"
      subheading={"Welcome, " + (customer.name || "organization partner")}
    >
      {organizations.length === 0 ? (
        <>
          <s-banner heading="No organization is assigned" tone="info">
            Submit a new-store request or contact Analog Adventures to connect
            your customer account to an approved organization.
          </s-banner>
          <OrganizationRequests
            apiUrl={apiUrl}
            organizations={organizations}
            campaigns={campaigns}
            initialRequests={requests}
          />
        </>
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
                      <s-badge tone="neutral">{organization.status}</s-badge>
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
                        <s-badge tone="neutral">{campaign.status}</s-badge>
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

          <s-section heading="Artwork proofs">
            {review.error && (
              <s-banner heading="Proof review was not saved" tone="critical">
                {review.error}
              </s-banner>
            )}
            {proofs.length === 0 ? (
              <s-text>No artwork proofs are ready for review.</s-text>
            ) : (
              <s-stack direction="block" gap="base">
                {[...proofs]
                  .sort((a, b) => b.version - a.version)
                  .map((proof) => (
                    <s-box
                      key={proof.id}
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
                          <s-heading>{proof.name}</s-heading>
                          <s-badge
                            tone={
                              proof.status === "changes_requested"
                                ? "critical"
                                : "neutral"
                            }
                          >
                            {proof.status}
                          </s-badge>
                        </s-stack>
                        {proof.staffNotes && (
                          <s-text>{proof.staffNotes}</s-text>
                        )}
                        {proof.assetUrl ? (
                          <s-link href={proof.assetUrl} target="_blank">
                            Open proof file
                          </s-link>
                        ) : (
                          <s-text color="subdued">
                            Proof file is processing.
                          </s-text>
                        )}
                        {proof.status === "submitted" && (
                          <>
                            <s-text-area
                              label="Revision notes (required when requesting changes)"
                              value={
                                review.handle === proof.handle
                                  ? review.notes
                                  : ""
                              }
                              onInput={(event) =>
                                setReview({
                                  handle: proof.handle,
                                  notes: fieldValue(event),
                                  busy: false,
                                  error: "",
                                })
                              }
                              rows={3}
                            />
                            <s-stack direction="inline" gap="base">
                              <s-button
                                variant="primary"
                                loading={
                                  review.busy && review.handle === proof.handle
                                }
                                onClick={() =>
                                  submitReview(proof.handle, "approve-proof")
                                }
                              >
                                Approve proof
                              </s-button>
                              <s-button
                                loading={
                                  review.busy && review.handle === proof.handle
                                }
                                onClick={() =>
                                  submitReview(proof.handle, "request-changes")
                                }
                              >
                                Request changes
                              </s-button>
                            </s-stack>
                          </>
                        )}
                        {proof.organizerNotes && (
                          <s-text color="subdued">
                            Organizer note: {proof.organizerNotes}
                          </s-text>
                        )}
                      </s-stack>
                    </s-box>
                  ))}
              </s-stack>
            )}
          </s-section>

          <OrganizationRequests
            apiUrl={apiUrl}
            organizations={organizations}
            campaigns={campaigns}
            initialRequests={requests}
          />

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
                    <s-stack direction="block" gap="base">
                      <s-stack
                        direction="inline"
                        gap="base"
                        alignItems="center"
                      >
                        <s-text type="strong">{statement.statementId}</s-text>
                        <s-badge
                          tone={
                            statement.status === "paid" ? "success" : "neutral"
                          }
                        >
                          {statement.status}
                        </s-badge>
                      </s-stack>
                      <s-text>{statement.campaignName}</s-text>
                      <s-grid
                        gridTemplateColumns="repeat(2, minmax(0, 1fr))"
                        gap="base"
                      >
                        <s-stack direction="block" gap="small-200">
                          <s-text color="subdued">Statement period</s-text>
                          <s-text>
                            {displayDate(statement.periodStart)} –{" "}
                            {displayDate(statement.periodEnd)}
                          </s-text>
                        </s-stack>
                        <s-stack direction="block" gap="small-200">
                          <s-text color="subdued">
                            {statement.paidAt ? "Paid" : "Settlement eligible"}
                          </s-text>
                          <s-text>
                            {displayDate(
                              statement.paidAt ||
                                statement.settlementEligibleAt,
                              "Pending campaign close",
                            )}
                          </s-text>
                        </s-stack>
                      </s-grid>
                      <s-grid
                        gridTemplateColumns="repeat(2, minmax(0, 1fr))"
                        gap="base"
                      >
                        <s-stack direction="block" gap="small-200">
                          <s-text color="subdued">Gross sales</s-text>
                          <s-text>
                            {money(statement.grossRevenue, statement.currency)}
                          </s-text>
                        </s-stack>
                        <s-stack direction="block" gap="small-200">
                          <s-text color="subdued">Refunds</s-text>
                          <s-text>
                            {money(statement.refunds, statement.currency)}
                          </s-text>
                        </s-stack>
                        <s-stack direction="block" gap="small-200">
                          <s-text color="subdued">Deductions</s-text>
                          <s-text>
                            {money(statement.deductions, statement.currency)}
                          </s-text>
                        </s-stack>
                        <s-stack direction="block" gap="small-200">
                          <s-text color="subdued">Organization proceeds</s-text>
                          <s-text type="strong">
                            {money(
                              statement.organizationProceeds,
                              statement.currency,
                            )}
                          </s-text>
                        </s-stack>
                      </s-grid>
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
