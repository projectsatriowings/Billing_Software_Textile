import { PDFParse } from 'pdf-parse';
import { createWorker } from 'tesseract.js';
import ExcelJS from 'exceljs';

export interface ExtractedProductItem {
  id: string;
  name: string;
  uom: string;
  sellingPrice: string;
  costPrice: string;
  hsn: string;
  gstRate: string;
  priceInclusive: 'Yes' | 'No';
  openingStock: string;
  rawRate?: string;
  rawQty?: string;
  rawDiscount?: string;
  rawTaxable?: string;
  rawTotal?: string;
  confidence?: 'high' | 'medium' | 'low';
  flags?: string[];
}

export interface InvoiceMetadata {
  supplierName: string;
  supplierGstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number | null;
  rawText: string;
}

export interface ColumnMapping {
  productNameCol?: string;
  quantityCol?: string;
  uomCol?: string;
  rateCol?: string;
  hsnCol?: string;
  gstRateCol?: string;
  taxableCol?: string;
  discountCol?: string;
  totalCol?: string;
  [key: string]: string | undefined;
}

export interface CatalogItemSummary {
  name: string;
  sku?: string;
  barcode?: string;
  hsn?: string;
  spMinor?: number;
  costMinor?: number;
}

// ── Known Heading Variations ──────────────────────────────────────────────────
export const HEADING_SYNONYMS: Record<string, string[]> = {
  productName: [
    'item description',
    'particulars',
    'product description',
    'product name',
    'item name',
    'description',
    'product',
    'items',
    'item',
    'goods description',
    'commodity',
    'material description',
  ],
  quantity: [
    'billed qty',
    'total qty',
    'quantity',
    'qty',
    'units',
    'pcs',
    'qnty',
    'nos',
    'count',
    'quant',
  ],
  uom: [
    'uom',
    'unit',
    'pkg',
    'packing',
    'measure',
    'packaging',
    'per',
    'u/m',
  ],
  rate: [
    'unit rate',
    'unit price',
    'basic rate',
    'rate',
    'price',
    'price/unit',
    'rate (rs)',
    'rate (in rs)',
    'mrp',
    'purchase rate',
  ],
  hsn: [
    'hsn/sac',
    'hsn code',
    'hsn',
    'sac code',
    'sac',
    'commodity code',
    'tariff',
  ],
  gstRate: [
    'gst %',
    'tax rate',
    'tax %',
    'gst rate',
    'gst',
    'tax',
    'rate %',
    'cgst %',
    'sgst %',
    'igst %',
  ],
  taxable: [
    'taxable value',
    'taxable amt',
    'taxable amount',
    'taxable val',
    'basic amount',
    'amount',
    'taxable',
    'net value',
  ],
  discount: [
    'discount',
    'disc %',
    'disc amt',
    'disc',
    'trade discount',
    'cd %',
    'scheme disc',
  ],
  total: [
    'total amount',
    'net amount',
    'item total',
    'total',
    'final amount',
    'bill amount',
    'amount (rs)',
  ],
};

// ── Common UOM Normalization ──────────────────────────────────────────────────
export function normalizeUom(raw: string, productNameHint = ''): string {
  const clean = (raw || '').trim().toLowerCase();
  if (['kg', 'kgs', 'kilogram', 'kilo'].includes(clean)) return 'kg';
  if (['g', 'gm', 'gms', 'gram', 'grams'].includes(clean)) return 'g';
  if (['ltr', 'lt', 'liter', 'litres', 'litre', 'l'].includes(clean)) return 'ltr';
  if (['ml', 'milli'].includes(clean)) return 'ml';
  if (['pcs', 'pc', 'piece', 'pieces', 'nos', 'no', 'unit', 'units', 'each'].includes(clean)) return 'pcs';
  if (['box', 'boxes', 'bx'].includes(clean)) return 'box';
  if (['pack', 'pkt', 'packets', 'packet', 'pouch'].includes(clean)) return 'pack';
  if (['bag', 'bags'].includes(clean)) return 'bag';
  if (['tin', 'tins'].includes(clean)) return 'tin';
  if (['bottle', 'bottles', 'btl'].includes(clean)) return 'bottle';
  if (['can', 'cans'].includes(clean)) return 'can';
  if (['strip', 'strips'].includes(clean)) return 'strip';
  if (['jar', 'jars'].includes(clean)) return 'jar';

  // Infer from product name if empty
  const pLower = productNameHint.toLowerCase();
  if (/\b(?:kg|kilo)\b/.test(pLower)) return 'kg';
  if (/\b(?:gm|gms|g)\b/.test(pLower)) return 'g';
  if (/\b(?:ltr|liter|litre|l)\b/.test(pLower)) return 'ltr';
  if (/\b(?:ml)\b/.test(pLower)) return 'ml';
  if (/\b(?:pack|pkt|box|bag|tin|btl)\b/.test(pLower)) {
    const match = pLower.match(/\b(pack|pkt|box|bag|tin|btl)\b/);
    if (match?.[1] === 'pkt') return 'pack';
    if (match?.[1] === 'btl') return 'bottle';
    return match?.[1] || 'pcs';
  }

  return clean || 'pcs';
}

