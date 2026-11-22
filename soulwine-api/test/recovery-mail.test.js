import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
import nodemailer from "nodemailer";
import { createRecoveryMailer } from "../src/auth/recovery-mail.js";

const relay = { SMTP_HOST: "127.0.0.1", SMTP_PORT: "465", SMTP_FROM: "sender@example.test", SMTP_SECURE: "true" };
const message = { to: "registered@example.test", code: "123456", expiresMinutes: 5 };

test("SMTP recovery is opt-in and rejects partial or unsafe configuration", () => {
  assert.equal(createRecoveryMailer({}), null);
  assert.throws(() => createRecoveryMailer({ SMTP_HOST: relay.SMTP_HOST }), /SMTP_HOST, SMTP_PORT/);
  assert.throws(() => createRecoveryMailer({ ...relay, SMTP_PORT: "65536" }), /SMTP_PORT/);
  assert.throws(() => createRecoveryMailer({ ...relay, SMTP_FROM: "a@example.test, b@example.test" }), /SMTP_FROM/);
  assert.throws(() => createRecoveryMailer({ ...relay, SMTP_SECURE: "yes" }), /SMTP_SECURE/);
  assert.throws(() => createRecoveryMailer({ ...relay, SMTP_USER: "fixture" }), /SMTP_PASSWORD/);
});

test("the mailer sends a single-recipient reset email and requires relay acceptance", async (t) => {
  const sent = [];
  const createTransport = t.mock.method(nodemailer, "createTransport", () => ({
    async sendMail(mail) {
      sent.push(mail);
      return { accepted: sent.length === 1 ? [mail.to.address] : [] };
    }
  }));
  const deliver = createRecoveryMailer(relay);
  assert.equal(createTransport.mock.calls[0].arguments[0].secure, true);
  assert.deepEqual(createTransport.mock.calls[0].arguments[0].tls, { minVersion: "TLSv1.2", rejectUnauthorized: true });
  await deliver(message);
  assert.deepEqual(sent[0].to, { address: message.to, name: "" });
  assert.equal(sent[0].from.address, relay.SMTP_FROM);
  assert.match(sent[0].text, /123456.*5/);
  await assert.rejects(deliver({ ...message, to: "registered@example.test, other@example.test" }), /Invalid recovery recipient/);
  assert.equal(sent.length, 1);
  await assert.rejects(deliver(message), /did not accept/);
});

test("a loopback SMTP relay that refuses STARTTLS never receives an OTP", { timeout: 5000 }, async (t) => {
  const commands = [];
  const server = net.createServer((socket) => {
    socket.setEncoding("ascii");
    socket.write("220 localhost SMTP test relay\r\n");
    let buffer = "";
    socket.on("data", (chunk) => {
      const lines = (buffer + chunk).split("\r\n");
      buffer = lines.pop();
      for (const line of lines) {
        commands.push(line);
        if (line.startsWith("EHLO ")) socket.write("250-localhost\r\n250 STARTTLS\r\n");
        else socket.end("454 TLS unavailable\r\n");
      }
    });
  });
  server.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const deliver = createRecoveryMailer({ ...relay, SMTP_SECURE: "false", SMTP_PORT: String(server.address().port) });
  await assert.rejects(deliver(message), { code: "ETLS" });
  assert.deepEqual(commands.map((line) => line.split(" ")[0]), ["EHLO", "STARTTLS"]);
});
