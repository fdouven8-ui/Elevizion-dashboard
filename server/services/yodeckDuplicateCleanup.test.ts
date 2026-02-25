import { buildAssetMarker, extractAssetIdFromDescription } from "./yodeckDuplicateCleanupService";

describe("yodeckDuplicateCleanupService helpers", () => {
  it("builds correct asset marker", () => {
    expect(buildAssetMarker(42)).toBe("EVZ_ASSET_ID=42");
    expect(buildAssetMarker(999)).toBe("EVZ_ASSET_ID=999");
  });

  it("extracts assetId from description with marker", () => {
    expect(extractAssetIdFromDescription("EVZ_ASSET_ID=42")).toBe(42);
    expect(extractAssetIdFromDescription("some desc | EVZ_ASSET_ID=123")).toBe(123);
    expect(extractAssetIdFromDescription("EVZ_ASSET_ID=0")).toBe(0);
  });

  it("returns null for description without marker", () => {
    expect(extractAssetIdFromDescription("")).toBeNull();
    expect(extractAssetIdFromDescription(null)).toBeNull();
    expect(extractAssetIdFromDescription(undefined)).toBeNull();
    expect(extractAssetIdFromDescription("some regular description")).toBeNull();
  });
});
