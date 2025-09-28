import "dotenv/config";

import express from "express";
import cors from "cors";
import { pino } from "pino";

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
} from "@whiskeysockets/baileys";

import { Boom } from "@hapi/boom";
import qrCodeTerminal from "qrcode-terminal";
import fs from "fs";
import { formatMessage } from "./utils/format-message.js";
import QRCode from "qrcode";
import { logger } from "./utils/logger.js";

const PORT = Number(process.env.PORT) | 5001;

const app = express();
app.use(cors());
app.use(express.json());

let sock: WASocket | null = null;
let lastQr: string | null = null;

const start = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  const sockWa = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
  });

  sock = sockWa;

  sockWa.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      lastQr = qr;
      logger.info(
        `[PENDING] QR code gerado. Escaneie por http://<IP>:${PORT}/qr em seu navegador ou pelo terminal`
      );
      qrCodeTerminal.generate(qr, { small: true });
    }

    if (connection === "open")
      logger.info(`[ONLINE] Sessão conectada com sucesso`);

    if (connection === "close") {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;

      if (reason === DisconnectReason.loggedOut) {
        logger.warn(`Sessão encerrada`);
        fs.rmSync("./auth", { recursive: true, force: true });
      }

      await start();
    }
  });

  sockWa.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;

    const ignoredTypes = [
      "senderKeyDistributionMessage",
      "status@broadcast",
      "protocolMessage",
      "reactionMessage",
      "ephemeralMessage",
    ];

    const messageType = Object.keys(msg.message)[0];

    if (
      ignoredTypes.includes(messageType!) ||
      msg.key.remoteJid?.endsWith("@g.us") ||
      msg.key.remoteJid?.endsWith("@newsletter") ||
      msg.key.remoteJid?.endsWith("@status")
    )
      return;

    const formatedMessage = await formatMessage(msg);

    const url_webhook =
      process.env.API_WEBHOOK || "http://localhost:5000/webhook";

    try {
      await fetch(url_webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formatedMessage),
        keepalive: true,
      });
    } catch (error) {
      logger.info("[ERROR] Erro ao enviar mensagem pelo webhook");
    }
  });

  sockWa.ev.on("creds.update", saveCreds);
};

app.post("/enviar-mensagem", async (req, res) => {
  try {
    const { phone, message } = req.body as {
      phone: string;
      message: string;
    };

    if (!phone || !message) {
      logger.error(
        `[SEND] Requisição inválida: telefone ou token não informado`
      );
      return res.status(400).json({
        status: "BAD REQUEST",
        message: "Informe telefone e token no corpo da requisição",
      });
    }

    const jid = `${phone.replace(/\D/g, "")}@s.whatsapp.net`;

    if (!sock) {
      logger.error(`[SESSION] Nenhuma sessão ativa`);
      return res.status(503).json({
        status: "unavailable",
        message: "Sessão WhatsApp indisponível. Escaneie o QR code no console",
      });
    }

    await sock.sendMessage(jid, {
      text: message,
    });

    logger.info(`[SEND] Mensagem enviada para ${jid}`);
    return res.status(200).json({
      status: "success",
      message: `Mensagem enviada com sucesso para +${phone}`,
    });
  } catch (error) {
    logger.error(
      `[ERROR] Falha ao enviar mensagem -> ${(error as Error).message}`
    );
    return res.status(500).json({
      status: "error",
      message:
        "Não foi possível enviar a mensagem. Confirme sessão e número (DDI + DDD)",
    });
  }
});

app.get("/qr", async (req, res) => {
  if (!lastQr) return res.status(404).send("QR ainda não gerado");
  res.setHeader("Content-Type", "image/png");
  QRCode.toFileStream(res, lastQr, { width: 300 });
});

app.listen(PORT, "0.0.0.0", async () => {
  logger.info("[BOOT] Servidor iniciado na porta " + PORT);
  await start();
});
