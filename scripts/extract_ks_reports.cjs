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

async function parseReport(name, filePath) {
  const absolutePath = path.resolve(__dirname, '..', filePath);
  if (!fs.existsSync(absolutePath)) {
    console.log(`❌ File not found: ${filePath}`);
    return;
  }
  
  const dataBuffer = fs.readFileSync(absolutePath);
  try {
    const parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    await parser.destroy();
    
    console.log(`\n========================================`);
    console.log(`📄 Name: ${name}`);
    console.log(`========================================`);
    
    const text = result.text.replace(/\s+/g, ' ');
    
    // Look for phrases like "국내 주식 일평균" or "일평균 시장" or "점유율은" or "리테일 시장 점유율은" or "원화예수금 평잔"
    const targets = ["거래대금은", "약정은", "점유율은", "평잔", "예탁금의 경우"];
    targets.forEach(target => {
      let pos = 0;
      while ((pos = text.indexOf(target, pos)) !== -1) {
        const start = Math.max(0, pos - 50);
        const end = Math.min(text.length, pos + 250);
        console.log(`  [${target}] => ... ${text.slice(start, end)} ...`);
        pos += target.length;
      }
    });
    
  } catch (err) {
    console.error(`Error parsing ${filePath}:`, err);
  }
}

async function main() {
  for (const [key, value] of Object.entries(reports)) {
    await parseReport(key, value);
  }
}

main();
