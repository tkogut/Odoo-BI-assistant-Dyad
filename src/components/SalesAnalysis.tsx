"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { showError, showSuccess, showLoading, dismissToast } from "@/utils/toast";
import { exportToCsv } from "@/lib/exportCsv";
import { analyzeSales as analyzeSalesRequest } from "@/lib/mcpRelayClient";

interface SalesAnalysisProps {
  relayHost: string;
  apiKey: string;
}

interface SalesData {
  total_sales: number;
  orders_count: number;
  top_products: {
    id: number;
    name: string;
    qty: number;
    revenue: number;
  }[];
}

export const SalesAnalysis = ({ relayHost, apiKey }: SalesAnalysisProps) => {
  const [startDate, setStartDate] = useState("2025-01-01");
  const [endDate, setEndDate] = useState("2025-09-01");
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SalesData | null>(null);

  const handleAnalyzeSales = async () => {
    if (!apiKey || !relayHost) {
      showError("Please provide Relay Host and API Key.");
      return;
    }

    setLoading(true);
    setData(null);
    const toastId = showLoading("Fetching sales data...");

    try {
      const result = await analyzeSalesRequest(relayHost, apiKey, startDate, endDate, Number(limit));

      // Some relays return success flag even with 200; respect that
      if (result && result.success === false) {
        throw new Error(result.error || result.message || "Failed to fetch sales data.");
      }

      setData(result);
      showSuccess("Sales data loaded successfully.");
    } catch (error) {
      dismissToast(toastId);
      showError(error instanceof Error ? error.message : "An unknown error occurred.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(value);
  };

  const renderMachineBlocks = (d: SalesData) => {
    const kpiBlock = {
      total_sales: d.total_sales,
      unit: "EUR",
      period: `${startDate}:${endDate}`,
    };

    const tableBlock = {
      columns: ["id", "name", "qty", "revenue"],
      rows: d.top_products.map((p) => [p.id, p.name, p.qty, p.revenue]),
    };

    const chartBlock = {
      series: [{ name: "Revenue", data: d.top_products.map((p) => p.revenue) }],
      labels: d.top_products.map((p) => p.name),
    };

    return { kpiBlock, tableBlock, chartBlock };
  };

  const renderHumanSummary = (d: SalesData) => {
    if (!d.top_products || d.top_products.length === 0) {
      return `Total sales between ${startDate} and ${endDate} were ${formatCurrency(d.total_sales)} across ${d.orders_count} orders. No top-products data available.`;
    }
    const top = d.top_products[0];
    return `Between ${startDate} and ${endDate} total sales were ${formatCurrency(d.total_sales)} across ${d.orders_count} orders. Top product: ${top.name} (id ${top.id}) with revenue ${formatCurrency(top.revenue)}.`;
  };

  const followupPayloads = (d: SalesData) => {
    // Suggest a read_group to get top customers by revenue
    const salesByCustomer = {
      model: "sale.order",
      method: "read_group",
      args: [[["date_order", ">=", startDate], ["date_order", "<=", endDate]]],
      kwargs: {
        fields: ["partner_id", "amount_total"],
        groupby: ["partner_id"],
        limit: 10,
        orderby: "amount_total desc",
      },
    };

    const productDrilldown = {
      model: "product.product",
      method: "search_read",
      args: [[["id", "in", d.top_products.map((p) => p.id)]]],
      kwargs: { fields: ["id", "name", "categ_id", "standard_price", "list_price"] },
    };

    return { salesByCustomer, productDrilldown };
  };

  const handleCopy = async (obj: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
      showSuccess("Copied to clipboard.");
    } catch (e) {
      console.error(e);
      showError("Failed to copy to clipboard.");
    }
  };

  const handleExportTopProducts = () => {
    if (!data || !data.top_products) {
      showError("No top products to export.");
      return;
    }
    const columns = ["id", "name", "qty", "revenue"];
    const rows = data.top_products.map((p) => [p.id, p.name, p.qty, p.revenue]);
    exportToCsv("top_products.csv", columns, rows);
    showSuccess("CSV download started.");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Query Parameters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <Label htmlFor="start-date">Start Date</Label>
            <Input id="start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="end-date">End Date</Label>
            <Input id="end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="limit">Limit</Label>
            <Input id="limit" type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
          </div>
          <Button onClick={handleAnalyzeSales} disabled={loading} className="md:col-span-3">
            {loading ? "Analyzing..." : "Analyze Sales"}
          </Button>
        </CardContent>
      </Card>

      {data && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Total Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrency(data.total_sales)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Orders Count</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{data.orders_count}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top Products by Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.top_products}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} interval={0} />
                    <YAxis tickFormatter={(value) => new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'short' }).format(value)} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#8884d8" name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top Products Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-3">
                <div />
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => handleCopy(renderMachineBlocks(data).kpiBlock)}>Copy KPIs</Button>
                  <Button variant="ghost" onClick={() => handleCopy(renderMachineBlocks(data).chartBlock)}>Copy Chart</Button>
                  <Button variant="ghost" onClick={() => handleCopy(renderMachineBlocks(data).tableBlock)}>Copy Table JSON</Button>
                  <Button variant="ghost" onClick={handleExportTopProducts}>Export CSV</Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead className="text-right">Quantity Sold</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top_products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>{product.id}</TableCell>
                      <TableCell>{product.name}</TableCell>
                      <TableCell className="text-right">{product.qty}</TableCell>
                      <TableCell className="text-right">{formatCurrency(product.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Machine-friendly outputs */}
              <div className="mt-4">
                <h3 className="text-lg font-medium mb-2">Machine-friendly outputs</h3>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium">KPIs</h4>
                    <pre className="bg-muted p-3 rounded text-sm overflow-auto">
                      {JSON.stringify(renderMachineBlocks(data).kpiBlock, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <h4 className="font-medium">Chart (series + labels)</h4>
                    <pre className="bg-muted p-3 rounded text-sm overflow-auto">
                      {JSON.stringify(renderMachineBlocks(data).chartBlock, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <h4 className="font-medium">Top products (table)</h4>
                    <pre className="bg-muted p-3 rounded text-sm overflow-auto">
                      {JSON.stringify(renderMachineBlocks(data).tableBlock, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Human summary */}
              <div className="mt-4">
                <h3 className="text-lg font-medium mb-2">Summary</h3>
                <p className="text-sm text-muted-foreground">{renderHumanSummary(data)}</p>
              </div>

              {/* Follow-up suggestions */}
              <div className="mt-4">
                <h3 className="text-lg font-medium mb-2">Follow-up queries (copy & run)</h3>
                <p className="text-sm mb-2">Suggested minimal drilldowns to run via POST /api/execute_method:</p>
                <div className="space-y-2">
                  <div>
                    <h4 className="font-medium">Top customers by revenue</h4>
                    <pre className="bg-muted p-3 rounded text-sm overflow-auto">
{JSON.stringify(followupPayloads(data).salesByCustomer, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <h4 className="font-medium">Product details for top products</h4>
                    <pre className="bg-muted p-3 rounded text-sm overflow-auto">
{JSON.stringify(followupPayloads(data).productDrilldown, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>

            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};