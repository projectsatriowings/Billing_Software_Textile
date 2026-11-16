import { requirePerm } from '../auth.ts';
import { bad, notFound, FileResponse, V, type Router } from '../http.ts';
import { newId } from '../security.ts';
import { audit } from '../audit.ts';
import { j } from '../db/index.ts';
import {
  extractTextFromInvoice,
  parseInvoiceMetadata,
  detectTableColumns,
  parseLineItems,
  enrichWithCatalog,
  generateTemplateExcel,
  type ColumnMapping,
  type ExtractedProductItem,
} from '../services/supplierInvoiceParser.ts';

export function registerSupplierInvoices(r: Router): void {
  // ── 1. EXTRACT INVOICE DATA (PDF / OCR) ──────────────────────────────────────
  r.post('/api/supplier-invoices/extract', requirePerm('items.view'), async (ctx) => {
    const b = ctx.body || {};
    const tenantId = ctx.user!.tenantId;

    const fileName = V.str(b.fileName, 'File name', { required: true, max: 255 });
    if (typeof b.fileData !== 'string' || !b.fileData.trim()) {
      throw bad('File data is required', 'VALIDATION', { field: 'fileData' });
    }
    const fileData = b.fileData.trim();
    const mimeType = typeof b.mimeType === 'string' ? b.mimeType : undefined;
    const supplierId = typeof b.supplierId === 'string' ? b.supplierId : undefined;

    // Decode base64 buffer
    let buffer: Buffer;
    try {
      // Strip potential data URL prefix: "data:application/pdf;base64,..."
      const cleanData = fileData.replace(/^data:[^;]+;base64,/, '');
      buffer = Buffer.from(cleanData, 'base64');
    } catch {
      throw bad('Invalid base64 file data provided', 'INVALID_FILE_DATA');
    }

    if (buffer.byteLength === 0) {
      throw bad('Uploaded file is empty (0 bytes)', 'EMPTY_FILE');
    }

    // Check for saved supplier mapping if supplierId was chosen
    let savedMapping: any = null;
    if (supplierId) {
      savedMapping = await ctx.db.one(
        'SELECT * FROM supplier_invoice_mappings WHERE tenant_id = ? AND supplier_id = ? LIMIT 1',
        [tenantId, supplierId]
      );
    }

    // Extract text and tables
    const { text, pages, isOcr, tableData, sparseText } = await extractTextFromInvoice(buffer, fileName, mimeType);

    if (!text || text.trim().length === 0) {
      throw bad(
        'Unable to recognize text in this invoice. The document may be blurry, blank, or protected. Please try a clearer scan or enter details manually.',
        'OCR_EMPTY'
      );
    }

    // Parse metadata (Supplier name, GSTIN, Inv No, Date, Total)
    const metadata = parseInvoiceMetadata(text, sparseText);

    // If no saved mapping by supplierId, attempt match by extracted GSTIN or Name
    if (!savedMapping && metadata.supplierGstin) {
      savedMapping = await ctx.db.one(
        'SELECT * FROM supplier_invoice_mappings WHERE tenant_id = ? AND lower(supplier_gstin) = lower(?) LIMIT 1',
        [tenantId, metadata.supplierGstin]
      );
    }
    if (!savedMapping && metadata.supplierName) {
      savedMapping = await ctx.db.one(
        'SELECT * FROM supplier_invoice_mappings WHERE tenant_id = ? AND lower(supplier_name) = lower(?) LIMIT 1',
        [tenantId, metadata.supplierName]
      );
    }

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    // Detect columns and map headers
    const initialMapping: ColumnMapping = savedMapping?.mapping
      ? (typeof savedMapping.mapping === 'string' ? JSON.parse(savedMapping.mapping) : savedMapping.mapping)
      : undefined;

    const { headers, columnMap, dataLines } = detectTableColumns(lines, initialMapping);

    // Parse product items
    let rawProducts = parseLineItems(dataLines, columnMap, headers, sparseText);

    // If line parsing yielded 0 items but we have tableData from PDF, attempt tableData mapping
    if (rawProducts.length === 0 && tableData && tableData.length > 1) {
      const tableLines = tableData.map((row) => row.join('\t'));
      const colDet = detectTableColumns(tableLines, initialMapping);
      rawProducts = parseLineItems(colDet.dataLines, colDet.columnMap, colDet.headers, sparseText);
    }

    // Cross-reference existing items in catalog to fill Selling Price
    const catalogRows = await ctx.db.query<{
      name: string;
      sku: string;
      barcode: string;
      hsn: string;
      spMinor: number;
      costMinor: number;
    }>(
      'SELECT name, sku, barcode, hsn, price_minor as "spMinor", cost_minor as "costMinor" FROM items WHERE tenant_id = ? AND active = true',
      [tenantId]
    );

    const enrichedProducts = enrichWithCatalog(rawProducts, catalogRows);

    // Calculate sum of extracted item costs & line item tax
    let calculatedTotalCost = 0;
    let calculatedItemTax = 0;
    for (const p of enrichedProducts) {
      const cp = parseFloat(p.costPrice || '0');
      const qty = parseFloat(p.openingStock || '0');
      const rateBp = p.gstRate ? parseFloat(p.gstRate.replace('%', '')) * 100 : 500;
      if (!isNaN(cp) && !isNaN(qty) && cp > 0 && qty > 0) {
        const lineCost = cp * qty;
        calculatedTotalCost += lineCost;
        calculatedItemTax += (lineCost * rateBp) / 10000;
      }
    }

    const invoiceTaxSummary = (metadata.cgstAmount ?? 0) + (metadata.sgstAmount ?? 0) + (metadata.igstAmount ?? 0);
    if (invoiceTaxSummary > 0 && Math.abs(invoiceTaxSummary - calculatedItemTax) > 1.0) {
      metadata.discrepancyWarning = `Tax discrepancy: Calculated item tax (₹${calculatedItemTax.toFixed(2)}) differs from invoice tax summary (₹${invoiceTaxSummary.toFixed(2)}) by ₹${Math.abs(invoiceTaxSummary - calculatedItemTax).toFixed(2)}. Please verify.`;
    }

    await audit(ctx.db, ctx, {
      action: 'extract_supplier_invoice',
      entity: 'supplier_invoices',
      entityId: metadata.invoiceNumber || fileName,
      detail: { fileName, pages, isOcr, itemCount: enrichedProducts.length },
    });

    return {
      ok: true,
      metadata,
      headers,
      detectedColumns: headers,
      columnMap,
      savedMapping: savedMapping
        ? {
            id: savedMapping.id,
            supplierId: savedMapping.supplier_id,
            supplierName: savedMapping.supplier_name,
            supplierGstin: savedMapping.supplier_gstin,
            mapping: typeof savedMapping.mapping === 'string' ? JSON.parse(savedMapping.mapping) : savedMapping.mapping,
          }
        : null,
      pageCount: pages,
      isOcr,
      products: enrichedProducts,
      calculatedTotalCost: Math.round(calculatedTotalCost * 100) / 100,
      dataLinesPreview: dataLines.slice(0, 100),
    };
  });

  // ── 2. REPARSE WITH UPDATED COLUMN MAPPING ──────────────────────────────────
  r.post('/api/supplier-invoices/reparse', requirePerm('items.view'), async (ctx) => {
    const b = ctx.body || {};
    const tenantId = ctx.user!.tenantId;

    const dataLines = Array.isArray(b.dataLines) ? (b.dataLines as string[]) : [];
    const headers = Array.isArray(b.headers) ? (b.headers as string[]) : [];
    const columnMap = (b.columnMap || {}) as ColumnMapping;

    if (!dataLines.length) {
      throw bad('No data lines provided to reparse', 'NO_DATA');
    }

    const rawProducts = parseLineItems(dataLines, columnMap, headers);

    const catalogRows = await ctx.db.query<{
      name: string;
      sku: string;
      barcode: string;
      hsn: string;
      spMinor: number;
      costMinor: number;
    }>(
      'SELECT name, sku, barcode, hsn, price_minor as "spMinor", cost_minor as "costMinor" FROM items WHERE tenant_id = ? AND active = true',
      [tenantId]
    );

    const enrichedProducts = enrichWithCatalog(rawProducts, catalogRows);

    let calculatedTotalCost = 0;
    for (const p of enrichedProducts) {
      const cp = parseFloat(p.costPrice || '0');
      const qty = parseFloat(p.openingStock || '0');
      if (!isNaN(cp) && !isNaN(qty) && cp > 0 && qty > 0) {
        calculatedTotalCost += cp * qty;
      }
    }

    return {
      ok: true,
      products: enrichedProducts,
      calculatedTotalCost: Math.round(calculatedTotalCost * 100) / 100,
      columnMap,
    };
  });

  // ── 3. GET SAVED SUPPLIER MAPPINGS ──────────────────────────────────────────
  r.get('/api/supplier-invoices/mappings', requirePerm('items.view'), async (ctx) => {
    const tenantId = ctx.user!.tenantId;

    const mappings = await ctx.db.query(
      `SELECT id, supplier_id as "supplierId", supplier_name as "supplierName",
              supplier_gstin as "supplierGstin", mapping, header_sample as "headerSample",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM supplier_invoice_mappings
       WHERE tenant_id = ?
       ORDER BY supplier_name ASC`,
      [tenantId]
    );

    return {
      ok: true,
      mappings: mappings.map((m: any) => ({
        ...m,
        mapping: typeof m.mapping === 'string' ? JSON.parse(m.mapping) : m.mapping,
      })),
    };
  });

  // ── 4. SAVE / UPDATE SUPPLIER MAPPING ───────────────────────────────────────
  r.post('/api/supplier-invoices/mappings', requirePerm('items.write'), async (ctx) => {
    const b = ctx.body || {};
    const tenantId = ctx.user!.tenantId;

    const supplierName = V.str(b.supplierName, 'Supplier name', { required: true });
    const supplierGstin = typeof b.supplierGstin === 'string' ? b.supplierGstin.trim().toUpperCase() : null;
    const supplierId = typeof b.supplierId === 'string' ? b.supplierId.trim() : null;
    const mapping = (b.mapping && typeof b.mapping === 'object') ? b.mapping : {};
    const headerSample = Array.isArray(b.headerSample) ? b.headerSample : [];

    // Check if mapping for this supplier already exists
    let existing: any = null;
    if (b.id) {
      existing = await ctx.db.one(
        'SELECT id FROM supplier_invoice_mappings WHERE tenant_id = ? AND id = ?',
        [tenantId, b.id]
      );
    }
    if (!existing && supplierId) {
      existing = await ctx.db.one(
        'SELECT id FROM supplier_invoice_mappings WHERE tenant_id = ? AND supplier_id = ?',
        [tenantId, supplierId]
      );
    }
    if (!existing && supplierGstin) {
      existing = await ctx.db.one(
        'SELECT id FROM supplier_invoice_mappings WHERE tenant_id = ? AND lower(supplier_gstin) = lower(?)',
        [tenantId, supplierGstin]
      );
    }

    if (existing) {
      await ctx.db.exec(
        `UPDATE supplier_invoice_mappings
         SET supplier_name = ?, supplier_gstin = ?, supplier_id = ?, mapping = ?::jsonb,
             header_sample = ?, updated_at = now()
         WHERE tenant_id = ? AND id = ?`,
        [supplierName, supplierGstin, supplierId, j(mapping), headerSample, tenantId, existing.id]
      );
      return { ok: true, id: existing.id, updated: true };
    }

    const id = newId('sim');
    await ctx.db.exec(
      `INSERT INTO supplier_invoice_mappings
       (id, tenant_id, supplier_id, supplier_name, supplier_gstin, mapping, header_sample, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, now(), now())`,
      [id, tenantId, supplierId, supplierName, supplierGstin, j(mapping), headerSample]
    );

    return { ok: true, id, created: true };
  });

  // ── 5. DELETE SUPPLIER MAPPING ──────────────────────────────────────────────
  r.delete('/api/supplier-invoices/mappings/:id', requirePerm('items.write'), async (ctx) => {
    const tenantId = ctx.user!.tenantId;
    const id = ctx.params.id;

    const count = await ctx.db.exec(
      'DELETE FROM supplier_invoice_mappings WHERE tenant_id = ? AND id = ?',
      [tenantId, id]
    );

    if (count === 0) {
      throw notFound('Supplier mapping');
    }

    return { ok: true, deleted: true };
  });

  // ── 6. EXPORT EXACT 8-COLUMN EXCEL TEMPLATE (ExcelJS) ───────────────────────
  r.post('/api/supplier-invoices/export-excel', requirePerm('items.view'), async (ctx) => {
    const b = ctx.body || {};
    const products: ExtractedProductItem[] = Array.isArray(b.products) ? b.products : [];

    if (products.length === 0) {
      throw bad('No products provided for Excel export', 'EMPTY_PRODUCTS');
    }

    const buffer = await generateTemplateExcel(products);

    const invoiceNum = (b.invoiceNumber || 'INV').replace(/[^\w-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Supplier_Product_Import_${invoiceNum}_${dateStr}.xlsx`;

    return new FileResponse(
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename
    );
  });
}
