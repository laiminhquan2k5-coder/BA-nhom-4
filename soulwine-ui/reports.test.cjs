const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

function fixture() {
  const context = vm.createContext({ console, Intl, Date, structuredClone, Blob, TextEncoder });
  for (const file of ["data.js", "ui.js", "workspace.js", "views.js", "workflows.js", "management.js"]) vm.runInContext(readFileSync(join(__dirname, file), "utf8"), context, { filename: file });
  const app = readFileSync(join(__dirname, "app.js"), "utf8");
  vm.runInContext(app.slice(app.indexOf("function canUseReport("), app.indexOf("function exportData(")), context, { filename: "report-functions.js" });
  vm.runInContext(`
    state.loggedIn = true; state.role = "director"; state.activeUserId = "D";
    state.users = [{id:"D",name:"Director",email:"d@example.test",status:"user_active",roleIds:["director"]}, {id:"S1",name:"Lan",email:"lan@example.test",status:"user_active",roleIds:["sales_staff"]}, {id:"S2",name:"An",email:"an@example.test",status:"user_active",roleIds:["sales_staff"]}];
    state.products = [{sku:"A",name:"Wine A",category:"Red",unit:"Chai",physical:20,held:0,damaged:0,min:5,retail:1000,wholesale:800,status:"product_active"}, {sku:"B",name:"Wine B",category:"White",unit:"Chai",physical:10,held:0,damaged:0,min:5,retail:2000,wholesale:1800,status:"product_active"}];
    state.customers = [{id:"C1",name:"Company",type:"Bán sỉ",kind:"business"},{id:"C2",name:"Retail",type:"Bán lẻ",kind:"individual"}];
    state.suppliers = [{id:"N1",name:"Supplier",tax:"",contact:"Contact",phone:"0900000000",email:"n@example.test",address:"Address",terms:"30 ngày"}];
    state.attachments = {}; state.credentials = [];
  `, context);
  return { run: (code) => vm.runInContext(code, context), context };
}

test("sales periods use Vietnam calendar, Monday weeks, and cross-year boundaries", () => {
  const f = fixture();
  f.run('state.ui.reportPeriod = "today"');
  assert.equal(f.run('salesPeriodRange(new Date("2026-11-22T18:00:00Z")).from'), "2026-11-23");
  f.run('state.ui.reportPeriod = "week"');
  assert.equal(f.run('salesPeriodRange(new Date("2026-11-22T16:00:00Z")).from'), "2026-11-16");
  assert.equal(f.run('salesPeriodRange(new Date("2026-11-22T18:00:00Z")).from'), "2026-11-23");
  assert.equal(f.run('salesPeriodRange(new Date("2027-01-01T05:00:00Z")).to'), "2027-01-03");
  f.run('state.ui.reportPeriod = "quarter"');
  assert.equal(f.run('salesPeriodRange(new Date("2026-11-23T00:00:00Z")).from'), "2026-10-01");
  assert.equal(f.run('salesPeriodRange(new Date("2026-11-23T00:00:00Z")).to'), "2026-12-31");
});

test("sales channel and customer group metrics reconcile to booked completed orders", () => {
  const f = fixture();
  f.run(`
    state.ui.reportPeriod = "week";
    state.orders = [
      {code:"R",createdAt:"2026-11-22T18:00:00Z",created:"23/11/2026",type:"Bán lẻ",channel:"Tại quầy",customerId:"C2",owner:"Lan",status:"completed",total:200,lines:[{sku:"A",qty:2,price:100}]},
      {code:"W",created:"23/11/2026",type:"Bán sỉ",channel:"Hợp đồng",customerId:"C1",owner:"Lan",status:"completed",total:250,lines:[{sku:"A",qty:1,price:200,discountAmount:50},{sku:"B",qty:1,price:100}]},
      {code:"OLD",created:"22/11/2026",type:"Bán lẻ",customerId:"C2",owner:"An",status:"completed",total:999,lines:[{sku:"B",qty:1,price:999}]},
      {code:"PENDING",created:"23/11/2026",type:"Bán lẻ",customerId:"C2",owner:"An",status:"shipping",total:999,lines:[{sku:"B",qty:1,price:999}]}
    ];
    var now = new Date("2026-11-23T03:00:00Z"), sales = salesAnalytics(now);
  `);
  assert.equal(f.run("sales.total"), 450);
  assert.equal(f.run("sales.orders.length"), 2);
  assert.equal(f.run("sales.customerGroups[0].value"), 250);
  assert.equal(f.run("sales.customerGroups[0].qty"), 2);
  assert.equal(f.run("sales.customerGroups[1].value"), 200);
  assert.equal(f.run("sales.products.reduce((sum, row) => sum + row[1].value, 0)"), 450);
  assert.equal(f.run('sales.products.find(row => row[0] === "A")[1].value'), 350);
  f.run("state.products.forEach(product => { product.retail *= 100; product.wholesale *= 100; });");
  assert.equal(f.run('salesAnalytics(now).products.find(row => row[0] === "A")[1].value'), 350);
  f.run('state.ui.reportChannel = "retail"; sales = salesAnalytics(now)');
  assert.equal(f.run("sales.total"), 200);
  f.run('state.ui.reportChannel = "wholesale"; sales = salesAnalytics(now)');
  assert.equal(f.run("sales.total"), 250);
});

