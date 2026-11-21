(function (root) {
  "use strict";
  const SAMPLE_SET_ID = "soulwine-linked-v3-history";
  const LEGACY_SAMPLE_SET_IDS = ["soulwine-linked-v1", "soulwine-linked-v2-compact"];
  const COLLECTION_KEYS = ["products", "customers", "suppliers", "quotes", "approvals", "contracts", "orders", "payments", "reservations", "issues", "deliveries", "returns", "receipts", "purchaseRequests", "purchaseOrders", "documents", "movements", "stocktakes"];
  const PRIMARY_KEYS = { products: "sku", customers: "id", suppliers: "id", approvals: "id", payments: "id", reservations: "id", movements: "id" };
  const ROLE_NAMES = { director: "Giám đốc", accountant: "Kế toán", sales_manager: "Quản lý bán hàng", sales_staff: "Nhân viên bán hàng", warehouse_manager: "Quản lý kho", warehouse_staff: "Nhân viên kho" };

  function pdfContent(reference) {
    const text = `SOULWINE - DU LIEU MINH HOA | ${reference} | KHONG PHAI CHUNG TU THAT`;
    const stream = `BT /F1 12 Tf 45 760 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
    const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
    let file = "%PDF-1.4\n", offsets = [0];
    objects.forEach((object, index) => { offsets.push(file.length); file += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const start = file.length;
    file += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
    return { content: typeof btoa === "function" ? btoa(file) : Buffer.from(file, "ascii").toString("base64"), size: file.length };
  }

  function buildLinkedSampleData({ users, namespace = "LK01", now = new Date() }) {
    const base = new Date(now);
    if (!Number.isFinite(base.valueOf())) throw new Error("Ngày khởi tạo dữ liệu không hợp lệ.");
    const actors = {};
    for (const role of Object.keys(ROLE_NAMES)) {
      const user = users.find((item) => item.status === "user_active" && item.roleIds?.includes(role));
      if (!user) throw new Error(`Thiếu nhân sự đang hoạt động với vai trò ${ROLE_NAMES[role]}. Không thay đổi hồ sơ đăng nhập.`);
      actors[role] = user;
    }
    const collections = Object.fromEntries(COLLECTION_KEYS.map((key) => [key, []]));
    const attachments = {}, activity = [], operations = [], scenarios = [], counters = {};
    const code = (prefix) => `${prefix}-${namespace}-${String(counters[prefix] = (counters[prefix] || 0) + 1).padStart(3, "0")}`;
    const iso = (days, hour = 9, minute = 0) => {
      const local = new Date(base.valueOf() + 7 * 3600000);
      local.setUTCDate(local.getUTCDate() + days); local.setUTCHours(hour, minute, 0, 0);
      const weekday = local.getUTCDay();
      if (weekday === 6) local.setUTCDate(local.getUTCDate() + (days > 0 ? 2 : -1));
      if (weekday === 0) local.setUTCDate(local.getUTCDate() + (days > 0 ? 1 : -2));
      return new Date(local.valueOf() - 7 * 3600000).toISOString();
    };
    const display = (timestamp) => new Date(timestamp).toLocaleDateString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" });
    const stamp = (timestamp) => new Date(timestamp).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour12: false }).replace(",", "").slice(0, 16);
    const add = (key, item) => { item.sampleSet = SAMPLE_SET_ID; item.sampleNamespace = namespace; collections[key].push(item); return item; };
    const owner = (role) => ({ createdBy: actors[role].id, createdById: actors[role].id, owner: actors[role].name });
    const event = (role, action, object, detail, timestamp, tone = "info") => activity.push({ id: code("A"), time: stamp(timestamp), timestamp, actorId: actors[role].id, actor: actors[role].name, roleKey: role, role: ROLE_NAMES[role], action: action, object, detail, tone, sampleSet: SAMPLE_SET_ID });
    const file = (reference, title) => {
      const id = code("FILE"), name = `${reference.replace(/[^A-Za-z0-9_-]/g, "-")}-${title}.pdf`, payload = pdfContent(reference.replace(/[^A-Za-z0-9_-]/g, "-"));
      attachments[id] = { id, name, type: "application/pdf", size: payload.size, content: payload.content, reference, savedAt: iso(-1), sampleSet: SAMPLE_SET_ID };
      return attachments[id];
    };
    const document = (type, reference, role, timestamp, title) => {
      const attachment = file(reference, title);
      return add("documents", { code: code("CT"), type, record: reference, date: display(timestamp), file: attachment.name, fileId: attachment.id, owner: actors[role].name, createdBy: actors[role].id, sampleSet: SAMPLE_SET_ID });
    };
    const total = (lines) => lines.reduce((sum, line) => { const gross = line.price * line.qty; return sum + gross - Math.round(gross * (line.discount || 0) / 100); }, 0);
    const productBySku = (sku) => collections.products.find((item) => item.sku === sku);
    const inventory = (type, sku, physicalDelta, heldDelta, damagedDelta, reference, timestamp, role, note) => operations.push({ type, sku, physicalDelta, heldDelta, damagedDelta, ref: reference, timestamp, role, note });

    for (const [name, contact, terms] of [["Vinimport Hà Nội", "Nguyễn Quốc Bảo", "30 ngày"], ["Wine & Co", "Trần Mai Anh", "45 ngày"]]) {
      add("suppliers", { id: code("NCC"), name, contact, phone: "0900000000", email: `supplier${collections.suppliers.length + 1}@example.test`, tax: "", address: "Hà Nội", terms, skus: 0, lastDelivery: display(iso(-210)), note: "", ...owner("warehouse_manager") });
    }
    const catalog = [
      ["Château Lumières 2019", "Vang đỏ", "Pháp", "750 ml", "13,5%", "Chai", 1450000, 1250000, 60, 12, 0],
      ["Bordeaux Réserve 2020", "Vang đỏ", "Pháp", "750 ml", "14%", "Chai", 990000, 820000, 48, 10, 0],
      ["Set quà Signature", "Quà tặng", "Pháp", "2 chai / hộp", "—", "Hộp", 2800000, 2400000, 24, 6, 0],
      ["Barolo Classico", "Vang đỏ", "Ý", "750 ml", "14,5%", "Chai", 1890000, 1650000, 36, 8, 1],
      ["Chianti Riserva", "Vang đỏ", "Ý", "750 ml", "13%", "Chai", 790000, 650000, 60, 12, 1],
      ["Whisky Single Malt 12", "Whisky", "Scotland", "700 ml", "40%", "Chai", 1850000, 1600000, 20, 24, 1]
    ];
    catalog.forEach(([name, category, origin, volume, abv, unit, retail, wholesale, opening, min, supplier], index) => {
      add("products", { sku: code("SW"), name, category, origin, volume, abv, unit, retail, wholesale, physical: 0, held: 0, damaged: 0, min, status: "product_active", supplier: collections.suppliers[supplier].id, sampleOpening: opening, sampleDamage: index === 5 ? 1 : 0, ...owner("sales_manager") });
    });
    const customers = [
      ["Công ty Minh An", "Bán sỉ", "Nguyễn Văn Minh"], ["Nhà hàng Sen Vàng", "Bán sỉ", "Lê Thu Hà"],
      ["Trần Văn Hùng", "Bán lẻ", "Trần Văn Hùng"], ["Nguyễn Thu Trang", "Bán lẻ", "Nguyễn Thu Trang"]
    ];
    customers.forEach(([name, type, contact], index) => add("customers", { id: code("KH"), name, type, kind: type === "Bán sỉ" ? "business" : "individual", contact, phone: `090100${String(index + 1).padStart(4, "0")}`, email: `customer${index + 1}@example.test`, tax: "", address: `${index + 10} Nguyễn Trãi, Hà Nội`, invoiceAddress: `${index + 10} Nguyễn Trãi, Hà Nội`, ar: 0, orders: 0, note: "", ...owner("sales_staff") }));

    function approval(type, reference, role, status, lines, amount, timestamp, requester = "sales_staff") {
      return add("approvals", { id: code("AP"), type, ref: reference, title: type === "discount" ? "Chiết khấu bán sỉ" : type === "purchase" ? role === "accountant" ? "Kiểm tra tài chính mua hàng" : "Phê duyệt yêu cầu mua" : "Xác nhận thanh toán", assignee: role, status, requester: actors[requester].name, requesterId: actors[requester].id, amount, lines: structuredClone(lines), summary: "Đề nghị xem xét và phê duyệt theo hồ sơ đính kèm.", evidence: [], createdAt: stamp(timestamp), timestamp, age: "", decidedAt: status === "pending" ? null : stamp(new Date(new Date(timestamp).valueOf() + 600000).toISOString()), decidedBy: status === "pending" ? null : actors[role].name, decidedById: status === "pending" ? null : actors[role].id, decidedRole: status === "pending" ? null : role, decisionNote: status === "approved" ? "Đồng ý theo hồ sơ đã kiểm tra" : "" });
    }
    function purchase(products, supplier, days, mode = "completed", quantity = null, roleState = "both") {
      const lines = products.map((product) => ({ sku: product.sku, qty: quantity || product.sampleOpening, price: Math.round(product.wholesale * 0.65) }));
      const request = add("purchaseRequests", { code: code("YCM"), supplier: supplier.id, requester: actors.warehouse_manager.name, requesterId: actors.warehouse_manager.id, createdAt: display(iso(days)), needed: display(iso(days + (mode === "completed" ? 0 : 4))), status: mode === "pending" ? "pending" : "approved", amount: total(lines), lines, note: "Bổ sung hàng phục vụ khách sỉ và định mức tồn", approvals: { accountant: mode !== "pending" || roleState === "accountant", director: mode !== "pending" || roleState === "director" }, ...owner("warehouse_manager") });
      for (const role of ["accountant", "director"]) approval("purchase", request.code, role, request.approvals[role] ? "approved" : "pending", lines, request.amount, iso(days, 8, 10), "warehouse_manager");
      if (mode === "pending") return { request };
      const po = add("purchaseOrders", { code: code("PO"), supplier: supplier.id, request: request.code, createdAt: display(iso(days)), receiveDate: display(iso(days)), amount: request.amount, status: mode === "completed" ? "completed" : "receiving", receipt: "", terms: supplier.terms, lines: structuredClone(lines), ...owner("warehouse_manager") });
      const receipt = add("receipts", { code: code("PN"), po: po.code, supplier: supplier.id, eta: po.receiveDate, status: mode === "completed" ? "completed" : "receiving", threshold: 5, owner: actors.warehouse_staff.name, createdBy: actors.warehouse_staff.id, receivedById: actors.warehouse_staff.id, confirmedById: mode === "completed" ? actors.warehouse_manager.id : null, confirmedBy: mode === "completed" ? actors.warehouse_manager.name : "", evidence: [], note: "Nhân viên kho kiểm đếm; Quản lý kho xác nhận", lines: lines.map((line) => {
        const product = productBySku(line.sku), received = mode === "over" ? line.qty - 4 : line.qty, damaged = mode === "completed" ? product.sampleDamage : mode === "over" ? 1 : 0;
        return { sku: line.sku, ordered: line.qty, received, good: received - damaged, damaged, counted: true };
      }) });
      po.receipt = receipt.code;
      const doc = document("Phiếu nhập kho", receipt.code, "warehouse_staff", iso(days, 9), "phieu-giao"); receipt.evidence.push(doc.file);
      event("warehouse_staff", "Kiểm đếm hàng nhận", receipt.code, `${po.code} · ${receipt.lines.length} dòng hàng`, iso(days, 9));
      if (mode === "completed") {
        receipt.completedAt = iso(days, 9, 15);
        receipt.lines.forEach((line) => inventory("Nhập kho", line.sku, line.received, 0, line.damaged, receipt.code, receipt.completedAt, "warehouse_manager", `${line.good} đạt / ${line.damaged} lỗi · ${po.code}`));
        event("warehouse_manager", "Xác nhận nhập kho", receipt.code, supplier.name, receipt.completedAt, "success");
      }
      return { request, po, receipt };
    }
    collections.suppliers.forEach((supplier) => { const products = collections.products.filter((product) => product.supplier === supplier.id); supplier.skus = products.length; purchase(products, supplier, -210); });

    function quote(customer, specs, days, status = "approved", role = "sales_staff") {
      const lines = specs.map(([index, qty, discount = 0]) => ({ sku: collections.products[index].sku, qty, discount, price: collections.products[index].wholesale }));
      const record = add("quotes", { code: code("BG"), customerId: customer.id, channel: "Bán sỉ", ...owner(role), validUntil: display(iso(status === "expired" ? -5 : 20)), status, version: 1, createdAt: display(iso(days)), createdTimestamp: iso(days), lines, note: "Giao theo lịch hợp đồng; thanh toán theo thỏa thuận", confirmed: status !== "draft", confirmedById: actors[role].id, confirmBasis: "Khách xác nhận qua email" });
      const doc = document("Báo giá", record.code, role, iso(days), "bao-gia");
      if (status !== "draft" && status !== "expired") { const ap = approval("discount", record.code, "director", status === "pending" ? "pending" : "approved", lines, total(lines), iso(days, 9, 15), role); ap.evidence.push(doc.file); record.approvalId = ap.id; }
      event(role, "Lập báo giá", record.code, `${customer.name} · ${total(lines)} VND`, iso(days));
      if (status === "approved") event("director", "Phê duyệt chiết khấu", record.code, "Mức chiết khấu theo từng dòng", iso(days, 9, 25), "success");
      return record;
    }
    function contract(source, days, status = "active", scheme = "50/50", dueDays = 15) {
      const record = add("contracts", { code: code("HD"), customerId: source.customerId, quote: source.code, ...owner("sales_manager"), value: total(source.lines), paid: 0, status, scheme, due: display(iso(dueDays)), signedAt: status === "active" ? display(iso(days)) : "", createdAt: iso(days, 9, 45), lines: structuredClone(source.lines), shipments: [], checklist: { customerConfirm: true, accountantCheck: status !== "checking", directorSign: status === "active" || status === "pending_sign", customerSign: status === "active", scan: status === "active" }, salesOwnerId: actors.sales_staff.id, accountantId: actors.accountant.id, directorId: actors.director.id, warehouseManagerId: actors.warehouse_manager.id });
      event("sales_manager", "Soạn hợp đồng", record.code, source.code, iso(days, 9, 45));
      if (record.checklist.accountantCheck) event("accountant", "Kiểm tra điều khoản hợp đồng", record.code, "Hồ sơ hợp lệ", iso(days, 10), "success");
      if (record.checklist.directorSign) event("director", "Ký hợp đồng", record.code, "Đã ký phía SoulWine", iso(days, 10, 30), "success");
      if (status === "active") { const doc = document("Hợp đồng", record.code, "sales_manager", iso(days, 11), "hop-dong"); record.scanFile = doc.file; record.scanName = doc.file; record.scanId = doc.fileId; }
      return record;
    }
    function wholesale(source, days) {
      return add("orders", { code: code("SO"), customerId: source.customerId, type: "Bán sỉ", channel: "Hợp đồng", quote: source.quote, contract: source.code, ...owner("sales_staff"), created: display(iso(days)), createdAt: iso(days, 12), status: source.paid > 0 ? "eligible" : "pending_payment", total: source.value, paid: source.paid, lines: source.lines.map((line) => ({ ...line, held: 0, shipped: 0 })), note: "Đơn thực hiện theo hợp đồng" });
    }
    function payment(record, amount, days, confirmed = true, method = "Chuyển khoản") {
      const role = method === "Tiền mặt" ? "sales_staff" : "accountant";
      const paid = add("payments", { id: code("PAY"), record: record.code, customerId: record.customerId, amount, date: display(iso(days)), method, reference: code(method === "Tiền mặt" ? "PT" : "FT"), status: confirmed ? "confirmed" : "pending_confirm", confirmedBy: confirmed ? actors[role].name : "", confirmedById: confirmed ? actors[role].id : null, confirmedAt: confirmed ? iso(days, 9, 5) : "", evidenceReadyAt: iso(days), createdBy: actors.sales_staff.id, note: "Chứng từ và số tiền được liên kết với đơn/hợp đồng" });
      paid.evidenceReadyAt = iso(days, record.scheme ? 14 : 9);
      paid.confirmedAt = confirmed ? iso(days, record.scheme ? 14 : 9, 5) : "";
      const attachment = file(paid.id, "chung-tu-thanh-toan"); paid.fileId = attachment.id; paid.proofName = attachment.name;
      if (confirmed) document("Phiếu thu", record.code, role, paid.confirmedAt, "phieu-thu");
      if (confirmed) {
        record.paid += amount;
        collections.orders.filter((order) => order.code === record.code || order.contract === record.code).forEach((order) => { order.paid = record.paid; if (order.status === "pending_payment") order.status = "eligible"; order.eligibleAt = paid.confirmedAt; });
        event(role, "Xác nhận thanh toán", paid.id, `${record.code} · ${amount} VND`, paid.confirmedAt, "success");
      } else { const ap = approval("payment", paid.id, "accountant", "pending", [], amount, paid.evidenceReadyAt, "sales_staff"); ap.evidence.push(attachment.name); event("sales_staff", "Gửi xác nhận chuyển khoản", paid.id, record.code, paid.evidenceReadyAt, "warning"); }
      return paid;
    }
    function reserve(order, items, days, note = "Giữ theo điều kiện thanh toán") {
      items.forEach((item) => {
        const line = order.lines.find((entry) => entry.sku === item.sku); line.held += item.qty;
        add("reservations", { id: code("GR"), order: order.code, customerId: order.customerId, sku: item.sku, qty: item.qty, since: display(iso(days)), expiry: display(iso(7)), status: "holding", note, createdBy: actors.warehouse_manager.id });
        inventory("Giữ hàng", item.sku, 0, item.qty, 0, order.code, iso(days, 10), "warehouse_manager", note);
      });
      order.status = "holding"; order.readyForIssueAt = iso(days, 10);
      event("warehouse_manager", "Xác nhận giữ hàng", order.code, items.map((item) => `${item.sku} × ${item.qty}`).join(", "), iso(days, 10), "success");
    }
    function issue(order, items, days, status = "delivered", shipment = null) {
      const record = add("issues", { code: code("PX"), order: order.code, customerId: order.customerId, date: display(iso(days)), status: "issued", owner: actors.warehouse_manager.name, createdBy: actors.warehouse_manager.id, preparedById: actors.warehouse_staff.id, lines: structuredClone(items) });
      items.forEach((item) => {
        const line = order.lines.find((entry) => entry.sku === item.sku); line.shipped += item.qty; line.held -= item.qty;
        collections.reservations.filter((reservation) => reservation.order === order.code && reservation.sku === item.sku && reservation.status === "holding").forEach((reservation) => { reservation.status = "issued"; reservation.issue = record.code; });
        inventory("Xuất kho", item.sku, -item.qty, -item.qty, 0, record.code, iso(days, 10, 10), "warehouse_manager", order.code);
      });
      order.issueRequestedAt = iso(days, 10, 10);
      const delivery = add("deliveries", { code: code("GH"), order: order.code, customerId: order.customerId, issue: record.code, contract: order.contract || "", shipmentId: shipment?.id || "", items: structuredClone(items), carrier: "Viettel Post", planned: display(iso(days)), status, fee: 65000, payer: order.type === "Bán sỉ" ? "SoulWine" : "Khách hàng", address: collections.customers.find((customer) => customer.id === order.customerId).address, tracking: code("VD"), owner: actors.sales_staff.name, createdBy: actors.sales_staff.id, note: status === "failed" ? "Khách báo chai bị nứt, chờ thu hồi" : "Theo dõi qua biên bản giao nhận" });
      if (status === "delivered") {
        const doc = document("Biên bản giao nhận", order.code, "sales_staff", iso(days, 14), "giao-nhan");
        delivery.evidenceFile = doc.file; delivery.evidence = doc.file; delivery.evidenceId = doc.fileId;
        delivery.resultReceivedAt = iso(days, 14); delivery.resultRecordedAt = iso(days, 14, 10);
        order.status = order.lines.every((line) => line.shipped === line.qty) ? "completed" : "shipping";
      } else order.status = status === "failed" ? "failed" : "shipping";
      if (shipment) { shipment.delivery = delivery.code; shipment.status = status === "delivered" ? "delivered" : status === "failed" ? "failed" : "issued"; shipment.confirmedAt = delivery.resultReceivedAt || ""; shipment.updatedAt = delivery.resultRecordedAt || ""; }
      document("Phiếu xuất kho", order.code, "warehouse_manager", iso(days, 10, 10), "phieu-xuat");
      event("warehouse_staff", "Chuẩn bị và đóng gói", record.code, order.code, iso(days, 10, 5));
      event("warehouse_manager", "Xác nhận xuất kho", record.code, order.code, iso(days, 10, 10), "success");
      if (status === "delivered") event("sales_staff", "Ghi nhận khách đã nhận hàng", delivery.code, order.code, delivery.resultRecordedAt, "success");
      return delivery;
    }
    function retail(customer, specs, days, status = "delivered", cash = true) {
      const lines = specs.map(([index, qty]) => ({ sku: collections.products[index].sku, qty, price: collections.products[index].retail, held: 0, shipped: 0 }));
      const order = add("orders", { code: code("SO"), customerId: customer.id, type: "Bán lẻ", channel: cash ? "Tại quầy" : "Facebook", quote: "", contract: "", ...owner("sales_staff"), created: display(iso(days)), createdAt: iso(days), status: "pending_payment", total: total(lines), paid: 0, lines, note: "Đơn bán lẻ." });
      payment(order, order.total, days, status !== "pending_payment", cash ? "Tiền mặt" : "Chuyển khoản");
      if (status !== "pending_payment") { reserve(order, lines, days); const delivery = issue(order, lines.map((line) => ({ sku: line.sku, qty: line.qty })), days, status); return { order, delivery }; }
      return { order };
    }

    const completedRetail = retail(collections.customers[2], [[0, 2], [4, 2]], -12, "delivered", true);
    const waitingQuote = quote(collections.customers[1], [[0, 8, 8], [2, 2, 5]], -1, "pending");
    const checkContract = contract(quote(collections.customers[0], [[1, 12, 5], [4, 6, 0]], -5), -4, "checking");
    const holdingContract = contract(quote(collections.customers[0], [[0, 8, 8], [2, 2, 5]], -9), -8);
    const holdingOrder = wholesale(holdingContract, -7); payment(holdingContract, holdingContract.value / 2, -6);
    holdingContract.shipments = [1, 2].map((number) => ({ id: `Đợt ${number}`, date: display(iso(number === 1 ? 1 : 8)), items: holdingContract.lines.map((line) => ({ sku: line.sku, qty: line.qty / 2 })), status: number === 1 ? "due" : "planned", note: "Giao theo địa chỉ hợp đồng" }));
    reserve(holdingOrder, holdingContract.shipments[0].items, -1, "Đợt 1 · đã có cọc 50%");
    const payContract = contract(quote(collections.customers[1], [[4, 12, 5], [3, 4, 0]], -8), -7);
    const payOrder = wholesale(payContract, -5); const waitingPayment = payment(payContract, payContract.value / 2, -1, false);
    payContract.shipments = [{ id: "Đợt 1", date: display(iso(4)), items: payContract.lines.map((line) => ({ sku: line.sku, qty: line.qty })), status: "planned", note: "Chờ Kế toán xác nhận khoản cọc" }];

    const facebook = retail(collections.customers[3], [[5, 1]], -1, "pending_payment", false);
    const shipping = retail(collections.customers[2], [[1, 2]], -1, "shipping", false);
    const returned = add("returns", { code: code("DT"), order: completedRetail.order.code, customerId: completedRetail.order.customerId, delivery: completedRetail.delivery.code, sku: completedRetail.order.lines[1].sku, qty: 1, reason: "Chai bị nứt do vận chuyển", source: "Vận chuyển", status: "inspecting", createdAt: display(iso(-1)), evidence: [], note: "Chờ kiểm tra hàng hoàn.", createdBy: actors.sales_staff.id, assignedToId: actors.warehouse_manager.id });
    const returnFile = file(returned.code, "yeu-cau-doi-tra"); returned.evidence.push(returnFile.name);

    const purchasePending = purchase([collections.products[5], collections.products[4]], collections.suppliers[1], -1, "pending", 12);
    const receiptReady = purchase([collections.products[0], collections.products[1]], collections.suppliers[0], -1, "receiving", 12);

    const historyRetails = [
      retail(collections.customers[2], [[0, 2], [4, 2]], -100, "delivered", true),
      retail(collections.customers[3], [[1, 2]], -55, "delivered", false),
      retail(collections.customers[2], [[2, 1], [5, 2]], -30, "delivered", true)
    ];
    const historyContract1 = contract(quote(collections.customers[0], [[0, 12, 5], [2, 4, 3]], -78, "approved", "sales_manager"), -77, "active", "50/50", -60);
    const historyOrder1 = wholesale(historyContract1, -76);
    payment(historyContract1, Math.round(historyContract1.value / 2), -75);
    payment(historyContract1, historyContract1.value - Math.round(historyContract1.value / 2), -71);
    const historyShipment1 = { id: "Đợt 1", date: display(iso(-73)), items: historyContract1.lines.map((line) => ({ sku: line.sku, qty: line.qty })), status: "planned", note: "Giao đủ một lần" };
    historyContract1.shipments.push(historyShipment1);
    reserve(historyOrder1, historyShipment1.items, -73);
    issue(historyOrder1, historyShipment1.items, -71, "delivered", historyShipment1);
    historyContract1.status = "liquidated";
    historyContract1.liquidatedAt = iso(-69);
    const historyContract2 = contract(quote(collections.customers[1], [[3, 12, 4], [5, 2, 0]], -48, "approved", "sales_manager"), -47, "active", "100%", -20);
    const historyOrder2 = wholesale(historyContract2, -46);
    payment(historyContract2, historyContract2.value, -45);
    const historyShipment2 = { id: "Đợt 1", date: display(iso(-40)), items: historyContract2.lines.map((line) => ({ sku: line.sku, qty: line.qty })), status: "planned", note: "Giao đủ, chờ thanh lý" };
    historyContract2.shipments.push(historyShipment2);
    reserve(historyOrder2, historyShipment2.items, -40);
    issue(historyOrder2, historyShipment2.items, -39, "delivered", historyShipment2);

    operations.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    operations.forEach((operation) => {
      const product = productBySku(operation.sku);
      product.physical += operation.physicalDelta; product.held += operation.heldDelta; product.damaged += operation.damagedDelta;
      if (product.held < 0 || product.damaged < 0 || product.physical < product.held + product.damaged) throw new Error(`Mất cân đối thẻ kho mẫu: ${product.sku}`);
      add("movements", { id: code("MV"), time: stamp(operation.timestamp), at: operation.timestamp, timestamp: operation.timestamp, sku: operation.sku, type: operation.type, qty: operation.type === "Giữ hàng" ? operation.heldDelta : operation.physicalDelta, physical: product.physical, held: product.held, damagedAfter: product.damaged, physicalDelta: operation.physicalDelta, heldDelta: operation.heldDelta, damagedDelta: operation.damagedDelta, ref: operation.ref, user: actors[operation.role].name, by: actors[operation.role].id, note: operation.note });
    });
    collections.products.forEach((product) => { delete product.sampleOpening; delete product.sampleDamage; });
    for (const days of [-10]) {
      const timestamp = iso(days, 17);
      const lines = collections.products.map((product) => {
        const prior = collections.movements.filter((movement) => movement.sku === product.sku && movement.timestamp <= timestamp).at(-1);
        return { sku: product.sku, system: prior?.physical || 0, count: prior?.physical || 0, note: "Đếm và đối chiếu khớp", reviewed: true, countedById: actors.warehouse_staff.id };
      });
      const period = add("stocktakes", { code: code("KK"), scope: "Toàn kho", started: stamp(iso(days, 15)), status: "completed", locked: false, owner: actors.warehouse_manager.name, createdBy: actors.warehouse_manager.id, reportTo: stamp(timestamp), closedAt: timestamp, lines, closedLines: lines.map((line) => ({ sku: line.sku, count: line.count, final: line.count })) });
      document("Biên bản kiểm kê", period.code, "warehouse_manager", timestamp, "kiem-ke");
      event("warehouse_staff", "Nhập số kiểm đếm", period.code, "Đối chiếu các mã trong kho", iso(days, 16));
      event("warehouse_manager", "Hoàn tất kiểm kê", period.code, "Báo cáo Giám đốc và mở lại giao dịch", timestamp, "success");
    }
    collections.customers.forEach((customer) => {
      customer.orders = collections.orders.filter((order) => order.customerId === customer.id).length;
      customer.ar = collections.contracts.filter((record) => record.customerId === customer.id && record.status === "active").reduce((sum, record) => sum + record.value - record.paid, 0) + collections.orders.filter((order) => order.customerId === customer.id && order.type === "Bán lẻ").reduce((sum, order) => sum + order.total - order.paid, 0);
    });
    const scenario = (title, roles, records) => scenarios.push({ code: `SC-${namespace}-${String(scenarios.length + 1).padStart(2, "0")}`, title, roles, records });
    scenario("Giám đốc duyệt báo giá Sen Vàng do nhân viên bán hàng lập", ["sales_staff", "director"], [waitingQuote.code, waitingQuote.approvalId]);
    scenario("Kế toán kiểm tra hợp đồng do Quản lý bán hàng soạn", ["sales_manager", "accountant", "director"], [checkContract.code, checkContract.quote]);
    scenario("Kế toán xác nhận cọc, Kho giữ và xuất theo hợp đồng", ["sales_staff", "accountant", "warehouse_manager", "warehouse_staff"], [payOrder.code, payContract.code, waitingPayment.id]);
    scenario("Kho xuất ngay đợt 1 đã giữ, Bán hàng theo dõi giao nhận", ["warehouse_manager", "warehouse_staff", "sales_staff"], [holdingOrder.code, holdingContract.code]);
    scenario("Duyệt mua hàng qua cả Kế toán và Giám đốc", ["warehouse_manager", "accountant", "director"], [purchasePending.request.code]);
    scenario("Nhân viên kho kiểm đếm, Quản lý kho xác nhận nhập", ["warehouse_staff", "warehouse_manager", "accountant"], [receiptReady.receipt.code]);
    scenario("Bán lẻ Facebook chờ xác nhận tiền và giao hàng đang vận chuyển", ["sales_staff", "accountant", "warehouse_manager"], [facebook.order.code, shipping.order.code, shipping.delivery.code]);
    scenario("Tiếp nhận đổi trả từ đơn đã giao", ["sales_staff", "warehouse_manager", "accountant"], [returned.code, completedRetail.delivery.code, completedRetail.order.code]);
    scenario("Lịch sử kinh doanh tháng 8-10: đơn bán lẻ và hai hợp đồng đã giao đủ", ["sales_staff", "sales_manager", "accountant", "warehouse_manager"], [historyContract1.code, historyContract2.code, ...historyRetails.map((entry) => entry.order.code)]);
    activity.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const result = { alreadyLoaded: false, sampleSet: SAMPLE_SET_ID, namespace, collections, attachments, activity, defaults: { receiptTolerance: 5 }, scenarios, summary: { counts: Object.fromEntries(COLLECTION_KEYS.map((key) => [key, collections[key].length])) } };
    validateSampleGraph(result, users);
    return result;
  }

  function validateSampleGraph(plan, users) {
    const c = plan.collections;
    const find = (collection, id) => c[collection].find((record) => record[PRIMARY_KEYS[collection] || "code"] === id);
    const check = (condition, message) => { if (!condition) throw new Error(`Dữ liệu không nhất quán: ${message}`); };
    for (const key of COLLECTION_KEYS) {
      const ids = c[key].map((record) => record[PRIMARY_KEYS[key] || "code"]);
      check(new Set(ids).size === ids.length, `trùng mã ${key}`);
    }
    c.products.forEach((product) => {
      check(!!find("suppliers", product.supplier), `NCC của ${product.sku}`);
      const held = c.reservations.filter((record) => record.status === "holding" && record.sku === product.sku).reduce((sum, record) => sum + record.qty, 0);
      check(held === product.held && product.physical >= product.held + product.damaged, `tồn / giữ ${product.sku}`);
      const ledger = c.movements.filter((record) => record.sku === product.sku);
      check(ledger.reduce((sum, record) => sum + record.physicalDelta, 0) === product.physical, `thẻ kho ${product.sku}`);
      check(ledger.reduce((sum, record) => sum + record.damagedDelta, 0) === product.damaged, `hàng lỗi ${product.sku}`);
    });
    for (const key of ["quotes", "contracts", "orders"]) c[key].forEach((record) => { check(!!find("customers", record.customerId), `KH của ${record.code}`); record.lines.forEach((line) => check(!!find("products", line.sku) && Number.isSafeInteger(line.qty) && line.qty > 0, `dòng hàng ${record.code}`)); });
    c.contracts.forEach((contract) => {
      check(!!find("quotes", contract.quote), `báo giá của ${contract.code}`);
      check(c.payments.filter((payment) => payment.record === contract.code && payment.status === "confirmed").reduce((sum, payment) => sum + payment.amount, 0) === contract.paid, `thanh toán ${contract.code}`);
      contract.lines.forEach((line) => check(contract.shipments.reduce((sum, shipment) => sum + (shipment.items.find((item) => item.sku === line.sku)?.qty || 0), 0) <= line.qty, `đợt giao ${contract.code}`));
    });
    c.orders.forEach((order) => {
      check(order.paid <= order.total, `thu vượt giá trị ${order.code}`);
      if (order.contract) check(find("contracts", order.contract)?.paid === order.paid, `công nợ liên kết ${order.code}`);
      else check(c.payments.filter((payment) => payment.record === order.code && payment.status === "confirmed").reduce((sum, payment) => sum + payment.amount, 0) === order.paid, `phiếu thu ${order.code}`);
      order.lines.forEach((line) => {
        check(line.held + line.shipped <= line.qty, `xuất vượt đơn ${order.code}`);
        check(c.issues.filter((issue) => issue.order === order.code).reduce((sum, issue) => sum + (issue.lines.find((item) => item.sku === line.sku)?.qty || 0), 0) === line.shipped, `phiếu xuất ${order.code}`);
        check(c.reservations.filter((reservation) => reservation.order === order.code && reservation.sku === line.sku && reservation.status === "holding").reduce((sum, reservation) => sum + reservation.qty, 0) === line.held, `giữ theo đơn ${order.code}`);
      });
    });
    c.payments.forEach((payment) => check(!!find("orders", payment.record) || !!find("contracts", payment.record), `chứng từ của ${payment.id}`));
    c.deliveries.forEach((delivery) => { check(!!find("orders", delivery.order) && !!find("issues", delivery.issue), `giao nhận ${delivery.code}`); });
    c.receipts.forEach((receipt) => check(find("purchaseOrders", receipt.po)?.receipt === receipt.code, `tiếp nhận ${receipt.code}`));
    c.purchaseOrders.forEach((order) => check(find("purchaseRequests", order.request)?.status === "approved", `đặt mua ${order.code}`));
    c.approvals.forEach((approval) => check(!!find(approval.type === "discount" ? "quotes" : approval.type === "payment" ? "payments" : "purchaseRequests", approval.ref), `phê duyệt ${approval.id}`));
    c.returns.forEach((record) => check(find("deliveries", record.delivery)?.order === record.order, `đổi trả ${record.code}`));
    plan.activity.forEach((entry) => check(users.some((user) => user.id === entry.actorId && user.roleIds.includes(entry.roleKey)), `tác nhân ${entry.id}`));
    return true;
  }

  function createSamplePlan({ collections, users, now = new Date() }) {
    if (COLLECTION_KEYS.some((key) => (collections[key] || []).some((record) => record.sampleSet === SAMPLE_SET_ID))) return { alreadyLoaded: true, sampleSet: SAMPLE_SET_ID };
    const removeSampleSets = LEGACY_SAMPLE_SET_IDS.filter((set) => COLLECTION_KEYS.some((key) => (collections[key] || []).some((record) => record.sampleSet === set)));
    if (removeSampleSets.length) {
      const removedIds = new Set();
      const legacy = (key, record) => removeSampleSets.includes(record.sampleSet) && String(record[PRIMARY_KEYS[key] || "code"] || "").includes(`-${record.sampleNamespace}-`);
      COLLECTION_KEYS.forEach((key) => (collections[key] || []).filter((record) => legacy(key, record)).forEach((record) => removedIds.add(record[PRIMARY_KEYS[key] || "code"])));
      Object.values(collections.attachments || {}).filter((attachment) => removeSampleSets.includes(attachment.sampleSet)).forEach((attachment) => removedIds.add(attachment.id));
      const hasReference = (value) => typeof value === "string" ? removedIds.has(value) : value && typeof value === "object" ? Object.values(value).some(hasReference) : false;
      const externallyLinked = COLLECTION_KEYS.some((key) => (collections[key] || []).filter((record) => !legacy(key, record)).some(hasReference))
        || (collections.editor && hasReference(collections.editor)) || Object.values(collections.workingQuotes || {}).some(hasReference)
        || Object.values(collections.attachments || {}).filter((attachment) => !removeSampleSets.includes(attachment.sampleSet)).some(hasReference);
      if (externallyLinked) throw new Error("Bộ mẫu cũ đang được bản ghi tự nhập hoặc nội dung đang soạn tham chiếu. Dữ liệu được giữ nguyên; hoàn tất hoặc tách các tham chiếu trước khi nạp bộ gọn.");
    }
    for (let version = 1; version <= 99; version++) {
      const namespace = `LK${String(version).padStart(2, "0")}`;
      const collision = COLLECTION_KEYS.some((key) => (collections[key] || []).some((record) => String(record[PRIMARY_KEYS[key] || "code"] || "").includes(`-${namespace}-`)));
      if (!collision) return { ...buildLinkedSampleData({ users, namespace, now }), removeSampleSets };
    }
    throw new Error("Không thể cấp vùng mã dữ liệu mới. Không có bản ghi nào bị ghi đè.");
  }

  const api = { SAMPLE_SET_ID, LEGACY_SAMPLE_SET_IDS, COLLECTION_KEYS, buildLinkedSampleData, createSamplePlan, validateSampleGraph };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SoulWineSampleData = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
