import puppeteer from "puppeteer";

export async function generateContractPdf(htmlContent: string): Promise<Buffer> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
      ],
    });

    const page = await browser.newPage();

    const fullHtml = htmlContent.includes("<!DOCTYPE html") 
      ? htmlContent 
      : wrapInHtmlDocument(htmlContent);

    await page.setContent(fullHtml, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: {
        top: "20mm",
        right: "20mm",
        bottom: "20mm",
        left: "20mm",
      },
      printBackground: true,
      preferCSSPageSize: true,
    });

    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error("[ContractPdfService] Error generating PDF:", error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function wrapInHtmlDocument(content: string): string {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contract</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    @media print {
      body { margin: 0; padding: 0; }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
    }
    .contract-wrapper {
      max-width: 100%;
      padding: 40px 50px;
      background: white;
    }
    h1 { font-size: 18pt; font-weight: bold; margin-bottom: 20px; }
    h2 { font-size: 14pt; font-weight: bold; margin: 20px 0 10px; border-bottom: 1px solid #e0e0e0; padding-bottom: 6px; }
    h3 { font-size: 12pt; font-weight: bold; margin: 15px 0 8px; }
    p { margin: 0 0 12px; text-align: justify; }
    ul, ol { margin: 12px 0; padding-left: 24px; }
    li { margin-bottom: 6px; }
    .signature-section { margin-top: 40px; page-break-inside: avoid; }
    .signature-grid { display: flex; justify-content: space-between; gap: 40px; }
    .signature-box { flex: 1; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; }
    .signature-label { font-size: 10pt; color: #666; margin-bottom: 4px; }
    .signature-value { font-weight: bold; margin-bottom: 12px; }
    .signature-line { margin-top: 50px; padding-top: 8px; border-top: 1px solid #1a1a1a; }
    .signature-line-label { font-size: 9pt; color: #666; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e0e0e0; text-align: center; font-size: 9pt; color: #666; }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
}
