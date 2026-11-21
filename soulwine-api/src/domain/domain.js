import { config, policyAllows, ROLES } from "../config.js";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../http/http.js";
import { hashPassword, passwordPolicyError } from "../auth/passwords.js";

export function availableOf(product) {
  return Math.max(0, product.physical - product.held - product.damaged);
}

export function stockLock(store) {
  return store.list("stocktakes").find((period) => period.locked && period.status !== "completed") || null;
}

export function orderEligible(order, store) {
  if (!Number.isSafeInteger(order.total) || order.total <= 0 || !Number.isSafeInteger(order.paid) || order.paid < 0 || order.paid > order.total) return false;
  if (order.type === "Bán lẻ") return order.paid >= order.total;
  if (order.contract) {
    const contract = store.find("contracts", order.contract);
    if (!contract || !["signed", "active"].includes(contract.status)) return false;
    if (!["50/50", "100%"].includes(contract.scheme) || !Number.isSafeInteger(contract.value) || contract.value <= 0) return false;
    const minimum = contract.scheme === "100%" ? contract.value : Math.ceil(contract.value / 2);
    return Number.isSafeInteger(contract.paid) && contract.paid >= minimum && contract.paid <= contract.value;
  }
  return false;
}

export function eligibilityReason(order, store) {
  if (order.type === "Bán lẻ") return order.paid >= order.total ? "Đã thanh toán đủ 100%" : "Đơn bán lẻ cần thanh toán đủ 100% trước khi giữ hàng";
  if (order.contract && !["signed", "active"].includes(store.find("contracts", order.contract)?.status)) return "Hợp đồng chưa đủ chữ ký và hồ sơ";
  return orderEligible(order, store) ? "Đã đủ cọc/thanh toán theo hợp đồng" : "Chưa đủ cọc/thanh toán theo phương án hợp đồng";
}

function requireInt(value, label, { min = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < min) badRequest("invalid_number", `${label} phải là số nguyên không nhỏ hơn ${min}.`);
  return value;
}

function requireEnum(value, allowed, label, fallback) {
  const selected = value === undefined ? fallback : value;
  if (!allowed.includes(selected)) badRequest("invalid_enum", `${label} không hợp lệ.`);
  return selected;
}

function requireDate(value, label, { past = false } = {}) {
  if (typeof value !== "string") badRequest("invalid_date", `${label} không hợp lệ.`);
  const input = value.trim();
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
  const normalized = local ? `${local[3]}-${local[2]}-${local[1]}` : input;
  const date = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(normalized);
  const timestamp = Date.parse(normalized);
  const calendar = date && new Date(Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3])));
  if (!date || !Number.isFinite(timestamp) || calendar.getUTCFullYear() !== Number(date[1]) || calendar.getUTCMonth() + 1 !== Number(date[2]) || calendar.getUTCDate() !== Number(date[3])) badRequest("invalid_date", `${label} không hợp lệ.`);
  if (past && timestamp > Date.now()) badRequest("future_time", `${label} không được ở tương lai.`);
  return input;
}

function returnDelivery(tx, order, sku, qty, requested, returnCode) {
  const candidates = tx.list("deliveries").filter((delivery) => {
    if (delivery.order !== order || !["failed", "delivered"].includes(delivery.status)) return false;
    if (requested && delivery.code !== requested) return false;
    const issued = delivery.items?.find((item) => item.sku === sku)?.qty || 0;
    const returned = tx.list("returns").filter((item) => item.code !== returnCode && item.delivery === delivery.code && item.sku === sku && item.status !== "rejected").reduce((sum, item) => sum + item.qty, 0);
    return qty <= issued - returned;
  });
  if (candidates.length !== 1) badRequest("invalid_return_delivery", "Chọn chuyến giao có đủ lượng hàng chưa hoàn; cần chỉ rõ chuyến nếu có nhiều chuyến phù hợp.");
  return candidates[0];
}

function requireRoles(value) {
  if (!Array.isArray(value) || !value.length || value.some((role) => typeof role !== "string" || !Object.hasOwn(ROLES, role))) badRequest("invalid_roles", "Chọn ít nhất một vai trò hợp lệ.");
  return [...new Set(value)];
}

function today() {
  return new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" });
}

function addMovement(tx, type, sku, qty, physical, held, ref, note) {
  tx.list("movements").push({ id: tx.nextCode("movements", "MV-", 5), at: new Date().toISOString(), type, sku, qty, physical, held, ref, note: note || "", by: tx.actor?.id || null, user: tx.actor?.name || "" });
}

function requireProduct(tx, sku) {
  const product = tx.find("products", sku);
  if (!product) notFound(`Không tìm thấy sản phẩm ${sku}.`);
  return product;
}

function paymentTarget(tx, recordCode) {
  const contract = tx.find("contracts", recordCode);
  if (contract) return { kind: "contract", record: contract };
  const order = tx.find("orders", recordCode);
  if (!order) return null;
  if (order.contract) {
    const linked = tx.find("contracts", order.contract);
    if (linked) return { kind: "contract", record: linked, order };
  }
  return { kind: "order", record: order, order };
}

function remainingOf(record) {
  const total = record.total ?? record.value;
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(record.paid) || record.paid < 0 || record.paid > total) badRequest("invalid_balance", "Số dư đơn hàng / hợp đồng không hợp lệ.");
  return total - record.paid;
}

function applyPaymentEffects(tx, payment, actorName) {
  const target = paymentTarget(tx, payment.record);
  if (!target) badRequest("unknown_record", "Không tìm thấy đơn hàng / hợp đồng của giao dịch.");
  const record = target.record;
  requireInt(payment.amount, "Số tiền", { min: 1 });
  const remaining = remainingOf(record);
  if (payment.amount > remaining) badRequest("over_payment", `Số tiền vượt phần còn phải thu (${remaining}).`);
  record.paid += payment.amount;
  payment.status = "confirmed";
  payment.confirmedBy = actorName;
  payment.confirmedAt = new Date().toISOString();
  const orders = tx.list("orders").filter((order) => order.code === record.code || order.contract === record.code || order.code === target.order?.code);
  for (const order of orders) {
    order.paid = record.paid;
    if (order.status === "pending_payment" && orderEligible(order, { find: (name, key) => tx.find(name, key) })) {
      order.status = "eligible";
      order.eligibleAt = new Date().toISOString();
    }
    if (order.status === "overdue" && order.paid >= order.total) order.status = order.lines.every((line) => line.shipped >= line.qty) ? "completed" : "holding";
  }
}

function validateLines(tx, lines, { againstAvailable = false } = {}) {
  if (!Array.isArray(lines) || !lines.length) badRequest("invalid_lines", "Thêm ít nhất một dòng hàng.");
  const seen = new Set();
  return lines.map((line) => {
    const sku = String(line.sku || "").trim();
    const product = tx.find("products", sku);
    if (!product || product.status !== "product_active") badRequest("unknown_product", `Sản phẩm ${sku} không tồn tại hoặc ngừng kinh doanh.`);
    if (seen.has(sku)) badRequest("duplicate_line", `SKU ${sku} xuất hiện nhiều lần; gộp số lượng vào một dòng.`);
    seen.add(sku);
    const qty = requireInt(Number(line.qty), `Số lượng ${sku}`, { min: 1 });
    const price = requireInt(Number(line.price ?? product.wholesale), `Giá ${sku}`, { min: 1 });
    if (againstAvailable && qty > availableOf(product)) badRequest("over_available", `${sku}: vượt tồn khả dụng ${availableOf(product)}.`);
    return { sku, qty, price };
  });
}

