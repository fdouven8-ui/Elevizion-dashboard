import { classifyUploadVerification } from "./mediaPipelineService";

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