test("employee closing rate attributes signed contracts to quote owner and handles zero denominator", () => {
  const f = fixture();
  f.run(`
    state.ui.reportPeriod = "week";
    state.quotes = [{code:"Q1",owner:"Lan",channel:"Bán sỉ",createdAt:"23/11/2026"},{code:"Q2",owner:"An",channel:"Bán sỉ",createdAt:"23/11/2026"},{code:"OLD",owner:"Lan",channel:"Bán sỉ",createdAt:"20/11/2026"}];
    state.contracts = [{code:"H1",quote:"Q1",owner:"An",status:"active",signedAt:"23/11/2026"},{code:"H2",quote:"OLD",owner:"Lan",status:"active",signedAt:"23/11/2026"},{code:"H3",quote:"Q2",owner:"An",status:"pending_sign",signedAt:""}];
    state.users.push({id:"S3",name:"Mai",email:"mai@example.test",roleIds:["sales_staff"],status:"user_active"});
    var sales = salesAnalytics(new Date("2026-11-23T03:00:00Z"));
  `);
  assert.equal(f.run('sales.staff.find(person => person.name === "Lan").signedContracts'), 2);
  assert.equal(f.run('sales.staff.find(person => person.name === "Lan").closeRate'), 200);
  assert.equal(f.run('sales.staff.find(person => person.name === "An").closeRate'), 0);
  assert.equal(f.run('sales.staff.find(person => person.name === "Mai").closeRate'), null);
  const html = f.run("salesReportView(sales)");
  for (const label of ["Doanh số theo nhóm khách hàng", "Hiệu suất nhân viên kinh doanh", "Báo giá đã lập", "Hợp đồng ký", "Tỷ lệ chốt", "Đơn hoàn tất", "Doanh số", "—"]) assert.ok(html.includes(label), label);
});

test("slow moving stock includes exact thresholds, positive stock and selected category only", () => {
  const f = fixture();
  f.run(`
    state.products.push({sku:"C",category:"Red",physical:0},{sku:"D",category:"Red",physical:3},{sku:"E",category:"Red",physical:4});
    state.movements = [
      {sku:"A",type:"Xuất kho",qty:-1,time:"23/09/2026 10:00"},
      {sku:"B",type:"Xuất kho",qty:-1,time:"01/08/2026 10:00"},
      {sku:"C",type:"Xuất kho",qty:-1,time:"01/08/2026 10:00"},
      {sku:"D",type:"Nhập kho",qty:3,time:"14/08/2026 10:00"}
    ];
    var report = slowMovingInventory("Red", new Date("2026-11-22T05:00:00Z"));
  `);
  assert.equal(f.run("report.minimum"), 60);
  assert.deepEqual(Array.from(f.run("report.rows"), row => row.product.sku), ["D", "A"]);
  assert.equal(f.run('report.rows.find(row => row.product.sku === "A").days'), 60);
  assert.equal(f.run('report.rows.find(row => row.product.sku === "D").lastOut'), "");
  f.run('state.ui.slowMovingDays = 90; report = slowMovingInventory("Red", new Date("2026-11-22T05:00:00Z"));');
  assert.deepEqual(Array.from(f.run("report.rows"), row => row.product.sku), ["D"]);
});