// ── Text Extraction (PDF / OCR) ───────────────────────────────────────────────
export async function extractTextFromInvoice(
  buffer: Buffer,
  fileName: string,
  mimeType?: string
): Promise<{ text: string; pages: number; isOcr: boolean; tableData?: string[][] }> {
  // Plain text fallback (e.g. for testing or raw text dumps)
  if (mimeType?.startsWith('text/') || fileName.toLowerCase().endsWith('.txt')) {
    return { text: buffer.toString('utf8'), pages: 1, isOcr: false };
  }

  const isPdf = mimeType?.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    let pdfParser: PDFParse | null = null;
    try {
      pdfParser = new PDFParse({ data: buffer });
      const textResult = await pdfParser.getText();
      const extractedText = (textResult.text || '').trim();
      const totalPages = textResult.total || 1;

      // Check if this is a scanned PDF (very little or no digital text)
      if (extractedText.length >= 60 && /[a-zA-Z]{3,}/.test(extractedText)) {
        let tableData: string[][] | undefined;
        try {
          const tableResult = await pdfParser.getTable();
          if (tableResult?.mergedTables?.length) {
            tableData = tableResult.mergedTables[0];
          }
        } catch {
          // Fall back to line parsing
        }
        await pdfParser.destroy();
        return { text: extractedText, pages: totalPages, isOcr: false, tableData };
      }

      // Scanned PDF fallback: try extracting embedded images and running OCR
      let scannedImageOcr = '';
      try {
        const imageResult = await pdfParser.getImage({ imageBuffer: true });
        if (imageResult?.pages?.length) {
          const worker = await createWorker('eng');
          for (const page of imageResult.pages) {
            for (const img of page.images) {
              if (img.data && img.data.byteLength > 1000) {
                const ret = await worker.recognize(Buffer.from(img.data));
                scannedImageOcr += '\n' + ret.data.text;
              }
            }
          }
          await worker.terminate();
        }
      } catch {
        // Ignore OCR fallback error
      }
      await pdfParser.destroy();

      if (scannedImageOcr.trim().length > 20) {
        return { text: scannedImageOcr.trim(), pages: totalPages, isOcr: true };
      }

      // If still minimal text, return whatever text was found
      return { text: extractedText, pages: totalPages, isOcr: false };
    } catch (err: any) {
      if (pdfParser) {
        try { await pdfParser.destroy(); } catch {}
      }
      throw new Error(`Failed to parse PDF document: ${err.message || String(err)}`);
    }
  }

  // Image files (JPG, JPEG, PNG)
  try {
    const worker = await createWorker('eng');
    const ret = await worker.recognize(buffer);
    await worker.terminate();
    return { text: (ret.data.text || '').trim(), pages: 1, isOcr: true };
  } catch (err: any) {
    throw new Error(`OCR processing failed for image: ${err.message || String(err)}`);
  }
}