export const services = {
  products: {
    create(store, ctx, body) {
      const sku = String(body.sku || "").trim().toUpperCase();
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(sku)) badRequest("invalid_sku", "Mã SKU gồm 1-40 ký tự chữ, số, gạch dưới hoặc gạch ngang.");
      if (store.find("products", sku)) conflict("sku_taken", "SKU đã tồn tại.");
      if (!String(body.name || "").trim()) badRequest("invalid_name", "Nhập tên sản phẩm.");
      const retail = requireInt(Number(body.retail), "Giá bán lẻ", { min: 0 });
      const wholesale = requireInt(Number(body.wholesale), "Giá bán sỉ", { min: 0 });
      const min = requireInt(Number(body.min), "Định mức tồn", { min: 0 });
      const product = {
        sku, name: body.name.trim(), category: body.category || "Khác", unit: body.unit || "Chai",
        origin: body.origin || "", volume: body.volume || "", abv: body.abv || "",
        retail, wholesale, min, physical: 0, held: 0, damaged: 0, status: "product_active",
        supplier: body.supplier || "", createdAt: new Date().toISOString()
      };
      const { result } = store.transact({ actor: ctx.actor, action: "products.create", requestId: ctx.requestId, method: ctx.method, route: "products", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        if (tx.find("products", sku)) conflict("sku_taken", "SKU đã tồn tại.");
        tx.list("products").push(product);
        tx.note(`${ctx.actor.name} thêm sản phẩm ${sku} · ${product.name}.`);
      });
      return result ?? product;
    },
    update(store, ctx, id, body) {
      const previous = store.find("products", id);
      if (!previous) notFound("Không tìm thấy sản phẩm.");
      const { result } = store.transact({ actor: ctx.actor, action: "products.update", requestId: ctx.requestId, method: ctx.method, route: `products/${id}`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const product = requireProduct(tx, id);
        for (const field of ["name", "category", "unit", "origin", "volume", "abv", "supplier"]) if (body[field] !== undefined) product[field] = String(body[field]).trim();
        for (const field of ["retail", "wholesale", "min"]) if (body[field] !== undefined) product[field] = requireInt(Number(body[field]), field, { min: 0 });
        if (body.status !== undefined) product.status = requireEnum(body.status, ["product_active", "product_inactive"], "Trạng thái sản phẩm");
        tx.note(`${ctx.actor.name} cập nhật sản phẩm ${id}.`);
      });
      return result ?? store.find("products", id);
    },
    remove(store, ctx, id) {
      const product = store.find("products", id);
      if (!product) notFound("Không tìm thấy sản phẩm.");
      const referenced = ["quotes", "orders", "receipts", "stocktakes", "movements"].some((name) => store.list(name).some((record) => JSON.stringify(record).includes(`"${id}"`)));
      if (referenced) conflict("product_in_use", "Sản phẩm đã phát sinh giao dịch; chỉ cho phép ngừng kinh doanh.");
      store.transact({ actor: ctx.actor, action: "products.delete", requestId: ctx.requestId, method: ctx.method, route: `products/${id}`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const index = tx.list("products").findIndex((record) => record.sku === id);
        tx.list("products").splice(index, 1);
        tx.note(`${ctx.actor.name} xóa sản phẩm ${id}.`);
      });
      return { message: "Đã xóa sản phẩm." };
    }
  },

  customers: {
    create(store, ctx, body) {
      const name = String(body.name || "").trim();
      const phone = String(body.phone || "").trim();
      if (!name || !phone) badRequest("invalid_input", "Cần tên và số điện thoại.");
      if (store.list("customers").some((customer) => customer.phone === phone)) conflict("phone_taken", "Số điện thoại đã thuộc hồ sơ khác.");
      const customer = {
        id: store.nextCode("customers", "KH-"), name, phone,
        type: body.type === "Bán lẻ" ? "Bán lẻ" : "Bán sỉ",
        contact: body.contact || name, email: body.email || "", tax: body.tax || "",
        address: String(body.address || "").trim(), invoiceAddress: String(body.invoiceAddress || body.address || "").trim(),
        note: body.note || "", createdAt: new Date().toISOString()
      };
      store.transact({ actor: ctx.actor, action: "customers.create", requestId: ctx.requestId, method: ctx.method, route: "customers", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        if (tx.list("customers").some((record) => record.phone === phone)) conflict("phone_taken", "Số điện thoại đã thuộc hồ sơ khác.");
        customer.id = tx.nextCode("customers", "KH-");
        tx.list("customers").push(customer);
        tx.note(`${ctx.actor.name} thêm khách hàng ${customer.name}.`);
      });
      return store.list("customers").find((record) => record.phone === phone);
    },
    update(store, ctx, id, body) {
      const previous = store.find("customers", id);
      if (!previous) notFound("Không tìm thấy khách hàng.");
      store.transact({ actor: ctx.actor, action: "customers.update", requestId: ctx.requestId, method: ctx.method, route: `customers/${id}`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const customer = tx.find("customers", id);
        for (const field of ["name", "contact", "email", "tax", "address", "invoiceAddress", "note"]) if (body[field] !== undefined) customer[field] = String(body[field]).trim();
        if (body.type !== undefined && ["Bán sỉ", "Bán lẻ"].includes(body.type)) customer.type = body.type;
        if (body.phone !== undefined) {
          const phone = String(body.phone).trim();
          if (tx.list("customers").some((record) => record.phone === phone && record.id !== id)) conflict("phone_taken", "Số điện thoại đã thuộc hồ sơ khác.");
          customer.phone = phone;
        }
        tx.note(`${ctx.actor.name} cập nhật khách hàng ${customer.name}.`);
      });
      return store.find("customers", id);
    },
    remove(store, ctx, id) {
      if (!store.find("customers", id)) notFound("Không tìm thấy khách hàng.");
      if (store.list("orders").some((order) => order.customerId === id) || store.list("quotes").some((quote) => quote.customerId === id)) conflict("customer_in_use", "Khách hàng đã có giao dịch; không xóa được.");
      store.transact({ actor: ctx.actor, action: "customers.delete", requestId: ctx.requestId, method: ctx.method, route: `customers/${id}`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const index = tx.list("customers").findIndex((record) => record.id === id);
        tx.list("customers").splice(index, 1);
        tx.note(`${ctx.actor.name} xóa khách hàng ${id}.`);
      });
      return { message: "Đã xóa khách hàng." };
    }
  },

  suppliers: {
    create(store, ctx, body) {
      const name = String(body.name || "").trim();
      if (!name) badRequest("invalid_input", "Nhập tên nhà cung cấp.");
      if (store.list("suppliers").some((supplier) => supplier.name.toLowerCase() === name.toLowerCase())) conflict("supplier_taken", "Nhà cung cấp đã tồn tại.");
      const supplier = { id: store.nextCode("suppliers", "NCC-"), name, contact: body.contact || "", phone: body.phone || "", email: body.email || "", tax: body.tax || "", address: body.address || "", terms: body.terms || "", lastDelivery: "", createdAt: new Date().toISOString() };
      store.transact({ actor: ctx.actor, action: "suppliers.create", requestId: ctx.requestId, method: ctx.method, route: "suppliers", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        supplier.id = tx.nextCode("suppliers", "NCC-");
        tx.list("suppliers").push(supplier);
        tx.note(`${ctx.actor.name} thêm nhà cung cấp ${name}.`);
      });
      return store.list("suppliers").find((record) => record.name === name);
    }
  },

  quotes: {
    create(store, ctx, body) {
      const customer = store.find("customers", body.customerId);
      if (!customer) badRequest("unknown_customer", "Chọn khách hàng hợp lệ.");
      const defaultValidity = new Date(Date.now() + (store.list("settings")[0].rules.quoteValidityDays || 30) * 86400000).toLocaleDateString("en-GB");
      let code = null;
      store.transact({ actor: ctx.actor, action: "quotes.create", requestId: ctx.requestId, method: ctx.method, route: "quotes", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const lines = validateLines(tx, body.lines);
        const quote = {
          code: tx.nextCode("quotes", "BG-" + new Date().getFullYear() + "-"),
          customerId: customer.id, channel: "Bán sỉ", owner: ctx.actor.name,
          validUntil: requireDate(body.validUntil ?? defaultValidity, "Ngày hết hạn báo giá"), status: "draft", version: 1,
          confirmed: false, note: String(body.note || ""), lines,
          createdAt: new Date().toISOString(), createdBy: ctx.actor.id
        };
        tx.list("quotes").push(quote);
        code = quote.code;
        tx.note(`${ctx.actor.name} lập báo giá ${quote.code} cho ${customer.name}.`);
      });
      return store.find("quotes", code);
    },
    submit(store, ctx, code, body) {
      const quote = store.find("quotes", code);
      if (!quote) notFound("Không tìm thấy báo giá.");
      const lines = quote.lines;
      const totals = lines.reduce((sum, line) => sum + line.price * line.qty, 0);
      store.transact({ actor: ctx.actor, action: "quotes.submit", requestId: ctx.requestId, method: ctx.method, route: `quotes/${code}/submit`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const record = tx.find("quotes", code);
        if (!["draft", "rejected"].includes(record.status)) conflict("quote_state", "Chỉ báo giá đang soạn / bị từ chối mới gửi được duyệt.");
        if (!record.lines.length) badRequest("empty_lines", "Thêm ít nhất một sản phẩm.");
        const validity = requireDate(record.validUntil, "Ngày hết hạn báo giá");
        const validityIso = validity.includes("/") ? validity.split("/").reverse().join("-") : validity;
        if (new Date(validityIso) < new Date(new Date().toISOString().slice(0, 10))) badRequest("expired", "Báo giá đã hết hiệu lực; tạo phiên bản mới.");
        if (body && body.confirmed) { record.confirmed = true; record.confirmBasis = String(body.confirmed).slice(0, 200); }
        if (!record.confirmed) badRequest("not_confirmed", "Khách hàng cần xác nhận nội dung trước khi gửi duyệt.");
        record.status = "pending";
        tx.list("approvals").push({
          id: tx.nextCode("approvals", "AP-", 4), type: "discount", ref: record.code, title: "Chiết khấu bán sỉ",
          assignee: "director", status: "pending", requester: ctx.actor.name, requesterId: ctx.actor.id,
          amount: record.lines.reduce((sum, line) => sum + Math.round(line.price * line.qty * (1 - (line.discount || 0) / 100)), 0),
          summary: record.note || "Đề nghị phê duyệt giá và chiết khấu.", lines: structuredClone(record.lines),
          createdAt: new Date().toISOString(), decidedAt: null, decidedBy: null, decisionNote: ""
        });
        tx.note(`${ctx.actor.name} gửi duyệt báo giá ${record.code}.`);
      });
      return store.find("quotes", code);
    },
    confirm(store, ctx, code, body) {
      const basis = String(body?.basis || "").trim();
      if (!basis) badRequest("invalid_input", "Cần ghi căn cứ xác nhận của khách.");
      store.transact({ actor: ctx.actor, action: "quotes.confirm", requestId: ctx.requestId, method: ctx.method, route: `quotes/${code}/confirm`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const record = tx.find("quotes", code);
        if (!record) notFound("Không tìm thấy báo giá.");
        if (record.status !== "approved") conflict("quote_state", "Chỉ báo giá đã duyệt mới ghi nhận xác nhận của khách.");
        record.confirmed = true;
        record.confirmBasis = basis.slice(0, 200);
        record.confirmedAt = new Date().toISOString();
        tx.note(`${ctx.actor.name} ghi nhận khách xác nhận báo giá ${record.code}.`);
      });
      return store.find("quotes", code);
    }
  },

  approvals: {
    decide(store, ctx, id, body) {
      const approval = store.find("approvals", id);
      if (!approval) notFound("Không tìm thấy hồ sơ phê duyệt.");
      if (typeof body.approve !== "boolean") badRequest("invalid_decision", "Quyết định phê duyệt phải là true hoặc false.");
      const approve = body.approve;
      const reason = String(body.reason || "").trim();
      if (!approve && !reason) badRequest("reason_required", "Từ chối cần nêu lý do.");
      store.transact({ actor: ctx.actor, action: approve ? "approvals.approve" : "approvals.reject", requestId: ctx.requestId, method: ctx.method, route: `approvals/${id}/decide`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const record = tx.find("approvals", id);
        if (record.status !== "pending") conflict("approval_state", "Hồ sơ đã được xử lý.");
        if (record.assignee !== ctx.session.role) forbidden("wrong_assignee", `Hồ sơ thuộc vai trò ${ROLES[record.assignee]}.`);
        record.status = approve ? "approved" : "rejected";
        record.decidedAt = new Date().toISOString();
        record.decidedBy = ctx.actor.name;
        record.decisionNote = reason || "Đồng ý theo hồ sơ đã xem xét.";
        if (record.type === "discount") {
          const quote = tx.find("quotes", record.ref);
          if (quote) quote.status = approve ? "approved" : "rejected";
        }
        if (record.type === "purchase") {
          const request = tx.list("purchaseRequests").find((item) => item.code === record.ref);
          if (request) {
            request.approvals = request.approvals || { accountant: false, director: false };
            request.approvals[ctx.session.role] = approve;
            request.status = !approve ? "rejected" : Object.values(request.approvals).every(Boolean) ? "approved" : "pending";
          }
        }
        if (record.type === "payment" && approve) {
          const payment = tx.find("payments", record.ref);
          if (payment && payment.status === "pending_confirm") applyPaymentEffects(tx, payment, ctx.actor.name);
          else conflict("payment_state", "Giao dịch không còn chờ xác nhận.");
        }
        tx.note(`${ctx.actor.name} ${approve ? "phê duyệt" : "từ chối"} hồ sơ ${record.ref}${reason ? ` · Lý do: ${reason}` : ""}.`);
      });
      return store.find("approvals", id);
    }
  },

  contracts: {
    create(store, ctx, body) {
      const quote = store.find("quotes", body.fromQuote);
      if (!quote) notFound("Không tìm thấy báo giá nguồn.");
      const scheme = ["50/50", "100%"].includes(body.scheme) ? body.scheme : badRequest("invalid_scheme", "Phương án thanh toán phải là 50/50 hoặc 100%.");
      const due = requireDate(body.due, "Hạn thanh toán");
      let code = null;
      store.transact({ actor: ctx.actor, action: "contracts.create", requestId: ctx.requestId, method: ctx.method, route: "contracts", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const record = tx.find("quotes", body.fromQuote);
        if (record.status !== "approved" || !record.confirmed) conflict("quote_state", "Báo giá cần được duyệt và khách xác nhận.");
        if (tx.list("contracts").some((item) => item.quote === record.code)) conflict("contract_exists", "Báo giá đã có hợp đồng.");
        const value = requireInt(record.lines.reduce((sum, line) => sum + Math.round(line.price * line.qty * (1 - (line.discount || 0) / 100)), 0), "Giá trị hợp đồng", { min: 1 });
        const contract = {
          code: tx.nextCode("contracts", "HĐ-" + new Date().getFullYear() + "-"),
          customerId: record.customerId, quote: record.code, owner: ctx.actor.name,
          value, paid: 0, scheme, due, signedAt: "", status: "checking",
          lines: record.lines.map((line) => ({ sku: line.sku, qty: line.qty, price: line.price, discount: line.discount || 0 })),
          checklist: { customerConfirm: false, accountantCheck: false, directorSign: false, customerSign: false, scan: false },
          scanFile: "", shipments: [], createdAt: new Date().toISOString()
        };
        tx.list("contracts").push(contract);
        code = contract.code;
        tx.note(`${ctx.actor.name} tạo hợp đồng ${contract.code} từ báo giá ${record.code}.`);
      });
      return store.find("contracts", code);
    },
    checklist(store, ctx, code, field, body) {
      const allowedFields = ["customerConfirm", "accountantCheck", "directorSign", "customerSign", "scan"];
      if (!allowedFields.includes(field)) badRequest("invalid_field", "Bước ký kết không hợp lệ.");
      store.transact({ actor: ctx.actor, action: `contracts.checklist.${field}`, requestId: ctx.requestId, method: ctx.method, route: `contracts/${code}/checklist/${field}`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const contract = tx.find("contracts", code);
        if (!contract) notFound("Không tìm thấy hợp đồng.");
        if (["active", "liquidated", "cancelled"].includes(contract.status)) conflict("contract_state", "Hợp đồng đã hoàn tất ký kết.");
        if (contract.checklist[field]) conflict("step_done", "Bước này đã được xác nhận.");
        if (field === "directorSign" && !contract.checklist.accountantCheck) badRequest("step_order", "Kế toán cần kiểm tra trước khi Giám đốc ký.");
        if (field === "customerSign" && !contract.checklist.directorSign) badRequest("step_order", "Cần Giám đốc ký trước khi ghi nhận khách hoàn tất ký.");
        if (field === "scan") {
          const fileName = String(body?.fileName || "").trim();
          if (!fileName) badRequest("evidence_required", "Đính kèm bản scan hợp đồng đã ký.");
          contract.scanFile = fileName.slice(0, 200);
        }
        contract.checklist[field] = true;
        if (field === "accountantCheck") contract.status = "pending_sign";
        if (Object.values(contract.checklist).every(Boolean)) {
          contract.status = "active";
          contract.signedAt = new Date().toISOString();
          tx.note(`Hợp đồng ${code} đủ chữ ký và hồ sơ, chuyển sang đang thực hiện.`);
        }
        tx.note(`${ctx.actor.name} xác nhận bước ${field} của hợp đồng ${code}.`);
      });
      return store.find("contracts", code);
    },
    addShipment(store, ctx, code, body) {
      const date = requireDate(body.date, "Ngày giao");
      store.transact({ actor: ctx.actor, action: "contracts.shipments.add", requestId: ctx.requestId, method: ctx.method, route: `contracts/${code}/shipments`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const contract = tx.find("contracts", code);
        if (!contract) notFound("Không tìm thấy hợp đồng.");
        if (contract.status !== "active") conflict("contract_state", "Chỉ lập đợt giao cho hợp đồng đang thực hiện.");
        const items = [];
        for (const line of contract.lines) {
          const qty = Number(body.items?.[line.sku] ?? 0);
          if (!Number.isSafeInteger(qty) || qty < 0) badRequest("invalid_number", `Số lượng ${line.sku} không hợp lệ.`);
          if (qty > 0) items.push({ sku: line.sku, qty });
        }
        if (!items.length) badRequest("empty_shipment", "Cần ít nhất một mặt hàng có số lượng dương.");
        for (const item of items) {
          const limit = contract.lines.find((line) => line.sku === item.sku).qty;
          const planned = contract.shipments.reduce((sum, shipment) => sum + (shipment.items.find((line) => line.sku === item.sku)?.qty || 0), 0);
          if (planned + item.qty > limit) badRequest("over_contract", `${item.sku}: tổng các đợt giao vượt lượng hợp đồng (${limit}).`);
        }
        contract.shipments.push({ id: `Đợt ${contract.shipments.length + 1}`, date, items, status: "planned", note: String(body.note || ""), delivery: "", confirmedAt: "", updatedAt: "" });
        tx.note(`${ctx.actor.name} lập ${`Đợt ${contract.shipments.length}`} giao ${date} cho hợp đồng ${code}.`);
      });
      return store.find("contracts", code);
    },
    createOrder(store, ctx, code) {
      let orderCode = null;
      store.transact({ actor: ctx.actor, action: "contracts.create_order", requestId: ctx.requestId, method: ctx.method, route: `contracts/${code}/order`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const contract = tx.find("contracts", code);
        if (!contract) notFound("Không tìm thấy hợp đồng.");
        if (contract.status !== "active") conflict("contract_state", "Hợp đồng chưa đủ điều kiện thực hiện.");
        const existing = tx.list("orders").find((order) => order.contract === code && order.status !== "cancelled");
        if (existing) { orderCode = existing.code; return; }
        const order = {
          code: tx.nextCode("orders", "SO-" + new Date().getFullYear() + "-"),
          customerId: contract.customerId, type: "Bán sỉ", channel: "Hợp đồng",
          quote: contract.quote, contract: code, owner: ctx.actor.name,
          created: today(), createdAt: new Date().toISOString(),
          status: "pending_payment",
          total: contract.value, paid: contract.paid,
          lines: contract.lines.map((line) => ({ sku: line.sku, qty: line.qty, price: line.price, held: 0, shipped: 0 })),
          note: ""
        };
        if (orderEligible(order, { find: (name, key) => tx.find(name, key) })) order.status = "eligible";
        tx.list("orders").push(order);
        orderCode = order.code;
        tx.note(`${ctx.actor.name} tạo đơn thực hiện ${order.code} cho hợp đồng ${code}.`);
      });
      return store.find("orders", orderCode);
    }
  },

  orders: {
    createRetail(store, ctx, body) {
      const customer = store.find("customers", body.customerId);
      if (!customer) badRequest("unknown_customer", "Chọn khách hàng hợp lệ.");
      const channel = requireEnum(body.channel, ["Tại quầy", "Facebook"], "Kênh bán", "Tại quầy");
      const payment = body.payment || {};
      if (payment.collected !== undefined && typeof payment.collected !== "boolean") badRequest("invalid_payment", "Trạng thái thu tiền phải là true hoặc false.");
      if (payment.method !== undefined) requireEnum(payment.method, ["Chuyển khoản", "Tiền mặt"], "Phương thức thanh toán");
      if (payment.collected && channel !== "Tại quầy") badRequest("invalid_payment", "Thu tiền mặt chỉ áp dụng tại quầy.");
      if (payment.collected && !String(payment.reference || "").trim()) badRequest("invalid_payment", "Cần số phiếu thu khi thu tiền tại quầy.");
      let orderCode = null;
      store.transact({ actor: ctx.actor, action: "orders.create_retail", requestId: ctx.requestId, method: ctx.method, route: "orders", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const lines = validateLines(tx, body.lines, { againstAvailable: true }).map((line) => ({ ...line, held: 0, shipped: 0 }));
        const total = requireInt(lines.reduce((sum, line) => sum + line.price * line.qty, 0), "Tổng tiền", { min: 1 });
        const order = {
          code: tx.nextCode("orders", "SO-" + new Date().getFullYear() + "-"),
          customerId: customer.id, type: "Bán lẻ", channel, quote: "", contract: "",
          owner: ctx.actor.name, created: today(), createdAt: new Date().toISOString(),
          status: "pending_payment", total, paid: 0, lines, note: String(body.note || "")
        };
        tx.list("orders").push(order);
        orderCode = order.code;
        if (payment.collected) {
          const record = {
            id: tx.nextCode("payments", "PAY-", 5), record: order.code, customerId: customer.id,
            amount: total, date: today(), method: payment.method === "Chuyển khoản" ? "Chuyển khoản" : "Tiền mặt",
            reference: String(payment.reference || ""), fileName: String(payment.fileName || ""),
            status: "pending_confirm", confirmedBy: "", confirmedAt: "", evidenceReadyAt: new Date().toISOString(),
            note: "Thu đủ 100% tại quầy", createdBy: ctx.actor.id
          };
          tx.list("payments").push(record);
          if (ctx.session.role === "accountant" || record.method === "Tiền mặt") applyPaymentEffects(tx, record, ctx.actor.name);
          else {
            tx.list("approvals").push({
              id: tx.nextCode("approvals", "AP-", 4), type: "payment", ref: record.id, title: "Xác nhận thanh toán",
              assignee: "accountant", status: "pending", requester: ctx.actor.name, requesterId: ctx.actor.id,
              amount: total, summary: `${order.code} · ${total}`, lines: [], createdAt: new Date().toISOString(), decidedAt: null, decidedBy: null, decisionNote: ""
            });
          }
        }
        tx.note(`${ctx.actor.name} tạo đơn bán lẻ ${order.code} · ${total}.`);
      });
      return store.find("orders", orderCode);
    },
    reserve(store, ctx, code, body) {
      const sku = String(body.sku || "").trim();
      const qty = Number(body.qty);
      const order = store.find("orders", code);
      if (!order) notFound("Không tìm thấy đơn hàng.");
      if (!Number.isSafeInteger(qty) || qty <= 0) badRequest("invalid_number", "Nhập số lượng nguyên dương.");
      let reservationId = null;
      store.transact({ actor: ctx.actor, action: "orders.reserve", requestId: ctx.requestId, method: ctx.method, route: `orders/${code}/reserve`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const record = tx.find("orders", code);
        if (["completed", "cancelled", "failed", "overdue"].includes(record.status)) conflict("order_state", "Đơn không còn trong trạng thái phân bổ hàng.");
        const product = requireProduct(tx, sku);
        if (product.status !== "product_active") conflict("product_inactive", "Sản phẩm đã ngừng kinh doanh.");
        const line = record.lines.find((item) => item.sku === sku);
        if (!line) badRequest("not_in_order", "Sản phẩm không thuộc đơn này. Chọn đúng SKU đã đặt.");
        const contract = record.contract ? tx.find("contracts", record.contract) : null;
        if (contract && !["signed", "active"].includes(contract.status)) conflict("contract_state", "Hợp đồng chưa hoàn tất ký kết.");
        const lock = tx.list("stocktakes").find((period) => period.locked && period.status !== "completed");
        if (lock) forbidden("stock_locked", `Kho đang khóa kiểm kê ${lock.code}.`);
        if (!orderEligible(record, { find: (name, key) => tx.find(name, key) })) badRequest("not_eligible", eligibilityReason(record, { find: (name, key) => tx.find(name, key) }));
        if (qty > availableOf(product)) badRequest("over_available", `Không thể giữ ${qty}: tồn khả dụng chỉ còn ${availableOf(product)} ${product.unit.toLowerCase()}.`);
        if (qty > line.qty - line.shipped - line.held) badRequest("over_order", "Số lượng giữ vượt phần chưa giao, chưa giữ của đơn.");
        product.held += qty;
        line.held += qty;
        record.status = "holding";
        record.readyForIssueAt = new Date().toISOString();
        const reservation = {
          id: tx.nextCode("reservations", "GR-" + new Date().getFullYear() + "-"),
          order: record.code, customerId: record.customerId, sku, qty,
          since: today(), status: "holding", note: String(body.note || ""), createdAt: new Date().toISOString()
        };
        tx.list("reservations").push(reservation);
        reservationId = reservation.id;
        addMovement(tx, "Giữ hàng", sku, qty, product.physical, product.held, record.code, body.note || "");
        tx.note(`${ctx.actor.name} giữ ${qty} ${sku} cho đơn ${record.code}.`);
      });
      return store.find("reservations", reservationId);
    },
    issue(store, ctx, code) {
      let issueCode = null;
      store.transact({ actor: ctx.actor, action: "orders.issue", requestId: ctx.requestId, method: ctx.method, route: `orders/${code}/issue`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const record = tx.find("orders", code);
        if (!record) notFound("Không tìm thấy đơn hàng.");
        const lock = tx.list("stocktakes").find((period) => period.locked && period.status !== "completed");
        if (lock) forbidden("stock_locked", `Kho đang khóa kiểm kê ${lock.code}.`);
        const contract = record.contract ? tx.find("contracts", record.contract) : null;
        if (contract && contract.status !== "active") badRequest("contract_state", "Hợp đồng chưa đủ điều kiện thực hiện.");
        if (!orderEligible(record, { find: (name, key) => tx.find(name, key) })) badRequest("not_eligible", eligibilityReason(record, { find: (name, key) => tx.find(name, key) }));
        const heldLines = record.lines.filter((line) => line.held > 0);
        if (!heldLines.length) badRequest("nothing_held", "Đơn chưa có lượng hàng đang giữ.");
        let shipment = null;
        if (contract) {
          shipment = contract.shipments.find((item) => item.status !== "delivered" && !item.delivery && item.items.length === heldLines.length && item.items.every((line) => heldLines.find((held) => held.sku === line.sku)?.held === line.qty));
          if (!shipment) badRequest("shipment_mismatch", "Lượng đang giữ cần khớp một đợt giao chưa xuất của hợp đồng. Điều chỉnh giữ hàng hoặc lập đợt giao.");
        }
        for (const line of heldLines) {
          const product = requireProduct(tx, line.sku);
          if (line.held > line.qty - line.shipped || line.held > product.physical - product.damaged || line.held > product.held) badRequest("invalid_issue", `Số lượng xuất ${line.sku} không hợp lệ so với đơn và tồn thực tế.`);
        }
        const issue = {
          code: tx.nextCode("issues", "PX-" + new Date().getFullYear() + "-"),
          order: record.code, customerId: record.customerId, date: today(),
          status: "issued", owner: ctx.actor.name, createdAt: new Date().toISOString(),
          lines: heldLines.map((line) => ({ sku: line.sku, qty: line.held }))
        };
        tx.list("issues").push(issue);
        issueCode = issue.code;
        for (const line of heldLines) {
          const product = requireProduct(tx, line.sku);
          const qty = line.held;
          product.physical -= qty;
          product.held -= qty;
          line.shipped += qty;
          line.held = 0;
          tx.list("reservations").forEach((reservation) => { if (reservation.order === record.code && reservation.sku === line.sku && reservation.status === "holding") reservation.status = "issued"; });
          addMovement(tx, "Xuất kho", line.sku, -qty, product.physical, product.held, issue.code, record.code);
        }
        record.status = "issued";
        record.issueRequestedAt = new Date().toISOString();
        const delivery = {
          code: tx.nextCode("deliveries", "GH-" + new Date().getFullYear() + "-"),
          order: record.code, customerId: record.customerId, issue: issue.code,
          contract: contract?.code || "", shipmentId: shipment?.id || "",
          items: structuredClone(issue.lines), carrier: "", planned: shipment?.date || today(),
          status: "delivery_pending", fee: 0, payer: "SoulWine", address: "", note: "Chờ bàn giao vận chuyển", createdAt: new Date().toISOString()
        };
        tx.list("deliveries").push(delivery);
        if (shipment) { shipment.delivery = delivery.code; shipment.status = "issued"; }
        tx.note(`${ctx.actor.name} xuất kho ${issue.code} cho đơn ${record.code}; tạo ${delivery.code} chờ bàn giao.`);
      });
      return { issue: store.find("issues", issueCode), order: store.find("orders", code) };
    }
  },

  reservations: {
    release(store, ctx, id, body) {
      const reservation = store.find("reservations", id);
      if (!reservation) notFound("Không tìm thấy bản ghi giữ hàng.");
      const reason = String(body?.reason || "").trim();
      if (!reason) badRequest("reason_required", "Cần nêu lý do nhả giữ.");
      store.transact({ actor: ctx.actor, action: "reservations.release", requestId: ctx.requestId, method: ctx.method, route: `reservations/${id}`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const record = tx.find("reservations", id);
        if (record.status !== "holding") conflict("reservation_state", "Bản ghi không còn giữ hàng.");
        const product = requireProduct(tx, record.sku);
        const order = tx.find("orders", record.order);
        product.held = Math.max(0, product.held - record.qty);
        if (order) {
          const line = order.lines.find((item) => item.sku === record.sku);
          if (line) line.held = Math.max(0, line.held - record.qty);
        }
        record.status = "released";
        record.releasedAt = new Date().toISOString();
        addMovement(tx, "Nhả giữ", record.sku, -record.qty, product.physical, product.held, record.order, reason);
        tx.note(`${ctx.actor.name} nhả giữ ${record.qty} ${record.sku} của ${record.order}: ${reason}.`);
      });
      return store.find("reservations", id);
    }
  },

  payments: {
    create(store, ctx, body) {
      const target = store.list("contracts").find((item) => item.code === body.record) || store.list("orders").find((item) => item.code === body.record);
      if (!target) badRequest("unknown_record", "Không tìm thấy đơn hàng / hợp đồng.");
      const amount = Number(body.amount);
      if (!Number.isSafeInteger(amount) || amount <= 0) badRequest("invalid_amount", "Số tiền phải là số nguyên dương.");
      if (!String(body.reference || "").trim()) badRequest("invalid_input", "Cần mã tham chiếu / chứng từ.");
      const method = requireEnum(body.method, ["Chuyển khoản", "Tiền mặt"], "Phương thức thanh toán", "Chuyển khoản");
      const date = body.date === undefined ? today() : requireDate(body.date, "Ngày thanh toán", { past: true });
      if (method === "Chuyển khoản" && !String(body.fileName || "").trim()) badRequest("evidence_required", "Đính kèm chứng từ chuyển khoản.");
      let paymentId = null;
      store.transact({ actor: ctx.actor, action: "payments.create", requestId: ctx.requestId, method: ctx.method, route: "payments", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const resolved = paymentTarget(tx, String(body.record));
        if (!resolved) badRequest("unknown_record", "Không tìm thấy đơn hàng / hợp đồng.");
        const remaining = remainingOf(resolved.record);
        const pendingAmount = tx.list("payments").filter((item) => item.record === resolved.record.code && item.status === "pending_confirm").reduce((sum, item) => sum + item.amount, 0);
        if (pendingAmount + amount > remaining) badRequest("over_pending", `Đã có giao dịch chờ xác nhận; tổng vượt phần còn phải thu (${remaining}).`);
        if (ctx.session.role === "accountant" && amount > remaining) badRequest("over_payment", `Số tiền vượt phần còn phải thu (${remaining}).`);
        const payment = {
          id: tx.nextCode("payments", "PAY-" + new Date().getFullYear() + "-"),
          record: resolved.record.code, customerId: resolved.record.customerId,
          amount, date, method, reference: String(body.reference).trim().slice(0, 100),
          fileName: String(body.fileName || "").trim().slice(0, 200), status: "pending_confirm",
          confirmedBy: "", confirmedAt: "", evidenceReadyAt: new Date().toISOString(),
          note: String(body.note || "").trim().slice(0, 200), createdBy: ctx.actor.id
        };
        tx.list("payments").push(payment);
        paymentId = payment.id;
        if (ctx.session.role === "accountant") applyPaymentEffects(tx, payment, ctx.actor.name);
        else {
          tx.list("approvals").push({
            id: tx.nextCode("approvals", "AP-", 4), type: "payment", ref: payment.id, title: "Xác nhận thanh toán",
            assignee: "accountant", status: "pending", requester: ctx.actor.name, requesterId: ctx.actor.id,
            amount, summary: `${payment.record} · ${amount}`, lines: [], createdAt: new Date().toISOString(), decidedAt: null, decidedBy: null, decisionNote: ""
          });
        }
        tx.note(`${ctx.actor.name} ghi nhận thanh toán ${payment.id} cho ${payment.record} · ${amount}.`);
      });
      return store.find("payments", paymentId);
    },
    confirm(store, ctx, id) {
      const payment = store.find("payments", id);
      if (!payment) notFound("Không tìm thấy giao dịch.");
      store.transact({ actor: ctx.actor, action: "payments.confirm", requestId: ctx.requestId, method: ctx.method, route: `payments/${id}/confirm`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const record = tx.find("payments", id);
        if (record.status !== "pending_confirm") conflict("payment_state", "Giao dịch đã được xử lý.");
        applyPaymentEffects(tx, record, ctx.actor.name);
        tx.note(`${ctx.actor.name} xác nhận giao dịch ${record.id} của ${record.record}.`);
      });
      return store.find("payments", id);
    }
  },

  receipts: {
    create(store, ctx, body) {
      const purchaseOrder = store.find("purchaseOrders", body.po);
      if (!purchaseOrder) badRequest("unknown_po", "Không tìm thấy đơn đặt hàng.");
      let receiptCode = null;
      store.transact({ actor: ctx.actor, action: "receipts.create", requestId: ctx.requestId, method: ctx.method, route: "receipts", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const po = tx.find("purchaseOrders", body.po);
        if (po.receipt) conflict("receipt_exists", "Đơn đặt hàng đã có phiếu tiếp nhận.");
        const receipt = {
          code: tx.nextCode("receipts", "PN-" + new Date().getFullYear() + "-"),
          po: po.code, supplier: po.supplier, eta: po.receiveDate, status: "receiving",
          threshold: tx.list("settings")[0].rules.receiptTolerance,
          owner: ctx.actor.name, evidence: [], note: "",
          lines: po.lines.map((line) => ({ sku: line.sku, ordered: line.qty, received: null, good: null, damaged: null, counted: false })),
          createdAt: new Date().toISOString()
        };
        tx.list("receipts").push(receipt);
        po.receipt = receipt.code;
        receiptCode = receipt.code;
        tx.note(`${ctx.actor.name} tạo phiếu tiếp nhận ${receipt.code} cho ${po.code}.`);
      });
      return store.find("receipts", receiptCode);
    },
    setCounts(store, ctx, code, body) {
      store.transact({ actor: ctx.actor, action: "receipts.counts", requestId: ctx.requestId, method: ctx.method, route: `receipts/${code}/counts`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const receipt = tx.find("receipts", code);
        if (!receipt) notFound("Không tìm thấy phiếu tiếp nhận.");
        if (receipt.status !== "receiving") conflict("receipt_state", "Phiếu đã chốt kết quả.");
        for (const line of receipt.lines) {
          const patch = body.lines?.[line.sku];
          if (!patch) continue;
          const received = Number(patch.received), good = Number(patch.good), damaged = Number(patch.damaged ?? 0);
          for (const value of [received, good, damaged]) if (!Number.isSafeInteger(value) || value < 0) badRequest("invalid_number", `${line.sku}: nhập số nguyên không âm.`);
          line.received = received; line.good = good; line.damaged = damaged; line.counted = true;
        }
        tx.note(`${ctx.actor.name} cập nhật số kiểm đếm của ${code}.`);
      });
      return store.find("receipts", code);
    },
    decide(store, ctx, code, body) {
      const decision = body.decision === "return" ? "return" : "confirm";
      store.transact({ actor: ctx.actor, action: `receipts.${decision}`, requestId: ctx.requestId, method: ctx.method, route: `receipts/${code}/${decision}`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const receipt = tx.find("receipts", code);
        if (!receipt) notFound("Không tìm thấy phiếu tiếp nhận.");
        if (receipt.status !== "receiving") conflict("receipt_state", "Phiếu đã chốt kết quả.");
        if (!receipt.evidence.length) badRequest("evidence_required", "Đính kèm phiếu giao / biên bản kiểm đếm trước khi chốt.");
        if (!receipt.lines.every((line) => line.counted)) badRequest("counts_incomplete", "Nhập đủ số thực nhận, đạt và lỗi cho mọi dòng.");
        for (const line of receipt.lines) if (line.good + line.damaged !== line.received) badRequest("counts_mismatch", `${line.sku}: hàng đạt + hư hỏng phải bằng thực nhận.`);
        if (decision === "confirm") {
          const lock = tx.list("stocktakes").find((period) => period.locked && period.status !== "completed");
          if (lock) forbidden("stock_locked", `Kho đang khóa kiểm kê ${lock.code}.`);
          const threshold = tx.list("settings")[0].rules.receiptTolerance;
          if (threshold === null) badRequest("no_threshold", "Thiết lập ngưỡng sai lệch tiếp nhận trước khi xác nhận nhập kho.");
          receipt.threshold = threshold;
          const overThreshold = receipt.lines.some((line) => line.ordered > 0 && (Math.abs((line.received - line.ordered) / line.ordered) * 100 > threshold || (line.damaged / line.ordered) * 100 > threshold));
          if (overThreshold) badRequest("over_threshold", "Có dòng vượt ngưỡng sai lệch: phải trả lô và yêu cầu giao lại.");
          for (const line of receipt.lines) {
            const product = requireProduct(tx, line.sku);
            product.physical += line.received;
            product.damaged += line.damaged;
            addMovement(tx, "Nhập kho", line.sku, line.received, product.physical, product.held, receipt.code, `${line.good} đạt; ${line.damaged} lỗi`);
          }
          const po = tx.find("purchaseOrders", receipt.po);
          if (po) po.status = "completed";
          const supplier = tx.list("suppliers").find((item) => item.id === receipt.supplier);
          if (supplier) supplier.lastDelivery = today();
          receipt.status = "completed";
          receipt.completedAt = new Date().toISOString();
          tx.note(`${ctx.actor.name} xác nhận nhập kho ${code}; tồn vật lý đã cập nhật theo thực nhận.`);
        } else {
          receipt.status = "returned";
          const po = tx.find("purchaseOrders", receipt.po);
          if (po) po.status = "returned";
          tx.note(`${ctx.actor.name} ghi trả lô ${code}; yêu cầu nhà cung cấp giao lại. Không ghi tăng tồn.`);
        }
      });
      return store.find("receipts", code);
    },
    addEvidence(store, ctx, code, body) {
      const fileName = String(body?.fileName || "").trim();
      if (!fileName) badRequest("invalid_input", "Nhập tên tệp chứng từ.");
      store.transact({ actor: ctx.actor, action: "receipts.evidence", requestId: ctx.requestId, method: ctx.method, route: `receipts/${code}/evidence`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const receipt = tx.find("receipts", code);
        if (!receipt) notFound("Không tìm thấy phiếu tiếp nhận.");
        receipt.evidence.push(fileName.slice(0, 200));
        tx.note(`${ctx.actor.name} đính kèm chứng từ ${fileName} cho ${code}.`);
      });
      return store.find("receipts", code);
    }
  },

  purchase: {
    createRequest(store, ctx, body) {
      const supplier = store.find("suppliers", body.supplier);
      if (!supplier) badRequest("unknown_supplier", "Chọn nhà cung cấp.");
      if (!String(body.note || "").trim()) badRequest("invalid_input", "Nêu lý do mua hàng.");
      let requestCode = null;
      store.transact({ actor: ctx.actor, action: "purchaseRequests.create", requestId: ctx.requestId, method: ctx.method, route: "purchase-requests", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const lines = validateLines(tx, body.lines).map((line) => ({ sku: line.sku, qty: line.qty, price: line.price }));
        const request = {
          code: tx.nextCode("purchaseRequests", "YCM-" + new Date().getFullYear() + "-"),
          supplier: supplier.id, requester: ctx.actor.name, requesterId: ctx.actor.id,
          createdAt: new Date().toISOString(), needed: body.needed || "", status: "pending",
          amount: lines.reduce((sum, line) => sum + line.qty * line.price, 0),
          lines, note: String(body.note).trim(), approvals: { accountant: false, director: false }
        };
        tx.list("purchaseRequests").push(request);
        requestCode = request.code;
        for (const role of ["accountant", "director"]) {
          tx.list("approvals").push({
            id: tx.nextCode("approvals", "AP-", 4), type: "purchase", ref: request.code,
            title: role === "accountant" ? "Kiểm tra tài chính mua hàng" : "Phê duyệt yêu cầu mua",
            assignee: role, status: "pending", requester: ctx.actor.name, requesterId: ctx.actor.id,
            amount: request.amount, summary: request.note, lines: structuredClone(lines),
            createdAt: new Date().toISOString(), decidedAt: null, decidedBy: null, decisionNote: ""
          });
        }
        tx.note(`${ctx.actor.name} gửi duyệt yêu cầu mua ${request.code} · ${request.amount}.`);
      });
      return store.find("purchaseRequests", requestCode);
    },
    createOrder(store, ctx, body) {
      const request = store.find("purchaseRequests", body.request);
      if (!request) badRequest("unknown_request", "Không tìm thấy yêu cầu mua.");
      if (!String(body.terms || "").trim() || !String(body.receiveDate || "").trim()) badRequest("invalid_input", "Nhập ngày nhận dự kiến và điều khoản thanh toán.");
      let orderCode = null;
      store.transact({ actor: ctx.actor, action: "purchaseOrders.create", requestId: ctx.requestId, method: ctx.method, route: "purchase-orders", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const record = tx.find("purchaseRequests", body.request);
        if (record.status !== "approved") conflict("request_state", "Yêu cầu mua cần đủ hai phê duyệt trước khi đặt hàng.");
        if (tx.list("purchaseOrders").some((item) => item.request === record.code)) conflict("po_exists", "Yêu cầu mua đã có đơn đặt hàng.");
        const order = {
          code: tx.nextCode("purchaseOrders", "PO-" + new Date().getFullYear() + "-"),
          supplier: record.supplier, request: record.code, createdAt: new Date().toISOString(),
          receiveDate: requireDate(body.receiveDate, "Ngày nhận dự kiến"), amount: record.amount, status: "receiving",
          receipt: "", terms: String(body.terms).trim(), lines: structuredClone(record.lines)
        };
        tx.list("purchaseOrders").push(order);
        orderCode = order.code;
        tx.note(`${ctx.actor.name} lập đơn đặt hàng ${order.code} từ ${record.code}.`);
      });
      return store.find("purchaseOrders", orderCode);
    }
  },

  stocktakes: {
    create(store, ctx, body) {
      const scope = String(body.scope || "Toàn kho").trim();
      let code = null;
      store.transact({ actor: ctx.actor, action: "stocktakes.create", requestId: ctx.requestId, method: ctx.method, route: "stocktakes", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const lock = tx.list("stocktakes").find((period) => period.locked && period.status !== "completed");
        if (lock) conflict("stocktake_active", `Đang có kỳ ${lock.code} khóa kho; hoàn tất kỳ đó trước.`);
        const products = tx.list("products").filter((product) => product.status === "product_active");
        if (!products.length) badRequest("no_products", "Thêm sản phẩm trước khi tạo kỳ kiểm kê.");
        const period = {
          code: tx.nextCode("stocktakes", "KK-" + new Date().getFullYear() + "-", 2),
          scope, started: new Date().toISOString(), status: "counting", locked: true,
          owner: ctx.actor.name, reportTo: "", closedAt: "",
          lines: products.map((product) => ({ sku: product.sku, system: product.physical, count: null, note: "", reviewed: false })),
          createdAt: new Date().toISOString()
        };
        tx.list("stocktakes").push(period);
        code = period.code;
        tx.note(`${ctx.actor.name} mở kỳ kiểm kê ${period.code}; nhập/xuất bị khóa đến khi hoàn tất.`);
      });
      return store.find("stocktakes", code);
    },
    setCount(store, ctx, code, body) {
      const sku = String(body.sku || "").trim();
      const count = body.count === null ? null : Number(body.count);
      if (count !== null && (!Number.isSafeInteger(count) || count < 0)) badRequest("invalid_number", "Nhập số lượng nguyên không âm, kể cả 0.");
      store.transact({ actor: ctx.actor, action: "stocktakes.count", requestId: ctx.requestId, method: ctx.method, route: `stocktakes/${code}/counts`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const period = tx.find("stocktakes", code);
        if (!period) notFound("Không tìm thấy kỳ kiểm kê.");
        if (period.status !== "counting") conflict("stocktake_state", "Kỳ đã chốt số đếm.");
        const line = period.lines.find((item) => item.sku === sku);
        if (!line) badRequest("unknown_sku", "SKU không thuộc kỳ kiểm kê.");
        line.count = count;
        if (count === null) line.reviewed = false;
        if (String(body.note || "")) line.note = String(body.note).trim().slice(0, 240);
        tx.note(`${ctx.actor.name} ${count === null ? "mở lại" : "nhập"} số đếm ${sku}${count === null ? "" : ` = ${count}`} trong ${code}.`);
      });
      return store.find("stocktakes", code);
    },
    finish(store, ctx, code) {
      store.transact({ actor: ctx.actor, action: "stocktakes.finish", requestId: ctx.requestId, method: ctx.method, route: `stocktakes/${code}/finish`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const period = tx.find("stocktakes", code);
        if (!period) notFound("Không tìm thấy kỳ kiểm kê.");
        if (period.status !== "counting") conflict("stocktake_state", "Kỳ đã chốt số đếm.");
        if (period.lines.some((line) => line.count === null)) badRequest("counts_incomplete", "Còn mã chưa nhập số kiểm đếm (kể cả số 0).");
        period.status = "reconciling";
        tx.note(`${ctx.actor.name} chốt số đếm kỳ ${code}; chuyển sang đối chiếu.`);
      });
      return store.find("stocktakes", code);
    },
    adjust(store, ctx, code, body) {
      const sku = String(body.sku || "").trim();
      const reason = String(body.reason || "").trim();
      if (!reason) badRequest("reason_required", "Cần ghi nguyên nhân chênh lệch đã kiểm tra.");
      store.transact({ actor: ctx.actor, action: "stocktakes.adjust", requestId: ctx.requestId, method: ctx.method, route: `stocktakes/${code}/adjust`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const period = tx.find("stocktakes", code);
        if (!period) notFound("Không tìm thấy kỳ kiểm kê.");
        if (!["reconciling", "reported"].includes(period.status)) badRequest("stocktake_state", "Chốt số đếm trước khi giải trình điều chỉnh.");
        const line = period.lines.find((item) => item.sku === sku);
        if (!line) badRequest("unknown_sku", "SKU không thuộc kỳ kiểm kê.");
        if (line.count === null) badRequest("not_counted", "Dòng chưa có số đếm.");
        line.reviewed = true;
        line.note = reason.slice(0, 240);
        tx.note(`${ctx.actor.name} xác nhận chênh lệch ${sku} trong ${code}: ${reason}.`);
      });
      return store.find("stocktakes", code);
    },
    report(store, ctx, code) {
      store.transact({ actor: ctx.actor, action: "stocktakes.report", requestId: ctx.requestId, method: ctx.method, route: `stocktakes/${code}/report`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const period = tx.find("stocktakes", code);
        if (!period) notFound("Không tìm thấy kỳ kiểm kê.");
        if (!["reconciling", "reported"].includes(period.status)) badRequest("stocktake_state", "Chốt số đếm trước khi gửi báo cáo.");
        period.status = "reported";
        period.reportTo = new Date().toISOString();
        tx.note(`${ctx.actor.name} gửi báo cáo kiểm kê ${code}.`);
      });
      return store.find("stocktakes", code);
    },
    complete(store, ctx, code) {
      store.transact({ actor: ctx.actor, action: "stocktakes.complete", requestId: ctx.requestId, method: ctx.method, route: `stocktakes/${code}/complete`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const period = tx.find("stocktakes", code);
        if (!period) notFound("Không tìm thấy kỳ kiểm kê.");
        if (!["reconciling", "reported"].includes(period.status)) badRequest("stocktake_state", "Cần chốt số đếm và đối chiếu trước khi đóng kỳ.");
        if (period.lines.some((line) => line.count === null)) badRequest("counts_incomplete", "Còn mã chưa kiểm đếm.");
        if (period.lines.some((line) => line.count !== line.system && !line.reviewed)) badRequest("unreviewed_variance", "Mỗi mã chênh lệch cần được kiểm tra và xác nhận nguyên nhân.");
        for (const line of period.lines) {
          const product = requireProduct(tx, line.sku);
          if (line.count < product.held + product.damaged) badRequest("below_committed", `${line.sku}: số đếm thấp hơn lượng giữ + hàng lỗi. Kiểm tra lại.`);
        }
        period.closedLines = period.lines.map((line) => ({ sku: line.sku, count: line.count, final: line.count }));
        for (const line of period.lines) {
          const product = requireProduct(tx, line.sku);
          const variance = line.count - product.physical;
          if (variance) {
            product.physical = line.count;
            addMovement(tx, "Điều chỉnh tồn", line.sku, variance, product.physical, product.held, period.code, line.note);
          }
        }
        period.status = "completed";
        period.locked = false;
        period.closedAt = new Date().toISOString();
        tx.note(`${ctx.actor.name} hoàn tất kiểm kê ${code}; tồn điều chỉnh một lần và nhập/xuất mở lại.`);
      });
      return store.find("stocktakes", code);
    }
  },

  deliveries: {
    schedule(store, ctx, code, body) {
      const carrier = String(body.carrier || "").trim();
      if (!carrier || !String(body.planned || "").trim()) badRequest("invalid_input", "Nhập đơn vị vận chuyển và ngày giao dự kiến.");
      store.transact({ actor: ctx.actor, action: "deliveries.schedule", requestId: ctx.requestId, method: ctx.method, route: `deliveries/${code}/schedule`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const delivery = tx.find("deliveries", code);
        if (!delivery) notFound("Không tìm thấy bản ghi giao nhận.");
        if (!["delivery_pending", "failed"].includes(delivery.status)) conflict("delivery_state", "Chỉ bàn giao chuyến chưa hoàn tất.");
        if (delivery.returned || tx.list("returns").some((entry) => entry.delivery === code && entry.status !== "rejected")) badRequest("returned", "Hàng đang xử lý hoàn hoặc đã nhập hoàn; lập phiếu xuất mới trước khi giao lại.");
        delivery.carrier = carrier.slice(0, 120);
        delivery.planned = requireDate(body.planned, "Ngày giao dự kiến");
        delivery.fee = requireInt(Number(body.fee ?? 0), "Phí giao hàng");
        delivery.payer = requireEnum(body.payer, ["Khách hàng", "SoulWine"], "Bên trả phí", "SoulWine");
        delivery.address = String(body.address || "").slice(0, 240);
        delivery.tracking = String(body.tracking || "").slice(0, 80);
        delivery.status = "shipping";
        const order = tx.find("orders", delivery.order);
        if (order) order.status = "shipping";
        tx.note(`${ctx.actor.name} bàn giao ${code} cho ${delivery.carrier}.`);
      });
      return store.find("deliveries", code);
    },
    result(store, ctx, code, body) {
      const result = requireEnum(body.result, ["failed", "delivered"], "Kết quả giao hàng");
      const receivedAt = requireDate(body.receivedAt, "Thời điểm nhận xác nhận", { past: true });
      const evidence = String(body.fileName || "").trim();
      if (result === "delivered" && !evidence) badRequest("evidence_required", "Đính kèm biên bản giao nhận có chữ ký.");
      store.transact({ actor: ctx.actor, action: `deliveries.${result}`, requestId: ctx.requestId, method: ctx.method, route: `deliveries/${code}/result`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const delivery = tx.find("deliveries", code);
        if (!delivery) notFound("Không tìm thấy bản ghi giao nhận.");
        if (delivery.status !== "shipping") conflict("delivery_state", "Chuyến chưa được bàn giao vận chuyển.");
        delivery.status = result;
        delivery.resultReceivedAt = receivedAt;
        delivery.resultRecordedAt = new Date().toISOString();
        delivery.note = result === "failed" ? String(body.reason || "Giao thất bại").slice(0, 240) : "Khách đã ký nhận đủ hàng";
        if (result === "delivered") delivery.evidenceFile = evidence.slice(0, 200);
        const contract = delivery.contract ? tx.find("contracts", delivery.contract) : null;
        const shipment = contract?.shipments.find((item) => item.id === delivery.shipmentId);
        if (shipment) {
          shipment.status = result === "delivered" ? "delivered" : "failed";
          shipment.confirmedAt = receivedAt;
          shipment.updatedAt = delivery.resultRecordedAt;
        }
        const order = tx.find("orders", delivery.order);
        if (order) {
          const allDelivered = tx.list("deliveries").filter((item) => item.order === order.code).every((item) => item.code === code || ["delivered", "returned"].includes(item.status));
          if (result === "failed") order.status = "failed";
          else order.status = order.lines.every((line) => line.shipped >= line.qty) && allDelivered ? "completed" : "shipping";
        }
        tx.note(`${ctx.actor.name} ghi nhận ${result === "delivered" ? "giao thành công" : "giao thất bại"} cho ${code}.`);
      });
      return store.find("deliveries", code);
    }
  },

  returns: {
    create(store, ctx, body) {
      const order = store.find("orders", body.order);
      if (!order) badRequest("unknown_order", "Không tìm thấy đơn hàng.");
      const sku = String(body.sku || "").trim();
      const qty = Number(body.qty);
      if (!Number.isSafeInteger(qty) || qty <= 0) badRequest("invalid_number", "Nhập số lượng hoàn nguyên dương.");
      const reason = String(body.reason || "").trim();
      if (!reason) badRequest("reason_required", "Nêu lỗi và căn cứ đổi trả.");
      let returnCode = null;
      store.transact({ actor: ctx.actor, action: "returns.create", requestId: ctx.requestId, method: ctx.method, route: "returns", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const record = tx.find("orders", body.order);
        const line = record.lines.find((item) => item.sku === sku);
        if (!line) badRequest("not_in_order", "Sản phẩm không thuộc đơn hàng.");
        const delivery = returnDelivery(tx, record.code, sku, qty, body.delivery);
        const entry = {
          code: tx.nextCode("returns", "DT-" + new Date().getFullYear() + "-"),
          order: record.code, customerId: record.customerId, delivery: delivery.code, sku, qty,
          reason: reason.slice(0, 240), source: requireEnum(body.source, ["Vận chuyển", "SoulWine"], "Nguồn đổi trả", "SoulWine"),
          status: "inspecting", evidence: [], receivedAt: "", postedAt: "",
          note: "Chờ nhận hàng thực tế và kiểm tra", createdAt: new Date().toISOString()
        };
        tx.list("returns").push(entry);
        returnCode = entry.code;
        tx.note(`${ctx.actor.name} tiếp nhận đổi trả ${entry.code}: ${reason}.`);
      });
      return store.find("returns", returnCode);
    },
    inspect(store, ctx, code, body) {
      const condition = requireEnum(body.condition, ["damaged", "good"], "Tình trạng hàng hoàn");
      const receivedAt = requireDate(body.receivedAt, "Thời điểm nhận hàng", { past: true });
      if (!String(body.reason || "").trim()) badRequest("reason_required", "Cần kết quả kiểm tra.");
      store.transact({ actor: ctx.actor, action: "returns.inspect", requestId: ctx.requestId, method: ctx.method, route: `returns/${code}/inspect`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const entry = tx.find("returns", code);
        if (!entry) notFound("Không tìm thấy yêu cầu đổi trả.");
        if (entry.status !== "inspecting") conflict("return_state", "Yêu cầu đã được xử lý.");
        const lock = tx.list("stocktakes").find((period) => period.locked && period.status !== "completed");
        if (lock) forbidden("stock_locked", `Kho đang khóa kiểm kê ${lock.code}.`);
        const delivery = returnDelivery(tx, entry.order, entry.sku, entry.qty, entry.delivery || body.delivery, entry.code);
        entry.delivery = delivery.code;
        const product = requireProduct(tx, entry.sku);
        product.physical += entry.qty;
        if (condition === "damaged") product.damaged += entry.qty;
        entry.status = "completed";
        entry.condition = condition;
        entry.note = String(body.reason).slice(0, 240);
        entry.receivedAt = receivedAt;
        entry.postedAt = new Date().toISOString();
        delivery.returned = true;
        delivery.returnedAt = entry.postedAt;
        if (delivery.status === "failed") {
          const order = tx.find("orders", entry.order);
          const line = order?.lines.find((item) => item.sku === entry.sku);
          if (!line || line.shipped < entry.qty) conflict("return_balance", "Lượng đã xuất không khớp hàng hoàn.");
          line.shipped -= entry.qty;
          order.status = orderEligible(order, { find: (name, key) => tx.find(name, key) }) ? "eligible" : "pending_payment";
          const fullyReturned = delivery.items.every((item) => tx.list("returns").filter((returned) => returned.delivery === delivery.code && returned.sku === item.sku && returned.status === "completed").reduce((sum, returned) => sum + returned.qty, 0) === item.qty);
          if (fullyReturned) {
            delivery.status = "returned";
            const contract = delivery.contract ? tx.find("contracts", delivery.contract) : null;
            const shipment = contract?.shipments.find((item) => item.id === delivery.shipmentId);
            if (shipment) { shipment.status = "planned"; shipment.delivery = ""; }
          }
        }
        addMovement(tx, "Hàng hoàn", entry.sku, entry.qty, product.physical, product.held, entry.code, entry.note);
        tx.note(`${ctx.actor.name} kiểm tra hàng hoàn ${code}: ${condition === "damaged" ? "hư hỏng, không tăng tồn khả dụng" : "đủ điều kiện bán lại"}.`);
      });
      return store.find("returns", code);
    }
  },

  users: {
    create(store, ctx, body) {
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.initialPassword || "");
      if (!name || !email) badRequest("invalid_input", "Cần họ tên và email đăng nhập.");
      if (store.list("users").some((user) => user.email?.toLowerCase() === email) || store.list("credentials").some((credential) => credential.email === email)) conflict("email_taken", "Email đã thuộc hồ sơ khác.");
      const policy = passwordPolicyError(password);
      if (policy) badRequest("weak_password", policy);
      const roleIds = requireRoles(body.roleIds);
      if (body.mustChange !== undefined && typeof body.mustChange !== "boolean") badRequest("invalid_input", "mustChange phải là true hoặc false.");
      let userId = null;
      store.transact({ actor: ctx.actor, action: "users.create", requestId: ctx.requestId, method: ctx.method, route: "users", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const user = {
          id: tx.nextCode("users", "U-"), name, email, phone: String(body.phone || ""),
          dept: String(body.dept || ROLES[roleIds[0]]), roleIds, status: "user_active",
          createdAt: new Date().toISOString()
        };
        tx.list("users").push(user);
        const { salt, hash } = hashPassword(password);
        tx.list("credentials").push({
          userId: user.id, email, salt, hash,
          mustChange: body.mustChange === undefined ? true : !!body.mustChange,
          failedAttempts: 0, locked: false, lockUntil: null, pending: false,
          updatedAt: new Date().toISOString()
        });
        userId = user.id;
        tx.note(`${ctx.actor.name} thêm nhân sự ${name} (${email}) với vai trò ${roleIds.map((role) => ROLES[role]).join(", ")}.`);
      });
      const user = store.find("users", userId);
      return { id: user.id, name: user.name, email: user.email, dept: user.dept, roleIds: user.roleIds, status: user.status };
    },
    update(store, ctx, id, body) {
      const target = store.find("users", id);
      if (!target) notFound("Không tìm thấy hồ sơ nhân sự.");
      store.transact({ actor: ctx.actor, action: "users.update", requestId: ctx.requestId, method: ctx.method, route: `users/${id}`, ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const user = tx.find("users", id);
        const previousRoles = [...user.roleIds];
        const nextRoles = body.roleIds === undefined ? user.roleIds : requireRoles(body.roleIds);
        const nextStatus = body.status === undefined ? user.status : requireEnum(body.status, ["user_active", "user_locked"], "Trạng thái nhân sự");
        if (user.status === "user_active" && user.roleIds.includes("director") && (nextStatus !== "user_active" || !nextRoles.includes("director"))) {
          if (!tx.list("users").some((item) => item.id !== id && item.status === "user_active" && item.roleIds.includes("director"))) conflict("last_director", "Cần duy trì ít nhất một hồ sơ Giám đốc hoạt động.");
        }
        if (user.id === ctx.session.userId && nextStatus !== "user_active") badRequest("self_lock", "Không thể vô hiệu hóa hồ sơ đang sử dụng.");
        if (body.name !== undefined) user.name = String(body.name).trim();
        if (body.phone !== undefined) user.phone = String(body.phone).trim();
        if (body.dept !== undefined) user.dept = String(body.dept).trim();
        user.roleIds = nextRoles;
        user.status = nextStatus;
        const rolesChanged = previousRoles.length !== nextRoles.length || previousRoles.some((role) => !nextRoles.includes(role));
        if (rolesChanged || nextStatus !== "user_active") {
          for (const session of tx.list("sessions")) if (session.userId === id) session.revokedAt = new Date().toISOString();
        }
        tx.note(`${ctx.actor.name} cập nhật hồ sơ nhân sự ${user.name}.`);
      });
      return store.find("users", id);
    }
  },

  settings: {
    update(store, ctx, body) {
      const current = store.list("settings")[0];
      const merged = structuredClone(current);
      if (body.organization) {
        for (const key of ["name", "taxId", "address", "representative", "phone", "email"]) {
          if (body.organization[key] !== undefined) merged.organization[key] = String(body.organization[key]).trim();
        }
        if (!merged.organization.name) badRequest("invalid_org", "Tên doanh nghiệp không được để trống.");
        if (merged.organization.taxId && !/^\d{10}(-\d{3})?$/.test(merged.organization.taxId)) badRequest("invalid_tax", "Mã số thuế gồm 10 hoặc 13 chữ số.");
      }
      if (body.rules) {
        for (const [key, min, max, optional] of [["receiptTolerance", 0, 100, true], ["quoteValidityDays", 1, 365, false], ["holdDays", 1, 365, true], ["approvalHours", 1, 720, true], ["quoteReminderDays", 0, 30, false], ["shipmentReminderDays", 0, 30, false]]) {
          const value = body.rules[key];
          if (value === undefined) continue;
          if (optional && value === null) { merged.rules[key] = null; continue; }
          if (!Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max || (key !== "receiptTolerance" && !Number.isInteger(Number(value)))) badRequest("invalid_rules", `Giá trị ${key} ngoài giới hạn cho phép.`);
          merged.rules[key] = Number(value);
        }
        for (const key of ["workStart", "workEnd"]) {
          if (body.rules[key] !== undefined) merged.rules[key] = String(body.rules[key]);
        }
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(merged.rules.workStart) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(merged.rules.workEnd) || merged.rules.workStart >= merged.rules.workEnd) badRequest("invalid_hours", "Giờ làm việc không hợp lệ (kết thúc phải sau bắt đầu).");
      }
      if (body.notifications) {
        for (const key of ["shipment", "quote", "approval", "stock", "payment"]) {
          if (body.notifications[key] !== undefined) merged.notifications[key] = !!body.notifications[key];
        }
      }
      merged.updatedAt = new Date().toISOString();
      store.transact({ actor: ctx.actor, action: "settings.update", requestId: ctx.requestId, method: ctx.method, route: "settings", ip: ctx.ip, userAgent: ctx.userAgent }, (tx) => {
        const settings = tx.list("settings")[0];
        Object.assign(settings, merged);
        tx.note(`${ctx.actor.name} cập nhật cấu hình hệ thống.`);
      });
      return store.list("settings")[0];
    }
  }
};

export function stockSummary(store) {
  return store.list("products").map((product) => ({
    sku: product.sku, name: product.name, unit: product.unit, physical: product.physical,
    held: product.held, damaged: product.damaged, available: availableOf(product), min: product.min,
    status: availableOf(product) < product.min ? "low" : "ok", active: product.status === "product_active"
  }));
}
