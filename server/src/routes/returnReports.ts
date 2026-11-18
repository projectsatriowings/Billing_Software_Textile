import { requirePerm, requireUser } from '../auth.ts';
import { bad, type Router } from '../http.ts';
import { resolveBranchScope } from '../branchScope.ts';

function getDateRange(filter: string, from?: string, to?: string): { startDate: string; endDate: string } {
  const now = new Date();
  const formatYMD = (d: Date) => d.toISOString().slice(0, 10);

  if (filter === 'yesterday') {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yStr = formatYMD(y);
    return { startDate: yStr, endDate: yStr };
  }
  if (filter === 'this_week') {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(d.setDate(diff));
    return { startDate: formatYMD(monday), endDate: formatYMD(now) };
  }
  if (filter === 'this_month') {
    const d = new Date();
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
    return { startDate: formatYMD(firstDay), endDate: formatYMD(now) };
  }
  if (filter === 'custom' && from && to) {
    return { startDate: from, endDate: to };
  }
  // Default: today
  const todayStr = formatYMD(now);
  return { startDate: todayStr, endDate: todayStr };
}

function normalizeReportRows(rows: any[], reportType: string): any[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const out: any = { ...r };
    for (const [k, v] of Object.entries(r)) {
      const snake = k.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      if (!(snake in out)) out[snake] = v;
      const camel = k.replace(/_([a-z0-9])/g, (_m, c) => c.toUpperCase());
      if (!(camel in out)) out[camel] = v;
    }

    if (reportType === 'daily_sales') {
      const gross = Number(out.gross_sales_minor ?? out.grossSalesMinor ?? 0);
      const ret = Number(out.returns_minor ?? out.returnsMinor ?? out.sales_returns_minor ?? out.salesReturnsMinor ?? 0);
      const net = Number(out.net_sales_minor ?? out.netSalesMinor ?? (gross - ret));
      const salesCount = Number(out.sales_count ?? out.salesCount ?? out.invoices_count ?? out.invoicesCount ?? out.invoice_count ?? 0);
      const returnsCount = Number(out.returns_count ?? out.returnsCount ?? out.return_count ?? 0);

      out.gross_sales_minor = gross;
      out.grossSalesMinor = gross;
      out.returns_minor = ret;
      out.returnsMinor = ret;
      out.sales_returns_minor = ret;
      out.salesReturnsMinor = ret;
      out.net_sales_minor = net;
      out.netSalesMinor = net;
      out.sales_count = salesCount;
      out.salesCount = salesCount;
      out.invoices_count = salesCount;
      out.invoice_count = salesCount;
      out.invoicesCount = salesCount;
      out.returns_count = returnsCount;
      out.returnsCount = returnsCount;
      out.return_count = returnsCount;
    }

    if (reportType === 'sales_returns') {
      const num = out.return_number ?? out.returnNumber ?? out.credit_note_number ?? out.creditNoteNumber ?? '';
      out.return_number = num;
      out.returnNumber = num;
      out.credit_note_number = num;
      out.creditNoteNumber = num;

      const origNum = out.orig_invoice_number ?? out.origInvoiceNumber ?? out.original_invoice_number ?? out.originalInvoiceNumber ?? '—';
      out.orig_invoice_number = origNum;
      out.origInvoiceNumber = origNum;
      out.original_invoice_number = origNum;

      const origDate = out.orig_sale_date ?? out.origSaleDate ?? out.original_sale_date ?? '—';
      out.orig_sale_date = origDate;
      out.origSaleDate = origDate;

      const retDate = out.return_date ?? out.returnDate ?? out.bdate ?? '';
      out.return_date = retDate;
      out.returnDate = retDate;

      const cust = out.customer_name ?? out.customerName ?? 'Walk-in';
      out.customer_name = cust;
      out.customerName = cust;

      const prod = out.product_name ?? out.productName ?? out.item_name ?? out.itemName ?? '—';
      out.product_name = prod;
      out.productName = prod;
      out.item_name = prod;

      const qty = Number(out.return_qty ?? out.returnQty ?? (Number(out.return_qty_milli ?? out.returnQtyMilli ?? 0) / 1000));
      out.return_qty = qty;
      out.returnQty = qty;

      const amt = Number(out.return_amount_minor ?? out.returnAmountMinor ?? out.total_minor ?? out.totalMinor ?? 0);
      out.return_amount_minor = amt;
      out.returnAmountMinor = amt;
      out.total_minor = amt;
      out.totalMinor = amt;

      const reason = out.return_reason ?? out.returnReason ?? out.reason ?? '—';
      out.return_reason = reason;
      out.returnReason = reason;
      out.reason = reason;

      const condition = out.item_condition ?? out.itemCondition ?? 'resellable';
      out.item_condition = condition;
      out.itemCondition = condition;

      const cashier = out.processed_by ?? out.processedBy ?? out.cashier_name ?? out.cashierName ?? 'Cashier';
      out.processed_by = cashier;
      out.processedBy = cashier;
      out.cashier_name = cashier;
      out.cashierName = cashier;
    }

    if (reportType === 'exchanges') {
      out.exchange_id = out.exchange_id ?? out.exchangeId ?? '';
      out.exchangeId = out.exchange_id;
      out.new_invoice_number = out.new_invoice_number ?? out.newInvoiceNumber ?? '';
      out.newInvoiceNumber = out.new_invoice_number;
      out.new_purchase_minor = Number(out.new_purchase_minor ?? out.newPurchaseMinor ?? out.new_sold_minor ?? out.newSoldMinor ?? out.total_minor ?? out.totalMinor ?? 0);
      out.newPurchaseMinor = out.new_purchase_minor;
      out.exchange_adjusted_minor = Number(out.exchange_adjusted_minor ?? out.exchangeAdjustedMinor ?? 0);
      out.exchangeAdjustedMinor = out.exchange_adjusted_minor;
      out.customer_paid_minor = Number(out.customer_paid_minor ?? out.customerPaidMinor ?? out.customer_difference_paid_minor ?? out.customerDifferencePaidMinor ?? out.paid_minor ?? out.paidMinor ?? 0);
      out.customerPaidMinor = out.customer_paid_minor;
      out.excess_refund_minor = Number(out.excess_refund_minor ?? out.excessRefundMinor ?? out.remaining_credit_minor ?? out.remainingCreditMinor ?? 0);
      out.excessRefundMinor = out.excess_refund_minor;
    }

    if (reportType === 'refunds') {
      out.id = out.id ?? out.refund_id ?? out.refundId ?? '';
      out.refund_id = out.id;
      out.refundId = out.id;
      out.bdate = out.bdate ?? out.refund_date ?? out.refundDate ?? '';
      out.refund_date = out.bdate;
      out.refundDate = out.bdate;
      out.method = out.method ?? out.refund_method ?? out.refundMethod ?? 'cash';
      out.refund_method = out.method;
      out.refundMethod = out.method;
      out.amount_minor = Number(out.amount_minor ?? out.amountMinor ?? out.refund_amount_minor ?? out.refundAmountMinor ?? 0);
      out.amountMinor = out.amount_minor;
      out.refund_amount_minor = out.amount_minor;
      out.refundAmountMinor = out.amount_minor;
      out.reference = out.reference ?? out.reference_no ?? out.referenceNo ?? out.refund_ref ?? '—';
      out.customer_name = out.customer_name ?? out.customerName ?? 'Walk-in';
      out.customerName = out.customer_name;
      out.cashier_name = out.cashier_name ?? out.cashierName ?? out.processed_by ?? out.processedBy ?? 'Cashier';
      out.cashierName = out.cashier_name;
    }

    if (reportType === 'gross_profit') {
      const netSales = Number(out.net_sales_minor ?? out.netSalesMinor ?? 0);
      const netCogs = Number(out.net_cogs_minor ?? out.netCogsMinor ?? 0);
      const grossProfit = Number(out.gross_profit_minor ?? out.grossProfitMinor ?? (netSales - netCogs));
      out.net_sales_minor = netSales;
      out.netSalesMinor = netSales;
      out.net_cogs_minor = netCogs;
      out.netCogsMinor = netCogs;
      out.gross_profit_minor = grossProfit;
      out.grossProfitMinor = grossProfit;
      out.operating_expenses_minor = Number(out.operating_expenses_minor ?? out.operatingExpensesMinor ?? 0);
      out.operatingExpensesMinor = out.operating_expenses_minor;
      out.net_profit_minor = Number(out.net_profit_minor ?? out.netProfitMinor ?? (grossProfit - out.operating_expenses_minor));
      out.netProfitMinor = out.net_profit_minor;
    }

    if (reportType === 'stock_returns') {
      const cond = out.item_condition ?? out.itemCondition ?? 'resellable';
      out.item_condition = cond;
      out.itemCondition = cond;
      out.condition = cond;
      out.location = out.location ?? (cond === 'resellable' ? 'MAIN STORE' : cond === 'damaged' ? 'DAMAGED WAREHOUSE' : 'DEFECTIVE BIN');
      out.total_qty = Number(out.total_qty ?? out.totalQty ?? (Number(out.return_qty_milli ?? out.returnQtyMilli ?? 0) / 1000));
      out.totalQty = out.total_qty;
      out.total_cost_minor = Number(out.total_cost_minor ?? out.totalCostMinor ?? out.total_cost_value_minor ?? out.totalCostValueMinor ?? 0);
      out.totalCostMinor = out.total_cost_minor;
    }

    if (reportType === 'store_credits') {
      out.customer_name = out.customer_name ?? out.customerName ?? 'Walk-in';
      out.customerName = out.customer_name;
      out.customer_phone = out.customer_phone ?? out.customerPhone ?? out.phone ?? '—';
      out.customerPhone = out.customer_phone;
      out.amount_minor = Number(out.amount_minor ?? out.amountMinor ?? out.issued_amount_minor ?? out.issuedAmountMinor ?? 0);
      out.amountMinor = out.amount_minor;
      out.balance_minor = Number(out.balance_minor ?? out.balanceMinor ?? out.remaining_balance_minor ?? out.remainingBalanceMinor ?? 0);
      out.balanceMinor = out.balance_minor;
      out.used_minor = Number(out.used_minor ?? out.usedMinor ?? (out.amount_minor - out.balance_minor));
      out.usedMinor = out.used_minor;
      out.status = out.status ?? 'active';
    }

    if (reportType === 'cashier_performance') {
      out.cashier_name = out.cashier_name ?? out.cashierName ?? 'Cashier';
      out.cashierName = out.cashier_name;
      const salesCount = Number(out.sales_count ?? out.salesCount ?? out.invoices_count ?? out.invoicesCount ?? out.invoice_count ?? 0);
      out.sales_count = salesCount;
      out.salesCount = salesCount;
      out.invoices_count = salesCount;
      out.invoice_count = salesCount;
      out.invoicesCount = salesCount;
      const gross = Number(out.gross_sales_minor ?? out.grossSalesMinor ?? 0);
      out.gross_sales_minor = gross;
      out.grossSalesMinor = gross;
      const retCount = Number(out.returns_count ?? out.returnsCount ?? out.return_count ?? 0);
      out.returns_count = retCount;
      out.returnsCount = retCount;
      out.return_count = retCount;
      const retAmt = Number(out.returns_minor ?? out.returnsMinor ?? 0);
      out.returns_minor = retAmt;
      out.returnsMinor = retAmt;
      out.net_sales_minor = Number(out.net_sales_minor ?? out.netSalesMinor ?? (gross - retAmt));
      out.netSalesMinor = out.net_sales_minor;
    }

    return out;
  });
}