// ── Rule-Based Invoice Metadata Extraction ────────────────────────────────────
export function parseInvoiceMetadata(rawText: string): InvoiceMetadata {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1. GSTIN (15-character Indian GST format: 2 digits + 5 alpha + 4 digits + 1 alpha + 1 alpha/digit + Z + 1 alpha/digit)
  const GSTIN_REGEX = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/gi;
  const gstinMatches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = GSTIN_REGEX.exec(rawText)) !== null) {
    gstinMatches.push(m[1].toUpperCase());
  }

  // The supplier GSTIN is usually the first one found or associated with Seller/From/M/s
  let supplierGstin = '';
  if (gstinMatches.length > 0) {
    supplierGstin = gstinMatches[0];
  }

  // 2. Supplier Name Detection
  let supplierName = '';
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const line = lines[i];
    // Ignore standard title headers
    if (/^(?:tax invoice|invoice|cash memo|bill of supply|original for recipient|duplicate for supplier|triplicate)/i.test(line)) {
      continue;
    }
    // Pattern: M/s. Name or Sold By: Name or From: Name
    const prefixMatch = line.match(/^(?:m\/s\.?|sold by|from|supplier|vendor|seller)\s*[:.-]?\s*([A-Za-z0-9&.,\- ]+)/i);
    if (prefixMatch && prefixMatch[1].trim().length > 3) {
      supplierName = prefixMatch[1].trim();
      break;
    }
    // If line has letters, no digits or colons, and looks like a store name
    if (line.length >= 4 && !line.includes(':') && !/gstin|pan|ph:|phone|date|invoice/i.test(line) && /^[A-Za-z0-9&.,\- ]+$/.test(line)) {
      if (!supplierName) {
        supplierName = line;
      }
    }
  }

  // 3. Invoice Number
  let invoiceNumber = '';
  const invNoMatch = rawText.match(
    /(?:invoice\s*(?:no\.?|num\.?|number|#)|inv\s*(?:no\.?|#)|bill\s*(?:no\.?|#)|tax\s*invoice\s*no\.?)[\s.:#-]*([a-zA-Z0-9/_-]+)/i
  );
  if (invNoMatch && invNoMatch[1].trim()) {
    const val = invNoMatch[1].trim().replace(/[.,;]$/, '');
    if (val.toLowerCase() !== 'invoice' && val.toLowerCase() !== 'date' && val.length >= 2) {
      invoiceNumber = val;
    }
  }

  // 4. Invoice Date
  let invoiceDate = '';
  const dateMatch = rawText.match(
    /(?:invoice\s*date|inv\s*date|bill\s*date|date\s*of\s*issue|dated?|date)[\s.:#-]*([0-9]{1,2}[-/.][0-9]{1,2}[-/.][0-9]{2,4}|[0-9]{1,2}\s+[a-zA-Z]{3,9}\s+[0-9]{2,4})/i
  );
  if (dateMatch && dateMatch[1].trim()) {
    invoiceDate = dateMatch[1].trim();
  }

  // 5. Total Amount
  let totalAmount: number | null = null;
  const totalMatch = rawText.match(
    /(?:grand\s*total|invoice\s*total|total\s*amount|net\s*payable|total\s*payable|round\s*off\s*total|net\s*amount|total\s*\(₹\)|total\s*\(rs\))[\s.:₹Rs]*([0-9,]+(?:\.[0-9]{1,2})?)/i
  );
  if (totalMatch && totalMatch[1]) {
    const parsed = parseFloat(totalMatch[1].replace(/,/g, ''));
    if (!isNaN(parsed) && parsed > 0) {
      totalAmount = parsed;
    }
  }

  return {
    supplierName,
    supplierGstin,
    invoiceNumber,
    invoiceDate,
    totalAmount,
    rawText,
  };
}

// ── Split Header Line (Handles Tabs, Pipes, Multi-space and Single-space PDFs) ─
export function splitHeaderLine(rawHeader: string): string[] {
  if (rawHeader.includes('\t')) {
    return rawHeader.split('\t').map((h) => h.trim()).filter(Boolean);
  }
  if (rawHeader.includes('|')) {
    return rawHeader.split('|').map((h) => h.trim()).filter(Boolean);
  }
  const multiSpace = rawHeader.split(/\s{2,}/).map((h) => h.trim()).filter(Boolean);
  if (multiSpace.length > 2) {
    return multiSpace;
  }

  // Single-space fallback: identify known header boundary positions
  const knownKeywords = [
    'item description',
    'product description',
    'particulars',
    'description',
    'product name',
    'item name',
    'hsn/sac',
    'hsn code',
    'hsn',
    'sac code',
    'sac',
    'billed qty',
    'total qty',
    'quantity',
    'qty',
    'units',
    'pcs',
    'uom',
    'unit',
    'pkg',
    'unit rate',
    'basic rate',
    'rate',
    'price',
    'mrp',
    'gst %',
    'tax rate',
    'tax %',
    'gst rate',
    'gst',
    'cgst',
    'sgst',
    'igst',
    'taxable value',
    'taxable amount',
    'basic amount',
    'amount',
    'discount',
    'disc',
    'total amount',
    'item total',
    'total',
  ].sort((a, b) => b.length - a.length);

  const matchedPositions: { start: number; end: number; text: string }[] = [];
  const lower = rawHeader.toLowerCase();

  for (const kw of knownKeywords) {
    let pos = 0;
    while ((pos = lower.indexOf(kw, pos)) !== -1) {
      const isWordStart = pos === 0 || /\s/.test(rawHeader[pos - 1]);
      const isWordEnd = pos + kw.length === rawHeader.length || /[\s%]/.test(rawHeader[pos + kw.length]);
      if (isWordStart) {
        const overlaps = matchedPositions.some((m) => !(pos + kw.length <= m.start || pos >= m.end));
        if (!overlaps) {
          matchedPositions.push({
            start: pos,
            end: pos + kw.length,
            text: rawHeader.slice(pos, pos + kw.length),
          });
        }
      }
      pos += kw.length;
    }
  }

  if (matchedPositions.length >= 2) {
    matchedPositions.sort((a, b) => a.start - b.start);
    return matchedPositions.map((m) => m.text.trim());
  }

  return rawHeader.split(/\s+/).filter(Boolean);
}

// ── Detect Table Columns & Headers ───────────────────────────────────────────
export function detectTableColumns(
  lines: string[],
  savedMapping?: ColumnMapping
): {
  headerLineIndex: number;
  headers: string[];
  columnMap: ColumnMapping;
  dataLines: string[];
} {
  let headerLineIndex = -1;
  let headers: string[] = [];

  const CORE_KEYWORDS = ['description', 'particulars', 'item', 'product', 'qty', 'rate', 'price', 'hsn', 'amount', 'total'];

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    let hitCount = 0;
    for (const kw of CORE_KEYWORDS) {
      if (lower.includes(kw)) hitCount++;
    }
    if (hitCount >= 2) {
      headerLineIndex = i;
      break;
    }
  }

  if (headerLineIndex >= 0) {
    headers = splitHeaderLine(lines[headerLineIndex]);
  }

  // Map detected headers to standard keys
  const columnMap: ColumnMapping = { ...(savedMapping || {}) };

  const findBestCol = (field: keyof typeof HEADING_SYNONYMS): string | undefined => {
    if (columnMap[field]) return columnMap[field];
    const synonyms = HEADING_SYNONYMS[field] || [];
    for (const h of headers) {
      const hLower = h.toLowerCase();
      if (synonyms.some((syn) => hLower.includes(syn))) {
        return h;
      }
    }
    return undefined;
  };

  columnMap.productNameCol = columnMap.productNameCol || findBestCol('productName');
  columnMap.quantityCol = columnMap.quantityCol || findBestCol('quantity');
  columnMap.uomCol = columnMap.uomCol || findBestCol('uom');
  columnMap.rateCol = columnMap.rateCol || findBestCol('rate');
  columnMap.hsnCol = columnMap.hsnCol || findBestCol('hsn');
  columnMap.gstRateCol = columnMap.gstRateCol || findBestCol('gstRate');
  columnMap.taxableCol = columnMap.taxableCol || findBestCol('taxable');
  columnMap.discountCol = columnMap.discountCol || findBestCol('discount');
  columnMap.totalCol = columnMap.totalCol || findBestCol('total');

  const dataLines = headerLineIndex >= 0 ? lines.slice(headerLineIndex + 1) : lines;

  return {
    headerLineIndex,
    headers,
    columnMap,
    dataLines,
  };
}

// ── Line Items Parser ─────────────────────────────────────────────────────────
export function parseLineItems(
  dataLines: string[],
  columnMap: ColumnMapping,
  headers: string[] = []
): ExtractedProductItem[] {
  const items: ExtractedProductItem[] = [];

  const FOOTER_TOKENS = [
    'grand total',
    'total amount',
    'sub total',
    'subtotal',
    'e.&o.e',
    'amount chargeable',
    'bank details',
    'terms & conditions',
    'authorized signatory',
    'for ',
    'rupees ',
    'tax summary',
    'hsn/sac summary',
  ];

  let currentItem: ExtractedProductItem | null = null;
  let rowSeq = 1;

  for (let idx = 0; idx < dataLines.length; idx++) {
    const line = dataLines[idx].trim();
    if (!line) continue;

    const lower = line.toLowerCase();
    // Stop at footer
    if (FOOTER_TOKENS.some((ft) => lower.startsWith(ft) || lower.includes('grand total') || lower.includes('authorized signatory'))) {
      if (currentItem) {
        items.push(currentItem);
        currentItem = null;
      }
      break;
    }

    // Split line tokens (by tab, pipe, or multiple spaces)
    let tokens: string[] = [];
    if (line.includes('\t')) {
      tokens = line.split('\t').map((t) => t.trim());
    } else if (line.includes('|')) {
      tokens = line.split('|').map((t) => t.trim()).filter(Boolean);
    } else {
      tokens = line.split(/\s{2,}/).map((t) => t.trim());
      // If only single spaces, use whitespace tokenization
      if (tokens.length <= 2) {
        tokens = line.split(/\s+/).map((t) => t.trim());
      }
    }

    // Check if line contains numeric tokens typical of a product row (quantity, rate, or amount)
    const numericTokens = tokens.filter((t) => /^-?[0-9]+(?:\.[0-9]+)?%?$/.test(t.replace(/,/g, '')));
    const hasNumbers = numericTokens.length >= 1;

    // Check if line has an HSN code (2 to 8 digits)
    const hasHsn = tokens.some((t) => /^[0-9]{2,8}$/.test(t) && !t.includes('.'));

    const isNewItemRow = (hasNumbers && tokens.length >= 3) || (hasHsn && tokens.length >= 2);

    if (isNewItemRow) {
      if (currentItem) {
        items.push(currentItem);
      }

      // Parse individual fields from tokens using columnMap or positional heuristics
      let name = '';
      let hsn = '';
      let qty = '1';
      let uom = '';
      let rate = '';
      let gstRate = '5%';
      let discount = '';
      let taxable = '';
      let total = '';

      // Smart alignment: if line was split on spaces and has more tokens than headers,
      // group the description words into a single token at descColIdx
      let alignedTokens = tokens;
      const descColIdx = headers.findIndex((h) =>
        /description|particulars|item|product|goods/i.test(h)
      );

      if (descColIdx >= 0 && tokens.length > headers.length && !line.includes('\t') && !line.includes('|')) {
        const otherColsCount = headers.length - 1;
        const nameTokensCount = tokens.length - otherColsCount;
        if (nameTokensCount > 0) {
          const namePart = tokens.slice(descColIdx, descColIdx + nameTokensCount).join(' ');
          alignedTokens = [
            ...tokens.slice(0, descColIdx),
            namePart,
            ...tokens.slice(descColIdx + nameTokensCount),
          ];
        }
      }

      // If headers count matches aligned tokens count, map by index
      if (headers.length > 0 && Math.abs(headers.length - alignedTokens.length) <= 1) {
        const getColVal = (colName?: string): string => {
          if (!colName) return '';
          const cIdx = headers.findIndex((h) => h.toLowerCase() === colName.toLowerCase());
          return cIdx >= 0 && cIdx < alignedTokens.length ? alignedTokens[cIdx] : '';
        };

        name = getColVal(columnMap.productNameCol);
        qty = getColVal(columnMap.quantityCol);
        uom = getColVal(columnMap.uomCol);
        rate = getColVal(columnMap.rateCol);
        hsn = getColVal(columnMap.hsnCol);
        gstRate = getColVal(columnMap.gstRateCol);
        taxable = getColVal(columnMap.taxableCol);
        discount = getColVal(columnMap.discountCol);
        total = getColVal(columnMap.totalCol);
      }

      // HSN fallback
      if (!hsn) {
        const hsnToken = tokens.find((t) => /^[0-9]{4,8}$/.test(t));
        if (hsnToken) hsn = hsnToken;
      }

      // Name fallback
      if (!name) {
        const hsnIndex = hsn ? tokens.indexOf(hsn) : -1;
        if (hsnIndex > 0) {
          const nameTokens = tokens.slice(0, hsnIndex).filter((t, i) => !(i === 0 && /^[0-9]+[.)]?$/.test(t)));
          name = nameTokens.join(' ').trim();
        } else {
          const firstNumIdx = tokens.findIndex((t, i) => i > 0 && /^[0-9]+(?:\.[0-9]+)?$/.test(t));
          if (firstNumIdx > 0) {
            const nameTokens = tokens.slice(0, firstNumIdx).filter((t, i) => !(i === 0 && /^[0-9]+[.)]?$/.test(t)));
            name = nameTokens.join(' ').trim();
          } else {
            for (const token of tokens) {
              const clean = token.replace(/^[0-9]+[.)]\s*/, '').trim();
              if (clean.length > 2 && /[a-zA-Z]/.test(clean)) {
                name = clean;
                break;
              }
            }
          }
        }
      }

      // UOM fallback
      if (!uom) {
        const uomWords = ['kg', 'kgs', 'g', 'gm', 'gms', 'ltr', 'lt', 'liter', 'ml', 'pcs', 'pc', 'box', 'pack', 'pkt', 'bag', 'tin', 'bottle', 'can', 'nos'];
        const foundUom = tokens.find((t) => uomWords.includes(t.toLowerCase()));
        if (foundUom) uom = foundUom;
      }

      // Qty fallback: find integer or decimal quantity
      if (!qty || qty === '1') {
        const qtyToken = tokens.find((t) => /^[0-9]+(?:\.[0-9]{1,3})?$/.test(t) && t !== hsn && parseFloat(t) > 0);
        if (qtyToken) qty = qtyToken;
      }

      // Rate / Price fallback
      if (!rate) {
        const rateCandidates = tokens.filter((t) => /^[0-9]+(?:\.[0-9]{2})$/.test(t) && t !== hsn && t !== qty);
        if (rateCandidates.length > 0) {
          rate = rateCandidates[0];
        }
      }

      // GST Rate fallback
      if (!gstRate || gstRate === '5%') {
        const gstToken = tokens.find((t) => /^[0-9]{1,2}%$/.test(t) || /^(?:0|5|12|18|28)(?:\.0)?%?$/.test(t));
        if (gstToken) {
          gstRate = gstToken.endsWith('%') ? gstToken : `${gstToken}%`;
        }
      }

      // UOM fallback
      uom = normalizeUom(uom, name);

      // Clean up Product Name
      name = name.replace(/^[0-9]+[.)\-\s]+/, '').trim();

      // Clean numbers
      const parsedQty = parseFloat(qty.replace(/,/g, '')) || 1;
      const parsedRate = parseFloat(rate.replace(/,/g, '')) || 0;
      const parsedTaxable = parseFloat(taxable.replace(/,/g, '')) || 0;
      const parsedDiscount = parseFloat(discount.replace(/,/g, '')) || 0;

      // Calculate cost price
      let unitCost = parsedRate;
      if (unitCost <= 0 && parsedTaxable > 0 && parsedQty > 0) {
        unitCost = parsedTaxable / parsedQty;
      }
      if (parsedDiscount > 0 && unitCost > 0) {
        if (parsedDiscount < 100) {
          // Discount percent
          unitCost = unitCost * (1 - parsedDiscount / 100);
        } else {
          // Discount amount per line
          unitCost = Math.max(0, unitCost - parsedDiscount / parsedQty);
        }
      }

      // Format cost price string
      const costPriceStr = unitCost > 0 ? unitCost.toFixed(2) : '';

      // Determine priceInclusive
      const priceInclusive: 'Yes' | 'No' = 'Yes'; // Supermarket retail standard for import template

      currentItem = {
        id: `inv-item-${rowSeq++}`,
        name: name || `Product Item ${rowSeq}`,
        uom,
        sellingPrice: '', // Left blank for manual entry if not in catalog
        costPrice: costPriceStr,
        hsn: hsn || '',
        gstRate: gstRate || '5%',
        priceInclusive,
        openingStock: parsedQty.toString(),
        rawRate: rate,
        rawQty: qty,
        rawDiscount: discount,
        rawTaxable: taxable,
        rawTotal: total,
        confidence: name && costPriceStr && parsedQty > 0 ? 'high' : 'medium',
        flags: [],
      };

      if (!costPriceStr) currentItem.flags?.push('Cost Price uncertain');
      if (!hsn) currentItem.flags?.push('HSN missing');
      if (!currentItem.sellingPrice) currentItem.flags?.push('Selling Price required');
    } else if (currentItem) {
      // Continuation line (wrapped product description or batch/expiry notes)
      const continuationText = line.replace(/^[0-9]+[.)\-\s]+/, '').trim();
      if (continuationText && !continuationText.startsWith('Page') && !continuationText.startsWith('GSTIN')) {
        currentItem.name = `${currentItem.name} ${continuationText}`.trim();
      }
    }
  }

  if (currentItem) {
    items.push(currentItem);
  }

  return items;
}

