import { downloadMediaMessage, type proto } from "@whiskeysockets/baileys";
import mime from "mime-types";

export const getMediaBuffer = async (msg: proto.IWebMessageInfo) => {
  const messageType = Object.keys(msg.message || {})[0] || "";
  const mediaMessage = (msg.message as any)[messageType];
  if (!mediaMessage) return null;

  const buffer = await downloadMediaMessage(msg, "buffer", {});

  const mimeType = mediaMessage.mimetype || "application/octet-stream";
  const ext = mime.extension(mimeType) || "bin";

  const fileName = `${msg.key.id || Date.now()}.${ext}`;

  return { buffer, fileName };
};
