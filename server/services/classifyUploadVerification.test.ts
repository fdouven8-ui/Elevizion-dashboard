import { classifyUploadVerification, isYodeckMediaReadyStandalone } from "./mediaPipelineService";

const base = { putOk: true, etagPresent: true, verifyOk: false, methodUsed: "RANGE", expectedSize: 106021 };

describe("classifyUploadVerification", () => {
  it("returns INCONCLUSIVE when verify returns 403 but PUT was OK with ETag", () => {
    expect(classifyUploadVerification({ ...base, verifyStatus: 403 })).toBe("INCONCLUSIVE");
  });

  it("returns INCONCLUSIVE when verify returns 405 but PUT was OK with ETag", () => {
    expect(classifyUploadVerification({ ...base, verifyStatus: 405 })).toBe("INCONCLUSIVE");
  });

  it("returns INCONCLUSIVE when verify returns 501 but PUT was OK with ETag", () => {
    expect(classifyUploadVerification({ ...base, verifyStatus: 501 })).toBe("INCONCLUSIVE");
  });

  it("returns INCONCLUSIVE when verify returns 403 but PUT was OK without ETag", () => {
    expect(classifyUploadVerification({ ...base, etagPresent: false, verifyStatus: 403 })).toBe("INCONCLUSIVE");
  });

  it("returns INCONCLUSIVE when methodUsed is NONE and PUT was OK", () => {
    expect(classifyUploadVerification({ ...base, methodUsed: "NONE", verifyStatus: undefined })).toBe("INCONCLUSIVE");
  });

  it("returns OK when verify succeeds with matching content length", () => {
    expect(classifyUploadVerification({ ...base, verifyOk: true, verifyStatus: 200, contentLength: 106021 })).toBe("OK");
  });

  it("returns OK when verify succeeds with positive content length", () => {
    expect(classifyUploadVerification({ ...base, verifyOk: true, verifyStatus: 200, contentLength: 99999 })).toBe("OK");
  });

  it("returns FAIL when verify returns 200 with contentLength 0", () => {
    expect(classifyUploadVerification({ ...base, verifyOk: false, verifyStatus: 200, contentLength: 0 })).toBe("FAIL");
  });

  it("returns FAIL when PUT failed and verify also failed", () => {
    expect(classifyUploadVerification({ ...base, putOk: false, etagPresent: false, verifyStatus: 403 })).toBe("FAIL");
  });

  it("returns FAIL when verify returns non-inconclusive error status", () => {
    expect(classifyUploadVerification({ ...base, putOk: false, etagPresent: false, verifyStatus: 500 })).toBe("FAIL");
  });
});

const noFiles = { fileSize: 0, hasFileObject: false, hasFileUrl: false, hasLastUploaded: false, hasThumbnailUrl: false };

describe("isYodeckMediaReadyStandalone", () => {
  it("returns STRONG when finished + last_uploaded + thumbnail_url (no file fields)", () => {
    const result = isYodeckMediaReadyStandalone(
      { status: "finished", last_uploaded: "2025-01-01T00:00:00Z", thumbnail_url: "https://..." },
      { ...noFiles, hasLastUploaded: true, hasThumbnailUrl: true },
    );
    expect(result.ready).toBe(true);
    expect(result.signal).toBe("STRONG");
  });

  it("returns WAIT_THUMBNAIL (not ready) when finished + last_uploaded but no thumbnail", () => {
    const result = isYodeckMediaReadyStandalone(
      { status: "finished", last_uploaded: "2025-01-01T00:00:00Z" },
      { ...noFiles, hasLastUploaded: true },
    );
    expect(result.ready).toBe(false);
    expect(result.signal).toBe("WAIT_THUMBNAIL");
  });

  it("returns NONE (not ready) when finished + thumbnail_url only (no last_uploaded)", () => {
    const result = isYodeckMediaReadyStandalone(
      { status: "finished", thumbnail_url: "https://..." },
      { ...noFiles, hasThumbnailUrl: true },
    );
    expect(result.ready).toBe(false);
    expect(result.signal).toBe("NONE");
  });

  it("returns FILE_FIELDS when file metadata present", () => {
    const result = isYodeckMediaReadyStandalone(
      { status: "finished" },
      { fileSize: 106021, hasFileObject: true, hasFileUrl: true, hasLastUploaded: false, hasThumbnailUrl: false },
    );
    expect(result.ready).toBe(true);
    expect(result.signal).toBe("FILE_FIELDS");
  });

  it("returns not ready when status=encoding, no signals", () => {
    const result = isYodeckMediaReadyStandalone(
      { status: "encoding" },
      noFiles,
    );
    expect(result.ready).toBe(false);
    expect(result.signal).toBe("NONE");
  });

  it("returns not ready when status=initialized", () => {
    const result = isYodeckMediaReadyStandalone(
      { status: "initialized" },
      noFiles,
    );
    expect(result.ready).toBe(false);
    expect(result.signal).toBe("NONE");
  });

  it("throws on status=failed", () => {
    expect(() => isYodeckMediaReadyStandalone(
      { status: "failed", error_message: "bad video" },
      noFiles,
    )).toThrow("YODECK_UPLOAD_FAILED");
  });

  it("returns not ready when finished but no signals at all", () => {
    const result = isYodeckMediaReadyStandalone(
      { status: "finished" },
      noFiles,
    );
    expect(result.ready).toBe(false);
    expect(result.signal).toBe("NONE");
  });
});