// ── Cross-Reference Catalog & Fill Selling Prices ────────────────────────────
export function enrichWithCatalog(
  items: ExtractedProductItem[],
  catalogItems: CatalogItemSummary[]
): ExtractedProductItem[] {
  // Build lookup index: normalized name -> catalog item
  const byName = new Map<string, CatalogItemSummary>();
  const byHsn = new Map<string, CatalogItemSummary>();

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const c of catalogItems) {
    const k = norm(c.name);
    if (k && !byName.has(k)) byName.set(k, c);
    if (c.hsn && !byHsn.has(c.hsn)) byHsn.set(c.hsn, c);
  }

  return items.map((item) => {
    const itemNorm = norm(item.name);
    let matched = byName.get(itemNorm);

    // Fuzzy matching by substring if exact normalized match fails
    if (!matched && itemNorm.length > 5) {
      for (const [cName, catItem] of byName.entries()) {
        if (cName.includes(itemNorm) || itemNorm.includes(cName)) {
          matched = catItem;
          break;
        }
      }
    }

    let sellingPrice = item.sellingPrice;
    const flags = [...(item.flags || [])];

    if (matched && matched.spMinor && matched.spMinor > 0) {
      sellingPrice = (matched.spMinor / 100).toFixed(2);
      // Remove 'Selling Price required' flag if it was matched
      const flagIdx = flags.indexOf('Selling Price required');
      if (flagIdx >= 0) flags.splice(flagIdx, 1);
    } else {
      if (!flags.includes('Selling Price required')) {
        flags.push('Selling Price required');
      }
    }

    return {
      ...item,
      sellingPrice,
      flags,
    };
  });
}