export function registerReturnReports(r: Router) {
  r.get('/api/reports/returns-module', requirePerm('reports'), async (ctx) => {
    const tenantId = ctx.user!.tenantId;
    const reportType = String(ctx.query.reportType || 'daily_sales').toLowerCase();
    const filter = String(ctx.query.filter || 'today').toLowerCase();
    const { startDate, endDate } = getDateRange(filter, ctx.query.from as string, ctx.query.to as string);

    const scope = await resolveBranchScope(ctx);
    const branchFilterSql = (!scope.isSuperAdminAll && scope.branchId) ? 'AND i.branch_id = ?' : '';
    const branchParams = (!scope.isSuperAdminAll && scope.branchId) ? [scope.branchId] : [];

    // 1. DAILY SALES REPORT
    if (reportType === 'daily_sales') {
      const rows = await ctx.db.query<any>(
        `WITH sales AS (
          SELECT bdate,
                 COUNT(*)::int AS sales_count,
                 COALESCE(SUM(total_minor), 0)::bigint AS gross_sales_minor
          FROM invoices i
          WHERE i.tenant_id = ? AND i.kind = 'sale' AND i.status = 'posted'
            AND i.bdate >= ? AND i.bdate <= ? ${branchFilterSql}
          GROUP BY bdate
        ),
        returns AS (
          SELECT bdate,
                 COUNT(*)::int AS returns_count,
                 COALESCE(SUM(total_minor), 0)::bigint AS returns_minor
          FROM invoices i
          WHERE i.tenant_id = ? AND i.kind = 'credit_note' AND i.status = 'posted'
            AND i.bdate >= ? AND i.bdate <= ? ${branchFilterSql}
          GROUP BY bdate
        ),
        payments_summary AS (
          SELECT (p.created_at)::date::text AS bdate,
                 COALESCE(SUM(CASE WHEN COALESCE(p.method, 'cash') = 'cash' THEN p.amount_minor ELSE 0 END), 0)::bigint AS cash_minor,
                 COALESCE(SUM(CASE WHEN p.method = 'upi' THEN p.amount_minor ELSE 0 END), 0)::bigint AS upi_minor,
                 COALESCE(SUM(CASE WHEN p.method = 'card' THEN p.amount_minor ELSE 0 END), 0)::bigint AS card_minor
          FROM payments p
          LEFT JOIN invoices i ON i.id = p.invoice_id
          WHERE p.tenant_id = ? AND (p.status IS NULL OR p.status = 'posted')
            AND (p.created_at)::date >= ?::date AND (p.created_at)::date <= ?::date
            ${branchFilterSql}
          GROUP BY (p.created_at)::date::text
        )
        SELECT
          COALESCE(s.bdate, r.bdate, p.bdate) AS date,
          COALESCE(s.gross_sales_minor, 0)::bigint AS gross_sales_minor,
          COALESCE(r.returns_minor, 0)::bigint AS returns_minor,
          (COALESCE(s.gross_sales_minor, 0) - COALESCE(r.returns_minor, 0))::bigint AS net_sales_minor,
          COALESCE(s.sales_count, 0)::int AS sales_count,
          COALESCE(r.returns_count, 0)::int AS returns_count,
          COALESCE(p.cash_minor, 0)::bigint AS cash_minor,
          COALESCE(p.upi_minor, 0)::bigint AS upi_minor,
          COALESCE(p.card_minor, 0)::bigint AS card_minor
        FROM sales s
        FULL OUTER JOIN returns r ON r.bdate = s.bdate
        FULL OUTER JOIN payments_summary p ON p.bdate = COALESCE(s.bdate, r.bdate)
        ORDER BY date DESC`,
        [
          tenantId, startDate, endDate, ...branchParams,
          tenantId, startDate, endDate, ...branchParams,
          tenantId, startDate, endDate, ...branchParams,
        ],
      );
      const normalizedRows = normalizeReportRows(rows, reportType);
      const summary = {
        totalGrossSalesMinor: normalizedRows.reduce((acc, r) => acc + (r.grossSalesMinor || 0), 0),
        totalReturnsMinor: normalizedRows.reduce((acc, r) => acc + (r.returnsMinor || 0), 0),
        totalNetSalesMinor: normalizedRows.reduce((acc, r) => acc + (r.netSalesMinor || 0), 0),
        totalSalesCount: normalizedRows.reduce((acc, r) => acc + (r.salesCount || 0), 0),
        totalReturnsCount: normalizedRows.reduce((acc, r) => acc + (r.returnsCount || 0), 0),
      };
      return { reportType, filter, startDate, endDate, summary, rows: normalizedRows };
    }

    // 2. SALES RETURN REPORT
    if (reportType === 'sales_returns') {
      const rows = await ctx.db.query<any>(
        `SELECT
          cn.id AS return_id,
          cn.number AS return_number,
          cn.bdate AS return_date,
          cn.created_at AS return_timestamp,
          orig.number AS orig_invoice_number,
          orig.bdate AS orig_sale_date,
          COALESCE(cn.customer_name, 'Retail Customer') AS customer_name,
          cn.customer_phone,
          il.name AS product_name,
          il.qty_milli::bigint AS return_qty_milli,
          il.unit,
          il.total_minor::bigint AS return_amount_minor,
          il.reason AS return_reason,
          COALESCE(il.item_condition, 'resellable') AS item_condition,
          COALESCE(cn.refund_mode, 'credit') AS refund_method,
          u.name AS processed_by
         FROM invoices cn
         JOIN invoice_lines il ON il.invoice_id = cn.id
         LEFT JOIN invoices orig ON orig.id = cn.linked_invoice_id
         LEFT JOIN users u ON u.id = cn.created_by
         WHERE cn.tenant_id = ?
           AND cn.kind = 'credit_note'
           AND cn.status = 'posted'
           AND cn.bdate >= ? AND cn.bdate <= ?
           ${branchFilterSql.replace('i.branch_id', 'cn.branch_id')}
         ORDER BY cn.created_at DESC`,
        [tenantId, startDate, endDate, ...branchParams],
      );
      return { reportType, filter, startDate, endDate, rows: normalizeReportRows(rows, reportType) };
    }

    // 3. EXCHANGE REPORT
    if (reportType === 'exchanges') {
      const rows = await ctx.db.query<any>(
        `SELECT
          sale.exchange_id,
          sale.bdate AS date,
          sale.created_at AS timestamp,
          sale.number AS new_invoice_number,
          cn.number AS return_credit_note_number,
          COALESCE(cn.total_minor, 0)::bigint AS old_returned_minor,
          COALESCE(sale.total_minor, 0)::bigint AS new_sold_minor,
          COALESCE(sale.exchange_adjusted_minor, 0)::bigint AS exchange_adjusted_minor,
          GREATEST(0, COALESCE(sale.total_minor, 0) - COALESCE(cn.total_minor, 0))::bigint AS customer_difference_paid_minor,
          GREATEST(0, COALESCE(cn.total_minor, 0) - COALESCE(sale.total_minor, 0))::bigint AS remaining_credit_minor,
          COALESCE(sale.customer_name, 'Retail Customer') AS customer_name,
          sale.customer_phone,
          u.name AS processed_by
         FROM invoices sale
         LEFT JOIN invoices cn ON cn.exchange_id = sale.exchange_id AND cn.kind = 'credit_note'
         LEFT JOIN users u ON u.id = sale.created_by
         WHERE sale.tenant_id = ?
           AND sale.is_exchange = TRUE
           AND sale.kind = 'sale'
           AND sale.status = 'posted'
           AND sale.bdate >= ? AND sale.bdate <= ?
           ${branchFilterSql.replace('i.branch_id', 'sale.branch_id')}
         ORDER BY sale.created_at DESC`,
        [tenantId, startDate, endDate, ...branchParams],
      );
      return { reportType, filter, startDate, endDate, rows: normalizeReportRows(rows, reportType) };
    }

    // 4. REFUND REPORT
    if (reportType === 'refunds') {
      const rows = await ctx.db.query<any>(
        `SELECT
          rfd.id AS refund_id,
          rfd.bdate AS refund_date,
          rfd.created_at AS timestamp,
          rfd.amount_minor::bigint AS refund_amount_minor,
          rfd.method AS refund_method,
          rfd.reference_no,
          cn.number AS credit_note_number,
          orig.number AS orig_invoice_number,
          COALESCE(p.name, cn.customer_name, 'Retail Customer') AS customer_name,
          u.name AS processed_by,
          rfd.notes
         FROM refund_transactions rfd
         LEFT JOIN invoices cn ON cn.id = rfd.credit_note_id
         LEFT JOIN invoices orig ON orig.id = rfd.orig_invoice_id
         LEFT JOIN parties p ON p.id = rfd.party_id
         LEFT JOIN users u ON u.id = rfd.processed_by
         WHERE rfd.tenant_id = ?
           AND rfd.bdate >= ? AND rfd.bdate <= ?
         ORDER BY rfd.created_at DESC`,
        [tenantId, startDate, endDate],
      );
      return { reportType, filter, startDate, endDate, rows: normalizeReportRows(rows, reportType) };
    }

    // 5. DAILY GROSS PROFIT REPORT
    if (reportType === 'gross_profit') {
      const rows = await ctx.db.query<any>(
        `WITH daily_sales AS (
          SELECT bdate,
                 COALESCE(SUM(total_minor), 0)::bigint AS gross_sales_minor
          FROM invoices i
          WHERE i.tenant_id = ? AND i.kind = 'sale' AND i.status = 'posted'
            AND i.bdate >= ? AND i.bdate <= ? ${branchFilterSql}
          GROUP BY bdate
        ),
        daily_returns AS (
          SELECT bdate,
                 COALESCE(SUM(total_minor), 0)::bigint AS returns_minor
          FROM invoices i
          WHERE i.tenant_id = ? AND i.kind = 'credit_note' AND i.status = 'posted'
            AND i.bdate >= ? AND i.bdate <= ? ${branchFilterSql}
          GROUP BY bdate
        ),
        sales_cogs AS (
          SELECT i.bdate,
                 COALESCE(SUM(il.qty_milli * COALESCE(il.cost_minor, it.cost_minor, 0) / 1000), 0)::bigint AS sold_cogs_minor
          FROM invoice_lines il
          JOIN invoices i ON i.id = il.invoice_id
          LEFT JOIN items it ON it.id = il.item_id
          WHERE i.tenant_id = ? AND i.kind = 'sale' AND i.status = 'posted'
            AND i.bdate >= ? AND i.bdate <= ? ${branchFilterSql}
          GROUP BY i.bdate
        ),
        returned_cogs AS (
          SELECT i.bdate,
                 COALESCE(SUM(il.qty_milli * COALESCE(il.cost_minor, it.cost_minor, 0) / 1000), 0)::bigint AS restock_cogs_minor
          FROM invoice_lines il
          JOIN invoices i ON i.id = il.invoice_id
          LEFT JOIN items it ON it.id = il.item_id
          WHERE i.tenant_id = ? AND i.kind = 'credit_note' AND i.status = 'posted'
            AND (il.item_condition = 'resellable' OR il.restock = TRUE)
            AND i.bdate >= ? AND i.bdate <= ? ${branchFilterSql}
          GROUP BY i.bdate
        ),
        daily_expenses AS (
          SELECT expense_date AS bdate,
                 COALESCE(SUM(total_minor), 0)::bigint AS expenses_minor
          FROM expenses
          WHERE tenant_id = ? AND status = 'posted'
            AND expense_date >= ? AND expense_date <= ?
          GROUP BY expense_date
        )
        SELECT
          ds.bdate AS date,
          COALESCE(ds.gross_sales_minor, 0)::bigint AS gross_sales_minor,
          COALESCE(dr.returns_minor, 0)::bigint AS returns_minor,
          (COALESCE(ds.gross_sales_minor, 0) - COALESCE(dr.returns_minor, 0))::bigint AS net_sales_minor,
          COALESCE(sc.sold_cogs_minor, 0)::bigint AS sold_cogs_minor,
          COALESCE(rc.restock_cogs_minor, 0)::bigint AS restock_cogs_minor,
          (COALESCE(sc.sold_cogs_minor, 0) - COALESCE(rc.restock_cogs_minor, 0))::bigint AS net_cogs_minor,
          ((COALESCE(ds.gross_sales_minor, 0) - COALESCE(dr.returns_minor, 0)) -
           (COALESCE(sc.sold_cogs_minor, 0) - COALESCE(rc.restock_cogs_minor, 0)))::bigint AS gross_profit_minor,
          COALESCE(de.expenses_minor, 0)::bigint AS operating_expenses_minor,
          (((COALESCE(ds.gross_sales_minor, 0) - COALESCE(dr.returns_minor, 0)) -
           (COALESCE(sc.sold_cogs_minor, 0) - COALESCE(rc.restock_cogs_minor, 0))) -
           COALESCE(de.expenses_minor, 0))::bigint AS net_profit_minor
        FROM daily_sales ds
        LEFT JOIN daily_returns dr ON dr.bdate = ds.bdate
        LEFT JOIN sales_cogs sc ON sc.bdate = ds.bdate
        LEFT JOIN returned_cogs rc ON rc.bdate = ds.bdate
        LEFT JOIN daily_expenses de ON de.bdate = ds.bdate
        ORDER BY ds.bdate DESC`,
        [
          tenantId, startDate, endDate, ...branchParams,
          tenantId, startDate, endDate, ...branchParams,
          tenantId, startDate, endDate, ...branchParams,
          tenantId, startDate, endDate, ...branchParams,
          tenantId, startDate, endDate,
        ],
      );
      const normalizedRows = normalizeReportRows(rows, reportType);
      const summary = {
        totalNetSalesMinor: normalizedRows.reduce((acc, r) => acc + (r.netSalesMinor || 0), 0),
        totalNetCogsMinor: normalizedRows.reduce((acc, r) => acc + (r.netCogsMinor || 0), 0),
        totalGrossProfitMinor: normalizedRows.reduce((acc, r) => acc + (r.grossProfitMinor || 0), 0),
        totalOperatingExpensesMinor: normalizedRows.reduce((acc, r) => acc + (r.operatingExpensesMinor || 0), 0),
        totalNetProfitMinor: normalizedRows.reduce((acc, r) => acc + (r.netProfitMinor || 0), 0),
      };
      return { reportType, filter, startDate, endDate, summary, rows: normalizedRows };
    }

    // 6. STOCK RETURN REPORT (Resellable vs Damaged vs Defective)
    if (reportType === 'stock_returns') {
      const rows = await ctx.db.query<any>(
        `SELECT
          il.id,
          cn.bdate AS return_date,
          cn.number AS credit_note_number,
          orig.number AS orig_invoice_number,
          COALESCE(il.item_condition, 'resellable') AS item_condition,
          il.name AS product_name,
          COALESCE(it.barcode, it.sku, '—') AS barcode,
          il.qty_milli::bigint AS return_qty_milli,
          il.unit,
          il.price_minor::bigint AS price_minor,
          il.total_minor::bigint AS total_return_amount_minor,
          COALESCE(il.cost_minor, it.cost_minor, 0)::bigint AS unit_cost_minor,
          (il.qty_milli * COALESCE(il.cost_minor, it.cost_minor, 0) / 1000)::bigint AS total_cost_value_minor,
          il.reason,
          cn.customer_name,
          u.name AS processed_by
         FROM invoice_lines il
         JOIN invoices cn ON cn.id = il.invoice_id
         LEFT JOIN invoices orig ON orig.id = cn.linked_invoice_id
         LEFT JOIN items it ON it.id = il.item_id
         LEFT JOIN users u ON u.id = cn.created_by
         WHERE cn.tenant_id = ?
           AND cn.kind = 'credit_note'
           AND cn.status = 'posted'
           AND cn.bdate >= ? AND cn.bdate <= ?
           ${branchFilterSql.replace('i.branch_id', 'cn.branch_id')}
         ORDER BY cn.created_at DESC`,
        [tenantId, startDate, endDate, ...branchParams],
      );

      const normalizedRows = normalizeReportRows(rows, reportType);

      // Summary counts by condition
      let resellableCount = 0;
      let damagedCount = 0;
      let defectiveCount = 0;
      let resellableValueMinor = 0;
      let damagedValueMinor = 0;
      let defectiveValueMinor = 0;

      for (const r of normalizedRows) {
        const c = String(r.item_condition || r.itemCondition).toLowerCase();
        const amt = Number(r.total_return_amount_minor || r.totalReturnAmountMinor || 0);
        if (c === 'damaged') {
          damagedCount++;
          damagedValueMinor += amt;
        } else if (c === 'defective') {
          defectiveCount++;
          defectiveValueMinor += amt;
        } else {
          resellableCount++;
          resellableValueMinor += amt;
        }
      }

      return {
        reportType,
        filter,
        startDate,
        endDate,
        summary: {
          resellableCount,
          damagedCount,
          defectiveCount,
          resellableValueMinor,
          damagedValueMinor,
          defectiveValueMinor,
        },
        rows: normalizedRows,
      };
    }

    // 7. CUSTOMER STORE CREDIT REPORT
    if (reportType === 'store_credits') {
      const rows = await ctx.db.query<any>(
        `SELECT
          sc.id,
          sc.reference_no,
          sc.amount_minor::bigint AS issued_amount_minor,
          sc.balance_minor::bigint AS remaining_balance_minor,
          sc.status,
          sc.created_at::date AS date_issued,
          sc.updated_at AS last_updated,
          p.name AS customer_name,
          p.phone AS customer_phone,
          p.advance_minor::bigint AS total_current_wallet_advance_minor,
          cn.number AS credit_note_number,
          u.name AS issued_by
         FROM store_credits sc
         JOIN parties p ON p.id = sc.party_id
         LEFT JOIN invoices cn ON cn.id = sc.credit_note_id
         LEFT JOIN users u ON u.id = sc.created_by
         WHERE sc.tenant_id = ?
         ORDER BY sc.created_at DESC`,
        [tenantId],
      );
      return { reportType, filter, rows: normalizeReportRows(rows, reportType) };
    }

    // 8. CASHIER-WISE SALES AND RETURN REPORT
    if (reportType === 'cashier_performance') {
      const rows = await ctx.db.query<any>(
        `SELECT
          u.id AS cashier_id,
          u.name AS cashier_name,
          u.role AS cashier_role,
          COUNT(CASE WHEN i.kind = 'sale' THEN 1 END)::int AS sales_count,
          COALESCE(SUM(CASE WHEN i.kind = 'sale' THEN i.total_minor ELSE 0 END), 0)::bigint AS gross_sales_minor,
          COUNT(CASE WHEN i.kind = 'credit_note' THEN 1 END)::int AS returns_count,
          COALESCE(SUM(CASE WHEN i.kind = 'credit_note' THEN i.total_minor ELSE 0 END), 0)::bigint AS returns_minor,
          (COALESCE(SUM(CASE WHEN i.kind = 'sale' THEN i.total_minor ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN i.kind = 'credit_note' THEN i.total_minor ELSE 0 END), 0))::bigint AS net_sales_minor,
          COUNT(CASE WHEN i.is_exchange = TRUE AND i.kind = 'sale' THEN 1 END)::int AS exchanges_count
         FROM users u
         LEFT JOIN invoices i ON i.created_by = u.id AND i.tenant_id = u.tenant_id AND i.status = 'posted'
           AND i.bdate >= ? AND i.bdate <= ?
         WHERE u.tenant_id = ?
         GROUP BY u.id, u.name, u.role
         ORDER BY gross_sales_minor DESC`,
        [startDate, endDate, tenantId],
      );
      return { reportType, filter, startDate, endDate, rows: normalizeReportRows(rows, reportType) };
    }

    throw bad(`Unknown reportType: ${reportType}`);
  });
}
