export const queries = {
  identity: `query RecoveryIdentity {
    shop { id myshopifyDomain }
    currentAppInstallation { app { id apiKey } accessScopes { handle } }
  }`,
  definitions: `query RecoveryDefinitions($after: String) {
    metaobjectDefinitions(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id type name description displayNameKey metaobjectsCount
        access { admin storefront }
        fieldDefinitions { key name description required type { name }
          validations { name value } }
      }
    }
  }`,
  records: `query RecoveryRecords($type: String!, $after: String) {
    metaobjects(type: $type, first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id type handle displayName updatedAt fields { key value
        reference { ... on MediaImage { id image { url } }
          ... on GenericFile { id url } }
      } }
    }
  }`,
  orders: `query RecoveryOrders($after: String) {
    orders(first: 1, after: $after, sortKey: ID) {
      pageInfo { hasNextPage endCursor }
      nodes { id name createdAt updatedAt cancelledAt currencyCode
        attributionManifest: metafield(key: "attribution_manifest") { jsonValue }
        attributionStatus: metafield(key: "attribution_status") { value }
        lineItems(first: 100) { pageInfo { hasNextPage endCursor }
          nodes { id name sku variantTitle quantity currentQuantity unfulfilledQuantity
            customAttributes { key value }
            discountedTotalSet { shopMoney { amount currencyCode } } }
        }
        refunds(first: 250) { id createdAt }
      }
    }
  }`,
  orderLines: `query RecoveryOrderLines($id: ID!, $after: String) {
    order(id: $id) { lineItems(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id name sku variantTitle quantity currentQuantity unfulfilledQuantity
        customAttributes { key value }
        discountedTotalSet { shopMoney { amount currencyCode } } }
    } }
  }`,
  refundLines: `query RecoveryRefundLines($id: ID!, $after: String) {
    refund(id: $id) { refundLineItems(first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { quantity subtotalSet { shopMoney { amount currencyCode } } lineItem { id } }
    } }
  }`,
  files: `query RecoveryFiles($after: String) {
    files(first: 100, after: $after) { pageInfo { hasNextPage endCursor }
      nodes { id alt createdAt updatedAt fileStatus
        ... on GenericFile { url mimeType originalFileSize }
        ... on MediaImage { image { url } originalSource { url fileSize } }
        ... on ExternalVideo { embeddedUrl host }
      }
    }
  }`,
  historical: `query RecoveryHistorical($ids: [ID!]!) {
    nodes(ids: $ids) { id ... on Metaobject { type handle updatedAt fields { key value } } }
  }`,
  companies: `query RecoveryCompanies($after: String) {
    companies(first: 1, after: $after) { pageInfo { hasNextPage endCursor }
      nodes { id name externalId updatedAt
        contacts(first: 100) { pageInfo { hasNextPage endCursor } nodes { id customer { id firstName lastName defaultEmailAddress { emailAddress } } } }
        locations(first: 100) { pageInfo { hasNextPage endCursor } nodes { id name shippingAddress { address1 address2 city province zip countryCode } } }
      }
    }
  }`,
  companyContacts: `query RecoveryCompanyContacts($id: ID!, $after: String) {
    company(id: $id) { contacts(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id customer { id firstName lastName defaultEmailAddress { emailAddress } } } } }
  }`,
  companyLocations: `query RecoveryCompanyLocations($id: ID!, $after: String) {
    company(id: $id) { locations(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id name shippingAddress { address1 address2 city province zip countryCode } } } }
  }`,
  drafts: `query RecoveryDrafts($after: String) {
    draftOrders(first: 5, after: $after) { pageInfo { hasNextPage endCursor }
      nodes { id name status createdAt updatedAt invoiceUrl note2 customAttributes { key value }
        order { id } shippingAddress { address1 address2 city province zip countryCodeV2 }
        lineItems(first: 100) { pageInfo { hasNextPage endCursor } nodes { id name sku quantity variant { id } customAttributes { key value } originalUnitPriceSet { shopMoney { amount currencyCode } } } }
      }
    }
  }`,
  draftLines: `query RecoveryDraftLines($id: ID!, $after: String) {
    draftOrder(id: $id) { lineItems(first: 100, after: $after) { pageInfo { hasNextPage endCursor } nodes { id name sku quantity variant { id } customAttributes { key value } originalUnitPriceSet { shopMoney { amount currencyCode } } } } }
  }`,
};