// ── ExcelJS Generation: Exact 8-Column Template ──────────────────────────────
export async function generateTemplateExcel(products: ExtractedProductItem[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Adaptive Billing Software';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Supplier Products', {
    views: [{ showGridLines: true }],
  });

  // EXACT 8 COLUMNS:
  // 1. Product Name
  // 2. UOM
  // 3. Selling Price
  // 4. Cost Price
  // 5. HSN
  // 6. GST Rate
  // 7. Price Inclusive of GST
  // 8. Opening Stock
  worksheet.columns = [
    { header: 'Product Name', key: 'productName', width: 34 },
    { header: 'UOM', key: 'uom', width: 12 },
    { header: 'Selling Price', key: 'sellingPrice', width: 16 },
    { header: 'Cost Price', key: 'costPrice', width: 16 },
    { header: 'HSN', key: 'hsn', width: 14 },
    { header: 'GST Rate', key: 'gstRate', width: 14 },
    { header: 'Price Inclusive of GST', key: 'priceInclusive', width: 24 },
    { header: 'Opening Stock', key: 'openingStock', width: 16 },
  ];

  // Header styling
  const headerRow = worksheet.getRow(1);
  headerRow.height = 26;
  headerRow.font = {
    name: 'Calibri',
    size: 11,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4F46E5' }, // Modern indigo
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  // Align column headers
  worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };

  // Add Product Rows
  for (let i = 0; i < products.length; i++) {
    const p = products[i];

    const spNum = p.sellingPrice ? parseFloat(p.sellingPrice) : null;
    const cpNum = p.costPrice ? parseFloat(p.costPrice) : null;
    const stockNum = p.openingStock ? parseFloat(p.openingStock) : 0;

    const row = worksheet.addRow({
      productName: p.name || '',
      uom: p.uom || 'pcs',
      sellingPrice: spNum !== null && !isNaN(spNum) ? spNum : '',
      costPrice: cpNum !== null && !isNaN(cpNum) ? cpNum : '',
      hsn: p.hsn ? String(p.hsn) : '',
      gstRate: p.gstRate || '5%',
      priceInclusive: p.priceInclusive || 'Yes',
      openingStock: !isNaN(stockNum) ? stockNum : 0,
    });

    row.height = 20;

    // Formatting
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(4).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(8).alignment = { vertical: 'middle', horizontal: 'right' };

    // Set number formats
    if (spNum !== null && !isNaN(spNum)) {
      row.getCell(3).numFmt = '#,##0.00';
    }
    if (cpNum !== null && !isNaN(cpNum)) {
      row.getCell(4).numFmt = '#,##0.00';
    }
    if (!isNaN(stockNum)) {
      row.getCell(8).numFmt = '#,##0';
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
