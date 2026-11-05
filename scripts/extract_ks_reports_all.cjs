const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

const reports = {
  "2025.1Q": "BSPL/25.1Q/[키움증권]분기보고서(2025.05.14).pdf",
  "2025.2Q": "BSPL/25.2Q/[키움증권]반기보고서(2025.08.11).pdf",
  "2025.3Q": "BSPL/25.3Q/[키움증권]분기보고서(2025.11.12).pdf",
  "2025.4Q": "BSPL/25.4Q/[키움증권]사업보고서(2026.03.17).pdf",
  "2026.1Q": "BSPL/26.1Q/[키움증권]분기보고서(2026.05.13).pdf"
};

async function parseReport(name, filePath, writeStream) {
  const absolutePath = path.resolve(__dirname, '..', filePath);
  if (!fs.existsSync(absolutePath)) {
    writeStream.write(`❌ File not found: ${filePath}\n`);
    return;
  }
  
  const dataBuffer = fs.readFileSync(absolutePath);
  try {
    const parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    await parser.destroy();
    
    writeStream.write(`\n========================================\n`);
    writeStream.write(`📄 Name: ${name} (${filePath})\n`);
    writeStream.write(`========================================\n`);
    
    const text = result.text.replace(/\s+/g, ' ');
    
    // We want to find sentences that have numbers followed by 조원 or % or 조 원
    // Let's do a sliding window search for keywords
    const keywords = ["시장 거래대금은", "거래대금은", "약정은", "점유율은", "평잔", "예탁금의 경우", "예수금 평잔", "신용공여 평잔"];
    
    keywords.forEach(kw => {
      let idx = 0;
      while ((idx = text.indexOf(kw, idx)) !== -1) {
        const start = Math.max(0, idx - 80);
        const end = Math.min(text.length, idx + 250);
        writeStream.write(`  [${kw}] => ... ${text.slice(start, end)} ...\n\n`);
        idx += kw.length;
      }
    });
    
  } catch (err) {
    writeStream.write(`Error parsing ${filePath}: ${err.message}\n`);
  }
}

async function main() {
  const outputPath = path.resolve(__dirname, '..', 'scripts/ks_extracted.txt');
  const writeStream = fs.createWriteStream(outputPath);
  
  for (const [key, value] of Object.entries(reports)) {
    await parseReport(key, value, writeStream);
  }
  
  writeStream.end();
  console.log(`✅ Extracted data written to: ${outputPath}`);
}

main();