test("warehouse quality uses absolute inbound discrepancies and physical returns, with zero-safe ratios", () => {
  const f = fixture();
  f.run(`
    state.stocktakes = [{code:"K1",status:"completed",lines:[{system:10,count:8},{system:5,count:5},{system:1,count:null}]},{code:"K2",status:"cancelled",lines:[{system:1,count:0}]},{code:"K3",status:"counting",lines:[{system:0,count:0}]}];
    state.receipts = [{status:"completed",lines:[{ordered:10,received:8,damaged:2}]},{status:"returned",lines:[{ordered:10,received:12,damaged:0}]},{status:"receiving",lines:[{ordered:9,received:null,damaged:null}]}];
    state.returns = [{receivedAt:"2026-11-22T01:00:00Z",receivedQty:2,status:"return_received",qty:2},{status:"completed",qty:1},{status:"inspecting",qty:7}];
    state.issues = [{status:"issued",lines:[{qty:8},{qty:2}]}];
    var quality = warehouseQuality();
  `);
  assert.equal(f.run("quality.measures[0].numerator"), 1);
  assert.equal(f.run("quality.measures[0].denominator"), 3);
  assert.equal(f.run("quality.measures[1].rate"), 20);
  assert.equal(f.run("quality.measures[2].rate"), 10);
  assert.equal(f.run("quality.measures[3].rate"), 30);
  assert.equal(f.run("quality.periods.length"), 2);
  f.run("state.stocktakes = []; state.receipts = []; state.returns = []; state.issues = []; quality = warehouseQuality();");
  assert.ok(Array.from(f.run("quality.measures")).every(measure => measure.rate === null));
  const html = f.run("warehouseQualityView()");
  assert.ok(html.includes("Chất lượng vận hành kho"));
  assert.ok(html.includes("—"));
  assert.ok(!/NaN|Infinity/.test(html));
});

test("supplier catalogs and receipt variance notes survive validation and hydration", () => {
  const f = fixture();
  f.run(`
    state.suppliers[0].catalog = [{sku:"A",price:150000,leadDays:365,updatedAt:"2026-11-22T01:00:00.000Z"}];
    state.receipts = [{code:"PN-1",status:"receiving",lines:[{sku:"A",ordered:2,received:1,good:1,damaged:0}],evidence:[],varianceNote:"Thiếu một chai"}];
    var saved = JSON.parse(JSON.stringify(workspaceData())); validateRestoredData(saved);
    hydrateWorkspace({version:1,revision:1,savedAt:"2026-11-22T01:00:00.000Z",data:saved});
  `);
  assert.equal(f.run("state.suppliers[0].catalog[0].leadDays"), 365);
  assert.equal(f.run("state.receipts[0].varianceNote"), "Thiếu một chai");
  for (const change of ["price = 0", "price = 0.5", "leadDays = -1", "leadDays = 366", "leadDays = 0.5", 'sku = "UNKNOWN"', 'updatedAt = "invalid"']) {
    assert.throws(() => f.run(`var bad = structuredClone(saved); bad.suppliers[0].catalog[0].${change}; validateRestoredData(bad);`), /Danh mục cung ứng/);
  }
  assert.throws(() => f.run("var bad = structuredClone(saved); bad.suppliers[0].catalog.push(structuredClone(bad.suppliers[0].catalog[0])); validateRestoredData(bad);"), /Danh mục cung ứng/);
  assert.throws(() => f.run("var bad = structuredClone(saved); bad.receipts[0].varianceNote = 2; validateRestoredData(bad);"), /nguyên nhân sai lệch/);
  assert.throws(() => f.run('var bad = structuredClone(saved); bad.receipts[0].varianceNote = "x".repeat(1001); validateRestoredData(bad);'), /nguyên nhân sai lệch/);
});

test("supplier supply history renders exactly one summary row per receipt", () => {
  const f = fixture();
  f.run(`
    state.purchaseOrders = [{code:"PO-1",supplier:"N1",status:"returned",lines:[]}];
    state.receipts = [{code:"PN-1",supplier:"N1",po:"PO-1",status:"returned",eta:"20/11/2026",threshold:5,lines:[{sku:"A",ordered:10,received:8,good:8,damaged:0,counted:true},{sku:"B",ordered:10,received:12,good:12,damaged:0,counted:true}]},{code:"PN-2",supplier:"N1",po:"PO-1",previousReceipt:"PN-1",status:"completed",eta:"21/11/2026",threshold:5,lines:[{sku:"A",ordered:10,received:10,good:10,damaged:0,counted:true}]}];
    var history = supplierDetails(state.suppliers[0]).body.split("Lịch sử cung ứng")[1];
  `);
  const html = f.run("history");
  assert.equal([...html.matchAll(/<tr\b/g)].length, 3);
  for (const label of ["2 lần giao · 1 lô vượt ngưỡng/trả lô · 1 đơn chờ giao lại", "Giao lại sau", "% lệch", f.run("pct(20)"), "var(--danger)"]) assert.ok(html.includes(label), label);
});
