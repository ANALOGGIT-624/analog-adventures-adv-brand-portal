export function productionProofLabel(manifest) {
  const versions = [
    ...new Set(
      (manifest?.lines || [])
        .map(({ artworkProofSnapshot }) => artworkProofSnapshot?.version)
        .filter((version) => Number.isFinite(Number(version)))
        .map(Number),
    ),
  ].sort((a, b) => a - b);
  return versions.length
    ? versions.map((version) => `Version ${version}`).join(", ")
    : "Not captured";
}
